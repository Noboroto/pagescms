# Fork patches (on top of upstream 2.1.8)

Google sign-in + Google One Tap. Off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

| File | Why |
| --- | --- |
| `lib/google-auth.ts` (new) | Env gating and the sign-up gate (admin / collaborator / invited email only). |
| `lib/google-one-tap-client.ts` (new) | Per-Client-ID One Tap auth client (ID is a runtime env, so not on the shared client). |
| `components/google-one-tap.tsx` (new) | Renders the One Tap prompt. |
| `lib/auth.ts` | `socialProviders.google`, `oneTap` plugin, `google` in `trustedProviders`, `user.create.before` gate for Google. |
| `components/sign-in.tsx` | "Sign in with Google" button + One Tap, only when `googleClientId` prop is set. |
| `app/(auth)/sign-in/page.tsx` | Passes the Client ID to `SignIn` at request time. |
| `.env.local.example` | Documents the two env vars. |
