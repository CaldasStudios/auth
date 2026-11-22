import assert from "node:assert/strict";
import { test } from "node:test";

process.env.BETTER_AUTH_URL = "https://auth.example.com";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-characters";
const { db } = await import("./auth.ts");
const { default: app } = await import("./index.ts");

test("the serverless handler serves pages and bundled files without database setup", async (t) => {
  // Only the traffic write is expected; importing the handler must not run migrations.
  const queries: string[] = [];
  t.mock.method(db, "query", async (sql: string) => {
    queries.push(sql);
    return { rows: [], rowCount: 1 };
  });
  for (const [path, contentType, content] of [
    ["/health", "application/json", '"ok":true'],
    ["/sign-in", "text/html", "Caldas"],
    ["/assets/brand/app-icon.svg", "image/svg+xml", "<svg"],
    ["/assets/webauthn.js", "text/javascript", "SimpleWebAuthnBrowser"],
    ["/llms.txt", "text/plain", "Caldas"],
  ]) {
    const response = await app.request(`https://auth.example.com${path}`);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get("content-type")?.startsWith(contentType), path);
    assert.ok((await response.text()).includes(content), path);
  }
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => sql.includes("insert into traffic_daily")));
});

test("set password: the form shows only without a password, and the route checks origin and input", async (t) => {
  t.mock.method(db, "query", async () => ({ rows: [], rowCount: 1 }));
  const { homePage } = await import("./pages.ts");
  const data = { user: { name: "A", email: "a@example.com" }, googleLinked: false, googleEnabled: false, passkeys: [] };
  assert.ok(homePage({ ...data, hasPassword: false }).includes('id="pw-set"'));
  assert.ok(!homePage({ ...data, hasPassword: true }).includes('id="pw-set"'));
  const post = (origin: string, body: unknown) =>
    app.request("https://auth.example.com/account/password", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post("https://evil.example", { newPassword: "long-enough-pw" })).status, 403);
  assert.equal((await post("https://auth.example.com", {})).status, 400);
  assert.equal((await post("https://auth.example.com", null)).status, 400);
  // Session lookups need the real schema, so they are stubbed: signed out gives 401, a 2-day-old session 403.
  const { auth } = await import("./auth.ts");
  const getSession = t.mock.method(auth.api, "getSession", async () => null);
  assert.equal((await post("https://auth.example.com", { newPassword: "long-enough-pw" })).status, 401);
  getSession.mock.mockImplementation(async () => ({ session: { createdAt: new Date(Date.now() - 2 * 86400e3) } }) as never);
  assert.equal((await post("https://auth.example.com", { newPassword: "long-enough-pw" })).status, 403);
  // A fresh session reaches setPassword; Better Auth's errors keep their status and message.
  getSession.mock.mockImplementation(async () => ({ session: { createdAt: new Date(Date.now() - 3600e3) } }) as never);
  const setPassword = t.mock.method(auth.api, "setPassword", async () => ({ status: true }) as never);
  assert.equal((await post("https://auth.example.com", { newPassword: "long-enough-pw" })).status, 200);
  assert.deepEqual(setPassword.mock.calls[0]?.arguments[0]?.body, { newPassword: "long-enough-pw" });
  const { APIError } = await import("better-auth/api");
  setPassword.mock.mockImplementation(async () => {
    throw new APIError("BAD_REQUEST", { message: "User already has a password set" });
  });
  const res = await post("https://auth.example.com", { newPassword: "long-enough-pw" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, "User already has a password set");
});
