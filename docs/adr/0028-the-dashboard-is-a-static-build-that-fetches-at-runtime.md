# The dashboard is a static build that fetches at runtime

The dashboard is an Astro project built with `output: 'static'` and deployed to Cloudflare
Pages, and each of its three pages fetches its own `/api/*` endpoint in the browser once
loaded. Astro rather than React because the pages are documents — type, rules and hand-written
SVG — with no state shared across any two of them; the interactive parts are a sort control, an
Entrant selector, an expanding rationale, a theme toggle and a mobile menu, and every one of
them is local to the element it sits in. Static rather than server-rendered because the data
behind these pages is identical for every reader and changes only when a scheduled job writes,
so rendering per request buys nothing a cache header does not, and because the spec's
architecture puts a static dashboard on Pages and a read API on a Worker as two separate
things.

Two separate deployments still answer on one origin: a Worker route claims `/api/*` on the
Pages hostname, so the browser fetches a relative path, no request is cross-origin and there
is no CORS configuration to keep correct. Local development reaches the same path through a
dev proxy rather than a second base URL, so no build reads an API origin from the environment
and no preview can be pointed at production data by a misread variable.

## Considered Options

- **A React SPA on Vite** — rejected because it ships a runtime to render content that is
  fundamentally a document, and nothing on these pages needs it: no two islands share state.
  React earns its keep the day a chart filters another chart, and at that point the islands
  are already isolated enough to convert one at a time.
- **Building the data in at build time** — no Worker at all, with the daily scoring run
  emitting JSON or HTML straight to Pages. Genuinely simpler and rejected on the spec's
  architecture rather than on merit: it makes every read depend on a deploy, and it leaves
  no read API for anything else to use later.
- **Astro with the Cloudflare adapter, server-rendered** — rejected because it puts the
  dashboard and the read API on the same runtime and dissolves the boundary the spec draws
  between them. It would also render per request for data that is the same for everyone.
- **An absolute API origin on its own hostname, with CORS** — rejected because it makes the
  origin a build input, which is the thing that eventually points a preview at production,
  and because an allowed-origin list is then a second place the deployment can be wrong. Not
  rejected over preflights: these are plain `GET`s with no custom headers, so they stay
  simple requests. A route on one hostname costs one line of Worker configuration and needs
  neither.

## Consequences

- There is a moment on every page load with chrome and no data. The design system has no
  animation and no radius, so the loading state is a still block in `--color-surface` laid
  over the same grid the real rows use, and a failed fetch is one `--danger` line under the
  heading with no automatic retry.
- The Entrant record page reads `/api/entrants`, returning all nine Entrants with their full
  per-Gameweek series, because its cumulative chart draws all nine lines at once. Selecting a
  different Entrant is therefore a re-render and not a fetch.
- Sort order and selected Entrant live in the URL through `history.replaceState`, so a page
  can be linked to in the state the reader is looking at. Which rationale is expanded does
  not.
- Cache lifetimes are per endpoint, because the three do not change on the same clock.
  `/api/leaderboard` and `/api/entrants` move when the daily scoring run writes, and hold a
  five-minute edge cache with an hour of stale-while-revalidate. `/api/fixtures` moves twice
  in the hours before a Lock — the main run at deadline −6h and the Fill at −2h — and an hour
  of stale would show Gaps the Fill has already closed, so it holds sixty seconds with no
  stale window. Neither is invalidated by the writing job; the endpoints are read by people
  watching a deadline, and a minute is short enough that a purge hook would be machinery
  around a number.
- Those lifetimes are inert until the Worker is configured to cache at all — a Worker's
  response is not edge-cached from its `Cache-Control` header alone. Enabling it in
  `wrangler.toml` is part of the first slice, and the minimum Wrangler version that supports
  the setting gets pinned there once it is verified against the deployed version rather than
  recorded here from memory.
- Hosted Pages previews sit on their own `*.pages.dev` origins, which the production Worker
  route does not cover and a local dev proxy cannot intercept. **Previews carry no live
  data**: they render chrome and the error line, and prove only that the build is sound.
  Anything to be looked at — layout, both themes, the breakpoint, the pre-season state — is
  looked at locally against the seeded Postgres. Giving previews data would mean either a
  branch-per-custom-domain scheme or a build-time API origin, and the second is the option
  rejected above.
- Nothing about the pages is indexable beyond the chrome, since the numbers arrive after
  load. Acceptable for a dashboard; if it stops being acceptable the fix is the rejected
  build-time option, not server rendering.
