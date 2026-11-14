import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
  verifyOAuthQueryParams,
} from "@better-auth/oauth-provider";
import { auth } from "./auth.ts";
import { consentPage, errorPage, homePage, signInPage, signUpPage } from "./pages.ts";

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

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Discovery at the root (RFC 8414 / OIDC), in addition to the copies under /api/auth.
app.get("/.well-known/oauth-authorization-server/api/auth", (c) => authServerMetadata(c.req.raw));
app.get("/.well-known/openid-configuration", (c) => openIdMetadata(c.req.raw));
app.get("/health", (c) => c.json({ ok: true }));

// Integration guide for apps (and their AI agents), served at the root by convention.
const llmsTxt = readFileSync(new URL("../llms.txt", import.meta.url), "utf8");
app.get("/llms.txt", (c) => c.text(llmsTxt));

const search = (url: string) => new URL(url).search;
app.get("/sign-in", (c) => c.html(signInPage(search(c.req.url))));
app.get("/sign-up", (c) => c.html(signUpPage(search(c.req.url))));

app.get("/consent", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const signed = new Set(["sig", "ba_param", ...params.getAll("ba_param")]);
  const query = new URLSearchParams([...params].filter(([k]) => signed.has(k)));
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query.toString(), secret))) {
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
    return c.html(consentPage(client, redirectHost, scopes));
  } catch {
    return c.html(errorPage("Unknown or disabled application."), 404);
  }
});

app.get("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session ? c.html(homePage(session.user)) : c.redirect("/sign-in");
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`Auth server on :${port}`));
