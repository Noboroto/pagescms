# Fork patches (on top of upstream 2.1.8)

Google sign-in + Google One Tap, configured from the web UI by the repo owner
(Settings, "Google sign-in" card). Off until a Client ID + secret are saved and enabled.
No env vars: the secret is stored AES-GCM encrypted with `CRYPTO_KEY` in table `google_auth_setting`.

"Repo owner" = a user signed in with GitHub whose GitHub account id equals the account of a
GitHub App installation (`GET /app/installations`). Google / email-OTP-only users never qualify.

| File | Why |
| --- | --- |
| `db/schema.ts`, `db/migrations/*google_auth_setting*` | `google_auth_setting` single-row table (`version` bumps on save). |
| `lib/repo-owner.ts` (new) | Repo-owner check via the App's installations (60s cache). |
| `lib/google-settings.ts` (new) | Read / validate / encrypt-and-save the Google client. |
| `lib/actions/google-settings.ts` (new) | Owner-only save server action. |
| `components/settings/google-sign-in.tsx` (new) | Settings form (secret write-only) + origin / redirect URI to paste into Google Cloud. |
| `app/(main)/settings/page.tsx` | Shows the card to the repo owner only. |
| `lib/google-auth.ts` (new) | Sign-up gate (admin / collaborator / invited / repo-owner email only). |
| `lib/google-one-tap-client.ts` (new), `components/google-one-tap.tsx` (new) | Per-Client-ID One Tap client + prompt. |
| `lib/auth.ts` | Better Auth fixes providers/plugins at init, so `getAuth()` returns a cached instance rebuilt (15s TTL check) when the settings version changes; `auth` is no longer exported. |
| `app/api/auth/[...all]/route.ts`, `lib/admin.ts`, `lib/session-server.ts`, `lib/actions/*`, other `auth.api` callers | Use `await getAuth()`. |
| `components/sign-in.tsx`, `app/(auth)/sign-in/page.tsx` | "Sign in with Google" + One Tap when the active instance has Google. |
| `.env.local.example` | Notes that Google is configured in Settings. |

Note: the `auth:generate` script (Better Auth CLI) expects an exported `auth`; it is not used by the app.

## Brevo email from Settings

Repo owner sets a Brevo transactional API key + verified sender (Settings, "Email (Brevo)" card; write-only
key, "Send test email"). Stored in `brevo_mail_setting`, key encrypted with `CRYPTO_KEY`, cached 15s.
When configured it is used for all outgoing mail (`lib/mailer.ts`, POST `https://api.brevo.com/v3/smtp/email`);
otherwise the env `EMAIL_PROVIDER` / `RESEND_*` / `SMTP_*` providers are used unchanged. Brevo > Security >
Authorized IPs must not block the key (Vercel has no fixed IP).

| File | Why |
| --- | --- |
| `db/schema.ts`, `db/migrations/*brevo_mail_setting*` | `brevo_mail_setting` single-row table. |
| `lib/brevo.ts` (new) | Brevo HTTP client (status + code only in errors). |
| `lib/brevo-settings.ts` (new) | Validate / encrypt / save / cached read. |
| `lib/require-repo-owner.ts` (new) | Shared owner gate for the settings actions. |
| `lib/actions/brevo-settings.ts` (new) | Save + test-email server actions (owner only). |
| `components/settings/brevo-mail.tsx` (new), `app/(main)/settings/page.tsx` | UI card. |
| `lib/mailer.ts` | Prefers DB-configured Brevo over env providers. |
