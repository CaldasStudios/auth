const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Posts JSON to the auth API, attaching the signed OAuth query from the URL so
// Better Auth can resume the authorization flow. Follows `url` when returned.
const script = `
const q = location.search.slice(1);
async function call(path, body) {
  const res = await fetch("/api/auth" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(q ? { ...body, oauth_query: q } : body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error_description || "Request failed");
  return data;
}
function bind(form, run) {
  const err = form.querySelector("[role=alert]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const btns = form.querySelectorAll("button");
    btns.forEach((b) => (b.disabled = true));
    try {
      const data = await run(Object.fromEntries(new FormData(form)), e.submitter);
      location.href = data && data.url ? data.url : "/";
    } catch (x) {
      err.textContent = x.message;
      btns.forEach((b) => (b.disabled = false));
    }
  });
}
`;

const layout = (title: string, body: string, js = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · CaldasStudios</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f7;--card:#fff;--fg:#18181b;--muted:#6b6b76;--line:#d9d9de;--accent:#2f5bea}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1b1b1f;--fg:#ededf0;--muted:#a0a0ab;--line:#33333a;--accent:#7b9bff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
h1{font-size:1.35rem;margin:0 0 4px}p{color:var(--muted);margin:0 0 20px}
label{display:block;font-size:.9rem;margin:14px 0 6px}
input{width:100%;padding:10px 12px;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:8px}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button{width:100%;margin-top:20px;padding:11px;font:inherit;font-weight:600;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
button.secondary{background:transparent;color:var(--fg);border:1px solid var(--line);margin-top:10px}
button:disabled{opacity:.6;cursor:default}a{color:var(--accent)}
ul{padding-left:20px;margin:0 0 8px}[role=alert]{color:#d33;min-height:1.5em;margin:12px 0 0;font-size:.9rem}
.foot{margin:18px 0 0;font-size:.9rem;text-align:center}
</style></head>
<body><main>${body}</main>${js ? `<script>${script}${js}</script>` : ""}</body></html>`;

export const signInPage = (search: string) =>
  layout(
    "Sign in",
    `<h1>Sign in</h1><p>Use your CaldasStudios account.</p>
<form id="f">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<div role="alert" aria-live="polite"></div>
<button type="submit">Sign in</button></form>
<p class="foot">No account? <a href="/sign-up${esc(search)}">Create one</a></p>`,
    `bind(document.getElementById("f"), (v) => call("/sign-in/email", v));`,
  );

export const signUpPage = (search: string) =>
  layout(
    "Create account",
    `<h1>Create account</h1><p>One account for every CaldasStudios app.</p>
<form id="f">
<label for="name">Name</label><input id="name" name="name" autocomplete="name" required>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required>
<div role="alert" aria-live="polite"></div>
<button type="submit">Create account</button></form>
<p class="foot">Have an account? <a href="/sign-in${esc(search)}">Sign in</a></p>`,
    `bind(document.getElementById("f"), async (v) => {
  const data = await call("/sign-up/email", v);
  if (data.url || !q) return data;
  return call("/oauth2/continue", { created: true });
});`,
  );

export const consentPage = (client: { client_name?: string }, redirectHost: string, scopes: string[]) =>
  layout(
    "Authorize",
    `<h1>Authorize ${esc(client.client_name || "this app")}</h1>
<p>It will be redirected to <strong>${esc(redirectHost)}</strong> and may access:</p>
<ul>${scopes.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
<form id="f"><div role="alert" aria-live="polite"></div>
<button type="submit" value="1">Allow</button>
<button type="submit" value="0" class="secondary">Deny</button></form>`,
    `bind(document.getElementById("f"), (_, btn) => call("/oauth2/consent", { accept: btn.value === "1" }));`,
  );

export const homePage = (user: { name: string; email: string }) =>
  layout(
    "Account",
    `<h1>Hi, ${esc(user.name)}</h1><p>Signed in as ${esc(user.email)}.</p>
<form id="f"><div role="alert" aria-live="polite"></div><button type="submit">Sign out</button></form>`,
    `bind(document.getElementById("f"), async () => { await call("/sign-out", {}); return { url: "/sign-in" }; });`,
  );

export const errorPage = (message: string) =>
  layout("Error", `<h1>Something went wrong</h1><p>${esc(message)}</p><a href="/">Back</a>`);
