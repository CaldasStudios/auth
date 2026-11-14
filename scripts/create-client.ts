// Registers an app as an OAuth/OIDC client. Run with ADMIN_EMAIL and ADMIN_PASSWORD set.
// npm run client:create -- --name "My App" --redirect https://app.example.com/api/auth/callback/caldas
//   [--redirect ...] [--logout-redirect https://app.example.com] [--trusted] [--public]
import { parseArgs } from "node:util";
import { auth } from "../src/auth.ts";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    redirect: { type: "string", multiple: true },
    "logout-redirect": { type: "string", multiple: true },
    trusted: { type: "boolean", default: false },
    public: { type: "boolean", default: false },
  },
});

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!values.name || !values.redirect?.length || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Required: --name, at least one --redirect, and ADMIN_EMAIL / ADMIN_PASSWORD env vars.");
  process.exit(1);
}
if (values.trusted && values.public) {
  console.error("--trusted cannot be combined with --public (public clients must always show consent).");
  process.exit(1);
}

// The admin endpoints need a signed-in admin session.
const { headers } = await auth.api.signInEmail({
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  returnHeaders: true,
});
const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const client = await auth.api.adminCreateOAuthClient({
  headers: new Headers({ cookie }),
  body: {
    client_name: values.name,
    redirect_uris: values.redirect,
    post_logout_redirect_uris: values["logout-redirect"],
    skip_consent: values.trusted,
    enable_end_session: true,
    ...(values.public ? { token_endpoint_auth_method: "none" as const } : {}),
  },
});

console.log(JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret }, null, 2));
console.log("\nStore the secret now; it is not shown again.");
if (values.trusted) {
  console.log(`Add ${client.client_id} to TRUSTED_CLIENT_IDS and restart so its settings cannot be changed via the API.`);
}
process.exit(0);
