# Handoff: Football Bench — Match Track dashboard

## Overview

Three public-facing pages for the Football Bench match track: a leaderboard ranking LLM
entrants, a fixtures page showing every entrant's prediction for the upcoming gameweek, and
a per-entrant historical record. Terminology and scoring rules come from the project's
`CONTEXT.md` and `football-benchmark-spec.md`; the data shown in the mocks is plausible
placeholder data, not real results.

## About the design files

The files in this bundle are **design references written in HTML**. They are prototypes of
the intended look and behaviour — not production code to lift directly. The task is to
recreate these designs inside the target codebase (the spec calls for a static dashboard on
Cloudflare Pages reading a Cloudflare Worker `/api/*`), using that project's own framework
and patterns. If no frontend exists yet, pick the framework and implement from this document.

The prototypes render standalone in a browser; open `Match Track.dc.html`.

## Fidelity

**High fidelity.** Colours, typography, spacing and interaction states are final and taken
from the bound design system (Modernist). Recreate pixel-for-pixel unless the target codebase
has an established component library, in which case map to its equivalents and keep the token
values below.

## Design system

Modernist: flat, architectural, set in Archivo, near-mono red on a light ground, zero corner
radius, strong 2px rules, everything flush left. Full guide in `tokens/modernist-readme.md`;
the authoritative token sheet is `tokens/modernist-styles.css` — take colours, type, spacing
and radii from its CSS variables rather than the literals below where possible.

### Tokens (light)

| Token | Value |
|---|---|
| `--color-bg` | `#f3f2f2` |
| `--color-surface` | `#eae9e9` |
| `--color-text` | `#201e1d` |
| `--color-accent` | `#6d28d2` (purple; overrides the design system default) |
| `--color-divider` | `color-mix(in srgb, #201e1d 40%, transparent)` |
| neutral ramp | `#f8f4f4 · #eae7e7 · #d7d3d3 · #bab6b6 · #9b9797 · #7d7979 · #605d5d · #444141 · #2d2b2b` (100→900) |
| accent ramp | `#f2ecfd · #e0d2fa · #c6adf6 · #a37ef0 · #6d28d2 · #5a1cb4 · #471490 · #340f68 · #231044` (100→900) |
| spacing | 4 / 8 / 12 / 16 / 24 / 32 px |
| radius | 0 everywhere |
| type | Archivo — headings 800, body 400, base 15px/1.55 |

### Dark theme overrides

Applied by setting `data-theme="dark"` on the page root; every value below overrides the
token of the same name and everything else inherits.

| Token | Dark value |
|---|---|
| `--color-bg` | `#1a1918` |
| `--color-surface` | `#242220` |
| `--color-text` | `#f0eeec` |
| `--color-divider` | `color-mix(in srgb, #f0eeec 38%, transparent)` |
| `--color-accent` | `#a37ef0` (lighter step for contrast on dark) |
| link / link hover | `#c6adf6` / `#e0d2fa` |

Accent lightens from `#6d28d2` to `#a37ef0` in dark mode; red survives only as `--danger`.

### Chart / data colours (theme-aware)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--tier-5` | `#6d28d2` | `#a37ef0` | exact score (5 pts), home probability, selected series |
| `--tier-3` | `#a37ef0` | `#6d28d2` | goal difference (3 pts) |
| `--tier-2` | `#bab6b6` | `#9b9797` | outcome only (2 pts), draw probability |
| `--tier-0` | `#605d5d` | `#605d5d` | no points, away probability, bet-points bars |
| `--danger` | `#ae1800` | `#ff9783` | incoherent prediction, gameweeks with gaps |

Axis lines, tick labels and non-selected chart series use `currentColor` at 0.14–0.25 opacity
so they follow the theme.

## Global chrome

Sticky header, full width, `padding: 14px 28px`, `border-bottom: 2px solid var(--color-divider)`.

- Brand: `FOOTBALL BENCH` (Archivo 800, 18px, `letter-spacing: -0.02em`) followed by
  `MATCH TRACK` (11px, `letter-spacing: 0.12em`, uppercase, accent).
- Nav links: `Leaderboard · Fixtures · Model stats`, 13px, uppercase, 600, `letter-spacing:
  0.06em`, `gap: 20px`. Active link takes the accent via `aria-current="page"`.
- Right side: a theme toggle as a `.btn .btn-ghost .btn-icon` — a Lucide moon in light mode, a sun in dark. On mobile a hamburger button sits to its right.

Page body is `padding: 0 28px 80px` with sections separated by 2px divider rules.

## Responsive

One breakpoint at **760px**. Below it:

- Page padding drops to 16px; h1 to 30px, h2 to 24px.
- The nav collapses: the three links hide behind a hamburger button (theme icon left, hamburger right). Open, the nav grows a full-width stacked list below the brand row, links at 15px separated by 2px rules; picking one closes the menu.
- Every two- and three-column grid stacks to one column; the stats KPI strip goes to two columns; the small-multiples grid to one.
- All column-header rows are hidden.
- Leaderboard rows become `40px 1fr auto auto`: rank, entrant, then match and bet points right-aligned on the same line, bars capped at 56px.
- The leaderboard's "n = … ranks, does not prove" note is hidden and the sort control is pushed right.
- Fixture prediction rows become a wrapping flex: name and score on line one, the probability bar full-width below, coherence and Why below that.
- The per-gameweek table scrolls horizontally inside its wrapper.

## Screens

### 1. Leaderboard

**Purpose.** Rank the nine entrants season-to-date, by match points or bet points.

**Hero.** Two columns, `1fr 320px`, `gap: 48px`, `padding: 40px 0 28px`, bottom 2px rule.
Left: h1 at 56px, `letter-spacing: -0.03em`, max-width 16ch — "One set of fixtures, one lock";
below it a 15px paragraph at max-width 56ch, text at 70% opacity. Right: a surface panel
(`padding: 22px 24px`) with three stat pairs — Season `2026/27`, Scored fixtures `137`,
Through `GW 14`. Labels are 11px uppercase accent, `letter-spacing: 0.1em`; values Archivo
800 at 24px.

**Ranking header.** `Ranking` (h3, 22px), the label `Sort by`, a segmented control with
`Match points` / `Bet points`, and right-aligned meta `n = 137 fixtures · ranks, does not prove`.

**Table (the chosen layout).** A ruled list, not a `<table>`: grid columns
`78px 1fr 200px 200px`, each row `padding: 14px 0`, `border-bottom: 1px solid var(--color-divider)`,
hover tint `color-mix(in srgb, var(--color-text) 4%, transparent)`.

- Rank: Archivo 800 at 40px, line-height 1; rank 1 in accent, the rest in `currentColor`.
- Entrant: name Archivo 800 at 22px, `letter-spacing: -0.02em`; under it `id · tier` at 11px,
  55% opacity.
- Match points: value Archivo 800 at 30px, then a 6px bar (max-width 150px) filled in
  `--tier-5` to `value / max`.
- Bet points: same, filled in `--tier-0`.
- The two value columns carry `padding-left: 20px`.

**Footnotes.** Three equal columns under a 2px rule, 12px, 65% opacity, explaining match
points, bet points, and what the ranking does not claim.

**Empty (pre-season) state.** Kept in the code and reachable by setting the `season` state to
`'pre'`. Two columns: a headline "The table fills after the first gameweek is settled" with the
lock date, and a surface panel listing the nine entered entrants with their ids.

### 2. Fixtures and predictions

**Purpose.** Show the upcoming gameweek and every entrant's committed prediction.

**Header.** Kicker `Gameweek 15`, h1 at 48px, and a right-hand block with the lock time
(`Fri 4 Dec, 18:30`) and the note "All ten fixtures locked at this deadline".

**Fixture block.** One per fixture, `padding: 20px 0 24px`, 2px bottom rule.

- Title row: `Home v Away` in Archivo 800 at 26px with the `v` in accent; then
  `kickoff · fpl_id NNN` at 12px, 55% opacity; right-aligned `.tag .tag-neutral` reading
  `9 of 9 predicted`.
- Column header: grid `190px 1fr 96px 96px`, 10px uppercase labels — Entrant, Home / Draw /
  Away, Score, Coherent.
- Entrant rows, same grid, `padding: 9px 0`, 1px bottom rule:
  - name, Archivo 800 at 14px;
  - a 14px-tall stacked probability bar (max-width 420px) — home `--tier-5`, draw `--tier-2`,
    away `--tier-0` — followed by the three probabilities to two decimals at 11px;
  - predicted score, Archivo 800 at 17px;
  - coherence `Yes` / `No` (No in `--danger`) and a ghost button `Why` / `Hide`.
- Expanding a row reveals a surface panel with a 2px accent left border, `padding: 14px 16px`:
  kicker "Rationale · display only, never scored", the rationale at 13px/max-width 80ch, and a
  meta line `context <hash> · attempts 0 · locked before deadline`.

**Empty state.** Pre-season shows the fixture list with an accent-tinted banner ("No predictions
stored", explaining the −6h main run and −2h fill run) and, per fixture, "Nine entrants pending
· context not yet built".

### 3. Model stats

**Purpose.** The historical record for one entrant at a time.

**Header.** h1 `Historical record` at 48px plus a 60ch note that nothing is back-filled.

**Entrant selector.** A wrapping row of nine buttons, Archivo 800 at 13px, `padding: 9px 16px`.
Selected is an accent fill with `--color-bg` text; the rest are transparent with `currentColor`.

**Headline strip.** Four equal surface cells, `gap: 14px`, `padding: 18px 22px` — Match points,
Bet points, RPS, Gaps. Label 10px uppercase accent, value Archivo 800 at 32px, note 11px at
55% opacity.

**Charts row.** Grid `1fr 380px`, `gap: 32px`.

- *Cumulative match points* — an SVG line chart, `viewBox="0 0 880 260"`, plot area inset
  `left 44 / bottom 30 / top 8 / right 6`, y-axis fixed 0–260 with ticks every 65, x-axis GW1–GW14.
  Horizontal grid lines and tick labels in `currentColor` at 0.14 / 0.5 opacity, the eight
  unselected entrants at 1.5px `currentColor` 0.2, the selected entrant at 3px accent.
- *Score-tier breakdown* — a 34px stacked bar over four legend rows (exact 5 pts, goal
  difference 3 pts, outcome only 2 pts, no points) with count and percentage.
- *Bet slip market hit rate* — five rows (match result, over/under 2.5, 3.5, 4.5, both teams to
  score), each with `hits / n · pct` and an 8px accent bar.

**Per-gameweek table.** `.table`, columns: GW, Fixtures, Match pts, Bet pts, Exact, Outcome,
RPS, Gaps. Numeric columns right-aligned; a non-zero gap count is `--danger`.

**Alternate layout (in the code, currently off).** `stB` renders nine small-multiple cards
(sparkline vs field median, tier bar, exact/bet/rps footer) plus a GW × entrant matrix with
accent-tinted cells. Left in place if you want a comparison view later.

### Ops dialog (currently unreachable)

The trigger was removed from the header at the client's request; the markup is still in the file if you want to bring it back behind a route or a footer link. Closed by backdrop click or the Close button. `.dialog-backdrop` +
`.dialog` at 620px. Contents: four run-health cells (last fetch, last predict run, fill run,
last score run) and a list of gaps by cause (provider / schema / timeout / refusal).

## Interactions & behaviour

| Trigger | Result |
|---|---|
| Nav link click | switches page; `aria-current="page"` moves |
| Sort segmented control | re-sorts the leaderboard by match or bet points; ranks recompute |
| `Why` on a prediction row | expands that one rationale; opening another closes the previous |
| Entrant button on stats | swaps every chart, tier bar, market list and table row |
| Theme icon | flips `data-theme` on the page root (moon ⇄ sun) |
| Hamburger (≤760px) | toggles `menu-open` on `.nav`; any nav link closes it |


No animation beyond the design system's built-in hover and `:focus-visible` states. Focus is a
2px accent outline at 2px offset — do not fall back to the browser default.

## State

- `page`: `'leaderboard' | 'fixtures' | 'stats'`
- `theme`: `'light' | 'dark'`
- `season`: `'gw14' | 'pre'` — drives every empty state; the toggle was removed from the UI but
  the branches remain, so wire it to "no settled gameweeks yet" in the real app
- `sortBy`: `'match' | 'bet'`
- `entrant`: selected entrant id on the stats page
- `openRat`: which rationale is expanded, `"<fixtureIndex>:<entrantIndex>"` or empty
- `menu`: mobile nav open
- `ops`: dialog open (the trigger button was removed; the dialog markup remains)

## Data the real pages need

Per the spec's schema, the dashboard reads from the Worker:

- **Leaderboard** — for each `models` row with `role = 'entrant'`: id, display name, tier,
  season-to-date match points and bet points, and the fixture count `n` behind them.
- **Fixtures** — the current gameweek's fixtures (`season`, `fpl_id`, home, away, kickoff,
  lock) and, per fixture, every entrant's `probs`, `pred_home`, `pred_away`, `rationale`, plus
  a derived coherence flag (argmax of `probs` vs the outcome the scoreline implies).
- **Stats** — per entrant per gameweek: match points, bet points, exact hits, correct outcomes,
  RPS, gap count; plus season-to-date score-tier counts and per-market bet-slip hit counts.

Reference lines are not shown on either ranking — they belong to the RPS layer only.

## Assets

None. No images, no icons — the design uses type and rules only. If you add icons, the system
specifies Lucide.

## Responsive

One breakpoint at **760px**. Below it:

- Page padding drops to 16px; h1 to 30px, h2 to 24px.
- The nav collapses: the three links hide behind a hamburger button (theme icon left, hamburger right). Open, the nav grows a full-width stacked list below the brand row, links at 15px separated by 2px rules; picking one closes the menu.
- Every two- and three-column grid stacks to one column; the stats KPI strip goes to two columns; the small-multiples grid to one.
- All column-header rows are hidden.
- Leaderboard rows become `40px 1fr auto auto`: rank, entrant, then match and bet points right-aligned on the same line, bars capped at 56px.
- The leaderboard's "n = … ranks, does not prove" note is hidden and the sort control is pushed right.
- Fixture prediction rows become a wrapping flex: name and score on line one, the probability bar full-width below, coherence and Why below that.
- The per-gameweek table scrolls horizontally inside its wrapper.

## Screenshots

`screenshots/` — 01 leaderboard, 02 fixtures, 03 and 04 model stats, 05 leaderboard in dark mode.

## Files

| File | What it is |
|---|---|
| `Match Track.dc.html` | The three pages, on Modernist. This is the design of record. |
| `tokens/modernist-styles.css` | The design system's token sheet and component classes. |
| `tokens/modernist-readme.md` | The design system's written guide. |
| `alternates/Match Track (Industry).dc.html` | Same pages on the Industry system (steel wireframe). |
| `alternates/Match Track (Nocturne).dc.html` | Same pages on the Nocturne system (dark, compact). |
| `alternates/Match Track (Organic).dc.html` | Same pages on the Organic system (warm, rounded). |
| `alternates/Visual Directions.dc.html` | Three exploratory leaderboard treatments from an earlier round. |

The prototypes reference the design system stylesheet at
`_ds/modernist-a4b238fd-710d-4e6d-b9e6-8001cf1af62f/styles.css`; a copy is in `tokens/`. Repoint
the `<link>` if you open them outside the original project.
