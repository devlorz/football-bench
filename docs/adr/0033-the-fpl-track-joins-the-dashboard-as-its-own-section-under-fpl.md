# The FPL track joins the dashboard as its own section under /fpl

The FPL track's three screens — the points leaderboard, the latest Team Sheets, and one
Entrant's record (design handoff: `docs/design_handoff_fpl_track/`) — are pages in the
existing Astro project, served by the same Worker, at `/fpl`, `/fpl/squads` and
`/fpl/entrants`, each fetching its own endpoint under `/api/fpl/*`. Nothing in ADR-0028 or
ADR-0029 is superseded; every decision there extends unchanged to the new pages: static
build, per-page fetch in the browser, URL state through `history.replaceState`, theming
through `data-theme`, one Worker serving assets and API on one origin.

The section is a sibling of the Match track, not a tab inside it. It has its own layout with
the handoff's header — brand, three tabs, status line — and the Match track's `Page.astro`
and its nav are untouched. There is no track switcher: the two sections are separated by
path alone, and a reader moves between them by URL. The third page is named **Entrant
record**, not the handoff's "Model stats", which the glossary forbids — the same rename
spec 0011 applied to the Match track, carried into the path as `/fpl/entrants`.

The Premier League purple accent lives in a third stylesheet, loaded only by the FPL pages,
that overrides the accent ramp and the pitch tokens. `modernist.css` stays vendored and
unedited (its accent is the stock red), and `overrides.css` stays the Match track's. The
theme toggle keeps the repo's `data-theme` attribute and localStorage key rather than the
handoff's `.dark` class, so the reader's theme follows them across tracks.

State the reader is looking at lives in the URL, per ADR-0028's rule: `?entrant=` on the two
Entrant-scoped pages — carried by the tab links between them, so the selection survives the
page switch without storage — and `?view=` for the leaderboard's Table/Race/Cards variant
and the squad page's Pitch/List. Nothing about the selection is in localStorage.

The read API gains three endpoints: `/api/fpl/leaderboard`, `/api/fpl/squads`,
`/api/fpl/entrants`. Squads and entrants return all nine Entrants in one response, following
`/api/entrants`' precedent, so switching the picker is a re-render and not a fetch. All
three carry `SCORED_CACHE` (five minutes, an hour of stale-while-revalidate). The
demonstration qualification ADR-0003 requires renders as a footnote under the leaderboard
table, and the sentence travels in the `/api/fpl/leaderboard` response, read from the detail
of the `scores` rows where the scorer froze it.

## Considered Options

- **A separate Astro project or Worker for the track** — rejected because it buys a second
  deploy, a second origin and a second copy of the chrome plumbing, and gives up every
  property ADR-0029 chose the single Worker for: one hostname, relative fetches, no CORS,
  no origin as a build input.
- **Responsive via container query, as the handoff specifies** — rejected in favour of the
  existing `@media (max-width: 760px)` convention. The two are pixel-identical at every
  viewport; they differ only inside a narrow embed, and no embed exists. If one ever does,
  the switch is mechanical: the breakpoint values are the handoff's either way.
- **The qualification from a Worker constant, or hardcoded in the page** — rejected because
  the `scores` rows are the frozen record: a constant edited mid-Season would answer with a
  different claim than the rows the ranking was read from, and a UI copy is a second place
  for the wording to be wrong. It also keeps the principle the scorer already enforces —
  a value cannot reach a reader without its label — true of the API path: anyone reading
  `/api/fpl/leaderboard` raw still gets a labelled ranking.
- **Per-Entrant endpoints (`/api/fpl/squads/:id`)** — rejected because the picker's instant
  switch is the designed behaviour, the whole payload is nine squads of fifteen players,
  and the flat endpoint keeps the routing an if-chain.
- **A track switcher in the header** — rejected for now; both handoffs' headers are final
  designs and neither includes one. Revisit if readers actually need to cross over.

## Consequences

- The Worker's if-chain grows three branches. Every FPL `scores` read filters
  `track = 'fpl'`, mirroring how the match endpoints filter `track = 'match'` so neither
  ranking leaks into the other — the existing tests already seed an FPL row to prove the
  match side of that, and the FPL endpoints need the reverse seed.
- `SCORED_CACHE` on `/api/fpl/squads` means a freshly Locked Team Sheet can take up to five
  minutes to appear. Accepted: unlike `/api/fixtures`, which moves twice in the pre-Lock
  hours and earned its sixty seconds, a Team Sheet appears once at the Lock and then holds
  still.
- Only Settled Gameweeks appear, and a missing Gameweek is announced rather than silently
  absent — the same two rules the rest of the record already obeys, restated in the handoff
  and binding on all three endpoints.
- The implementation deviates from the design files in exactly five places: "Model stats"
  is rendered "Entrant record", `.dark` is `data-theme`, the container query is a media
  query, the Race chart's panel has a 10px foot rather than the handoff's 20px, and its
  Gameweek axis is an absolutely positioned label at every Gameweek up to eight of them,
  rather than a flex row of all of them. Everything else is per the handoff, including the
  deliberately dark pitch in both themes.

  The last two are the Race variant's, and both follow from facts the prototype's four
  Gameweeks did not have. The axis is positioned because a Gameweek the record holds
  nothing for is a longer segment in every line: a row spaced evenly would hang GW5's label
  under GW4's points, which is the quietest kind of wrong a chart can be. It thins to eight
  because the Season is 38 Gameweeks and not four, and 38 labels across 462 units of viewBox
  is a grey bar — the same eight the Match track's cumulative chart already thins to, with
  the last Gameweek always among them. The foot is 10px because the labels are centred on
  their line's end and the lowest can be clamped to the foot of the plot, where half of it
  hangs below the viewBox — the padding is the room it hangs in.
