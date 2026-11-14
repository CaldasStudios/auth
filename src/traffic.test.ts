import assert from "node:assert/strict";
import { test } from "node:test";

process.env.BETTER_AUTH_URL = "https://auth.example.com";
process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-at-least-32-characters";
const { db } = await import("./auth.ts");
const { record } = await import("./traffic.ts");

test("traffic is persisted before the request finishes, without waiting for a timer", async (t) => {
  let saved = false;
  t.mock.method(db, "query", async () => {
    await new Promise((resolve) => setImmediate(resolve));
    saved = true;
    return { rows: [], rowCount: 1 };
  });
  await record(new Request("https://auth.example.com/sign-in"), "/sign-in", 200);
  assert.equal(saved, true);
});

test("a failed traffic write does not fail sign-in and is retried on the next request", async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => errors.push(args));
  let attempts = 0;
  let savedHits = 0;
  t.mock.method(db, "query", async (_sql: string, values: unknown[][]) => {
    if (++attempts === 1) throw new Error("Database temporarily unavailable");
    savedHits = (values[4] as number[]).reduce((total, hits) => total + hits, 0);
    return { rows: [], rowCount: 1 };
  });
  const req = new Request("https://auth.example.com/sign-in");
  await assert.doesNotReject(record(req, "/sign-in", 200));
  assert.equal(errors.length, 1);
  await record(req, "/sign-in", 200);
  assert.equal(savedHits, 2);
});
