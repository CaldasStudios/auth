import { readFileSync } from "node:fs";
import { Hono } from "hono";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
  verifyOAuthQueryParams,
} from "@better-auth/oauth-provider";
import QRCode from "qrcode";
import { auth, db, googleEnabled, ownOrigin } from "./auth.ts";
import admin from "./admin.ts";
import { record } from "./traffic.ts";
import {
  consentPage,
  errorFromQuery,
  errorPage,
  homePage,
  signInPage,
  signUpPage,
  twoFactorPage,
  type AppInfo,
} from "./pages.ts";

const app = new Hono();
const publicCors = { headers: { "Access-Control-Allow-Origin": "*" } };
const authServerMetadata = oauthProviderAuthServerMetadata(auth, publicCors);
const openIdMetadata = oauthProviderOpenIdConfigMetadata(auth, publicCors);

app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

// Traffic counters for the dashboard (health checks, static files and the dashboard itself are left out).
const untracked = /^\/(health$|favicon\.ico$|assets\/|admin(\/|$))/;
app.use("*", async (c, next) => {
  await next();
  if (!untracked.test(c.req.path)) await record(c.req.raw, c.req.path, c.res.status);
});

app.route("/", admin);
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Discovery at the root (RFC 8414 / OIDC), in addition to the copies under /api/auth.
app.get("/.well-known/oauth-authorization-server/api/auth", (c) => authServerMetadata(c.req.raw));
app.get("/.well-known/openid-configuration", (c) => openIdMetadata(c.req.raw));
app.get("/health", (c) => c.json({ ok: true }));

// Integration guide for apps (and their AI agents), served at the root by convention.
const llmsTxt = readFileSync(new URL("../llms.txt", import.meta.url), "utf8");
app.get("/llms.txt", (c) => c.text(llmsTxt));

// WebAuthn browser helper for the passkey buttons (same major version as Better Auth's passkey plugin).
const webauthnJs = readFileSync(
  new URL("../node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js", import.meta.url),
  "utf8",
);
// Brand assets from CaldasStudios/brand-assets.
const brand = new Map(
  ["app-icon", "symbol", "logo-primary", "logo-reversed"].map((name) => [
    `${name}.svg`,
    readFileSync(new URL(`../assets/brand/${name}.svg`, import.meta.url), "utf8"),
  ]),
);
app.get("/assets/brand/:file", (c) => {
  const svg = brand.get(c.req.param("file"));
  if (!svg) return c.notFound();
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(svg);
});
app.get("/favicon.ico", (c) => c.redirect("/assets/brand/app-icon.svg", 301));

app.get("/assets/webauthn.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(webauthnJs);
});

const search = (url: string) => new URL(url).search;

// The signed part of an OAuth query (Better Auth lists the signed keys in ba_param), or null if the signature is bad.
async function signedQuery(url: string) {
  const params = new URL(url).searchParams;
  if (!params.has("sig")) return null;
  const signed = new Set(["sig", "ba_param", ...params.getAll("ba_param")]);
  const query = new URLSearchParams([...params].filter(([k]) => signed.has(k)));
  const { secret } = await auth.$context;
  return (await verifyOAuthQueryParams(query.toString(), secret)) ? query : null;
}

// Name and logo of the app being signed in to, shown on the sign-in pages during an OAuth flow.
async function appFromUrl(url: string): Promise<AppInfo | undefined> {
  const clientId = (await signedQuery(url))?.get("client_id");
  if (!clientId) return undefined;
  const { rows } = await db.query(
    `select name, icon from "oauthClient" where "clientId" = $1 and disabled is not true`,
    [clientId],
  );
  return rows[0] ? { name: rows[0].name || "this app", icon: rows[0].icon } : undefined;
}

app.get("/sign-in", async (c) => c.html(signInPage(search(c.req.url), googleEnabled, await appFromUrl(c.req.url))));
app.get("/sign-up", async (c) => c.html(signUpPage(search(c.req.url), googleEnabled, await appFromUrl(c.req.url))));
app.get("/two-factor", async (c) => c.html(twoFactorPage(search(c.req.url), await appFromUrl(c.req.url))));
app.get("/error", (c) => c.html(errorPage(errorFromQuery(new URL(c.req.url).searchParams)), 400));

app.get("/consent", async (c) => {
  const query = await signedQuery(c.req.url);
  if (!query) {
    return c.html(errorPage("This authorization request is invalid or expired."), 400);
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect(`/sign-in${search(c.req.url)}`);
  try {
    const client = await auth.api.getOAuthClientPublic({
      query: { client_id: query.get("client_id")! },
      headers: c.req.raw.headers,
    });
    const redirectHost = new URL(query.get("redirect_uri") ?? "").host;
    const scopes = (query.get("scope") ?? "").split(" ").filter(Boolean);
    return c.html(consentPage({ name: client.client_name || "this app", icon: client.logo_uri }, redirectHost, scopes));
  } catch {
    return c.html(errorPage("Unknown or disabled application."), 404);
  }
});

app.get("/", async (c) => {
  const headers = c.req.raw.headers;
  const session = await auth.api.getSession({ headers });
  if (!session) return c.redirect("/sign-in");
  const [accounts, passkeys] = await Promise.all([
    auth.api.listUserAccounts({ headers }),
    auth.api.listPasskeys({ headers }),
  ]);
  c.header("Cache-Control", "no-store");
  return c.html(
    homePage({
      user: session.user,
      hasPassword: accounts.some((a) => a.providerId === "credential"),
      googleLinked: accounts.some((a) => a.providerId === "google"),
      googleEnabled,
      passkeys,
    }),
  );
});

// Starts 2FA setup and returns the QR code as SVG, so the TOTP secret never needs a client-side QR library.
app.post("/account/two-factor/enable", async (c) => {
  if (c.req.header("origin") !== ownOrigin) return c.json({ message: "Cross-site request refused" }, 403);
  const { password } = await c.req.json().catch(() => ({}));
  if (typeof password !== "string" || !password) return c.json({ message: "Enter your password." }, 400);
  try {
    const result = await auth.api.enableTwoFactor({ headers: c.req.raw.headers, body: { password } });
    if (result.method !== "totp") return c.json({ message: "Authenticator-app setup is unavailable." }, 500);
    const { totpURI, backupCodes } = result;
    const qr = await QRCode.toString(totpURI, { type: "svg", margin: 1 });
    c.header("Cache-Control", "no-store");
    return c.json({ qr, secret: new URL(totpURI).searchParams.get("secret"), backupCodes });
  } catch (error) {
    const e = error as { statusCode?: number; body?: { message?: string } };
    if (!e.statusCode) throw error;
    return c.json({ message: e.body?.message ?? "Could not start setup." }, e.statusCode as 400);
  }
});

// Adds a password to an account created with Google or a passkey (Better Auth's setPassword is server-only).
app.post("/account/password", async (c) => {
  if (c.req.header("origin") !== ownOrigin) return c.json({ message: "Cross-site request refused" }, 403);
  const body = await c.req.json().catch(() => null);
  const newPassword = body?.newPassword;
  if (typeof newPassword !== "string" || !newPassword) return c.json({ message: "Enter a new password." }, 400);
  const headers = c.req.raw.headers;
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session) return c.json({ message: "Unauthorized" }, 401);
  // Same rule as Better Auth's freshSessionMiddleware (used for passkey registration); freshAge 0 turns it off.
  const { freshAge } = (await auth.$context).sessionConfig;
  if (freshAge !== 0 && Date.now() - new Date(session.session.createdAt).getTime() >= freshAge * 1000)
    return c.json({ message: "For your security, sign out and sign in again before setting a password." }, 403);
  try {
    await auth.api.setPassword({ headers, body: { newPassword } });
    c.header("Cache-Control", "no-store");
    return c.json({ status: true });
  } catch (error) {
    const e = error as { statusCode?: number; body?: { message?: string } };
    if (!e.statusCode) throw error;
    return c.json({ message: e.body?.message ?? "Could not set password." }, e.statusCode as 400);
  }
});

export default app;
