import { db } from "../src/auth.ts";
import { setupTraffic } from "../src/traffic.ts";

try {
  await setupTraffic();
  // One password login per user, so two simultaneous "set password" requests cannot both insert one.
  await db.query(
    `create unique index if not exists account_credential_user_unique on account ("userId") where "providerId" = 'credential'`,
  );
} finally {
  await db.end();
}
