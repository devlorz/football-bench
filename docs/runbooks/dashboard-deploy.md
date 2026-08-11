# The dashboard deploy, and the credential it runs on

The dashboard is one Cloudflare Worker at
**<https://football-bench.leelorz6.workers.dev>**. It serves the built Astro
pages as static assets and answers `/api/*` itself, so the browser fetches a
relative path and nothing is cross-origin.

Config: [wrangler.toml](../../wrangler.toml). Decisions:
[ADR-0027](../adr/0027-the-read-api-reaches-postgres-directly-under-a-select-only-role.md),
[ADR-0028](../adr/0028-the-dashboard-is-a-static-build-that-fetches-at-runtime.md)
and
[ADR-0029](../adr/0029-the-dashboard-deploys-as-one-worker-serving-both-the-assets-and-the-read-api.md),
which supersedes 0028's topology.

## Deploying

The assets are built separately and `wrangler` uploads whatever is in
`dashboard/dist` — a stale `dist` deploys silently, so build first, every time.

```sh
cd dashboard && npm run build && cd ..
npx wrangler deploy
```

There is no preview step, deliberately. `preview_urls = false` is set, because a
Worker version preview holds the same secrets as production and would answer a
public URL with production data. Look at changes locally against the seeded
Postgres before deploying; see "What this deploy does not do" below.

## The credential

Two roles, and the split is the point:

- **`dashboard_read`** — `nologin`, holds every `select` grant and the matching
  Row Level Security policies. Created by
  [migration 0017](../../migrations/0017_dashboard_read_role.sql). It is schema
  and it is in the repository.
- **`dashboard_worker_a` / `dashboard_worker_b`** — one of the two logs in at
  any time, holding nothing but membership in `dashboard_read`. Created by hand,
  **never by a migration**, so rotating the password is a secret change and not
  a schema change, and no checkout of this repository names it with its
  password. Two names rather than one because rotation swaps between them
  without a window; see below. **The role live today is the unsuffixed
  `dashboard_worker`**, from the first deploy, which predates the two-name
  scheme. The first rotation moves it to `dashboard_worker_a` and it never comes
  back — every command here matches `dashboard_worker%`, so both shapes are
  covered and nothing has to be done about it in the meantime.

**Which one is live right now** is a question every command here needs
answered, so answer it from the database rather than from memory. Everything
below uses `$LIVE` for it:

```sh
LIVE="$(psql "$OWNER_DATABASE_URL" -At -c "
  select rolname from pg_roles
   where rolname like 'dashboard_worker%' and rolcanlogin")"
echo "$LIVE"   # expect exactly one name
```

Two names printed means a rotation was left half-finished; finish or unwind it
before doing anything else.

**Never put the password in a command line.** `psql "postgres://user:pw@host"`
puts it in `argv`, where any process on the box can read it out of `ps` for as
long as the command runs. Pass it in the environment as `PGPASSWORD` and leave
it out of the URI. (Shell history is not the exposure here: history records the
literal `"$PW"`, not what it expands to.)

### Provisioning it

Once per database, and again for any new environment. `_a` is just the name to
start from; a rotation will move it to `_b` and back:

```sh
ROLE=dashboard_worker_a
PW="$(openssl rand -hex 24)"

ROLE="$ROLE" PW="$PW" psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\set role `printf '%s' "$ROLE"`
\set pw   `printf '%s' "$PW"`

create role :"role" login;
alter role :"role" with login password :'pw';
grant dashboard_read to :"role";
SQL
```

Then hand the Worker the connection string. On Supabase the pooler takes the
role and the project ref as one username — `dashboard_worker_a.<project_ref>`,
not `dashboard_worker_a` — and the ref is the suffix of whatever username the
owner URL already uses:

```sh
# built from the owner URL: same host, same port, same database
printf 'postgresql://%s.<ref>:%s@<host>:5432/postgres' "$ROLE" "$PW" \
  | npx wrangler secret put DATABASE_URL
```

Check it before trusting it. The password goes in the environment, not the URI.
This must print the role name and a row count, and it proves the grants *and*
the policies — under RLS a grant without a policy returns zero rows and reports
no error:

```sh
PGPASSWORD="$PW" psql "postgresql://$ROLE.<ref>@<host>:5432/postgres" \
  -c "select current_user, (select count(*) from models)"
```

### Rotating it

No schema changes at all — but **the naive rotation takes the dashboard down**,
and for longer than one request. The Worker opens a connection per request, so
the moment the password changes *every* subsequent request fails, and it keeps
failing until the new secret is live. That is however long you take between the
two commands, plus the seconds `wrangler` needs. Have the second command
written out before running the first.

The outage-free version swaps to the other role and has no window at all.
Prefer it. The old role stays valid and usable the whole way through, so step 4
is a real rollback and not a hope:

```sh
# 0. which one is live, and therefore which one we are moving to
LIVE="$(psql "$OWNER_DATABASE_URL" -At -c "
  select rolname from pg_roles
   where rolname like 'dashboard_worker%' and rolcanlogin")"
NEXT=$([ "$LIVE" = dashboard_worker_a ] \
  && echo dashboard_worker_b || echo dashboard_worker_a)
PW="$(openssl rand -hex 24)"

# 1. the other login role, membership in the same nologin role
ROLE="$NEXT" PW="$PW" psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\set role `printf '%s' "$ROLE"`
\set pw   `printf '%s' "$PW"`
create role :"role" login;
alter role :"role" with login password :'pw';
grant dashboard_read to :"role";
SQL

# 2. point the Worker at it -- old role still valid, so nothing fails
printf 'postgresql://%s.<ref>:%s@<host>:5432/postgres' "$NEXT" "$PW" \
  | npx wrangler secret put DATABASE_URL
```

**Step 3 is the verification, and it is the step to get right.** "Is the
dashboard up" is not the question — the edge caches `/api/*` now, so a page
that looks fine may be a `HIT` served without the Worker running at all, and
dropping the old role on that evidence is dropping the rollback. Prove the new
credential twice: directly, and through a request the cache cannot answer.

```sh
# 3a. the new login itself reaches the data
PGPASSWORD="$PW" psql "postgresql://$NEXT.<ref>@<host>:5432/postgres" \
  -c "select current_user, (select count(*) from models)"

# 3b. and the Worker is using it -- a unique key, so this cannot be a HIT
curl -sS -D- -o /dev/null \
  "https://football-bench.leelorz6.workers.dev/api/leaderboard?rot=$(date +%s)" \
  | grep -iE '^(HTTP|cf-cache-status)'
# require: HTTP 200 *and* cf-cache-status: MISS
```

Only with both of those in hand:

```sh
# 4. retire the old one
psql "$OWNER_DATABASE_URL" -c "drop role \"$LIVE\""
```

Nothing is ever without a valid credential, so nothing goes dark. The next
rotation reads `$LIVE` again and swaps back.

`wrangler secret put` takes effect on its own — `npx wrangler deploy` is **not**
needed after it.

Rotate on any suspicion, on any operator leaving, and whenever the password has
been typed anywhere it could be logged.

### Revoking access

One statement. It leaves the role and its password alone and takes away
everything they can reach — but it must name **the role that is live now**,
which a rotation may have changed since anyone last read this page. Never paste
a role name in from memory:

```sh
psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record;
begin
  for r in select rolname from pg_roles
            where rolname like 'dashboard_worker%' loop
    execute format('revoke dashboard_read from %I', r.rolname);
  end loop;
end;
$$;
SQL
```

Every `dashboard_worker*` role — the live one, the unsuffixed original, and
anything left over from a half-finished rotation — because in an emergency the
one you miss is the one that matters.

Confirm it went dark before believing it, and confirm it past the cache — an
ordinary page load can be served from the edge for up to five minutes after the
Worker has stopped being able to read anything:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://football-bench.leelorz6.workers.dev/api/leaderboard?rev=$(date +%s)"
# require: 500
```

The pages then show their one error line. To take the login away as well,
`drop role` each of the same names — but revoke first and confirm as above
before dropping anything.

## What this deploy does not do

- **There is no hosted preview.** A Worker version preview holds the *same
  secrets as production* and answers with production data on a public URL, so
  it is not the data-free preview ADR-0028 assumed. `preview_urls = false` is
  set. Anything to be looked at before a deploy is looked at locally against
  the seeded Postgres. A custom domain plus a Pages project would restore a
  real preview environment; nothing else will.

`/api/*` **is** edge-cached — `[cache] enabled = true` in `wrangler.toml` makes
Cloudflare check the cache before invoking the Worker, and responses carry
`cf-cache-status: MISS` then `HIT`. The lifetime is in
`cloudflare-cdn-cache-control`, not `Cache-Control`; see ADR-0029 for why the
two are separate headers. To confirm it after a change, request the same unique
query key twice and compare — a hit is roughly 0.04s against 0.25s cold.

## Observability

`[observability]` is on in `wrangler.toml`. Logs are in the Cloudflare
dashboard under the Worker, and `npx wrangler tail` follows them live. It was
turned on because a single unexplained 500 from `/api/entrants` on the first
deploy left no log behind to explain it.
