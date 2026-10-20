"use server";

import { revalidatePath } from "next/cache";
import { invalidateAuthCache } from "@/lib/auth";
import { toActionError } from "@/lib/action-error";
import { requireRepoOwner } from "@/lib/require-repo-owner";
import { saveGoogleAuthSettings } from "@/lib/google-settings";

type ActionResult = { success: true } | { success: false; error: string };

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
    return toActionError("google-settings", error, "Could not save settings.");
  }
};

export { saveGoogleSignInSettings };
