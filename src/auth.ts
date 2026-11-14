import { betterAuth } from "better-auth";
import { admin, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";

const list = (value?: string) =>
  (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);

export const auth = betterAuth({
  appName: "CaldasStudios",
  // BETTER_AUTH_URL and BETTER_AUTH_SECRET are read from the environment.
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.DISABLE_SIGNUP === "true",
    minPasswordLength: 10,
  },
  trustedOrigins: list(process.env.TRUSTED_ORIGINS),
  rateLimit: { enabled: true, storage: "database" },
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https://"),
  },
  // The JWT plugin must not hand session JWTs to browsers; apps get tokens from /oauth2/token.
  disabledPaths: ["/token"],
  plugins: [
    admin(),
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      signup: { page: "/sign-up" },
      // First-party apps: cached in memory and immutable through the client API.
      cachedTrustedClients: new Set(list(process.env.TRUSTED_CLIENT_IDS)),
      // Only admins may create or manage OAuth clients (apps).
      clientPrivileges: ({ user }) => user?.role === "admin",
      // Local development: let web apps on localhost use http callbacks.
      allowInsecureRedirectUri: (url) =>
        process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname),
    }),
  ],
});
