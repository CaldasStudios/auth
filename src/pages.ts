export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Posts JSON to the auth API, attaching the signed OAuth query from the URL so
// Better Auth can resume the authorization flow. Follows `url` when returned;
// a handler that returns false keeps the user on the page.
const script = `
const q = location.search.slice(1);
async function send(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error_description || "Request failed");
  return data;
}
function call(path, body, base = "/api/auth") {
  return send(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(q ? { ...body, oauth_query: q } : body),
  });
}
const get = (path) => send("/api/auth" + path);
async function passkeySignIn() {
  const optionsJSON = await get("/passkey/generate-authenticate-options");
  const response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });
  return call("/passkey/verify-authentication", { response });
}
const friendly = (x) =>
  x && x.name === "NotAllowedError" ? "The passkey request was cancelled or timed out." : x.message;
function bind(form, run) {
  const err = form.querySelector("[role=alert]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const btns = form.querySelectorAll("button");
    btns.forEach((b) => (b.disabled = true));
    try {
      const data = await run(Object.fromEntries(new FormData(form)), e.submitter);
      if (data !== false) return (location.href = data && data.url ? data.url : "/");
    } catch (x) {
      err.textContent = friendly(x);
    }
    btns.forEach((b) => (b.disabled = false));
  });
}
`;

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=Space+Grotesk:wght@400;500;700&display=swap">`;

// Brand: Electric cobalt #2454FF, Deep ink #11141B, Warm paper #F3F1E9 (CaldasStudios/brand-assets).
const css = `
:root{color-scheme:light dark;--bg:#F3F1E9;--card:#fff;--fg:#11141B;--muted:#6B6E76;--line:#DEDBD0;--accent:#2454FF;--on-accent:#fff;--link:#2454FF;--tint:#DCE4FF;--ok:#1B7F3B;--err:#C62828;--ink:#11141B;--paper:#F3F1E9}
@media (prefers-color-scheme:dark){:root{--bg:#11141B;--card:#181C25;--fg:#F3F1E9;--muted:#A3A6AE;--line:#2A2F3A;--link:#A8B9FF;--tint:#1E2747;--ok:#5CC27C;--err:#FF8A80}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--fg);font:16px/1.5 "Space Grotesk",system-ui,sans-serif}
.mono,.eyebrow,code,.codes{font-family:"IBM Plex Mono",ui-monospace,monospace}
.content{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px 32px}
.brand{width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;gap:12px;margin:0 0 28px;text-align:center}
.brand.wide{max-width:560px}
.brand a{display:block;line-height:0;border-radius:4px}
.logo{display:block;height:32px;width:auto}
.logo-dark{display:none}
@media (prefers-color-scheme:dark){.logo-light{display:none}.logo-dark{display:block}}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:32px}
main.wide{max-width:560px}
@media (max-width:480px){main{padding:24px 20px}}
footer{margin-top:28px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.eyebrow{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--link);margin:0 0 10px}
h1{font-size:1.75rem;line-height:1.15;font-weight:500;letter-spacing:-.01em;margin:0 0 8px}
h2{font-size:1.1rem;font-weight:500;margin:0 0 4px}
p{color:var(--muted);margin:0 0 24px}
section{border-top:1px solid var(--line);padding-top:24px;margin-top:28px}section p{margin-bottom:12px}
label{display:block;font-size:.9rem;font-weight:500;margin:16px 0 6px}
label.check{display:flex;gap:10px;align-items:center;font-weight:400;color:var(--muted)}label.check input{width:18px;height:18px;margin:0;accent-color:var(--accent)}
input{width:100%;padding:11px 12px;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px}
input:hover{border-color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input:focus-visible{outline-offset:0;border-color:var(--accent)}
button{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:24px;padding:12px;font:inherit;font-weight:500;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:var(--on-accent);cursor:pointer;transition:filter .15s}
button:hover:not(:disabled){filter:brightness(1.08)}
button.secondary{background:var(--card);color:var(--fg);border-color:var(--line);margin-top:10px}
button.secondary:hover:not(:disabled){filter:none;border-color:var(--muted)}
button.small{width:auto;margin:0;padding:6px 12px;font-size:.9rem}
button svg{flex:none}
button:disabled{opacity:.6;cursor:default}a{color:var(--link)}
ul{padding-left:20px;margin:0 0 8px}[role=alert]{color:var(--err);margin:12px 0 0;font-size:.9rem}[role=alert]:empty{margin:0}
#alt button:first-child{margin-top:0}
.foot{margin:20px 0 0;font-size:.9rem;text-align:center}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font:12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;margin:24px 0 4px}.or::before,.or::after{content:"";flex:1;border-top:1px solid var(--line)}
.on{color:var(--ok);font-weight:600}
.item{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--line)}.item small{color:var(--muted);display:block}
.item [role=alert]{flex-basis:100%;min-height:0;margin:0}
.qr{background:#fff;padding:8px;border-radius:8px;width:200px;margin:8px auto 12px}.qr svg{display:block;width:100%;height:auto}
code,.codes{font-size:.9rem;word-break:break-all}
.codes{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;padding:12px;border:1px solid var(--line);border-radius:6px;margin:0 0 12px}
.pair{display:flex;align-items:center;gap:12px;margin:0 0 20px}
.pair .dots{width:28px;border-top:2px dotted var(--line)}
.tile{position:relative;flex:none;width:48px;height:48px;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:var(--tint);color:var(--link);font-weight:700;font-size:1.3rem;border:1px solid var(--line)}
.tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--card)}
.pair > img{width:48px;height:48px;flex:none}
`;

const logo = `<img class="logo logo-light" src="/assets/brand/logo-primary.svg" alt="Caldas Studios" width="208" height="32">
<img class="logo logo-dark" src="/assets/brand/logo-reversed.svg" alt="Caldas Studios" width="208" height="32">`;

const layout = (title: string, body: string, js = "", opts: { wide?: boolean; webauthn?: boolean } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Caldas Studios</title>
<link rel="icon" href="/assets/brand/app-icon.svg" type="image/svg+xml">
<meta name="theme-color" content="#11141B">
${fonts}
<style>${css}</style>
${opts.webauthn ? `<script src="/assets/webauthn.js"></script>` : ""}
</head>
<body><div class="content">
<header class="brand${opts.wide ? " wide" : ""}"><a href="/" aria-label="Caldas Studios account">${logo}</a></header>
<main${opts.wide ? ` class="wide"` : ""}>${body}</main>
<footer class="mono">Secure sign-in</footer>
</div>
${js ? `<script>${script}${js}</script>` : ""}</body></html>`;

/** The app a user is signing in to during an OAuth flow. */
export type AppInfo = { name: string; icon?: string | null };

const safeImage = (url?: string | null) => (url && /^https:\/\//i.test(url) ? url : url && /^http:\/\/localhost[:/]/i.test(url) ? url : "");

// Caldas Studios icon ··· app logo (or its initial when it has none or the image fails to load).
const appPair = (app: AppInfo) => {
  const icon = safeImage(app.icon);
  return `<div class="pair" aria-hidden="true">
<img src="/assets/brand/app-icon.svg" alt="" width="48" height="48"><span class="dots"></span>
<span class="tile">${esc(app.name.trim().charAt(0).toUpperCase() || "?")}${
    icon ? `<img src="${esc(icon)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""
  }</span></div>`;
};

const heading = (app: AppInfo | undefined, plain: string, withApp: string, sub: string) =>
  app
    ? `${appPair(app)}<p class="eyebrow">${esc(app.name)}</p><h1>${esc(withApp)} ${esc(app.name)}</h1><p>${esc(sub)}</p>`
    : `<p class="eyebrow">Caldas Studios account</p><h1>${esc(plain)}</h1><p>${esc(sub)}</p>`;

const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
const passkeyIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20v-1.5A5.5 5.5 0 0 1 8 13h2"/><circle cx="17" cy="13.5" r="2.5"/><path d="M17 16v5l1.5-1.2M17 18.5h1.5"/></svg>`;

// Google and passkey buttons shown above the password form.
const altSignIn = (google: boolean, passkey: boolean) =>
  google || passkey
    ? `<form id="alt">
${google ? `<button type="submit" value="google" class="secondary">${googleIcon}Continue with Google</button>` : ""}
${passkey ? `<button type="submit" value="passkey" class="secondary">${passkeyIcon}Sign in with a passkey</button>` : ""}
<div role="alert" aria-live="polite"></div></form><div class="or">or use email</div>`
    : "";

const altSignInJs = `
const alt = document.getElementById("alt");
if (alt) bind(alt, (_, btn) =>
  btn.value === "google"
    ? call("/sign-in/social", { provider: "google", callbackURL: "/", errorCallbackURL: "/error" })
    : passkeySignIn());
`;

export const signInPage = (search: string, google: boolean, app?: AppInfo) =>
  layout(
    app ? `Sign in to ${app.name}` : "Sign in",
    `${heading(app, "Sign in", "Sign in to", app ? "Continue with your Caldas Studios account." : "One account for every Caldas Studios app.")}
${altSignIn(google, true)}
<form id="f">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<div role="alert" aria-live="polite"></div>
<button type="submit">Sign in</button></form>
<p class="foot">No account? <a href="/sign-up${esc(search)}">Create one</a></p>`,
    `${altSignInJs}
bind(document.getElementById("f"), async (v) => {
  const data = await call("/sign-in/email", v);
  return data.twoFactorRedirect ? { url: "/two-factor" + location.search } : data;
});`,
    { webauthn: true },
  );

export const signUpPage = (search: string, google: boolean, app?: AppInfo) =>
  layout(
    "Create account",
    `${heading(app, "Create your account", "Create an account for", "One account for every Caldas Studios app.")}
${altSignIn(google, false)}
<form id="f">
<label for="name">Name</label><input id="name" name="name" autocomplete="name" required>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="pw-hint">
<p class="mono" id="pw-hint" style="font-size:12px;margin:6px 0 0">At least 10 characters.</p>
<div role="alert" aria-live="polite"></div>
<button type="submit">Create account</button></form>
<p class="foot">Have an account? <a href="/sign-in${esc(search)}">Sign in</a></p>`,
    `${altSignInJs}
bind(document.getElementById("f"), async (v) => {
  const data = await call("/sign-up/email", v);
  if (data.url || !q) return data;
  return call("/oauth2/continue", { created: true });
});`,
  );

export const twoFactorPage = (search: string, app?: AppInfo) =>
  layout(
    "Two-step verification",
    `${app ? appPair(app) : ""}<p class="eyebrow">${app ? esc(app.name) : "Caldas Studios account"}</p>
<h1>Two-step verification</h1><p id="hint">Enter the 6-digit code from your authenticator app.</p>
<form id="f">
<label for="code" id="code-label">Code</label>
<input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
<label class="check"><input type="checkbox" name="trustDevice" value="1"> Trust this device for 30 days</label>
<div role="alert" aria-live="polite"></div>
<button type="submit">Verify</button></form>
<p class="foot"><a href="#" id="toggle">Use a backup code instead</a> · <a href="/sign-in${esc(search)}">Start over</a></p>`,
    `let backup = false;
const code = document.getElementById("code");
document.getElementById("toggle").addEventListener("click", (e) => {
  e.preventDefault();
  backup = !backup;
  e.target.textContent = backup ? "Use your authenticator app instead" : "Use a backup code instead";
  document.getElementById("hint").textContent = backup
    ? "Enter one of the backup codes you saved. Each code works once."
    : "Enter the 6-digit code from your authenticator app.";
  document.getElementById("code-label").textContent = backup ? "Backup code" : "Code";
  code.value = "";
  if (backup) code.removeAttribute("pattern");
  else code.setAttribute("pattern", "[0-9]{6}");
  code.maxLength = backup ? 32 : 6;
  code.inputMode = backup ? "text" : "numeric";
  code.focus();
});
bind(document.getElementById("f"), (v) =>
  call(backup ? "/two-factor/verify-backup-code" : "/two-factor/verify-totp", {
    code: v.code.trim(),
    trustDevice: !!v.trustDevice,
  }));`,
  );

export const consentPage = (app: AppInfo, redirectHost: string, scopes: string[]) =>
  layout(
    "Authorize",
    `${appPair(app)}<p class="eyebrow">${esc(app.name)}</p>
<h1>Allow ${esc(app.name)} to use your account?</h1>
<p>You'll go back to <strong>${esc(redirectHost)}</strong>. It will be able to see:</p>
<ul>${scopes.map((s) => `<li>${esc(scopeLabels[s] ?? s)}</li>`).join("")}</ul>
<form id="f"><div role="alert" aria-live="polite"></div>
<button type="submit" value="1">Allow</button>
<button type="submit" value="0" class="secondary">Deny</button></form>`,
    `bind(document.getElementById("f"), (_, btn) => call("/oauth2/consent", { accept: btn.value === "1" }));`,
  );

const scopeLabels: Record<string, string> = {
  openid: "Your account ID",
  profile: "Your name and picture",
  email: "Your email address",
  offline_access: "Stay signed in when you're away",
};

type HomeData = {
  user: { name: string; email: string; role?: string | null; twoFactorEnabled?: boolean | null };
  hasPassword: boolean;
  googleLinked: boolean;
  googleEnabled: boolean;
  passkeys: { id: string; name?: string | null; createdAt: Date | string }[];
};

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const twoFactorSection = (user: HomeData["user"], hasPassword: boolean) => {
  if (!hasPassword) return `<p>Set a password above to turn this on.</p>`;
  if (user.twoFactorEnabled)
    return `<p><span class="on">On.</span> Signing in with your password also asks for a code from your authenticator app.</p>
<form id="tf-manage"><label for="tf-pw">Current password</label>
<input id="tf-pw" name="password" type="password" autocomplete="current-password" required>
<div role="alert" aria-live="polite"></div>
<button type="submit" value="codes" class="secondary">Get new backup codes</button>
<button type="submit" value="off" class="secondary">Turn off</button></form>
<div id="tf-codes" hidden></div>`;
  return `<p>Off. Add a code from an authenticator app (1Password, Google Authenticator, Authy…) to your sign-in.</p>
<form id="tf-start"><label for="tf-pw">Current password</label>
<input id="tf-pw" name="password" type="password" autocomplete="current-password" required>
<div role="alert" aria-live="polite"></div>
<button type="submit" class="secondary">Set up</button></form>
<form id="tf-verify" hidden>
<p>Scan this QR code with your authenticator app, or enter the key by hand.</p>
<div class="qr" id="tf-qr"></div><p>Key: <code id="tf-secret"></code></p>
<p>Save these backup codes somewhere safe. Each one signs you in once if you lose your device.</p>
<div class="codes" id="tf-backup"></div>
<label for="tf-code">Code from the app</label>
<input id="tf-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
<div role="alert" aria-live="polite"></div>
<button type="submit">Turn on</button></form>`;
};

const passwordSection = `<section aria-labelledby="pw-h"><h2 id="pw-h">Password</h2>
<p>Not set. You sign in with Google or a passkey. Add a password to also sign in with your email, and to turn on two-step verification.</p>
<form id="pw-set" method="post"><label for="pw-new">New password</label>
<input id="pw-new" name="newPassword" type="password" autocomplete="new-password" minlength="10" required aria-describedby="pw-hint">
<p class="mono" id="pw-hint" style="font-size:12px;margin:6px 0 0">At least 10 characters.</p>
<label for="pw-confirm">Confirm password</label>
<input id="pw-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required>
<div role="alert" aria-live="polite"></div>
<button type="submit" class="secondary">Set password</button></form></section>
`;

const googleSection = (email: string, linked: boolean) => `<section aria-labelledby="g-h"><h2 id="g-h">Google</h2>
${
  linked
    ? `<p><span class="on">Connected.</span> You can sign in with Google.</p>`
    : `<p>Connect the Google account that uses ${esc(email)} to sign in with it.</p>
<form id="g-link"><div role="alert" aria-live="polite"></div><button type="submit" class="secondary">Connect Google</button></form>`
}</section>`;

export const homePage = ({ user, hasPassword, googleLinked, googleEnabled, passkeys }: HomeData) =>
  layout(
    "Account",
    `<h1>Hi, ${esc(user.name)}</h1><p>Signed in as ${esc(user.email)}.</p>
${user.role === "admin" ? `<p><a href="/admin">Open the admin dashboard</a></p>` : ""}
${hasPassword ? "" : passwordSection}
<section aria-labelledby="tf-h"><h2 id="tf-h">Two-step verification</h2>
${twoFactorSection(user, hasPassword)}
</section>

<section aria-labelledby="pk-h"><h2 id="pk-h">Passkeys</h2>
<p>Sign in with your fingerprint, face, or device PIN instead of a password.</p>
${passkeys
  .map(
    (p) => `<form class="item pk-del"><div>${esc(p.name || "Passkey")}<small>Added ${day(p.createdAt)}</small></div>
<input type="hidden" name="id" value="${esc(p.id)}"><button type="submit" class="secondary small" aria-label="Remove ${esc(p.name || "passkey")}">Remove</button>
<div role="alert" aria-live="polite"></div></form>`,
  )
  .join("")}
<form id="pk-add"><label for="pk-name">Name (optional)</label>
<input id="pk-name" name="name" maxlength="60" placeholder="e.g. MacBook, iPhone">
<div role="alert" aria-live="polite"></div>
<button type="submit" class="secondary">Add a passkey</button></form>
</section>

${googleEnabled ? googleSection(user.email, googleLinked) : ""}

<section><form id="out"><div role="alert" aria-live="polite"></div><button type="submit">Sign out</button></form></section>`,
    `const $ = (id) => document.getElementById(id);
const showCodes = (el, codes) => {
  el.replaceChildren(...codes.map((c) => Object.assign(document.createElement("span"), { textContent: c })));
};
bind($("out"), async () => { await call("/sign-out", {}); return { url: "/sign-in" }; });
if ($("pw-set")) bind($("pw-set"), async (v) => {
  if (v.newPassword !== v.confirm) throw new Error("The passwords don't match.");
  await call("/account/password", { newPassword: v.newPassword }, "");
  return { url: "/" };
});
if ($("tf-start")) bind($("tf-start"), async (v) => {
  const data = await call("/account/two-factor/enable", v, "");
  $("tf-qr").innerHTML = data.qr;
  $("tf-secret").textContent = data.secret;
  showCodes($("tf-backup"), data.backupCodes);
  $("tf-start").hidden = true;
  $("tf-verify").hidden = false;
  $("tf-code").focus();
  return false;
});
if ($("tf-verify")) bind($("tf-verify"), async (v) => {
  await call("/two-factor/verify-totp", { code: v.code.trim() });
  return { url: "/" };
});
if ($("tf-manage")) bind($("tf-manage"), async (v, btn) => {
  if (btn.value === "off") {
    if (!confirm("Turn off two-step verification?")) return false;
    await call("/two-factor/disable", v);
    return { url: "/" };
  }
  const data = await call("/two-factor/generate-backup-codes", v);
  const list = Object.assign(document.createElement("div"), { className: "codes" });
  showCodes(list, data.backupCodes);
  const note = Object.assign(document.createElement("p"), { textContent: "Your old backup codes no longer work. Save these:" });
  $("tf-codes").replaceChildren(note, list);
  $("tf-codes").hidden = false;
  return false;
});
bind($("pk-add"), async (v) => {
  const optionsJSON = await get("/passkey/generate-register-options");
  const response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON });
  await call("/passkey/verify-registration", { response, name: v.name.trim() || undefined });
  return { url: "/" };
});
document.querySelectorAll(".pk-del").forEach((f) =>
  bind(f, async (v) => {
    if (!confirm("Remove this passkey?")) return false;
    await call("/passkey/delete-passkey", { id: v.id });
    return { url: "/" };
  }));
if ($("g-link")) bind($("g-link"), () => call("/link-social", { provider: "google", callbackURL: "/", errorCallbackURL: "/error" }));`,
    { wide: true, webauthn: true },
  );

// Messages for errors Better Auth reports on /error after a Google sign-in.
const socialErrors: Record<string, string> = {
  account_not_linked:
    "An account with this email already exists. Sign in with your password, then connect Google from your account page.",
  unable_to_link_account: "This Google account could not be linked to your account.",
  email_does_not_match: "That Google account uses a different email than your CaldasStudios account.",
  account_already_linked_to_different_user: "That Google account is already connected to another user.",
  signup_disabled: "New accounts are created by an administrator. Ask one to invite you.",
  email_not_verified: "Google did not confirm this email address.",
};

export const errorFromQuery = (params: URLSearchParams) => {
  const code = params.get("error") ?? "";
  return socialErrors[code] ?? params.get("error_description") ?? (code ? `Sign-in failed (${code}).` : "Unknown error.");
};

export const errorPage = (message: string) =>
  layout("Error", `<h1>Something went wrong</h1><p>${esc(message)}</p><a href="/">Back</a>`);
