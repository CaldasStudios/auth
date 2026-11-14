import assert from "node:assert/strict";
import { test } from "node:test";

process.env.BETTER_AUTH_URL = "https://auth.example.com";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-characters";
const { auth } = await import("./auth.ts");
const { default: admin } = await import("./admin.ts");

test("admin registration requires explicit localhost opt-in for callbacks and logout URLs", async (t) => {
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: "admin", role: "admin" }, session: {} }));
  t.mock.method(auth.api, "adminCreateOAuthClient", async ({ body }: { body: Record<string, unknown> }) => {
    assert.deepEqual(body.redirect_uris, ["http://localhost:5173/callback"]);
    assert.equal("allow_localhost" in body, false);
    return { client_id: "local-test" };
  });
  const request = (body: Record<string, unknown>) => admin.request("https://auth.example.com/admin/api/apps", {
    method: "POST",
    headers: { origin: "https://auth.example.com", "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test", ...body }),
  });
  assert.equal((await request({ redirect_uris: ["http://localhost:5173/callback"] })).status, 400);
  assert.equal((await request({ redirect_uris: ["https://app.example.com/callback"], post_logout_redirect_uris: ["http://localhost:5173"] })).status, 400);
  assert.equal((await request({ redirect_uris: ["http://localhost:5173/callback"], allow_localhost: "true" })).status, 400);
  assert.equal((await request({ redirect_uris: ["http://localhost:5173/callback"], allow_localhost: true })).status, 201);
});

test("editing an app can clear localhost logout redirects when disabling testing", async (t) => {
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: "admin", role: "admin" }, session: {} }));
  t.mock.method(auth.api, "adminUpdateOAuthClient", async ({ body }: { body: { update: Record<string, unknown> } }) => {
    assert.deepEqual(body.update.post_logout_redirect_uris, []);
    return { client_id: "local-test", ...body.update };
  });
  const response = await admin.request("https://auth.example.com/admin/api/apps/local-test", {
    method: "PATCH",
    headers: { origin: "https://auth.example.com", "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://app.example.com/callback"], post_logout_redirect_uris: [], allow_localhost: false }),
  });
  assert.equal(response.status, 200);
});
