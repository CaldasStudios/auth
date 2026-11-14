import { spawnSync } from "node:child_process";

// Schema changes use a direct Neon connection; local Postgres needs only DATABASE_URL.
process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const result = spawnSync(process.execPath, [
  "node_modules/.bin/auth", "migrate", "--config", "src/auth.ts", "-y",
], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await import("./setup-db.ts");
