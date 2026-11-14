<img src="assets/icon.svg" width="64" height="64" alt="">

# CaldasStudios Auth

Centralized sign-in for every CaldasStudios app. One account, one database for identity only, built on [Better Auth](https://better-auth.com) with its [OAuth 2.1 / OpenID Connect provider](https://better-auth.com/docs/plugins/oauth-provider).

```
┌────────────┐   OIDC (redirect + code)   ┌──────────────────┐
│  App A     │ ─────────────────────────▶ │  Auth server     │
│  (own DB)  │ ◀───── tokens / userinfo ─ │  (this repo)     │
└────────────┘                            │  Postgres: users,│
┌────────────┐                            │  sessions, OAuth │
│  App B     │ ─────────────────────────▶ │  clients, tokens │
│  (own DB)  │                            └──────────────────┘
└────────────┘
```

- The auth database stores only identity data: users, accounts, sessions, OAuth clients, tokens, consents and signing keys.
- Each app keeps its own database. It stores the user's `sub` (the stable user ID from this server) as a foreign key to its own data.
- Apps connect over standard OpenID Connect. That works with Better Auth (`genericOAuth`) or any OIDC library in any language.

## Stack

Node 24 (runs TypeScript directly) · Hono · Better Auth 1.7 · `@better-auth/oauth-provider` · PostgreSQL

Plugins: `oauthProvider` (OAuth 2.1 + OIDC, PKCE required), `jwt` (signing keys and JWKS), `admin` (user roles, bans), `twoFactor` (authenticator app + backup codes), `passkey` (WebAuthn). Optional Google sign-in.

## Run locally

```bash
cp .env.example .env               # then set BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d db            # Postgres on 127.0.0.1:5433
npm install
npm run migrate                    # creates the auth tables
npm run admin:create -- you@caldasstudios.com 'a-long-password' "Your Name"
npm run dev                        # http://localhost:3000
```

To run the server in Docker as well: `docker compose --profile app up -d --build`. The container runs migrations on start.

## Pages and endpoints

| Path | Purpose |
| --- | --- |
| `/sign-in`, `/sign-up` | Login and registration (password, passkey, Google). Apps never build their own. |
| `/two-factor` | Asks for the authenticator or backup code after a password sign-in when 2FA is on. |
| `/error` | Explains Google sign-in errors. |
| `/consent` | Shown to users for apps that are not marked trusted. |
| `/` | Account page: two-step verification, passkeys, connecting Google, sign-out. Admins also get a link to `/admin`. |
| `/admin` | Admin dashboard: traffic and app (OAuth client) management. Admins only. |
| `/api/auth/.well-known/openid-configuration` | OIDC discovery (also at `/.well-known/openid-configuration`). |
| `/.well-known/oauth-authorization-server/api/auth` | RFC 8414 metadata. |
| `/api/auth/oauth2/authorize`, `/token`, `/userinfo`, `/end-session`, `/introspect`, `/revoke` | OAuth/OIDC endpoints. |
| `/api/auth/jwks` | Public keys for verifying ID tokens and JWT access tokens. |
| `/health` | Liveness check. |
| `/llms.txt` | Integration guide for apps and AI agents ([llms.txt](llms.txt)). |

The issuer is `BETTER_AUTH_URL + /api/auth`, for example `https://auth.caldasstudios.com/api/auth`.

## Connect a new app

### 1. Register the app (admin)

```bash
# ADMIN_EMAIL / ADMIN_PASSWORD must be an admin account (set in .env or inline)
npm run client:create -- \
  --name "My App" \
  --redirect https://myapp.caldasstudios.com/api/auth/callback/caldas \
  --logout-redirect https://myapp.caldasstudios.com \
  --trusted
```

This prints the `client_id` and `client_secret`. The secret is shown once, so put it in the app's secret store.

- `--trusted`: a first-party app with no consent screen. Also add its `client_id` to `TRUSTED_CLIENT_IDS` and restart. That keeps its settings from being changed through the API.
- `--public`: an SPA or mobile app with no secret, using PKCE only. It always shows consent.
- Production redirect URIs must use `https`. Outside `NODE_ENV=production`, `http://localhost` and `http://127.0.0.1` are also accepted for development.

Only users with the `admin` role can register apps. Apps belong to all admins together, so any admin can manage them.

You can also do all of this from the dashboard at `/admin`.

## Admin dashboard

`/admin` is only open to users with the `admin` role. Others get a 403, and signed-out visitors go to `/sign-in`.

- **Traffic**: requests per day (7, 30 or 90 days), error rate, user and session counts, top endpoints, and per-app sign-in requests, token requests, errors and users holding live tokens.
- **Apps**: register, edit (name, logo, redirect URIs, logout URIs, trusted), disable or enable, rotate the secret, and delete. New and rotated secrets are shown once.

Traffic is counted per UTC day in the `traffic_daily` table, which the server creates on start. Counters are written every 15 seconds, so the newest requests show up after a short delay. `/health`, `/admin` and static files under `/assets` are not counted. Per-app numbers come from `client_id` on `/authorize` and HTTP Basic credentials on `/token`, so public apps' token requests are only counted in the endpoint totals.

Apps listed in `TRUSTED_CLIENT_IDS` show as **Locked** and cannot be changed from the dashboard. Remove the ID from that variable and restart to edit them.

The dashboard's write API (`/admin/api/*`) only accepts same-origin JSON requests, so `BETTER_AUTH_URL` must match the URL you open the dashboard on.

### 2a. App built with Better Auth (recommended)

The app keeps its own Better Auth instance and database for its sessions, and signs in through this server:

```ts
// my-app/auth.ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  database: myAppDb, // the app's own DB
  plugins: [
    genericOAuth({
      config: [{
        providerId: "caldas",
        clientId: process.env.CALDAS_CLIENT_ID!,
        clientSecret: process.env.CALDAS_CLIENT_SECRET!,
        discoveryUrl: "https://auth.caldasstudios.com/api/auth/.well-known/openid-configuration",
        scopes: ["openid", "profile", "email", "offline_access"],
        tokenEndpointAuth: { method: "client_secret_basic" }, // clients are registered for Basic auth
      }],
    }),
  ],
});
```

```ts
// my-app client
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();

await authClient.signIn.social({ provider: "caldas", callbackURL: "/dashboard" });
await authClient.signOut(); // also ends the session on the auth server (RP-initiated logout)
```

The callback URL is `https://<app>/api/auth/callback/caldas`. Register exactly that URL in step 1.

### 2b. Any other stack

Use any OpenID Connect client library with:

- Discovery: `https://auth.caldasstudios.com/api/auth/.well-known/openid-configuration`
- Flow: Authorization Code with PKCE (`S256`). PKCE is required.
- Scopes: `openid profile email`, plus `offline_access` for refresh tokens
- User identity: the `sub` claim of the ID token, or `GET /api/auth/oauth2/userinfo` with the access token

### 3. Link app data to users

In the app's own database, reference users by `sub`:

```sql
create table projects (
  id uuid primary key,
  owner_sub text not null,  -- user id from the auth server
  ...
);
```

Do not copy passwords or credentials into app databases. Name and email can be cached, but the auth server is the source of truth.

### Protecting APIs (optional)

For backend APIs that accept access tokens, register the API as a resource (`resources` in `oauthProvider`). Clients then get JWT access tokens that the API verifies against `/api/auth/jwks`. See [Protect your API](https://better-auth.com/docs/plugins/oauth-provider/resource-server). Without a resource, access tokens are opaque and can be checked with `/api/auth/oauth2/introspect`.

## Sign-in methods

The sign-in pages use the Caldas Studios identity from [CaldasStudios/brand-assets](https://github.com/CaldasStudios/brand-assets), copied into `assets/brand/`. When an app sends a user to sign in, the page shows the app's name and logo next to the Caldas Studios icon. Set the logo in the admin dashboard; it must be an `https` URL to a square image. Apps without a logo show their first letter.

All of these happen on the auth server, so every app gets them without changes. Each one also works in the middle of an app's OAuth flow and sends the user back to the app afterwards.

- **Password**, with optional **two-step verification**. Users turn it on from their account page: scan the QR code with an authenticator app, confirm one code, and save the 10 backup codes. After that, a password sign-in also asks for a code. "Trust this device" skips the code for 30 days on that browser. Only accounts with a password can use it.
- **Passkeys**. Users add them on their account page, then use "Sign in with a passkey". Passkeys are bound to the domain in `BETTER_AUTH_URL`, so changing that domain makes existing passkeys stop working. Passkey sign-ins don't ask for a 2FA code, because the passkey already is a second factor.
- **Google**. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart. Google sign-ins don't ask for a 2FA code either.

### Google setup

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Authorized redirect URI: `BETTER_AUTH_URL/api/auth/callback/google`, for example `https://auth.caldasstudios.com/api/auth/callback/google`. For local development: `http://localhost:3000/api/auth/callback/google`.
3. Put the ID and secret in `.env` and restart.

A Google sign-in creates a new account when the email is new. If an account with that email already exists, the two are only joined automatically when that account's email has been verified. Otherwise the user gets an error page asking them to sign in with their password and click **Connect Google** on their account page. This stops someone from registering a victim's email with a password before the victim signs in with Google.

## Environment

See [.env.example](.env.example). Key variables:

| Variable | Notes |
| --- | --- |
| `BETTER_AUTH_URL` | Public URL of this server. Use `https://` in production; that also enables secure cookies. |
| `BETTER_AUTH_SECRET` | 32+ random bytes. Rotating it invalidates sessions and signed requests. |
| `DATABASE_URL` | Postgres used only by this server. |
| `TRUSTED_CLIENT_IDS` | Comma-separated IDs of first-party apps. |
| `TRUSTED_ORIGINS` | Origins allowed to call `/api/auth` from a browser. |
| `DISABLE_SIGNUP` | `true` limits accounts to ones created by admins. This also stops Google from creating new accounts. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turn on "Continue with Google". Leave empty to hide it. |

## Production checklist

- Serve over HTTPS behind a reverse proxy. Set `NODE_ENV=production` and the `https://` `BETTER_AUTH_URL`.
- Use a strong `POSTGRES_PASSWORD` and back up the auth database.
- Email verification and password reset need an email sender. Add `sendVerificationEmail` / `sendResetPassword` in [src/auth.ts](src/auth.ts) once a mail provider is chosen. Turn on `emailVerification.sendOnSignUp` and `emailAndPassword.requireEmailVerification` too. Verified accounts then link to Google automatically when the emails match.
- Until then, an existing account can be linked to Google by signing in with the password and clicking **Connect Google**, or by marking the email verified in the database.
- After adding Better Auth plugins, run `npm run migrate` again.
