import { db } from "../src/auth.ts";
import { setupTraffic } from "../src/traffic.ts";

try {
  await setupTraffic();
} finally {
  await db.end();
}
