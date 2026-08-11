# The dashboard

Astro, `output: 'static'`, deployed as static assets on the same Cloudflare
Worker that answers `/api/*`. The pages are built ahead of time and the numbers
arrive in the browser from a relative path on the one hostname — so no origin
is a build input and nothing is cross-origin. See
[ADR-0028](../docs/adr/0028-the-dashboard-is-a-static-build-that-fetches-at-runtime.md)
for the static build,
[ADR-0029](../docs/adr/0029-the-dashboard-deploys-as-one-worker-serving-both-the-assets-and-the-read-api.md)
for the deployment that supersedes its topology, and
[spec 0011](../docs/specs/0011-match-track-dashboard.md).

`public/styles/modernist.css` is the design system, vendored byte-for-byte from
`docs/design_handoff_match_track/tokens/` and never edited. Every override — the
purple accent, the `--tier-*` ramp, the dark theme, the chrome, the 760px
breakpoint — is in `public/styles/overrides.css` beside it.

## Running it locally

Three terminals, from a clean local Postgres. The seed is a development tool and
refuses a database that is not local.

```sh
# 1. the Season the design was drawn against
DATABASE_URL=postgres://localhost/football_bench SEASON=2026-27 \
  npm run seed -- "the design's"     # or "pre-season" for the empty-table state

# 2. the read API, on the port `astro dev` proxies /api to
DATABASE_URL=postgres://localhost/football_bench SEASON=2026-27 npm run dev:api

# 3. the pages
cd dashboard && npm run dev
```

`src/cli/dev-api.ts` stands in for `wrangler dev`. It shares
`handleDashboardRequest` with the Worker and differs only in the wiring either
side, which is what the seam exists for.

## Deploying it

Live at <https://football-bench.leelorz6.workers.dev> — one Worker serving the
built pages and `/api/*` both, not a Pages site with a route beside it. Build
first, because `wrangler` uploads whatever `dashboard/dist` holds:

```sh
cd dashboard && npm run build && cd ..
npx wrangler deploy
```

The credential it runs on, how to rotate it, and what this deploy shape does
not do: [docs/runbooks/dashboard-deploy.md](../docs/runbooks/dashboard-deploy.md).

## Before a slice that touches a page is complete

Walk the manual acceptance checklist in spec 0011 §"The pages" — nine steps, in
both themes, at 1440px and 375px — and record the result on the ticket. `astro
build` and `astro check` prove the pages compile and prove none of it.
