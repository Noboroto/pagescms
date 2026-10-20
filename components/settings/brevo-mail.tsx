"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBrevoMailSettings, sendBrevoTestEmail } from "@/lib/actions/brevo-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BrevoMailSettings({
  apiKeySet,
  initialSenderEmail,
  initialSenderName,
  ownerEmail,
}: {
  apiKeySet: boolean;
  initialSenderEmail: string;
  initialSenderName: string;
  ownerEmail: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [senderEmail, setSenderEmail] = useState(initialSenderEmail);
  const [senderName, setSenderName] = useState(initialSenderName);
  const [pending, startTransition] = useTransition();

  const save = (clearApiKey = false) => {
    startTransition(async () => {
      const result = await saveBrevoMailSettings({
        apiKey: apiKey.trim() || undefined,
        clearApiKey: clearApiKey || undefined,
        senderEmail,
        senderName: senderName.trim() || undefined,
      });
      if (result.success) {
        setApiKey("");
        toast.success("Saved. Changes apply within about 15 seconds.");
      } else {
        toast.error(result.error);
      }
    });
  };

  const sendTest = () => {
    startTransition(async () => {
      const result = await sendBrevoTestEmail();
      if (result.success) toast.success(`Test email sent to ${ownerEmail}.`);
      else toast.error(result.error, { duration: 12000 });
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-muted-foreground">
        When set, sign-in codes and invitations are sent through the Brevo transactional API instead of the
        environment email provider. In Brevo, open Security, then Authorized IPs, and make sure it does not
        block this API key (Vercel has no fixed IP). The sender email must be verified in Brevo.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="brevo-api-key">
          API key <span className="text-muted-foreground">({apiKeySet ? "set" : "not set"})</span>
        </Label>
        <Input
          id="brevo-api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={apiKeySet ? "Leave empty to keep the current key" : "xkeysib-..."}
          autoComplete="new-password"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brevo-sender-email">Sender email</Label>
        <Input
          id="brevo-sender-email"
          type="email"
          value={senderEmail}
          onChange={(event) => setSenderEmail(event.target.value)}
          placeholder="no-reply@example.com"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brevo-sender-name">Sender name (optional)</Label>
        <Input
          id="brevo-sender-name"
          value={senderName}
          onChange={(event) => setSenderName(event.target.value)}
          placeholder="Pages CMS"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !apiKeySet}
          onClick={sendTest}
        >
          Send test email to {ownerEmail}
        </Button>
        {apiKeySet && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(true)}>
            Clear API key
          </Button>
        )}
      </div>
    </form>
  );
}
