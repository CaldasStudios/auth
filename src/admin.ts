// Admin dashboard: traffic and OAuth app management. Every route requires a signed-in admin.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth, ownOrigin, trustedClientIds } from "./auth.ts";
import { adminPage } from "./admin-page.ts";
import { errorPage } from "./pages.ts";
import { overview } from "./traffic.ts";
import { validateAppRedirects } from "./redirect-policy.ts";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
const admin = new Hono<{ Variables: { session: Session } }>().basePath("/admin");

admin.use("*", async (c, next) => {
  const isApi = c.req.path.startsWith("/admin/api");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return isApi ? c.json({ message: "Sign in required" }, 401) : c.redirect("/sign-in");
  if (session.user.role !== "admin") {
    return isApi
      ? c.json({ message: "Admins only" }, 403)
      : c.html(errorPage("This page is only for administrators."), 403);
  }
  if (c.req.method !== "GET") {
    // Cookie-authenticated writes: accept same-origin JSON only (blocks cross-site form posts).
    const sameOrigin = c.req.header("origin") === ownOrigin;
    const json = c.req.header("content-type")?.startsWith("application/json");
    if (!sameOrigin || !json) return c.json({ message: "Cross-site or non-JSON request refused" }, 403);
  }
  c.set("session", session);
  await next();
  c.header("Cache-Control", "no-store");
});

admin.get("/", (c) => c.html(adminPage(c.get("session").user)));

admin.get("/api/overview", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
  return c.json(await overview(days));
});

admin.get("/api/apps", async (c) => {
  const apps = (await auth.api.getOAuthClients({ headers: c.req.raw.headers })) ?? [];
  return c.json(apps.map((a) => ({ ...a, locked: trustedClientIds.has(a.client_id) })));
});

// Only the fields the dashboard edits; Better Auth validates the values themselves.
const urls = (v: unknown) =>
  Array.isArray(v) ? v.filter((u): u is string => typeof u === "string" && u.trim() !== "").map((u) => u.trim()) : undefined;
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
// App logos load on the sign-in page, so only https URLs (or http://localhost in development) are accepted.
// An empty string removes the logo.
function logoUrl(v: unknown) {
  if (typeof v !== "string") return undefined;
  const url = v.trim();
  if (!url) return "";
  const allowed =
    /^https:\/\//i.test(url) || (process.env.NODE_ENV !== "production" && /^http:\/\/localhost[:/]/i.test(url));
  if (!allowed || !URL.canParse(url)) throw new HTTPException(400, { message: "Logo URL must start with https://." });
  return url;
}

function appFields(body: Record<string, unknown>) {
  const logout = urls(body.post_logout_redirect_uris);
  const redirects = urls(body.redirect_uris);
  validateAppRedirects([...(redirects ?? []), ...(logout ?? [])], body.allow_localhost === true);
  const fields = {
    client_name: typeof body.client_name === "string" ? body.client_name.trim().slice(0, 100) : undefined,
    redirect_uris: redirects,
    post_logout_redirect_uris: logout,
    skip_consent: bool(body.skip_consent),
    disabled: bool(body.disabled),
    logo_uri: logoUrl(body.logo_uri),
  };
  // Drop unset keys: an explicit undefined would overwrite the stored value during validation.
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<typeof fields>;
}

admin.post("/api/apps", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const fields = appFields(body);
  const isPublic = body.public === true;
  if (!fields.logo_uri) delete fields.logo_uri;
  if (!fields.client_name || !fields.redirect_uris?.length) {
    return c.json({ message: "Name and at least one redirect URI are required." }, 400);
  }
  if (isPublic && fields.skip_consent) {
    return c.json({ message: "Public apps must always show consent." }, 400);
  }
  const client = await auth.api.adminCreateOAuthClient({
    headers: c.req.raw.headers,
    body: {
      ...fields,
      enable_end_session: true,
      ...(isPublic ? { token_endpoint_auth_method: "none" as const } : {}),
    },
  });
  return c.json({ client_id: client.client_id, client_secret: client.client_secret }, 201);
});

admin.patch("/api/apps/:id", async (c) => {
  const update = appFields(await c.req.json().catch(() => ({})));
  const app = await auth.api.adminUpdateOAuthClient({
    headers: c.req.raw.headers,
    body: { client_id: c.req.param("id"), update },
  });
  return c.json(app);
});

admin.post("/api/apps/:id/rotate-secret", async (c) => {
  const app = await auth.api.rotateClientSecret({
    headers: c.req.raw.headers,
    body: { client_id: c.req.param("id") },
  });
  return c.json({ client_id: app.client_id, client_secret: app.client_secret });
});

admin.delete("/api/apps/:id", async (c) => {
  await auth.api.deleteOAuthClient({ headers: c.req.raw.headers, body: { client_id: c.req.param("id") } });
  return c.json({ ok: true });
});

// Better Auth APIError carries an HTTP status and an OAuth-style description.
admin.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ message: error.message }, error.status);
  const e = error as { statusCode?: number; body?: { message?: string; error_description?: string } };
  const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  if (status === 500) console.error(error);
  const message = e.body?.error_description ?? e.body?.message ?? (status === 500 ? "Server error" : error.message);
  return c.json({ message }, status as 400);
});

export default admin;
