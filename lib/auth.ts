import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { emailOTP, oneTap } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { repairLegacyGithubStubOnLogin } from "@/lib/github-legacy-stub-repair";
import { sendEmail } from "@/lib/mailer";
import { syncGithubProfileOnLogin } from "@/lib/github-account";
import { bindCollaboratorInvitesToUser } from "@/lib/collaborator-access";
import { LoginEmailTemplate } from "@/components/email/login";
import { render } from "@react-email/render";
import { isEmailAllowedToSignUp, isGoogleSignIn } from "@/lib/google-auth";
import { readGoogleAuthRow, resolveGoogleConfig, type GoogleAuthConfig } from "@/lib/google-settings";

// Better Auth providers/plugins are fixed at init, so the instance is rebuilt
// when the Google settings version changes (see getAuthState).
const createAuth = (google: GoogleAuthConfig | null) => betterAuth({
  baseURL: getBaseUrl(),
  secret: (process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET) as string,
  user: {
    additionalFields: {
      githubUsername: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: google ? ["github", "google"] : ["github"],
      disableImplicitLinking: false,
      updateUserInfoOnLink: true,
      allowUnlinkingAll: false,
    },
  },
  socialProviders: {
    ...(google && {
      google: {
        clientId: google.clientId,
        clientSecret: google.clientSecret,
      },
    }),
    github: {
      clientId: process.env.GITHUB_APP_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET as string,
      overrideUserInfoOnSignIn: false,
      mapProfileToUser: (profile) => ({
        name: profile.name ?? profile.login,
        image: profile.avatar_url ?? null,
        githubUsername: profile.login,
      }),
      scope: ["repo", "user:email"],
      getUserInfo: async (token) => {
        const profileResponse = await fetch("https://api.github.com/user", {
          headers: {
            "User-Agent": "better-auth",
            Authorization: `Bearer ${token.accessToken}`,
          },
        });

        if (!profileResponse.ok) {
          console.warn("[auth] github getUserInfo failed", {
            status: profileResponse.status,
            githubRequestId: profileResponse.headers.get("x-github-request-id"),
            rateLimitRemaining: profileResponse.headers.get("x-ratelimit-remaining"),
          });
          return null;
        }

        const profile = await profileResponse.json();

        let emails:
          | Array<{ email: string; primary: boolean; verified: boolean; visibility: "public" | "private" }>
          | undefined;
        try {
          const emailsResponse = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${token.accessToken}`,
              "User-Agent": "better-auth",
            },
          });
          if (emailsResponse.ok) {
            emails = await emailsResponse.json();
          }
        } catch {}

        if (!profile.email && emails) {
          profile.email = (emails.find((entry) => entry.primary) ?? emails[0])?.email as string;
        }
        const emailVerified = emails?.find((entry) => entry.email === profile.email)?.verified ?? false;

        const userMap = {
          name: profile.name ?? profile.login,
          image: profile.avatar_url ?? null,
          githubUsername: profile.login,
        };

        return {
          user: {
            id: profile.id,
            email: profile.email,
            emailVerified,
            ...userMap,
          },
          data: profile,
        };
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        // Google must not open sign-up to everyone: a new user is only created
        // for an admin, collaborator or invited email. Existing users link.
        before: async (user, context) => {
          if (!google || !isGoogleSignIn(context)) return;
          if (await isEmailAllowedToSignUp(user.email)) return;
          throw new APIError("FORBIDDEN", {
            message: "This Google account has not been invited to Pages CMS.",
          });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            await repairLegacyGithubStubOnLogin(session.id, session.userId);
          } catch (error) {
            console.warn("[auth] legacy github stub repair failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            await syncGithubProfileOnLogin(session.userId);
          } catch (error) {
            console.warn("[auth] github profile sync failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          try {
            const user = await db.query.userTable.findFirst({
              where: (table, { eq }) => eq(table.id, session.userId),
            });
            if (user) {
              await bindCollaboratorInvitesToUser(user);
            }
          } catch (error) {
            console.warn("[auth] collaborator invite binding failed", {
              sessionId: session.id,
              userId: session.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }

        },
      },
    },
  },
  plugins: [
    nextCookies(),
    ...(google ? [oneTap({ clientId: google.clientId })] : []),
    emailOTP({
      expiresIn: 300,
      otpLength: 6,
      allowedAttempts: 5,
      storeOTP: "encrypted",
      resendStrategy: "reuse",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;

        const subject = `Your Pages CMS temporary code is ${otp}`;
        const html = await render(
          LoginEmailTemplate({
            email,
            otp,
            preview: subject,
          }),
        );

        await sendEmail({
          to: email,
          subject,
          html,
        });
      },
    }),
  ],
});

type Auth = ReturnType<typeof createAuth>;
type AuthState = { auth: Auth; version: number; googleClientId: string | null };

// Short TTL: a settings change lands on every instance within ~15s.
const CONFIG_TTL_MS = 15_000;

let current: AuthState | null = null;
let checkedAt = 0;
let inflight: Promise<AuthState> | null = null;

const refreshAuthState = async (): Promise<AuthState> => {
  try {
    const row = await readGoogleAuthRow();
    const version = row?.version ?? 0;
    if (!current || current.version !== version) {
      const google = await resolveGoogleConfig(row);
      current = { auth: createAuth(google), version, googleClientId: google?.clientId ?? null };
    }
    checkedAt = Date.now();
    return current;
  } catch (error) {
    console.error("[auth] settings reload failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (current) {
      checkedAt = Date.now();
      return current;
    }
    // Settings unreadable on first use: serve GitHub/email only and retry on the next call.
    checkedAt = 0;
    return { auth: createAuth(null), version: -1, googleClientId: null };
  }
};

const getAuthState = (): Promise<AuthState> => {
  if (current && Date.now() - checkedAt < CONFIG_TTL_MS) return Promise.resolve(current);
  inflight ??= refreshAuthState().finally(() => {
    inflight = null;
  });
  return inflight;
};

export const getAuth = async () => (await getAuthState()).auth;

// Client ID of the active Google provider, null when Google sign-in is off.
export const getActiveGoogleClientId = async () => (await getAuthState()).googleClientId;

// Call after saving settings: this instance re-checks on the next request.
export const invalidateAuthCache = () => {
  checkedAt = 0;
};
