"use server";

import { revalidatePath } from "next/cache";
import { BrevoRequestError, sendViaBrevo } from "@/lib/brevo";
import { getBrevoConfig, saveBrevoSettings } from "@/lib/brevo-settings";
import { toActionError } from "@/lib/action-error";
import { requireRepoOwner } from "@/lib/require-repo-owner";

type ActionResult = { success: true } | { success: false; error: string };

const saveBrevoMailSettings = async (input: {
  apiKey?: string;
  clearApiKey?: boolean;
  senderEmail: string;
  senderName?: string;
}): Promise<ActionResult> => {
  try {
    const user = await requireRepoOwner();
    await saveBrevoSettings(input, user.id);
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return toActionError("brevo-settings", error, "Could not save settings.");
  }
};

// Sends one email to the signed-in owner with the saved settings.
const sendBrevoTestEmail = async (): Promise<ActionResult> => {
  try {
    const user = await requireRepoOwner();
    const config = await getBrevoConfig();
    if (!config) return { success: false, error: "Save an API key and sender email first." };

    await sendViaBrevo({
      apiKey: config.apiKey,
      sender: { email: config.senderEmail, name: config.senderName },
      to: [user.email],
      subject: "Pages CMS test email",
      html: "<p>This is a test email from Pages CMS. Brevo is configured correctly.</p>",
      text: "This is a test email from Pages CMS. Brevo is configured correctly.",
    });
    return { success: true };
  } catch (error) {
    if (error instanceof BrevoRequestError) {
      const hint =
        error.status === 401 || error.status === 403
          ? " Check the API key and Brevo > Security > Authorized IPs."
          : error.status === 400
            ? " Check that the sender email is verified in Brevo."
            : "";
      console.error("[brevo-settings] test email failed", { status: error.status });
      return { success: false, error: `${error.message}${hint}` };
    }
    return toActionError("brevo-settings", error, "Could not send test email.");
  }
};

export { saveBrevoMailSettings, sendBrevoTestEmail };
