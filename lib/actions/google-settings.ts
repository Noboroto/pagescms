"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuth, invalidateAuthCache } from "@/lib/auth";
import { isRepoOwnerUser } from "@/lib/repo-owner";
import { saveGoogleAuthSettings } from "@/lib/google-settings";

type ActionResult = { success: true } | { success: false; error: string };

// Repo owner only: a user signed in with GitHub whose GitHub account has this
// GitHub App installed. Email-OTP / Google-only users never pass.
const requireRepoOwner = async () => {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) throw new Error("Not signed in.");
  if (!(await isRepoOwnerUser(user.id))) throw new Error("Only the repository owner can change these settings.");
  return user;
};

const saveGoogleSignInSettings = async (input: {
  clientId: string;
  clientSecret?: string;
  clearSecret?: boolean;
  enabled: boolean;
}): Promise<ActionResult> => {
  try {
    const user = await requireRepoOwner();
    await saveGoogleAuthSettings(input, user.id);
    invalidateAuthCache();
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save settings." };
  }
};

export { saveGoogleSignInSettings };
