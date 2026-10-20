"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getOneTapClient } from "@/lib/google-one-tap-client";

// Shows the Google One Tap prompt. Renders nothing; sign-in completes through
// the session cookie set by the server callback.
export function GoogleOneTap({
  clientId,
  onSuccess,
}: {
  clientId: string;
  onSuccess: () => void;
}) {
  useEffect(() => {
    let active = true;
    getOneTapClient(clientId)
      .oneTap({
        fetchOptions: {
          onSuccess: () => {
            if (active) onSuccess();
          },
          onError: (context: { error?: { message?: string } }) => {
            if (active) toast.error(context.error?.message || "Google sign-in failed.");
          },
        },
      })
      .catch(() => {
        // GSI script blocked (offline, ad blocker): the Google button still works.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return null;
}
