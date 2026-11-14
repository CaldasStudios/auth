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

Plugins: `oauthProvider` (OAuth 2.1 + OIDC, PKCE required), `jwt` (signing keys and JWKS), `admin` (user roles, bans).

## Run locally

```bash
cp .env.example .env               # then set BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d db            # Postgres on 127.0.0.1:5432
npm install
npm run migrate                    # creates the auth tables
npm run admin:create -- you@caldasstudios.com 'a-long-password' "Your Name"
npm run dev                        # http://localhost:3000
```

To run the server in Docker as well: `docker compose --profile app up -d --build`. The container runs migrations on start.

## Pages and endpoints

| Path | Purpose |
| --- | --- |
| `/sign-in`, `/sign-up` | Login and registration. Apps never build their own. |
| `/consent` | Shown to users for apps that are not marked trusted. |
| `/` | Shows the signed-in account and a sign-out button. |
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

Only users with the `admin` role can register apps.

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

## Environment

See [.env.example](.env.example). Key variables:

| Variable | Notes |
| --- | --- |
| `BETTER_AUTH_URL` | Public URL of this server. Use `https://` in production; that also enables secure cookies. |
| `BETTER_AUTH_SECRET` | 32+ random bytes. Rotating it invalidates sessions and signed requests. |
| `DATABASE_URL` | Postgres used only by this server. |
| `TRUSTED_CLIENT_IDS` | Comma-separated IDs of first-party apps. |
| `TRUSTED_ORIGINS` | Origins allowed to call `/api/auth` from a browser. |
| `DISABLE_SIGNUP` | `true` limits accounts to ones created by admins. |

## Production checklist

- Serve over HTTPS behind a reverse proxy. Set `NODE_ENV=production` and the `https://` `BETTER_AUTH_URL`.
- Use a strong `POSTGRES_PASSWORD` and back up the auth database.
- Email verification and password reset need an email sender. Add `sendVerificationEmail` / `sendResetPassword` in [src/auth.ts](src/auth.ts) once a mail provider is chosen.
- After adding Better Auth plugins, run `npm run migrate` again.
