# Ticket: The dashboard has no deploy path

The dashboard is the only part of the system CI cannot ship. `.github/workflows/` holds
fetch, fpl, predict and score; nothing deploys. Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0028](../adr/0028-the-dashboard-is-a-static-build-that-fetches-at-runtime.md) and
[ADR-0029](../adr/0029-the-dashboard-deploys-as-one-worker-serving-both-the-assets-and-the-read-api.md),
neither of which changes here. Runbook:
[dashboard-deploy.md](../runbooks/dashboard-deploy.md).

**What it cost.** On 2026-08-20 the match track restarted onto `match-pd/2026-27-v2` and 116
Predictions landed under the new seats. The dashboard kept showing empty slots for a day.
Nothing was broken: the deployed Worker ran older code, so `read-api.ts` resolved
`matchPromptOf("PD").version` to `match-pd/2026-27-v1` and asked for a roster holding no
Gameweek 2 Predictions. The page faithfully answered a question nobody wanted asked any
more, which is the failure this deploy has no alarm for -- it renders either way.

## What was built

[.github/workflows/deploy-dashboard.yml](../../.github/workflows/deploy-dashboard.yml), in
the shape score.yml uses: `actions/checkout@v4`, `actions/setup-node@v4` on node 22 with the
npm cache, `npm ci`, secrets through `env:`. It installs both packages -- the dashboard is
its own -- and then runs `scripts/deploy-dashboard.sh`, which is the one thing in the
repository that knows the deploy's invariants.

**It calls the script rather than retyping the two commands.** The build-then-deploy order
is the smaller half of what the script holds. The larger half is the `deployed` tag: the
durable record of which commit the edge is running, which the recovery procedure in the
runbook clones and trusts. A CI deploy that shipped without moving it would leave that
record naming an older commit while the edge ran a newer one -- a lie is worse than the
absence the tag was created to fix. So the job runs with `PUSH_TAG=1` and
`permissions: contents: write`; the tag is worth nothing on a runner about to be destroyed.

The script's dirty-tree guard is satisfied by construction on a fresh checkout.

## When it runs, and why not on push

`workflow_dispatch` alone. Every other workflow here carries it for exactly this reason;
this one carries nothing else.

Push-to-main is the obvious answer and it is the wrong one *today*, for two reasons that
both expire:

- **It would race the operator.** The deploy still happens from one machine by hand, and
  the script's own note says the mutex it lacks should be built "the day a second person or
  a CI job can deploy". Adding the CI job first, and making it fire without anyone
  watching, creates the race before the lock exists. The tag lease narrows it; it does not
  prevent it, and the loser of that race finds out only afterwards.
- **`main` is not pushed.** The branch is local, 100-odd commits ahead of `origin/main`. A
  `push` trigger would sit inert until the day of the first push and then deploy the whole
  backlog unattended, as its debut. (Note that `workflow_dispatch` needs the workflow on the
  default branch to appear at all, so this workflow is dispatchable only once that push
  happens either way.)

Change it to `push: branches: [main]` plus `workflow_dispatch` when local deploys stop and
the remote ref lock exists. Nothing else in the file changes.

`concurrency: dashboard-deploy` with `cancel-in-progress: false`, because `wrangler deploy`
uploads a whole Worker and two overlapping runs end with whichever finished last. It
guards CI against itself only; the operator's machine is not in the group.

## The two things verified rather than assumed

**The Worker's database secret survives a CI deploy, and cannot be dropped silently.**
`wrangler deploy --dry-run` lists `env.SEASON` as the only binding, because `DATABASE_URL`
is not a var -- ADR-0027 has the read API reaching Postgres as a login role whose password
is a Worker secret, set by hand with `wrangler secret put` and in no checkout. What carries
it across a deploy is `[secrets] required = ["DATABASE_URL"]` in `wrangler.toml`: read in
the pinned wrangler 4.120.1, `addRequiredSecretsInheritBindings` turns each required name
that is not being set into an explicit `{ type: "inherit" }` binding in the upload metadata,
and `handleMissingSecretsError` turns the API's rejection of an invalid inherit into
"The following required secrets have not been set: DATABASE_URL". So a CI deploy either
inherits the live secret or fails naming it. It cannot ship a Worker whose every endpoint
answers 500, which is what the first manual deploy did.

Nothing about the credential moves into GitHub. The only new secret is
`CLOUDFLARE_API_TOKEN`, passed through `env:` the same way `DATABASE_URL` is in the other
four workflows, plus an optional `vars.CLOUDFLARE_ACCOUNT_ID` -- wrangler infers the account
when the token reaches exactly one, and treats an empty value as unset.

**A clean checkout builds the same `dist` as the local tree.** Verified at `fdb11cc` in a
fresh worktree with `npm ci` in both packages: `diff -rq` against the working tree's
`dashboard/dist` reports no differences across all 26 files. The seven-minute gap against
`dashboard/src/pages/[competition].astro` that made this visible was mtime and not content
-- the stale-looking build happened to hold the current bytes. That is luck, not a
property, and it is exactly the case the workflow removes: the build is a deploy input, so
the deploy performs it.

## Not done

- **No remote ref lock.** Still the upgrade the script names, and now it has its second
  deployer. It is the blocker on the `push` trigger, not on this workflow.
- **No alarm.** score.yml and predict.yml open an issue on failure; this does not. A failed
  dispatch is read by the person who dispatched it. Add the failure issue when the trigger
  stops being a human pressing a button.
