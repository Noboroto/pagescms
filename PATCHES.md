# Fork patches (on top of upstream 2.1.8)

Google sign-in + Google One Tap, configured from the web UI by the repo owner
(Settings, "Google sign-in" card). Off until a Client ID + secret are saved and enabled.
No env vars: the secret is stored AES-GCM encrypted with `CRYPTO_KEY` in table `google_auth_setting`.

"Repo owner" = the one user whose OAuth-linked GitHub account id equals the GitHub App's owner
(`GET /app` -> `owner.id`, App JWT, cached 10 min). Installing the App does not qualify; Google /
email-OTP-only users never qualify; any lookup failure denies.

Google hardening: `google` is not an account-linking trusted provider (links to an existing user only when
the token has `email_verified`); the sign-up gate (`databaseHooks.user.create.before`) covers the redirect
callback, `/one-tap/callback` and `POST /sign-in/social` (provider google + idToken), rejects unverified
emails, and only admits ADMIN_EMAILS / collaborators / invites. Better Auth 1.5.6 has no per-provider
`requireEmailVerification`, so the gate enforces it. Settings caches (auth instance, Brevo) use a generation
counter so a load that started before a save cannot overwrite newer config; the fallback auth instance
(settings DB unreadable) is cached 5s. Settings server actions return generic errors (`lib/action-error.ts`);
only validation / authorization messages reach the browser.

| File | Why |
| --- | --- |
| `db/schema.ts`, `db/migrations/*google_auth_setting*` | `google_auth_setting` single-row table (`version` bumps on save). |
| `lib/repo-owner.ts` (new) | Repo-owner check: App owner id from `GET /app` vs linked GitHub account id. |
| `lib/action-error.ts` (new) | `UserFacingError` + generic server-action error mapping. |
| `lib/google-settings.ts` (new) | Read / validate / encrypt-and-save the Google client. |
| `lib/actions/google-settings.ts` (new) | Owner-only save server action. |
| `components/settings/google-sign-in.tsx` (new) | Settings form (secret write-only) + origin / redirect URI to paste into Google Cloud. |
| `app/(main)/settings/page.tsx` | Shows the card to the repo owner only. |
| `lib/google-auth.ts` (new) | Sign-up gate (verified admin / collaborator / invited email only). |
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

## Action payload size guard

GitHub caps each `workflow_dispatch` input at 65,535 characters; the actions API sends the whole run payload
(`JSON.stringify` of `buildActionPayload`, including the entry in `context.data.content`) as `inputs.payload`.
The entry editor shows a live (debounced) `n / 65,535 characters` badge when the file/collection has entry/file
actions: warning style at >= 90%, error style plus disabled action buttons (tooltip explains) when over. Saving is
never blocked. The actions POST route rejects an over-limit payload with a clear 413 message before dispatching.

| File | Why |
| --- | --- |
| `lib/actions.ts` | `ACTION_PAYLOAD_MAX_LENGTH`, `buildActionPayload` (shared by route and editor so both measure the same shape). |
| `app/api/[owner]/[repo]/[branch]/actions/route.ts` | Uses `buildActionPayload`; length guard before DB insert / dispatch. |
| `components/entry/entry-form.tsx` | `onValuesChange` prop (react-hook-form `subscribe`). |
| `components/entry/entry.tsx` | Counter badge, warning/error notice, passes `disabledReason`. |
| `components/repo/repo-action-buttons.tsx` | `disabledReason` prop: disabled buttons with tooltip. |

## Default repository

Optional env `DEFAULT_REPO` (`owner/repo` or `owner/repo@branch`). When set, `/` redirects server-side to
`/{owner}/{repo}[/{branch}]` if the user can access it (`getToken`: GitHub access or collaborator row); otherwise the
normal home page renders (no loop). All sign-in methods land on `/`, so they are covered. The "Create from a template"
section is hidden. `/?home=1` skips the redirect ("All projects" menu item, back links, "Choose another repository").
Unset: upstream behaviour.

| File | Why |
| --- | --- |
| `lib/default-repo.ts` (new) | Parse `DEFAULT_REPO`, build the path. |
| `app/(main)/page.tsx`, `app/(main)/home-page.tsx` | Server wrapper doing the redirect; old client page moved, `hideTemplates` prop. |
| `components/repo/repo-sidebar.tsx`, `app/(main)/[owner]/[repo]/**/layout.tsx`, `app/(main)/settings/page.tsx`, `app/(main)/admin/page.tsx` | Home links use `/?home=1`. |
| `.env.local.example` | Documents `DEFAULT_REPO`. |

## Download a file

"Download" item in the file menu (entry editor, collection rows, media tiles, settings). `GET .../files/[path]`
checks access like the read routes (`getRepoReadContext`; path inside the content `path` / media `input`, the
schema's extension / media extension allowlist, `.pages.yml` for GitHub users only) and returns GitHub's short-lived `download_url`, not the
bytes, so large media is not capped by the Vercel response size limit. The browser fetches it as a blob
(raw.githubusercontent.com allows any origin) because `<a download>` is ignored for cross-origin links.

| File | Why |
| --- | --- |
| `app/api/[owner]/[repo]/[branch]/files/[path]/route.ts` | `GET` handler + `isWithin` path check. |
| `components/file/file-options.tsx` | Download menu item. |
