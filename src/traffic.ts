// Request counters for the admin dashboard, kept as daily totals in the auth database.
// Writes finish during the request so serverless suspension cannot discard counters.
import { ADMIN_CLIENT_REFERENCE, db } from "./auth.ts";

const buffer = new Map<string, number>();

export async function setupTraffic() {
  await db.query(`create table if not exists traffic_daily (
    day date not null,
    path text not null,
    client_id text not null default '',
    status smallint not null,
    hits integer not null,
    primary key (day, path, client_id, status)
  )`);
  // Apps registered before admins shared ownership belonged to one admin; hand them to all admins.
  await db.query(
    `update "oauthClient" set "referenceId" = $1, "userId" = null
     where "referenceId" is null and "userId" in (select id from "user" where role = 'admin')`,
    [ADMIN_CLIENT_REFERENCE],
  );
}

// The app a request belongs to: `client_id` on /authorize, or HTTP Basic credentials on /token.
function clientIdOf(req: Request) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("client_id");
  if (fromQuery) return fromQuery;
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!basic) return "";
  try {
    return decodeURIComponent(atob(basic).split(":")[0]);
  } catch {
    return "";
  }
}

export async function record(req: Request, path: string, status: number) {
  const day = new Date().toISOString().slice(0, 10);
  // Unknown paths are grouped so random URLs cannot grow the table.
  const bucket = status === 404 ? "(not found)" : path;
  const key = JSON.stringify([day, bucket, clientIdOf(req).slice(0, 200), Math.floor(status / 100)]);
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
  await flush();
}

async function flush() {
  if (!buffer.size) return;
  const rows = [...buffer].map(([key, hits]) => [...JSON.parse(key), hits]);
  buffer.clear();
  try {
    // Client IDs that are not registered apps are stored as '' so they cannot grow the table either.
    await db.query(
      `insert into traffic_daily (day, path, client_id, status, hits)
       select d::date, p, coalesce((select o."clientId" from "oauthClient" o where o."clientId" = c), ''), s, sum(h)
       from unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::int[]) as t(d, p, c, s, h)
       group by 1, 2, 3, 4
       on conflict (day, path, client_id, status) do update set hits = traffic_daily.hits + excluded.hits`,
      [0, 1, 2, 3, 4].map((i) => rows.map((r) => r[i])),
    );
  } catch (error) {
    console.error("Could not save traffic counters", error);
    for (const [d, p, c, s, h] of rows) {
      const key = JSON.stringify([d, p, c, s]);
      buffer.set(key, (buffer.get(key) ?? 0) + h);
    }
  }
}

export async function overview(days = 30) {
  const since = `now() - make_interval(days => ${days})`;
  const [users, sessions, daily, endpoints, apps] = await Promise.all([
    db.query(`select count(*)::int as total,
      count(*) filter (where "createdAt" > ${since})::int as new,
      count(*) filter (where banned)::int as banned
      from "user"`),
    db.query(`select count(*)::int as sessions, count(distinct "userId")::int as users
      from session where "expiresAt" > now()`),
    db.query(
      `select to_char(g.day, 'YYYY-MM-DD') as day,
        coalesce(sum(t.hits) filter (where t.status < 4), 0)::int as ok,
        coalesce(sum(t.hits) filter (where t.status >= 4), 0)::int as errors
      from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') as g(day)
      left join traffic_daily t on t.day = g.day
      group by g.day order by g.day`,
      [days],
    ),
    db.query(`select path, sum(hits)::int as hits, coalesce(sum(hits) filter (where status >= 4), 0)::int as errors
      from traffic_daily where day > current_date - ${days}
      group by path order by hits desc limit 15`),
    db.query(`select client_id,
        coalesce(sum(hits) filter (where path like '%/oauth2/authorize'), 0)::int as authorize,
        coalesce(sum(hits) filter (where path like '%/oauth2/token'), 0)::int as token,
        coalesce(sum(hits) filter (where status >= 4), 0)::int as errors
      from traffic_daily where day > current_date - ${days} and client_id <> ''
      group by client_id`),
  ]);
  // Users holding an unexpired token for each app.
  const activeUsers = await db.query(`select "clientId" as client_id, count(distinct "userId")::int as users from (
      select "clientId", "userId" from "oauthAccessToken" where "expiresAt" > now() and "userId" is not null
      union all
      select "clientId", "userId" from "oauthRefreshToken" where "expiresAt" > now() and revoked is null
    ) t group by 1`);
  const perApp: Record<string, { authorize: number; token: number; errors: number; users: number }> = {};
  for (const r of apps.rows) perApp[r.client_id] = { ...r, users: 0 };
  for (const r of activeUsers.rows) {
    perApp[r.client_id] ??= { authorize: 0, token: 0, errors: 0, users: 0 };
    perApp[r.client_id].users = r.users;
  }
  return {
    days,
    users: users.rows[0],
    sessions: sessions.rows[0],
    daily: daily.rows,
    endpoints: endpoints.rows,
    apps: perApp,
  };
}
