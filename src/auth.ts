import { betterAuth } from "better-auth";
import { admin, jwt, twoFactor } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { isLocalhostUri } from "./redirect-policy.ts";

const list = (value?: string) =>
  (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

// Every admin co-owns every app, so any admin can manage apps another admin created.
export const ADMIN_CLIENT_REFERENCE = "caldas-admins";
export const trustedClientIds = new Set(list(process.env.TRUSTED_CLIENT_IDS));
const signUpDisabled = process.env.DISABLE_SIGNUP === "true";
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
export const googleEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const ownOrigin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 15_000,
});
if (process.env.VERCEL === "1") attachDatabasePool(db);

export const auth = betterAuth({
  appName: "CaldasStudios",
  // BETTER_AUTH_URL and BETTER_AUTH_SECRET are read from the environment.
  database: db,
  emailAndPassword: {
    enabled: true,
    disableSignUp: signUpDisabled,
    minPasswordLength: 10,
  },
  // Google is enabled when both credentials are set. Callback: BETTER_AUTH_URL/api/auth/callback/google
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: GOOGLE_CLIENT_ID!,
          clientSecret: GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
          disableImplicitSignUp: signUpDisabled,
        },
      }
    : {},
  // Account linking keeps Better Auth's defaults: a Google login joins an existing account only when
  // that account's email is verified (requireLocalEmailVerified), which blocks pre-registration takeover.
  // Users with unverified emails link Google from their account page instead.
  onAPIError: { errorURL: "/error" },
  trustedOrigins: list(process.env.TRUSTED_ORIGINS),
  rateLimit: { enabled: true, storage: "database" },
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https://"),
  },
  // The JWT plugin must not hand session JWTs to browsers; apps get tokens from /oauth2/token.
  disabledPaths: ["/token"],
  plugins: [
    admin(),
    // Authenticator-app codes plus single-use backup codes. Asked for after email + password sign-in.
    twoFactor({ issuer: "CaldasStudios" }),
    // rpID and origin come from BETTER_AUTH_URL, so passkeys are bound to the auth server's domain.
    passkey({ rpName: "CaldasStudios" }),
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      signup: { page: "/sign-up" },
      // First-party apps: cached in memory and immutable through the client API.
      cachedTrustedClients: trustedClientIds,
      // Only admins may create or manage OAuth clients (apps).
      clientPrivileges: ({ user }) => user?.role === "admin",
      clientReference: ({ user }) => (user?.role === "admin" ? ADMIN_CLIENT_REFERENCE : undefined),
      // Admin registration gates localhost behind an explicit testing option; matching stays exact.
      allowInsecureRedirectUri: (url) => isLocalhostUri(url.href),
    }),
  ],
});
