// The admin dashboard: one page that loads its data from /admin/api.
import { esc } from "./pages.ts";

const css = `
:root{color-scheme:light dark;--bg:#F3F1E9;--card:#fff;--fg:#11141B;--muted:#6B6E76;--line:#DEDBD0;--accent:#2454FF;--link:#2454FF;--bar:#2454FF;--danger:#C62828;--grid:#ECE9DF;--tint:#DCE4FF}
@media (prefers-color-scheme:dark){:root{--bg:#11141B;--card:#181C25;--fg:#F3F1E9;--muted:#A3A6AE;--line:#2A2F3A;--link:#A8B9FF;--bar:#6B8CF5;--danger:#FF8A80;--grid:#232834;--tint:#1E2747}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Space Grotesk",system-ui,sans-serif}
code,.secret,textarea,.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--card)}
header .brand{display:flex;align-items:center;gap:12px;flex:1;min-width:0;color:inherit;text-decoration:none}
header .brand img{height:24px;width:auto}header .brand span{font:12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--link)}
.logo-dark{display:none}@media (prefers-color-scheme:dark){.logo-light{display:none}.logo-dark{display:block}}
header .who{color:var(--muted);font-size:.9rem}
.applogo{position:relative;flex:none;width:36px;height:36px;border-radius:9px;overflow:hidden;display:inline-grid;place-items:center;background:var(--tint);color:var(--link);font-weight:700;border:1px solid var(--line)}
.applogo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--card)}
main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}
h2{font-size:1.1rem;margin:32px 0 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}h2 .grow{flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.tile b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}.tile small{color:var(--muted)}
.muted{color:var(--muted)}a{color:var(--link)}
button,select{font:inherit;font-size:.9rem;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button.danger{color:var(--danger)}button:disabled{opacity:.5;cursor:default}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.chart{position:relative}.chart svg{display:block;width:100%;height:220px;overflow:visible}
.chart text{fill:var(--muted);font-size:11px}.chart .grid{stroke:var(--grid)}
.chart rect.bar{fill:var(--bar)}.chart rect.hit{fill:transparent}.chart g:hover rect.bar,.chart g:focus rect.bar{opacity:.75}
#tip{position:absolute;pointer-events:none;background:var(--fg);color:var(--bg);padding:6px 9px;border-radius:6px;font-size:.8rem;white-space:nowrap;display:none;transform:translate(-50%,-110%)}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}details{margin-top:12px}summary{cursor:pointer;color:var(--muted)}
.apps{display:grid;gap:12px}.app h3{margin:0;font-size:1rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.app code{font-size:.85rem;word-break:break-all}.app ul{margin:6px 0 0;padding-left:18px;font-size:.88rem;word-break:break-all}
.badge{font-size:.72rem;font-weight:600;padding:2px 7px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
.badge.off{color:var(--danger);border-color:currentColor}
.stats{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0;font-size:.88rem}.stats b{font-variant-numeric:tabular-nums}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
dialog{border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--fg);width:min(520px,calc(100vw - 32px));padding:20px}
dialog::backdrop{background:#0007}dialog h3{margin:0 0 8px}
label{display:block;font-size:.9rem;margin:12px 0 5px}label.check{display:flex;gap:8px;align-items:flex-start}label.check input{margin-top:4px}
input[type=text],textarea{width:100%;padding:9px 11px;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:8px}
textarea{min-height:72px;font-family:ui-monospace,monospace;font-size:.85rem}
.hint{font-size:.8rem;color:var(--muted);margin:4px 0 0}[role=alert]{color:var(--danger);margin:10px 0 0;font-size:.9rem}[role=alert]:empty{margin:0}
.secret{font-family:ui-monospace,monospace;font-size:.85rem;padding:10px;border:1px solid var(--line);border-radius:8px;word-break:break-all;user-select:all}
`;

const js = `
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const fmt = (n) => Number(n || 0).toLocaleString();
let stats = { apps: {} };

async function api(path, method = "GET", body) {
  const res = await fetch("/admin/api" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) location.href = "/sign-in";
  if (!res.ok) throw new Error(data.message || "Request failed (" + res.status + ")");
  return data;
}

function chart(daily) {
  const W = $("#chart").clientWidth || 1000, H = 220, L = 44, B = 22, max = Math.max(1, ...daily.map((d) => d.ok + d.errors));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step, bw = (W - L) / daily.length;
  const y = (v) => (H - B) - (v / top) * (H - B - 8);
  let svg = "";
  for (let i = 0; i <= 4; i++) {
    const v = (top / 4) * i;
    svg += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(Math.round(v)) + "</text>";
  }
  daily.forEach((d, i) => {
    const total = d.ok + d.errors, x = L + i * bw, h = (H - B) - y(total);
    const label = d.day + ": " + fmt(total) + " requests, " + fmt(d.errors) + " errors";
    svg += '<g tabindex="0" data-tip="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<rect class="hit" x="' + x + '" y="0" width="' + bw + '" height="' + (H - B) + '"/>' +
      (total ? '<rect class="bar" x="' + (x + 1) + '" y="' + y(total) + '" width="' + Math.max(1, bw - 2) + '" height="' + h + '" rx="2"/>' : "") +
      "</g>";
    if (i % Math.ceil(daily.length / 6) === 0 || i === daily.length - 1)
      svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + d.day.slice(5) + "</text>";
  });
  $("#chart svg").setAttribute("viewBox", "0 0 " + W + " " + H);
  $("#chart svg").innerHTML = svg;
  $("#chart-table").innerHTML = daily.map((d) =>
    "<tr><td>" + d.day + '</td><td class="n">' + fmt(d.ok) + '</td><td class="n">' + fmt(d.errors) + "</td></tr>").join("");
}

const tip = $("#tip");
function showTip(e) {
  const g = e.target.closest("g[data-tip]");
  if (!g) return (tip.style.display = "none");
  const box = $("#chart").getBoundingClientRect(), r = g.getBoundingClientRect();
  tip.textContent = g.dataset.tip;
  tip.style.display = "block";
  tip.style.left = Math.min(Math.max(r.left + r.width / 2 - box.left, 90), box.width - 90) + "px";
  tip.style.top = (e.type === "focusin" ? 40 : e.clientY - box.top) + "px";
}
$("#chart").addEventListener("mousemove", showTip);
addEventListener("resize", () => stats.daily && chart(stats.daily));
$("#chart").addEventListener("focusin", showTip);
$("#chart").addEventListener("mouseleave", () => (tip.style.display = "none"));
$("#chart").addEventListener("focusout", () => (tip.style.display = "none"));

async function loadOverview() {
  const days = $("#days").value;
  stats = await api("/overview?days=" + days);
  const total = stats.daily.reduce((s, d) => s + d.ok + d.errors, 0);
  const errors = stats.daily.reduce((s, d) => s + d.errors, 0);
  $("#tiles").innerHTML = [
    ["Requests", fmt(total), "last " + days + " days"],
    ["Error rate", total ? ((errors / total) * 100).toFixed(1) + "%" : "–", fmt(errors) + " 4xx/5xx responses"],
    ["Users", fmt(stats.users.total), fmt(stats.users.new) + " new · " + fmt(stats.users.banned) + " banned"],
    ["Signed in now", fmt(stats.sessions.users), fmt(stats.sessions.sessions) + " active sessions"],
  ].map(([k, v, s]) => '<div class="card tile"><small>' + k + "</small><b>" + v + "</b><small>" + s + "</small></div>").join("");
  chart(stats.daily);
  $("#endpoints").innerHTML = stats.endpoints.length
    ? stats.endpoints.map((e) => "<tr><td><code>" + esc(e.path) + '</code></td><td class="n">' + fmt(e.hits) +
      '</td><td class="n">' + fmt(e.errors) + "</td></tr>").join("")
    : '<tr><td colspan="3" class="muted">No traffic recorded yet.</td></tr>';
}

let apps = [];
async function loadApps() {
  apps = await api("/apps");
  $("#apps").innerHTML = apps.length ? apps.map((a) => {
    const s = stats.apps[a.client_id] || {};
    const isPublic = a.token_endpoint_auth_method === "none";
    const badges = [
      a.disabled ? '<span class="badge off">Disabled</span>' : "",
      a.skip_consent ? '<span class="badge">Trusted</span>' : "",
      isPublic ? '<span class="badge">Public (PKCE)</span>' : '<span class="badge">Confidential</span>',
      a.locked ? '<span class="badge" title="Listed in TRUSTED_CLIENT_IDS; change it in the server config">Locked</span>' : "",
    ].join("");
    const id = esc(a.client_id), lock = a.locked ? " disabled" : "";
    const initial = esc((a.client_name || "?").trim().charAt(0).toUpperCase());
    const logo = /^https?:\/\//i.test(a.logo_uri || "")
      ? '<img src="' + esc(a.logo_uri) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : "";
    return '<article class="card app"><h3><span class="applogo" aria-hidden="true">' + initial + logo + "</span>" +
      esc(a.client_name || "Unnamed app") + badges + "</h3>" +
      '<div class="muted">Client ID <code>' + id + "</code></div>" +
      '<div class="stats"><span><b>' + fmt(s.authorize) + "</b> sign-in requests</span><span><b>" + fmt(s.token) +
      "</b> token requests</span><span><b>" + fmt(s.errors) + "</b> errors</span><span><b>" + fmt(s.users) + "</b> users with live tokens</span></div>" +
      '<div class="muted">Redirect URIs</div><ul>' + (a.redirect_uris || []).map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul>" +
      (a.post_logout_redirect_uris?.length ? '<div class="muted" style="margin-top:8px">Logout redirect URIs</div><ul>' +
        a.post_logout_redirect_uris.map((u) => "<li>" + esc(u) + "</li>").join("") + "</ul>" : "") +
      '<div class="actions">' +
      '<button data-act="edit" data-id="' + id + '"' + lock + ">Edit</button>" +
      '<button data-act="toggle" data-id="' + id + '"' + lock + ">" + (a.disabled ? "Enable" : "Disable") + "</button>" +
      (isPublic ? "" : '<button data-act="rotate" data-id="' + id + '"' + lock + ">Rotate secret</button>") +
      '<button class="danger" data-act="delete" data-id="' + id + '"' + lock + ">Delete</button></div></article>";
  }).join("") : '<div class="card muted">No apps yet. Register one to let it sign users in.</div>';
}

function showSecret(title, data) {
  $("#secret-title").textContent = title;
  $("#secret-id").textContent = data.client_id;
  $("#secret-value").textContent = data.client_secret || "(public app, no secret)";
  $("#secret").showModal();
}

const form = $("#app-form"), dialog = $("#app-dialog");
const lines = (v) => v.split("\\n").map((s) => s.trim()).filter(Boolean);
function openForm(app) {
  form.reset();
  form.dataset.id = app ? app.client_id : "";
  $("#app-dialog-title").textContent = app ? "Edit app" : "Register app";
  form.client_name.value = app?.client_name || "";
  form.logo_uri.value = app?.logo_uri || "";
  form.redirect_uris.value = (app?.redirect_uris || []).join("\\n");
  form.post_logout_redirect_uris.value = (app?.post_logout_redirect_uris || []).join("\\n");
  form.skip_consent.checked = !!app?.skip_consent;
  form.public.checked = app?.token_endpoint_auth_method === "none";
  form.public.disabled = !!app;
  form.querySelector("[role=alert]").textContent = "";
  dialog.showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const alert = form.querySelector("[role=alert]"), id = form.dataset.id;
  const body = {
    client_name: form.client_name.value,
    logo_uri: form.logo_uri.value,
    redirect_uris: lines(form.redirect_uris.value),
    post_logout_redirect_uris: lines(form.post_logout_redirect_uris.value),
    skip_consent: form.skip_consent.checked,
  };
  form.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    if (id) await api("/apps/" + encodeURIComponent(id), "PATCH", body);
    else {
      const created = await api("/apps", "POST", { ...body, public: form.public.checked });
      showSecret("App registered", created);
    }
    dialog.close();
    await loadApps();
  } catch (x) {
    alert.textContent = x.message;
  } finally {
    form.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
});

$("#apps").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const app = apps.find((a) => a.client_id === btn.dataset.id), path = "/apps/" + encodeURIComponent(app.client_id);
  const name = app.client_name || app.client_id;
  if (btn.dataset.act === "edit") return openForm(app);
  try {
    if (btn.dataset.act === "toggle") {
      if (!app.disabled && !confirm("Disable " + name + "? Its users can no longer sign in to it.")) return;
      await api(path, "PATCH", { disabled: !app.disabled });
    } else if (btn.dataset.act === "rotate") {
      if (!confirm("Rotate the secret of " + name + "? The current secret stops working immediately.")) return;
      showSecret("New secret", await api(path + "/rotate-secret", "POST", {}));
    } else if (btn.dataset.act === "delete") {
      if (prompt("This permanently deletes " + name + " and its tokens. Type the app name to confirm.") !== name) return;
      await api(path, "DELETE", {});
    }
    await loadApps();
  } catch (x) {
    window.alert(x.message);
  }
});

$("#new-app").addEventListener("click", () => openForm());
$("#cancel").addEventListener("click", () => dialog.close());
$("#secret-done").addEventListener("click", () => $("#secret").close());
$("#days").addEventListener("change", () => refresh());
$("#sign-out").addEventListener("click", async () => {
  await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  location.href = "/sign-in";
});

async function refresh() {
  try {
    await loadOverview();
    await loadApps();
  } catch (x) {
    $("#load-error").textContent = x.message;
  }
}
refresh();
`;

export const adminPage = (user: { name: string; email: string }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin · Caldas Studios Auth</title>
<link rel="icon" href="/assets/brand/app-icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=Space+Grotesk:wght@400;500;700&display=swap">
<style>${css}</style></head>
<body>
<header><a class="brand" href="/admin"><img class="logo-light" src="/assets/brand/logo-primary.svg" alt="Caldas Studios" width="156" height="24"><img class="logo-dark" src="/assets/brand/logo-reversed.svg" alt="Caldas Studios" width="156" height="24"><span>Auth admin</span></a><span class="who">${esc(user.email)}</span><button id="sign-out">Sign out</button></header>
<main>
<div role="alert" id="load-error"></div>
<h2><span class="grow">Traffic</span>
<label for="days" class="muted" style="margin:0;font-weight:400">Period</label>
<select id="days"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></h2>
<div class="tiles" id="tiles"></div>
<div class="card" style="margin-top:12px">
<div class="muted" style="font-size:.9rem;margin-bottom:8px">Requests per day (UTC)</div>
<div class="chart" id="chart"><svg viewBox="0 0 1000 220" role="img" aria-label="Requests per day"></svg><div id="tip"></div></div>
<details><summary>Show as table</summary><div class="scroll"><table><thead><tr><th>Day</th><th class="n">Requests</th><th class="n">Errors</th></tr></thead><tbody id="chart-table"></tbody></table></div></details>
</div>
<div class="card scroll" style="margin-top:12px">
<table><thead><tr><th>Top endpoints</th><th class="n">Requests</th><th class="n">Errors</th></tr></thead><tbody id="endpoints"></tbody></table>
</div>

<h2><span class="grow">Apps</span><button class="primary" id="new-app">Register app</button></h2>
<div class="apps" id="apps"><div class="card muted">Loading…</div></div>
</main>

<dialog id="app-dialog" aria-labelledby="app-dialog-title"><form id="app-form">
<h3 id="app-dialog-title">Register app</h3>
<label for="f-name">Name</label><input type="text" id="f-name" name="client_name" required maxlength="100">
<label for="f-logo">Logo URL (optional)</label><input type="text" id="f-logo" name="logo_uri" inputmode="url" placeholder="https://app.caldasstudios.com/icon.png">
<p class="hint">Shown on the sign-in and consent screens. Square image, https only.</p>
<label for="f-redirect">Redirect URIs (one per line)</label>
<textarea id="f-redirect" name="redirect_uris" required placeholder="https://app.caldasstudios.com/api/auth/callback/caldas"></textarea>
<p class="hint">Must be https in production. Better Auth apps use <code>/api/auth/callback/caldas</code>.</p>
<label for="f-logout">Logout redirect URIs (optional)</label>
<textarea id="f-logout" name="post_logout_redirect_uris" placeholder="https://app.caldasstudios.com"></textarea>
<label class="check"><input type="checkbox" name="skip_consent"> <span>Trusted first-party app (no consent screen)</span></label>
<label class="check"><input type="checkbox" name="public"> <span>Public app (SPA or mobile, no secret, PKCE only). Cannot be changed later.</span></label>
<div role="alert" aria-live="polite"></div>
<div class="actions"><button type="submit" class="primary">Save</button><button type="button" id="cancel">Cancel</button></div>
</form></dialog>

<dialog id="secret" aria-labelledby="secret-title">
<h3 id="secret-title">App registered</h3>
<p class="muted">Store the secret in the app's secret store now. It is not shown again.</p>
<p class="muted">Client ID</p><div class="secret" id="secret-id"></div>
<p class="muted">Client secret</p><div class="secret" id="secret-value"></div>
<div class="actions"><button class="primary" id="secret-done">Done</button></div>
</dialog>
<script>${js}</script>
</body></html>`;
