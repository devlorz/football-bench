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
./scripts/deploy-dashboard.sh
```

**One script rather than a sequence to retype**, because the sequence has
invariants that kept getting lost when it was written out in prose and then
approximated somewhere else: it refuses a dirty tree, because `wrangler`
uploads the working tree and not `HEAD`; it builds `dashboard/dist`, because
that is a deploy input and a stale one deploys silently; and it moves the
`deployed` tag *only after* the deploy returns, to the SHA captured before the
build. A tag that moved after a failed deploy names a commit that never ran,
which is worse than no tag at all, because the recovery below trusts it.

Read [scripts/deploy-dashboard.sh](../../scripts/deploy-dashboard.sh) — it is
short, and it is the authority. Every other place in this document that
deploys calls it.

**Two records of which commit is running, because Cloudflare knows version IDs
and nothing about git.**

The `--message` is the convenient one: `npx wrangler deployments list` reads it
straight back. It is also the perishable one — that command shows only the ten
most recent deployments, and `wrangler secret put` creates a deployment of its
own. Ten credential rotations after a deploy, the SHA has fallen off the end of
the list and the recovery below has nothing to read.

The `deployed` tag is the durable one. It lives in the repository the recovery
clones from and it survives any number of rotations. Move it on every deploy or
it lies, which is worse than not existing — which is why it is inside the chain
above rather than a step to remember.

**It is on one machine, and that is the real limit of all this.** Once the
branch is pushed, publish the tag on every deploy:

```sh
PUSH_TAG=1 ./scripts/deploy-dashboard.sh
```

That path is in the script because getting it right is not obvious. A plain
`git push origin deployed` fails once the tag has moved — it is not a
fast-forward — and a bare `--force-with-lease` is *also* rejected, because a
lease with no explicit value wants a remote-tracking ref and tags do not have
one. The script reads the remote's current value with `git ls-remote` and
leases against it explicitly, so a tag someone else moved in the meantime is a
loud rejection rather than a silent overwrite. Two people deploying at once
should collide.

Until the branch is pushed at all, `PUSH_TAG` has nothing to publish to and the
tag is local, like the commits.

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
  back — every command here names all three, so both shapes are covered and
  nothing has to be done about it in the meantime.

**Never put a password in a command line**, the owner's included. `psql
"postgres://user:pw@host"` puts it in `argv`, where any process on the box can
read it out of `ps` for as long as the command runs. Split every connection
string into a URI without a password and a `PGPASSWORD` beside it. (Shell
history is not the exposure: history records the literal `"$PW"`, not what it
expands to.)

`$OWNER_URI` below is the owner connection with its password taken out, and
`PGPASSWORD` is exported once for the session. Given a `.env` holding
`DATABASE_URL=postgresql://user:pw@host/db`:

```sh
OWNER_URI="$(env -u DATABASE_URL node --env-file=.env -e '
  const u = new URL(process.env.DATABASE_URL); u.password = "";
  process.stdout.write(u.toString());
')"
export PGPASSWORD="$(env -u DATABASE_URL node --env-file=.env -e '
  const u = new URL(process.env.DATABASE_URL);
  process.stdout.write(decodeURIComponent(u.password));
')"

# say out loud which database this session is now pointed at. POSIX sh: the
# userinfo carries the Supabase project ref, and two environments can share a
# pooler host, so print the user as well as the host -- the host alone does not
# tell them apart.
USERINFO=${OWNER_URI#*//}; USERINFO=${USERINFO%%@*}
HOSTPART=${OWNER_URI#*@}; HOSTPART=${HOSTPART%%/*}
printf 'operating on: %s at %s\n' "$USERINFO" "$HOSTPART"
```

Four things that look fussy and are not.

**`env -u DATABASE_URL`.** Node gives a variable already in the environment
precedence over the same name in `--env-file` — verified, not assumed: with
`FOO` exported, `node --env-file` reads the exported one. So an operator who
exported a dev or staging `DATABASE_URL` earlier in the session gets *that*
database, silently, and the provisioning or revocation lands somewhere it was
never meant to. `env -u` removes the name for the length of the one command.
The line printing the host is the cheap confirmation that it worked; read it
before running anything below.

**`node --env-file`, not `set -a; . ./.env`.** Sourcing runs `.env` as a shell
script, so anything in it that looks like a command substitution executes; and
`set -a` exports every name it contains — the owner `DATABASE_URL` among them —
into every process started for the rest of the session. Here `.env` is read by
`node`, parsed as `.env` and not as shell, and only for the one command that
needs it. The single thing deliberately exported afterwards is `PGPASSWORD`,
because `psql` reads it from the environment by design.

**`decodeURIComponent`**, because `URL.password` hands back the
*percent-encoded* form: a password of `p@ss+word` is stored in the URI as
`p%40ss%2Bword`, and handing that to `PGPASSWORD` authenticates as the wrong
string and fails with nothing to suggest why.

**No `eval`**, because `eval` of generated text executes whatever the password
happens to contain; two plain command substitutions cannot.

**Which role is live right now** is a question every command here needs
answered, so answer it from the database rather than from memory. Everything
below uses `$LIVE` for it:

```sh
# `in`, not `like`: `_` is a single-character wildcard in LIKE, so
# 'dashboard_worker%' also matches names outside this family.
LIVE="$(psql "$OWNER_URI" -At -c "
  select rolname from pg_roles
   where rolname in ('dashboard_worker',
                     'dashboard_worker_a',
                     'dashboard_worker_b')
     and rolcanlogin")"
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

ROLE="$ROLE" PW="$PW" psql "$OWNER_URI" -v ON_ERROR_STOP=1 <<'SQL'
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
LIVE="$(psql "$OWNER_URI" -At -c "
  select rolname from pg_roles
   where rolname in ('dashboard_worker',
                     'dashboard_worker_a',
                     'dashboard_worker_b')
     and rolcanlogin")"
NEXT=$([ "$LIVE" = dashboard_worker_a ] \
  && echo dashboard_worker_b || echo dashboard_worker_a)
PW="$(openssl rand -hex 24)"

# 1. the other login role, membership in the same nologin role
ROLE="$NEXT" PW="$PW" psql "$OWNER_URI" -v ON_ERROR_STOP=1 <<'SQL'
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
psql "$OWNER_URI" -c "drop role \"$LIVE\""
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
psql "$OWNER_URI" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record;
begin
  for r in select rolname from pg_roles
            where rolname in ('dashboard_worker',
                              'dashboard_worker_a',
                              'dashboard_worker_b') loop
    execute format('revoke dashboard_read from %I', r.rolname);
  end loop;
end;
$$;
SQL
```

All three names, named literally rather than matched — `_` is a
single-character wildcard in `like`, so `'dashboard_worker%'` would also reach
roles outside this family. The live one, the unsuffixed original and anything
stranded by a half-finished rotation, because in an emergency the one you miss
is the one that matters.

**The revoke does not empty the cache, and the URLs a reader actually visits
are cached.** `/api/leaderboard` keeps returning its cached 200 after the
database has stopped answering — five minutes of it fresh, and then up to
another hour that `stale-while-revalidate=3600` allows. **Assume the full hour
and five minutes on `/api/leaderboard` and `/api/entrants`.**

`stale-if-error=0` was walked and does stop stale-on-error — but on
`/api/fixtures`, which carries *no* `stale-while-revalidate`, so its expiry
forces a revalidation the reader waits on and the error reaches them. The other
two carry an hour of it, and Cloudflare returns the stale response
*immediately* on the first request after expiry and refreshes in the
background. Whether `stale-if-error=0` then cuts that window short is not
documented and has not been walked here, so the Fixtures result does not carry
over. Plan for the hour on those two; `/api/fixtures` is proven at sixty
seconds.

Any of it is too long if hiding the data is why you revoked. Empty the cache.

The purge is a deploy, and it is the *same* deploy — same script, same
invariants, same tag move:

```sh
./scripts/deploy-dashboard.sh          # PUSH_TAG=1 once the branch is pushed
```

It matters more here, not less. This is the deploy run in a hurry on whatever
machine is to hand, so it is the one where a half-finished change or a stale
`dashboard/dist` would reach production while everyone is looking at the
outage, and the one whose running commit would otherwise go unrecorded exactly
when the next person needs it. The script refuses a dirty tree rather than
asking anyone to read `git status` and judge under pressure.

If the tree is not clean and cannot be made clean quickly, deploy from a fresh
clone of the deployed commit — but **clone from the local repository, not from
`origin`**. As of this writing the dashboard work is not pushed: `git branch -r
--contains HEAD` is empty, so a clone from GitHub contains none of these
commits and the checkout below would fail in the middle of an incident. The
local repository is the only place the deployed commit exists.

Two records, so use both and make them agree. **Ask Cloudflare first, from the
original repository** — a fresh clone has no `node_modules`, so `npx wrangler`
there would fetch some floating version instead of the pinned one, or fail
outright. And not from the newest deployment: `wrangler secret put` creates its
own, `Source: Secret Change`, whose message is `-`, as does anything else that
changes configuration without shipping code, so a rotation leaves a
message-less entry on top. Take the newest message that *is* a SHA, and know
that this only reaches back ten deployments:

```sh
# still in /Users/leelorz/src/football-bench, before cloning anything
EDGE_SHA="$(npx wrangler deployments list 2>/dev/null \
  | grep -oE '^Message: *[0-9a-f]{40}$' | grep -oE '[0-9a-f]{40}' | tail -1)"
TAG_SHA="$(git rev-parse deployed 2>/dev/null || true)"
printf 'tag: %s\nedge: %s\n' "${TAG_SHA:-<none>}" "${EDGE_SHA:-<none>}"
```

Then resolve the two deliberately, rather than trusting whichever came to hand:

```sh
if [ -n "$TAG_SHA" ] && [ -n "$EDGE_SHA" ] && [ "$TAG_SHA" != "$EDGE_SHA" ]; then
  printf 'tag and edge disagree -- stop and find out why\n'; exit 1
fi
SHA="${TAG_SHA:-$EDGE_SHA}"
[ -n "$SHA" ] || { printf 'no deployed commit from either source\n'; exit 1; }
printf 'deployed commit: %s\n' "$SHA"
```

A disagreement means the tag was not moved on the last deploy, or was moved
without one. Neither is a thing to guess about mid-incident: the wrong answer
redeploys code that is not running. If the tag is missing entirely the edge is
the fallback, and if both are missing there is nothing to recover to and
stopping is the correct outcome.

Now clone, and prove the commit is actually there before anything depends on
it:

```sh
HOME_REPO=/Users/leelorz/src/football-bench

# Prefer the remote once the branch is pushed -- then this works from any
# machine. `git clone` needs a URL, not the remote's name, and whether the
# remote actually holds $SHA cannot be asked of `ls-remote`: it matches ref
# names, not commit ids. So clone it and ask the clone.
REMOTE_URL="$(git -C "$HOME_REPO" remote get-url origin 2>/dev/null || true)"

# a temporary directory per incident, so a second one does not trip over the
# leftovers of the first
WORK="$(mktemp -d)"

if [ -n "$REMOTE_URL" ] && git clone -q "$REMOTE_URL" "$WORK" 2>/dev/null \
   && git -C "$WORK" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  printf 'recovered from the remote\n'
else
  rm -rf "$WORK"; WORK="$(mktemp -d)"
  git clone -q "$HOME_REPO" "$WORK"
  printf 'the remote does not have it -- recovered from %s\n' "$HOME_REPO"
fi
cd "$WORK"

git cat-file -e "$SHA^{commit}" || {
  printf 'the deployed commit is in neither source\n'; exit 1; }
git log -1 --format='%h %s' "$SHA"

git checkout "$SHA"
npm ci
npm --prefix dashboard ci
./scripts/deploy-dashboard.sh
```

A clone has no `node_modules` in either place, so both installs come first —
and `npm ci` rather than `npm install`, so the pinned `wrangler` is the one
that runs. `wrangler` reads the same OAuth credentials from the home directory,
so no login is needed. The deploy is the same script as everywhere else, which
is what moves the tag and records the message; a detached `HEAD` at `$SHA` is a
clean tree, so its guard is satisfied.

**Then repair the durable record in the source repository.** The clone is a
temporary directory about to be deleted, so the tag it just moved dies with it
— and if this recovery ran because the tag was *missing*, leaving it missing
means the next incident finds an expired edge history and nothing else:

Repair it **from `$WORK`**, which has just been proven to contain the commit.
`$HOME_REPO` may not: if this recovery reached the commit through the remote,
tagging at home would fail on a missing object and leave the durable record
exactly as broken as it was found.

Two records to repair, and **two separate answers about whether they were**. A
home tag that worked does not mean the remote one did, and treating either as
"repaired" lets a failed push — a lease conflict, an expired credential, a
flaky network — be cleaned up after as though every other machine could now
find the commit.

And the remote is addressed **by URL**. Inside `$WORK`, `origin` is whatever
that clone came from, which on the fallback path is `$HOME_REPO` — so a push to
`origin` there lands in the local repository and reports the shared record
repaired while GitHub is untouched.

```sh
# still in $WORK, still on $SHA
git tag -f deployed "$SHA"

home_repaired=0
remote_published=0

# The home repository, when it has the object -- and the flag is set from what
# the tag *resolves to* afterwards, not from the exit status of `git tag`.
# A missing object is usually refused: `git tag -f <tag> <nonexistent-sha>`
# exits 128 and leaves the old value alone. The exception is the **all-zero
# null OID**, which git reads as "delete this ref": it prints "Updated tag",
# exits **0**, and the tag is simply gone. Reproduced on git 2.50.1 -- and once
# by accident on this repository, which is how its `deployed` tag was lost.
#
# So the exit status is not enough on its own, and $SHA here comes from a
# `wrangler` message or another repository's tag rather than from anything that
# validated it. The flag is set from what the tag resolves to afterwards, which
# is right in every case and does not depend on knowing which one this is.
if git -C "$HOME_REPO" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  git -C "$HOME_REPO" tag -f deployed "$SHA" >/dev/null 2>&1
  if [ "$(git -C "$HOME_REPO" rev-parse -q --verify 'deployed^{commit}' \
          2>/dev/null)" = "$SHA" ]; then
    home_repaired=1
    printf 'home tag repaired\n'
  else
    printf 'home tag did NOT end up naming %s\n' "$SHA"
  fi
else
  printf 'home repo does not have %s\n' "$SHA"
fi

# The shared remote, addressed by URL and never by the name `origin`. Inside
# $WORK, `origin` is whatever this clone came from -- and on the fallback path
# that is $HOME_REPO, so every check and the push itself would have been
# answered by the local repository while GitHub stayed stale, and reported as
# published.
if [ -z "$REMOTE_URL" ]; then
  printf 'no shared remote configured\n'
  remote_published=skip
else
  git remote remove shared 2>/dev/null || true
  git remote add shared "$REMOTE_URL"

  # Whether the fetch worked has to be its own fact. Without it, a network or
  # auth failure leaves no `shared/*` refs, the containment test below finds
  # nothing, and "the remote does not have this commit" becomes
  # indistinguishable from "we could not ask" -- which would reach `skip` and
  # permit cleanup while every other machine still resolves the old tag.
  if git fetch -q shared; then
    fetched=1
  else
    fetched=0
    printf 'could NOT reach %s -- treating the shared record as unrepaired\n' \
      "$REMOTE_URL"
  fi

  if [ "$fetched" = "0" ]; then
    remote_published=0
  # Only publish when the shared remote genuinely carries this commit. Pushing
  # the tag to one that does not would drag every unpushed commit along with
  # it to create a shared record that does not exist yet -- a decision for a
  # person, not a step in a recovery.
  elif git branch -r --contains "$SHA" 2>/dev/null | grep -q '^ *shared/'; then
    old="$(git ls-remote shared refs/tags/deployed | cut -f1)"
    git push --force-with-lease="refs/tags/deployed:${old}" \
      shared refs/tags/deployed && remote_published=1
  else
    printf '%s does not carry %s -- not pushing the tag.\n' "$REMOTE_URL" "$SHA"
    printf 'push the branch first; that is a decision, not a recovery step.\n'
    remote_published=skip
  fi
fi
```

Then decide, and **fail closed**:

```sh
if [ "$home_repaired" = "0" ]; then
  printf 'THE LOCAL RECORD IS STILL BROKEN.\n'
elif [ "$remote_published" = "0" ]; then
  printf 'THE REMOTE RECORD IS STILL BROKEN -- other machines see the old tag.\n'
fi

if [ "$home_repaired" = "0" ] || [ "$remote_published" = "0" ]; then
  printf 'keep %s and fix this before the next incident, or the next\n' "$WORK"
  printf 'recovery has nothing to read.\n'
  exit 1
fi

rm -rf "$WORK"
```

The `exit 1` is the point, and so is the split. A recovery that redeploys the
right code and leaves either record unrepaired works once; then the edge
history expires ten deployments at a time and the next person has nothing.
Deleting `$WORK` on the way past would throw away the only copy of the commit
that was found. `remote_published=skip` is the one case that is not a failure:
origin does not have this work at all yet, so there is no shared record to
break, and pushing thirty-odd commits to create one is not something a recovery
decides on its own.

**Push the branch and this gets simpler**, and safer: the clone comes from
`origin` on any machine, the tag is published rather than local, and the one
laptop holding these commits stops being the single point of failure for the
whole recovery path.

`cross_version_cache` is left off precisely so this works — the Worker version
is part of the cache key, so a new deployment starts from an empty cache. There
is no zone here and therefore no zone purge; redeploying is the purge.

Then confirm, and confirm both things — the canonical URL a reader loads *and*
a unique key the cache cannot answer. The first says readers are dark; the
second says the Worker is:

```sh
BASE=https://football-bench.leelorz6.workers.dev/api/leaderboard
curl -sS -o /dev/null -w 'canonical %{http_code}\n' "$BASE"
curl -sS -o /dev/null -w 'unique    %{http_code}\n' "$BASE?rev=$(date +%s)"
# require: 500 from both
```

A 200 on the canonical URL with a 500 on the unique one means the deploy has
not landed yet, or did not run — readers are still being served the old data.

The pages then show their one error line. To take the login away as well,
`drop role` each of the same names — but revoke, invalidate and confirm as
above before dropping anything.

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
