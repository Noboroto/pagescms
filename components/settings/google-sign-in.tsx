"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGoogleSignInSettings } from "@/lib/actions/google-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function GoogleSignInSettings({
  initialClientId,
  secretSet,
  initialEnabled,
  origin,
  redirectUri,
}: {
  initialClientId: string;
  secretSet: boolean;
  initialEnabled: boolean;
  origin: string;
  redirectUri: string;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const save = (clearSecret = false) => {
    startTransition(async () => {
      const result = await saveGoogleSignInSettings({
        clientId,
        clientSecret: clientSecret.trim() || undefined,
        clearSecret: clearSecret || undefined,
        enabled: clearSecret ? false : enabled,
      });
      if (result.success) {
        setClientSecret("");
        if (clearSecret) setEnabled(false);
        toast.success("Saved. Changes apply within about 15 seconds.");
      } else {
        toast.error(result.error);
      }
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
      <div className="space-y-1.5 text-sm">
        <p className="text-muted-foreground">
          Paste these into Google Cloud Console (APIs &amp; Services, Credentials, OAuth client ID, Web application).
        </p>
        <div>
          <span className="text-muted-foreground">Authorized JavaScript origin: </span>
          <code className="break-all">{origin}</code>
        </div>
        <div>
          <span className="text-muted-foreground">Authorized redirect URI: </span>
          <code className="break-all">{redirectUri}</code>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="google-client-id">Client ID</Label>
        <Input
          id="google-client-id"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="123456789-abc.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="google-client-secret">
          Client secret <span className="text-muted-foreground">({secretSet ? "set" : "not set"})</span>
        </Label>
        <Input
          id="google-client-secret"
          type="password"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
          placeholder={secretSet ? "Leave empty to keep the current secret" : "GOCSPX-..."}
          autoComplete="new-password"
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="google-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="google-enabled">Enable Google sign-in and One Tap</Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        {secretSet && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(true)}>
            Clear secret and disable
          </Button>
        )}
      </div>
    </form>
  );
}
