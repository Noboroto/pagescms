import { sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorInviteTable, collaboratorTable } from "@/db/schema";

type AuthHookContext = {
  path?: string;
  params?: Record<string, string>;
  body?: unknown;
};

// Every route where Better Auth can create a user from a Google identity:
// the redirect callback, the One Tap callback, and ID-token sign-in
// (POST /sign-in/social with provider "google").
const isGoogleSignIn = (context: AuthHookContext | null | undefined) => {
  const path = context?.path;
  if (!path) return false;
  if (path === "/one-tap/callback") return true;
  if (path.startsWith("/callback/")) {
    return context?.params?.id === "google" || path.split("/").pop() === "google";
  }
  if (path === "/sign-in/social") {
    const provider = (context?.body as { provider?: unknown } | undefined)?.provider;
    return provider === "google";
  }
  return false;
};

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

  return false;
};

export { isEmailAllowedToSignUp, isGoogleSignIn };
