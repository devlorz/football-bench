# The dashboard deploys as one Worker serving both the assets and the read API

The dashboard is one Cloudflare Worker. It serves the built Astro output as static assets and
answers `/api/*` from its own script, selected by `run_worker_first = ["/api/*"]`. There is no
Pages project and no Worker route. This supersedes the deployment topology in ADR-0028 — Pages
plus a Worker route claiming `/api/*` on the Pages hostname — and the preview consequence that
followed from it. **The static-build decision itself stands**: Astro, `output: 'static'`, three
pages that fetch their own endpoint in the browser, and no API origin as a build input.

The reason is not preference. A Worker route needs a zone, and `*.pages.dev` is not one, so
`/api/*` on a Pages hostname is only reachable with a custom domain — which the first deploy
did not have and which ADR-0028 did not notice it required. Serving both from one Worker keeps
every property the route was chosen for: one hostname, a relative fetch, no request
cross-origin, no CORS configuration, and no origin read from the environment.

The decision is reversible in the direction ADR-0028 assumed. A custom domain restores the
option of Pages plus a route, and the case for taking it is a real one (see the previews
below); nothing in the pages, the seam or the Worker changes either way.

## Considered Options

- **Buying or moving a domain into the Cloudflare zone for the first deploy** — rejected for
  the first deploy only, on the ticket's own terms: it is a slice about seeing the thing work
  by hand before automating it, and a domain purchase is not the part being learned. It stays
  the recommended next step.
- **Astro's Cloudflare adapter, server-rendered** — rejected again for the reason ADR-0028
  gives, unchanged: it renders per request for data identical to every reader.
- **Pages Functions instead of a Worker** — rejected because the read seam and the Worker
  already exist and are tested through the Worker's own driver; moving to Functions would
  change the wiring around a seam that had nothing wrong with it, to buy a `*.pages.dev`
  preview environment.

## Consequences

- **Version previews carry production data, and are therefore off.** ADR-0028 promised that
  previews carry no live data, and it was true of Pages previews on their own origins. A
  Worker version preview holds the same secrets as production: `wrangler versions upload` gave
  a public URL that answered `/api/leaderboard` with production rows. `preview_urls = false`
  is set and that URL 404s. The consequence is that **there is no hosted preview at all** —
  anything to be looked at before deploying is looked at locally against the seeded Postgres,
  which is what ADR-0028 already required for every state worth reading.
- **Caching is enabled in the Worker's configuration**, `[cache] enabled = true`, which makes
  Cloudflare check the cache before invoking the Worker. ADR-0028 left the Wrangler version
  to be pinned once verified rather than recorded from memory; it is Wrangler 4.69.0 or above
  and this repository pins 4.120.1.
- **The edge lifetime and the browser's are separate headers.** `cloudflare-cdn-cache-control`
  carries the per-endpoint lifetime with `max-age`, never `s-maxage`: Cloudflare disables
  stale-serving outright on a response carrying `s-maxage`, `must-revalidate` or
  `proxy-revalidate` (RFC 9111 4.2.4), so the `stale-while-revalidate` ADR-0028 asked for
  never once took effect beside the `s-maxage` it was written next to. `cache-control` is
  `no-cache`, which permits the browser to store a response but forbids reusing one without
  revalidating first — a browser given `s-maxage` and no `max-age` may reuse freely on a
  heuristic, and three separate acceptance walks were shown a cached body and no error line
  with the API dead behind it. The edge answers the revalidation.

  The lifetimes also carry `stale-if-error=0`, because dropping `s-maxage` switched on a
  default that had been suppressed by it: absent `s-maxage`, `must-revalidate` or
  `proxy-revalidate`, Cloudflare serves stale on Worker error *indefinitely*. A Worker that
  has lost its database would keep answering 200 from an entry that never expires — numbers
  that look right and are simply old, which is the failure this dashboard is least able to
  notice. Walked against the live edge rather than taken from the documentation: on
  `/api/fixtures`, with the grant revoked, a warmed entry served `200 HIT` right up to expiry
  and `500 BYPASS` from the moment expiry made a revalidation necessary.

  **That walk covers `/api/fixtures` only.** It is the endpoint with no
  `stale-while-revalidate`, so expiry forces a revalidation the reader waits on. On the two
  that carry an hour of it, Cloudflare returns the stale response immediately and revalidates
  behind it, and whether `stale-if-error=0` shortens that window is undocumented. The
  directive is set on all three; its effect is demonstrated on one.

  The lifetimes themselves are unchanged from ADR-0028: five minutes for the two the scoring
  run moves, sixty seconds for Fixtures.
- **A deploy is the only cache purge there is.** With no zone there is no zone purge. The
  Worker version is part of the cache key and `cross_version_cache` is left off, so
  `wrangler deploy` starts from an empty cache — which is what an emergency revoke has to run
  afterwards if the point is that nobody sees the data, since revoking the grant does not
  touch a cached 200. The runbook says so at the revoke step.
- **The built assets are a deploy input.** `wrangler deploy` uploads whatever `dashboard/dist`
  holds, so a stale `dist` deploys silently. Building first is part of the deploy and is
  written down as such in the runbook.
- **Astro builds to `build.format: 'file'`.** With a directory build the asset router answers
  `/fixtures` with a 307 to `/fixtures/`, and the nav links to `/fixtures` — so every nav click
  on the deployed site cost a redirect. This is a consequence of the asset router and would
  not arise under Pages.
