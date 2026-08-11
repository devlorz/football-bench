# The dashboard deploy, and the credential it runs on

The dashboard is one Cloudflare Worker at
**<https://football-bench.leelorz6.workers.dev>**. It serves the built Astro
pages as static assets and answers `/api/*` itself, so the browser fetches a
relative path and nothing is cross-origin.

Config: [wrangler.toml](../../wrangler.toml). Decisions:
[ADR-0027](../adr/0027-the-read-api-reaches-postgres-directly-under-a-select-only-role.md)
and [ADR-0028](../adr/0028-the-dashboard-is-a-static-build-that-fetches-at-runtime.md).

## Deploying

The assets are built separately and `wrangler` uploads whatever is in
`dashboard/dist` — a stale `dist` deploys silently, so build first, every time.

```sh
cd dashboard && npm run build && cd ..
npx wrangler deploy
```

`wrangler versions upload` gives a preview URL on the same hostname family
without taking production traffic. **A version preview holds the same secrets
as production and therefore serves live data** — it is not a data-free preview,
and its URL is public. See "What this deploy does not do" below.

## The credential

Two roles, and the split is the point:

- **`dashboard_read`** — `nologin`, holds every `select` grant and the matching
  Row Level Security policies. Created by
  [migration 0017](../../migrations/0017_dashboard_read_role.sql). It is schema
  and it is in the repository.
- **`dashboard_worker`** — logs in, holds nothing but membership in
  `dashboard_read`. Created by hand, **never by a migration**, so rotating its
  password is a secret change and not a schema change, and no checkout of this
  repository names it with its password.

### Provisioning it

Once per database, and again for any new environment. Run against the target
database as an owner, with `PW` set to a fresh password you did not choose by
hand:

```sh
PW="$(openssl rand -hex 24)"

PW="$PW" psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dashboard_worker') then
    create role dashboard_worker login;
  end if;
end;
$$;

\set pw `printf '%s' "$PW"`
alter role dashboard_worker with login password :'pw';

grant dashboard_read to dashboard_worker;
SQL
```

Then hand the Worker the connection string. On Supabase the pooler takes the
role and the project ref as one username — `dashboard_worker.<project_ref>`,
not `dashboard_worker` — and the ref is the suffix of whatever username the
owner URL already uses:

```sh
# built from the owner URL: same host, same port, same database
printf 'postgresql://dashboard_worker.<ref>:%s@<host>:5432/postgres' "$PW" \
  | npx wrangler secret put DATABASE_URL
```

Check it before trusting it. This must print `dashboard_worker` and a row
count, and it proves the grants *and* the policies — under RLS a grant without
a policy returns zero rows and reports no error:

```sh
psql "postgresql://dashboard_worker.<ref>:$PW@<host>:5432/postgres" \
  -c "select current_user, (select count(*) from models)"
```

### Rotating it

The same two commands, in this order, and no schema changes at all:

1. `alter role dashboard_worker with login password '<new>'` — every existing
   Worker connection is unaffected until it reconnects, and the Worker opens a
   connection per request, so the window is one request long.
2. `wrangler secret put DATABASE_URL` with the new string, then
   `npx wrangler deploy` is **not** needed — a secret takes effect on its own.

Rotate on any suspicion, on any operator leaving, and whenever the password has
been typed anywhere it could be logged.

### Revoking access

One statement. It leaves the role and its password alone and takes away
everything they can reach:

```sql
revoke dashboard_read from dashboard_worker;
```

The endpoints then return errors rather than data, and the pages show their
error line. To take the login away as well, `drop role dashboard_worker` — but
revoke first and confirm the dashboard has gone dark before dropping anything.

## What this deploy does not do

Both are consequences of `*.workers.dev` and both are fixed by putting the
Worker on a custom domain, which changes no code and no configuration here.

- **Nothing caches `/api/*`.** Cloudflare's cache is functional for Workers on
  custom domains and for Pages functions on `*.pages.dev`; it is not for a
  Worker on `*.workers.dev`. The responses carry their `Cache-Control` and
  nothing at the edge acts on it — verified by the absence of any
  `cf-cache-status` header on `/api/*`, against `cf-cache-status: HIT` on the
  static assets, which the asset router does cache.
- **Version previews are not data-free.** They hold the production secret and
  answer with production data on a public URL. Treat every preview URL as
  production until the Worker is somewhere that separates them.

## Observability

`[observability]` is on in `wrangler.toml`. Logs are in the Cloudflare
dashboard under the Worker, and `npx wrangler tail` follows them live. It was
turned on because a single unexplained 500 from `/api/entrants` on the first
deploy left no log behind to explain it.
