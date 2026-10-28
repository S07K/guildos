# Google sign-in and absolute session lifetime

Set `NEXT_PUBLIC_SESSION_MAX_AGE_SECONDS=86400` (default), `43200` for 12 hours, or `28800` for 8 hours. Rebuild after changing it. Every Supabase SSR client uses this cookie maximum age, SameSite=Lax, path=/, and Secure in production.

Configure Google in Supabase Authentication → Providers with a Google OAuth client ID and secret. In Google Cloud, allow the Supabase project's `/auth/v1/callback` URL. In Supabase's redirect URL allowlist, add `https://guildos.design/auth/callback` and each explicitly trusted development/preview callback. The app uses PKCE, offline access, and account selection. Google credentials stay in Supabase, never in browser environment variables.

The app also requires `AUTH_SESSION_SECRET` (32+ random characters), falling back to the existing `STUDIO_VAULT_KEY`. It signs an HttpOnly session deadline cookie bound to both the user and Supabase session ID. Only successful email verification or OAuth code exchange creates this cookie; token refresh cannot extend its deadline. Existing sessions without it must sign in again. Server routes and the proxy independently verify the deadline and Supabase user. The frontend navigates back to sign-in at the same deadline.

The deadline restricts GuildOS pages and APIs, not direct use of Supabase tokens outside the application. To time-box refresh tokens at the provider as well, configure Supabase's **Time-box user sessions** to the same duration and keep JWT expiry short (for example, one hour). Supabase enforces its time-box when refreshing; already-issued JWTs remain valid until their own expiry. Google provider token lifetime is controlled by Google. These hosted provider settings cannot be changed by a Next.js cookie option.

Studio browser tests use a temporary self-signed loopback HTTPS server (OpenSSL required). This keeps production Secure cookie behavior intact for both Chromium and Playwright's API client. The certificate is generated for each run and removed when the server exits.
