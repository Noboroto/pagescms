import { sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorInviteTable, collaboratorTable, userTable } from "@/db/schema";
import { isRepoOwnerUser } from "@/lib/repo-owner";

// Paths where Better Auth creates a user from a Google identity.
const isGoogleSignIn = (context: { path?: string; params?: Record<string, string> } | null | undefined) =>
  context?.path === "/one-tap/callback" ||
  (context?.path?.startsWith("/callback/") === true &&
    (context.params?.id === "google" || context.path === "/callback/google"));

// Same ADMIN_EMAILS allowlist as lib/admin.ts (not imported: it pulls in lib/auth).
const isAdminEmail = (email: string) =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .some((entry) => entry.trim().toLowerCase() === email);

// A brand-new user may only be created by Google for an email that is already
// allowed in: a bootstrap admin, or a collaborator / pending invite.
const isEmailAllowedToSignUp = async (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (isAdminEmail(normalized)) return true;

  const collaborator = await db
    .select({ id: collaboratorTable.id })
    .from(collaboratorTable)
    .where(sql`lower(${collaboratorTable.email}) = ${normalized}`)
    .limit(1);
  if (collaborator.length > 0) return true;

  const invite = await db
    .select({ id: collaboratorInviteTable.id })
    .from(collaboratorInviteTable)
    .where(sql`lower(${collaboratorInviteTable.email}) = ${normalized}`)
    .limit(1);
  if (invite.length > 0) return true;

  // The repo owner's GitHub-linked account (matched by email).
  const owner = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(sql`lower(${userTable.email}) = ${normalized}`)
    .limit(1);
  return owner.length > 0 && (await isRepoOwnerUser(owner[0].id));
};

export { isEmailAllowedToSignUp, isGoogleSignIn };
