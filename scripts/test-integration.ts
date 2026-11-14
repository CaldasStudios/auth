import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { Pool } from "pg";

assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration checks");
const db = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const address = listener.address();
assert.ok(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve) => listener.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const email = `neon-integration-${randomUUID()}@example.com`;
const password = randomUUID();
const server = spawn(process.execPath, ["src/local.ts"], {
  env: { ...process.env, PORT: String(port), BETTER_AUTH_URL: base, DISABLE_SIGNUP: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stderr.on("data", (chunk) => { output += chunk; });
const timeout = setTimeout(() => server.kill(), 60_000);

async function post(path: string, body: unknown, cookie = "") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, cookie },
    body: JSON.stringify(body),
  });
}

try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => { throw new Error(`App failed to start: ${output}`); }),
  ]);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  console.log("PASS: app started and /health returned 200");

  const signup = await post("/api/auth/sign-up/email", { email, password, name: "Neon integration check" });
  assert.equal(signup.status, 200, `Sign-up failed: ${await signup.text()}`);
  const stored = await db.query('select id from "user" where email = $1', [email]);
  assert.equal(stored.rowCount, 1);
  const userId = stored.rows[0].id;
  const account = await db.query('select password from account where "userId" = $1 and "providerId" = $2', [userId, "credential"]);
  assert.equal(account.rowCount, 1);
  assert.ok(account.rows[0].password && account.rows[0].password !== password);
  console.log("PASS: sign-up persisted the user and hashed password in Neon Postgres");

  const wrong = await post("/api/auth/sign-in/email", { email, password: "incorrect-password" });
  assert.equal(wrong.status, 401);
  console.log("PASS: incorrect password rejected with 401");

  const signin = await post("/api/auth/sign-in/email", { email, password });
  assert.equal(signin.status, 200);
  const cookie = signin.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  const sessions = await db.query('select id from session where "userId" = $1', [userId]);
  assert.ok(sessions.rowCount && sessions.rowCount > 0);
  console.log("PASS: sign-in issued a session cookie and persisted the session in Neon");

  const session = await fetch(`${base}/api/auth/get-session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.id, userId);
  assert.equal((await fetch(base, { headers: { cookie }, redirect: "manual" })).status, 200);
  assert.equal((await fetch(base, { redirect: "manual" })).status, 302);
  console.log("PASS: restored session grants account access; anonymous access redirects");

  const discovery = await fetch(`${base}/.well-known/openid-configuration`);
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).issuer, `${base}/api/auth`);
  const counters = await db.query("select sum(hits)::int as hits from traffic_daily where day = current_date and path = '/api/auth/sign-up/email'");
  assert.ok(counters.rows[0].hits > 0);
  console.log("PASS: OIDC discovery and persisted dashboard traffic work");

  assert.equal((await post("/api/auth/sign-out", {}, cookie)).status, 200);
  const ended = await fetch(`${base}/api/auth/get-session`, { headers: { cookie } });
  assert.equal(await ended.json(), null);
  console.log("PASS: sign-out invalidates the session");
} finally {
  clearTimeout(timeout);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill();
    await once(server, "exit");
  }
  try {
    await db.query('delete from "user" where email = $1', [email]);
    console.log("Cleanup: temporary integration user and related auth records removed");
  } finally {
    await db.end();
  }
}
