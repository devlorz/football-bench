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
- The implementation deviates from the design files in exactly eight places: "Model stats"
  is rendered "Entrant record", `.dark` is `data-theme`, the container query is a media
  query, the Race chart's panel has a 10px foot rather than the handoff's 20px, its
  Gameweek axis is an absolutely positioned label at every Gameweek up to eight of them,
  rather than a flex row of all of them, the Transfers list under a Team Sheet states its
  cost once for the Gameweek rather than once per row, that list's heading names the
  Gameweek it was read against whenever that is not the Gameweek before, and a name plate
  carries as many opponents as the club has Fixtures — none, one, or two — where the
  handoff draws exactly one. Everything else is per the handoff, including the deliberately
  dark pitch in both themes.

  The last two are the Race variant's, and both follow from facts the prototype's four
  Gameweeks did not have. The axis is positioned because a Gameweek the record holds
  nothing for is a longer segment in every line: a row spaced evenly would hang GW5's label
  under GW4's points, which is the quietest kind of wrong a chart can be. It thins to eight
  because the Season is 38 Gameweeks and not four, and 38 labels across 462 units of viewBox
  is a grey bar — the same eight the Match track's cumulative chart already thins to, with
  the last Gameweek always among them. The foot is 10px because the labels are centred on
  their line's end and the lowest can be clamped to the foot of the plot, where half of it
  hangs below the viewBox — the padding is the room it hangs in.

  The last three are the Team Sheet's, and all three are the record having more or less to
  say than the prototype's invented data did.

  A Manager State stores the Squad an action arrived at and the points that Gameweek's paid
  Transfers cost, and never which of the Transfers was the paid one — so `Free transfer`
  beside one row and `−4 Hit` beside another would be a guess, and the cost is stated once,
  where it is known. The same list's heading names the Gameweek behind it whenever the
  record holds a hole there: a Gameweek an Entrant Gapped stores no Manager State
  (ADR-0011), so its Squad is diffed against the last one that stood, and "Transfers into
  GW5" over changes made since GW3 reads a hole as a quiet week.

  A name plate carries the Fixtures the club actually had. The prototype had four
  Gameweeks and no Blank or Double in them; a Season has both, and a plate that printed one
  Fixture would either invent a Gameweek for a club that did not play or drop half of a
  Double. The plate says `Blank` where there is none, which is the word the game uses.

  The sub-line is the design's in full — Base Model, provider, Lock — and this ADR
  previously recorded it as a deviation on the grounds that neither the provider nor the
  Lock was in the record. Both claims were wrong and the deviation should never have been
  written: `models.provider` has been `not null` since migration 0001 and is a field of the
  Season Roster, on the very row this endpoint already selects the seat from; the Lock is
  `gameweeks.deadline_at`, also `not null` since 0001 and immutable since 0025, one row
  away and already published by the Match track's Fixtures endpoint. Story 21 asks for the
  lock time against the Sheet and now has it. What the line does change is spelling: it
  carries the date as well as the weekday, because "Fri 18:30" names five deadlines by the
  end of August, and it states UTC where the Fixtures page states its next Lock in the
  reader's own zone — that page answers "when must I look", which is a question about the
  reader, and this one stamps an instant that was the same for the whole field.

  The lesson is worth more than the correction. An ADR that closes a story with a reason
  that is not true is worse than no ADR: it stops the next reader one line short of the
  column that was there all along.

- A club is named by the three-letter code FPL authors for it, stored on the player rows a
  Lock writes (migration 0029), because the design prints a code and never a name in the
  two places a club appears on a Team Sheet — the shirt and the plate's opponent slot.
  Deriving it from the name was rejected outright: `Man City` and `Man Utd` share their
  first three letters, and FPL's own codes for Aston Villa and Nottingham Forest are `AVL`
  and `NFO`. A club the record holds no listing for has no code and is printed by name; in
  production every club has listed players, and in the seed only the clubs its
  thirty-four-player pool draws from do.
