# Ticket — A 404 that outlives its cause

Found in production on 2026-08-16 while checking why La Liga's leaderboard showed the
page's failure line. Related: [ADR-0029](../../adr/0029-the-dashboard-deploys-as-one-worker-serving-both-the-assets-and-the-read-api.md),
[runbook](../../runbooks/dashboard-deploy.md), [spec 0017](../../specs/0017-the-dashboard-per-competition-shape.md).

## What was observed

`/pd` rendered "The leaderboard could not be read. Nothing is being retried." — the page's
`catch`, which is none of the three states spec 0017 built. The origin was healthy the
whole time:

```
/api/pd/leaderboard              404   cf-cache-status: HIT
/api/pd/leaderboard?rot=<epoch>  200   cf-cache-status: MISS   {"active":true,"throughGw":1,…}
/api/pd/fixtures                 200
/api/pd/entrants                 200
/api/pl/leaderboard              200
```

One URL, holding a 404 the edge had cached back when that path genuinely did not exist —
before slice 1 of spec 0017 shipped. `/api/pd/fixtures` and `/api/pd/entrants` escaped it
only because nobody requested them before they were served. A reader saw a broken site for
a league that had a scored Gameweek sitting behind it.

It recurs by construction. The day `SA` is served, anyone who loaded `/sa` before the
freeze-and-deploy pins its 404 the same way, and the page that reports it says something is
broken and that nothing is being retried.

## 1 — The if-chain's 404 carries a lifetime

**What to build:** A path that answers 404 today and 200 next week stops being able to
answer 404 for longer than the miss deserves.

The 404 leaves `handleDashboardRequest` with a content type and nothing else, so the edge
picks its own TTL and the response has no say. Every other response in that module carries
a deliberate lifetime and argues it.

**Blocked by:** None — can start immediately.

- [x] The if-chain's 404 carries an explicit `cache-control`, and the reasoning sits beside
      it the way `SCORED_CACHE` and `FIXTURES_CACHE` carry theirs.
- [x] It is a short lifetime and not `no-store`, unless the connection cost below is dealt
      with first: `worker.ts` opens a Postgres connection **before** routing, on every
      request it handles, so an uncacheable 404 is a database connection for every scanner
      and every typo. Sixty seconds is the number `FIXTURES_CACHE` already uses for the
      endpoint that moves fastest, and a minute of a stale miss is a minute.
- [x] A test asserts the header, the way the cache headers of the three Match endpoints are
      already asserted.
- [ ] If `no-store` is wanted anyway, the connection moves behind the route match first, so
      a 404 costs nothing to serve. That is the change that makes the choice free; it is
      not required to close this ticket, and `worker.ts` is deliberately wiring and nothing
      else, so it is a decision and not a tidy-up.

The page path shares the if-chain's 404, and the lifetime with it.
`run_worker_first` is `["/api/*"]` and a path that matches no asset falls
through to the Worker — `not_found_handling` is unset, so there is no asset
404 for it to answer with — which means `/bl1`, the unopened league the
narrative's `/sa` has since become, answers this same `Not found`. Measured
2026-08-23, after the fix deployed: `MISS → HIT → EXPIRED` at the minute, the
sixty seconds holding on the page path too.

## 2 — The purge works, and nothing says how long it takes

**What to build:** The runbook states the purge's latency, or states that it is unmeasured.

`docs/runbooks/dashboard-deploy.md` says the Worker version is part of the cache key, that
`cross_version_cache` is left off precisely so this works, and that "redeploying is the
purge". All of that held. What was measured is that it is not instant:

```
08-11 15:05   deploy c72adee0 — the Worker before spec 0017
08-16 11:41   deploy d6da40c (version ab93cdac)
      after   /api/pd/leaderboard still 404, cf-cache-status: HIT
08-16 11:46   deploy d6da40c again (version 77354651)
08-16 11:49   /api/pd/leaderboard 200, HIT, age 183 — recached ~11:46:39
```

The stale 404 outlived one deployment and cleared within a minute of the next. Two data
points do not separate a propagation lag from a deployment that did not reset the entry, and
this ticket does not guess between them.

Why it is not a documentation nit: the emergency purge rests on the same sentence. The
runbook spends paragraphs on how long a *stale* response can be served — five minutes fresh,
an hour of `stale-while-revalidate` — and says nothing about how long a purge takes to
reach a reader. That is the number an operator needs when the reason for purging is that
the data must go dark now.

**Blocked by:** None. Worth doing before item 1: item 1 bounds how long a wrong answer can
live, this one says how quickly a right answer arrives.

- [x] The purge's latency is measured rather than assumed — a deploy, then the canonical URL
      polled until `cf-cache-status` stops answering from the old entry, timed. Measured
      2026-08-23, redeploying the fix with the canonical URL polled twice a second through
      the deploy: the old entry answered `HIT` until 6.2s before `wrangler deploy` returned
      and the new version's empty cache answered `MISS` 5.7s before it returned — the
      switch watched inside a half-second bracket, from one client at one POP. It does not
      explain 08-16, and the runbook says both.
- [x] The runbook carries the number, or carries the sentence saying it is unmeasured and
      what that costs. Either is honest; the current silence reads as instant.
- [x] If one deployment is genuinely not enough, the emergency procedure says so and says
      what to do instead. `/api/pd/leaderboard` cleared on the second of two.

## Not in scope

- The page's failure line. It is correct: the read genuinely failed. Making it distinguish
  a cached 404 from a dead database would be guessing at a cause from inside the browser.
- Any change to the three Match endpoints' own cache lifetimes. They were walked and
  recorded in the runbook and nothing here disturbs them.
