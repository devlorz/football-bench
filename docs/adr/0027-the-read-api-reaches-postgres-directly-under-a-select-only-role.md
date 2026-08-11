# The read API reaches Postgres directly under a select-only role

The Cloudflare Worker serving `/api/*` opens a Postgres connection with `postgres.js` rather
than going through `supabase-js`, and it connects as a dedicated `dashboard_read` role holding
`select` on the handful of tables the three pages read and nothing else. The grant alone reads
nothing: migration 0003 enabled row level security on every table in `public` and wrote no
policies, and Postgres denies by default under that combination. The scheduled jobs are
unaffected only because they connect as the owner, which is exempt unless a table forces row
level security. So the role is defined by two things together — a `select` grant and a
`for select to dashboard_read using (true)` policy on each readable table — and it is not
granted `bypassrls`, so that if a grant is ever widened the policies still stand between the
one internet-facing edge and the tables migration 0003 was written to close.

`dashboard_read` is `nologin`: it is the privilege role, and it holds no password, because a
migration is committed to a public repository and a migration is where this role is defined.
The Worker authenticates as a separate login role granted membership in it, provisioned by an
operator outside migrations with its password held as a Worker secret. Policies and grants
follow membership, so the login role reads exactly what `dashboard_read` may read and nothing
in the schema names it. Rotation is then a password change on the login role and a secret
update, with no migration and no schema change; revoking the Worker's access entirely is one
`revoke dashboard_read from` statement. The spec names
`supabase-js` for the database, so this is a deliberate deviation: `supabase-js` reaches the
data over PostgREST, and migration 0003 revoked `anon` and `authenticated` from the whole
`public` schema precisely so nothing client-reachable holds rights there. Restoring those
grants to serve a dashboard would undo that migration; the alternative — reaching PostgREST as
`service_role` — puts a key that bypasses Row Level Security on the one edge that answers
unauthenticated requests from the internet. A separate role with `select` and no more is the
smaller thing to be wrong about, and it is the same shape as the rest of the pipeline, which
already speaks SQL to Postgres through an injected `pg` client.

## Considered Options

- **`supabase-js` with the `service_role` key** — the path the spec names, rejected because
  the key it requires bypasses RLS on every table including `predictions` and `attempts`,
  and the Worker needs to read six tables. PostgREST exposes CRUD and declared RPC rather
  than arbitrary SQL, so no route can issue a `truncate`; what it can issue is `delete` and
  `patch`, and only `predictions` and `manager_states` carry immutability triggers.
  `attempts` and `scores` have none, so a read API holding that key is one wrong route away
  from erasing the attempt ledger through the ordinary CRUD surface. That is a worse failure
  than the one the key saves us from.
- **`supabase-js` with `anon` and narrow RLS policies** — rejected because it means granting
  `anon` back into `public` and then relying on policy to hold the line. ADR-era migration
  0003 records why that is not enough: `truncate` is governed by privilege and not by policy,
  so the grant is the load-bearing part and RLS is only defence in depth.
- **`bypassrls` on `dashboard_read` instead of per-table policies** — one line instead of one
  policy per table, and it would work: `bypassrls` skips policies, not privileges, so the
  role would still read only what it was granted. Rejected because that is exactly what it
  costs — the grant becomes the only thing holding the line, and migration 0003 exists
  because a grant is the part that gets widened by hand or through the Supabase dashboard.
  The policies are the redundant half of the pair on purpose.
- **`pg` on the Worker via Hyperdrive** — keeps one driver across the whole repo, rejected as
  the default because it binds a second Cloudflare product to a read path that makes a few
  queries a minute. Note that it is Hyperdrive, not the compatibility flag, that this avoids:
  `postgres.js` needs `nodejs_compat` on Workers too. Worth revisiting if connection setup
  turns out to dominate response time; the queries live in `src/read/` and take an injected
  client, so the driver is the only thing that would change.

## Consequences

- Queries live in `src/read/` and are tested against a real Postgres through the existing
  `temporary-postgres` harness, the same as every other module. The Worker holds routing and
  serialization only, so nothing about the read path needs a Worker running to be tested.
- The role is created by a migration, which makes it part of the schema every test builds.
  A new table the dashboard reads needs **both** a `select` grant and a select policy for
  `dashboard_read` in the migration that adds it, alongside the `enable row level security`
  that migration 0003 already requires. Granting without the policy fails silently as an
  empty response rather than as an error, so the read-layer tests `set role dashboard_read`
  before querying rather than running as the owner — otherwise they would pass on a table
  the Worker cannot read. `set role` also keeps the tests free of any login role or password:
  the privilege role is the whole of what is being tested.
- Provisioning the login role is a manual operator step, and it is the one part of the read
  path that no migration and no test covers. It belongs in the runbook beside the other
  recurring operator chores, with the two facts that make it recoverable: which role it is a
  member of, and that nothing but the Worker secret refers to it.
- The Worker runs with `nodejs_compat` and a compatibility date recent enough for it, because
  `postgres.js` reaches TCP through Node APIs. Direct connection removes Hyperdrive, not the
  flag.
- Two drivers now exist in the repo: `pg` for the scheduled jobs, `postgres.js` for the
  Worker. That is the cost of the Worker runtime not being Node, and it is contained — only
  the connection is different, the SQL is shared.
