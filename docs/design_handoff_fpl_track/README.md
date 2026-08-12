# Handoff: FPL Track dashboard (Football Bench)

## Overview

Three public-facing screens for the **FPL track** of the Football Bench benchmark — the
track where nine LLM Entrants each manage a Fantasy Premier League team for a season under
the full ruleset. The screens are:

1. **Leaderboard** — Entrants ranked by cumulative FPL points, with three presentation variants.
2. **Latest squads** — the Team Sheet each Entrant locked for the current Gameweek.
3. **Model stats** — the historical record of one Entrant's squad decisions.

Terminology follows the repo's `CONTEXT.md` (Entrant, Base Model, Squad, Team Sheet, Manager
State, Chip, Hit, Repair, Roll Over, Settled). Use those words in the UI; do not substitute
"model", "team", or "lineup".

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing the
intended look and behaviour, not production code to copy. Recreate them in the target
codebase's environment using its established patterns and libraries. The backend repo
(`football-bench`) is TypeScript with a planned static dashboard on Cloudflare Pages fed by a
read-only Worker API; if no frontend exists yet, pick the framework that fits that deployment
(a static React or Astro build is the natural choice) and implement the screens there.

**All data in the prototype is invented placeholder data.** Nine Entrants, four Gameweeks,
squads generated from a 34-player pool. Nothing is seeded from the real database. Wire the
real queries in; keep the shapes described under *Data* below.

## Fidelity

**High-fidelity.** Final colours, typography, spacing and interactions. Recreate pixel-perfectly
using the codebase's libraries. Every value below is exact.

---

## Design tokens

The design is built on the **Modernist** design system — flat, architectural, Archivo
throughout, zero corner radius, strong 2px rules, near-mono with a single accent. The full
token sheet is bundled as `modernist-styles.css`; link it or port the `:root` block.

The one deviation from the stock system: the accent was retuned from red to **Premier League
purple**. Use these values, not the red ones in the stylesheet.

### Colour — light theme

| Token | Value | Used for |
|---|---|---|
| `--color-bg` | `#f3f2f2` | page ground |
| `--color-surface` | `#eae9e9` | card / panel fills, bench strip |
| `--color-text` | `#201e1d` | all copy |
| `--color-divider` | `color-mix(in srgb, #201e1d 40%, transparent)` | rules, table borders |
| `--color-accent` | `#7f2ea8` | rank 1, active tab, captain, primary emphasis |
| `--pitch` | `var(--color-neutral-900)` = `#2d2b2b` | pitch field background |

Accent ramp: `100 #f6effa` · `200 #ead9f3` · `300 #d8bbe9` · `400 #b98ad6` · `500 #9b4dc4` ·
`600 #6c2291` · `700 #57157a` · `800 #420f5c` · `900 #37003c`

Neutral ramp: `100 #f8f4f4` · `200 #eae7e7` · `300 #d7d3d3` · `400 #bab6b6` · `500 #9b9797` ·
`600 #7d7979` · `700 #605d5d` · `800 #444141` · `900 #2d2b2b`

### Colour — dark theme

Applied by a `.dark` class on the app root, overriding the same variables:

| Token | Value |
|---|---|
| `--color-bg` | `#201e1d` |
| `--color-surface` | `#2d2b2b` |
| `--color-text` | `#f3f2f2` |
| `--color-divider` | `color-mix(in srgb, #f3f2f2 34%, transparent)` |
| `--color-accent` | `#a95ccd` (lightened so it holds contrast) |
| `--color-accent-600` | `#c084dd` |
| `--pitch` | `#141312` |
| page surround behind the app | `#171615` |

The neutral ramp inverts (`100 #2d2b2b` … `900 #f8f4f4`) and the accent ramp mirrors
(`100 #420f5c`, `200 #57157a`, `300 #6c2291`, `700 #d8bbe9`, `800 #ead9f3`, `900 #f6effa`),
so every `neutral-N` / `accent-N` reference keeps its intended visual weight in both themes.
The pitch stays dark in both themes by design.

### Typography

**Archivo** for everything (`400`, `600`, `800`). Headings are weight `800`, letter-spacing
`-0.015em` (tightened to `-0.03em` on page titles). Body 15px / 1.55.

| Role | Size | Weight | Extra |
|---|---|---|---|
| Page title (h1) | 40–46px | 800 | letter-spacing `-0.03em` |
| Section kicker | 11px | 400 | uppercase, letter-spacing `.08em`, opacity .55 |
| Card / stat number | 20–28px | 800 | tabular-nums |
| Table header | 11px | 400 | uppercase, letter-spacing `.08em`, 60% text |
| Table body | 14px | 400 | tabular-nums on all numeric cells |
| Entrant name | 16px | 800 | with 11px / .55-opacity base-model id beneath |
| Player name (pitch) | 12px | 800 | ellipsis on overflow |

### Spacing & shape

4 / 8 / 12 / 16 / 24 / 32px scale. **Border radius is 0 everywhere.** Dividers are 2px for
section boundaries and 1px for row rules. Shadows only on the mobile shell (`--shadow-lg`);
the rest of the UI is flat.

---

## Global chrome

### Header (one row, 2px bottom rule)

- Left: `FOOTBALL BENCH` (18px / 800) then `FPL TRACK` (13px, weight 400, uppercase,
  letter-spacing `.18em`, accent colour). Never wraps.
- Centre: three tab buttons — `Leaderboard`, `Latest squads`, `Model stats`. 14px / 800,
  padding `20px 0`, gap 32px. Active tab: accent text + `inset 0 -3px 0 var(--color-accent)`
  underline. Inactive: text colour at 60% opacity. Hover: accent.
- Right: status line `Season 2026/27 · GW4 settled · 9 entrants` (11px, uppercase,
  letter-spacing `.08em`, 55% opacity), then a 36×36 icon button toggling the theme —
  Lucide **moon** in light mode, **sun** in dark.

Page body: `max-width: 1240px`, centred, padding `34px 28px 80px`.

### Responsive

Driven by a **container query** on the app root (`container-type: inline-size`), so the layout
also collapses inside a narrow embed, not just a narrow viewport. Breakpoint: `max-width: 760px`.

At mobile width:
- Header stays **one row**: brand left, theme icon + hamburger icon right. Tabs hide and move
  into a dropdown panel below the header (full-width rows, 15px / 800, 14px 16px padding,
  1px bottom rules, active row in accent). Selecting a page closes the menu.
- Page padding drops to `22px 16px 60px`; h1 to 28px.
- Every 2- and 3-column grid collapses to one column; the six-cell stat strip goes to 2×3.
- The entrant picker becomes a **stacked full-width list** (not a horizontal scroller).
- The leaderboard table hides columns 6 and 7 (Squad value, Chips left); cell padding drops to
  `8px 6px`, font to 13px.

---

## Screen 1 — Leaderboard

**Purpose:** rank Entrants by cumulative FPL points through the latest Settled Gameweek.

Header row: h1 `FPL points ranking` (46px), a kicker `CUMULATIVE, GAMEWEEKS 1–4`, and a
right-aligned segmented control `Table | Race | Cards` (the design-system `.seg` / `.seg-opt`
control: 1px divider border, 0 radius, selected option filled with accent and the label in
`--color-bg`). A 2px rule sits under the row.

### Variant A — Table (default)

Columns: Rank (56px) · Δ (34px) · Entrant · GW4 (96px, right) · Total (120px, right) ·
Squad value (120px, right) · Chips left (110px).

- Rank: 20px / 800.
- Δ: `▲n` in accent for a rise, `▼n` in neutral-600 for a fall, `–` at 35% opacity for no change.
  Computed against the cumulative snapshot at the previous Gameweek.
- Entrant cell is two lines: name (16px / 800) over the OpenRouter base-model id
  (11px, 55% opacity).
- Total: 18px / 800, tabular. Squad value: 75% opacity.
- Chips left: `.tag .tag-neutral` pill (11px, 3px 10px padding).
- Row rules 1px; header rule 2px; row hover is a 4% ink wash.
- Footnote beneath, 12px / 55% opacity, max 70ch: *"Δ is the change against the cumulative
  snapshot at GW3. Points are net of Hits. Reference Lines do not appear here — they produce
  probabilities, not a Squad."*

### Variant B — Race

Two columns: chart (fills) + a 260px standings list.

- Chart panel: `--color-surface` fill, 1px divider border, 20px 22px padding, kicker
  `CUMULATIVE POINTS BY GAMEWEEK`.
- SVG `viewBox="0 0 640 300"`, plotted into x 8→470 (the right ~26% is reserved for labels),
  y mapped `280 − (cumulative / maxTotal) × 250`. Four horizontal gridlines at y 70/140/210/280
  in `--color-divider` (the baseline at full strength, the rest at 40%).
- One polyline per Entrant. Rank 1: accent, 3px. Ranks 2–3: `neutral-800`, 2px (rank 3 dashed
  `6 4`). Ranks 4–9: `neutral-500`, 1.25px.
- **Entrant labels are HTML, not SVG `<text>`** — absolutely positioned spans at `left: 76%`,
  vertically at the line's end point, de-overlapped by forcing a minimum 17-unit gap in
  viewBox space. (SVG `<text>` nodes generated in a loop measured to zero width in the
  prototype's renderer; positioned HTML is the reliable route.) Rank 1 accent + 800, ranks 2–3
  ink + 800, the rest 400 at 60% opacity.
- Gameweek labels sit under the plot as a flex row spanning the plotted width.
- Standings list: rank (18px column, 50% opacity) · name (14px / 800) · total right-aligned,
  1px rule per row.

### Variant C — Cards

3-column grid with `gap: 2px` over a `--color-divider` background, so the gaps read as rules.
Each cell: `--color-bg`, padding `20px 20px 18px`, min-height 186px, flex column.

- Top row: rank (40px / 800, `letter-spacing -0.04em`, accent for rank 1) · Δ · total
  (28px / 800) pushed right.
- Then entrant name (18px / 800) and base-model id (11px / 55%).
- Bottom: three tags — `.tag-accent` `GW4 {n}`, `.tag-neutral` `£{value}`, `.tag-neutral`
  `{n} chips`.

---

## Screen 2 — Latest squads

**Purpose:** show the Team Sheet an Entrant locked for the current Gameweek.

Layout: `236px | 1fr` grid, 36px gap, `align-items: start`.

### Entrant picker (left)

Kicker `ENTRANT`, then nine full-width buttons in leaderboard order: rank (16px column, 50%
opacity) · name (13px / 800, flush left) · total (12px, 60% opacity, right). 1px bottom rule,
`9px 10px` padding. Selected row: accent fill, `--color-bg` text. Shared with Screen 3.

### Header block (right)

Kicker `TEAM SHEET · GAMEWEEK 4` in accent; h1 = Entrant name (40px); sub-line
`{base model} · {provider} · locked Fri 18:30 UTC` (12px, 55%). Right: `Pitch | List`
segmented control. 2px rule beneath.

### Stat strip

Six equal cells, `gap: 2px` over the divider colour, each `--color-bg` with `12px 14px`
padding: label (10px, uppercase, `.1em`, 55%) over value (22px / 800). Cells:
**GW4 points** (accent) · **Season total** · **Squad value** · **In the bank** ·
**Free transfers** · **Chip** (accent when one is active, 45% opacity when `None`).

### Pitch view

A dark field (`--pitch`) with `30px 24px 34px` padding and an absolutely-positioned SVG of the
markings at 28% opacity, white 0.25 strokes, `viewBox="0 0 100 62"`, `preserveAspectRatio="none"`:
outer rect, penalty box, six-yard box, D arc, halfway line at the bottom and the centre-circle arc.

Four rows (GKP / DEF / MID / FWD), each a centred flex row, 16px gap, 22px between rows. One
card per starter, 104px wide:

- **Jersey**: 58×50 block, `clip-path: polygon(0% 20%, 22% 0%, 36% 9%, 64% 9%, 78% 0%, 100% 20%,
  87% 36%, 81% 27%, 81% 100%, 19% 100%, 19% 27%, 13% 36%)`. Fill `neutral-200` outfield,
  `neutral-400` goalkeeper, **accent for the captain**. The club's 3-letter code sits at the
  bottom of the shirt (10px / 800, `neutral-800`, or `--color-bg` on the accent shirt).
- **Name plate**: `--color-bg` with a 1px `--pitch` border. Name row (12px / 800, ellipsis),
  then a footer row with a 1px `neutral-300` top border: opponent `BRE (H)` at 75% opacity on
  the left, the Gameweek points (800) on the right. The captain's footer is an accent fill with
  `--color-bg` text.
- **Armband badge**: 17×17 accent square, top `-2px`, right 8px, 1px `--color-bg` border, `C`
  or `V` in 10px / 800.

**Bench strip** below the field: `--color-surface`, 2px `--pitch` top border, `16px 24px`
padding. Label `BENCH` (11px, uppercase, `.1em`, 55%) then four cards in the same style with a
smaller 46×40 shirt; the footer left slot shows the bench order (`GK`, `1`, `2`, `3`).

### List view

A `.table` of all 15: Pos (60px) · Player · Club (70px) · Price (90px, right) ·
Selling price (110px, right) · GW4 (80px, right) · Role (120px). Bench rows render at 62%
opacity. Role tag: `.tag-accent` for the captain, `.tag-neutral` for bench, `.tag-outline`
otherwise — values `Captain`, `Vice`, `Bench GK`, `Bench 1–3`, `Starter`.

### Below the squad

Two columns, 32px gap:

- **Transfers into GW4** — rows of `{out, struck through, 50% opacity} → {in, 800}` with the
  cost right-aligned (`Free transfer` / `−4 Hit`), 1px rules. The arrow is accent.
- **Validation** — three label/value rows: `Repairs used` (`n of 3`), `Rolled over`,
  `Last violation`.

---

## Screen 3 — Model stats

**Purpose:** the historical record of one Entrant's squad decisions. Same 236px picker on the
left. Kicker `HISTORICAL RECORD · GAMEWEEKS 1–4`, h1 = Entrant name, 2px rule.

### Charts row (2 columns, 2px gap over divider)

**Points per Gameweek** — CSS bars in a 170px-tall flex row, 18px gap. Bar height
`(pts / maxPts) × 130px`; `neutral-800` fill, **accent for the latest Gameweek**. Value label
(15px / 800) above each bar, Gameweek label (11px, 55%) below.

**Squad value & bank** — SVG `viewBox="0 0 360 170"`. Baseline at y 140, a second rule at y 36
at 45% opacity. x = `46 + k × 96`. Each series is scaled independently into y 128 → 36 from its
own min/max, so a flat series still reads. Squad value: accent, 2px solid. Bank: `neutral-600`,
2px, `stroke-dasharray="4 3"`. Min/max value labels are **positioned HTML spans** at `left: 1%`
(same reason as the race labels). Legend beneath: swatch + label + the current value.

### Chip usage

Kicker `CHIP USAGE — FIRST SET EXPIRES AT THE GW19 DEADLINE`. A 38-cell flex strip (one cell
per Gameweek), `gap: 2px` over the divider colour, 1px border, each cell 30px tall. Played
Gameweeks use the chip's colour; past unplayed Gameweeks are `neutral-300`; future ones are
`--color-bg`. **GW19 carries `inset -2px 0 0 var(--color-accent)`** to mark the first set's
expiry. Legend rows below: swatch, chip name (600), and `played GW{n}` at 55% — or, when no
chip has been played, a single row reading `No chips played · 8 remaining across both halves`.

### Captain picks / Transfer history (2 columns, 36px gap)

- **Captain picks**: GW (56px, 55%) · Captain (800) · Vice (12px, 60%) · Returned (right,
  accent when ≥ 12). Captains must be drawn from the Entrant's own attacking starters.
- **Transfer history**: GW · Out (struck through, 60%) · In (800) · Cost (`Free` or `−4` in
  accent + 600). **Transfers must be like-for-like by position** and must move a player the
  Squad does not own in, and one it did own out — FPL forbids anything else.

### Operator footer

2px top rule, then a flex row of small stat blocks (10px uppercase label over 20px / 800
value): `Repairs, season` · `Roll overs` · `Hits taken` · `Gaps` · `Prompt version`.

---

## Interactions & behaviour

| Trigger | Result |
|---|---|
| Header tab click | switches page; state only, no route in the prototype — wire to real routes (`/fpl`, `/fpl/squads`, `/fpl/stats`) |
| Leaderboard segmented control | switches Table / Race / Cards |
| Entrant picker row | selects the Entrant on Screens 2 and 3 (selection is shared between them) |
| Pitch / List control | switches the squad presentation |
| Theme icon | toggles the `.dark` class on the app root |
| Hamburger (mobile) | opens the page menu; selecting a page closes it |

No animation beyond the design system's built-in hover and pressed states. Focus is the
system's `2px solid var(--color-accent)` `:focus-visible` ring at `2px` offset — do not leave
browser defaults. Persist the theme choice; persist the selected Entrant across the two
Entrant-scoped screens.

## State

```
page:      'leaderboard' | 'squads' | 'stats'
lbVariant: 'table' | 'race' | 'cards'
selected:  entrant index (shared by squads + stats)
squadView: 'pitch' | 'list'
dark:      boolean          // persist
menuOpen:  boolean          // mobile only
```

## Data

Everything maps onto the existing schema — no new tables.

- **Leaderboard row**: `scores` where `metric = 'fpl_points_season_to_date'` at the latest
  Settled Gameweek, joined to `models`; the Gameweek's own value comes from `fpl_points`, and Δ
  is the rank difference against the snapshot at GW−1. Squad value and chips remaining derive
  from `manager_states`.
- **Squad screen**: one `manager_states` row (`squad`, `team_sheet`, `bank`, `free_transfers`,
  `chips_used`, `chip_active`, `rolled_over`, `attempts_used`) plus per-player Gameweek points
  from `fpl_player_points` and positions/prices from the locked player snapshot. Selling price
  is purchase price plus half of any rise, rounded down — a fall passes through in full.
- **Stats screen**: the `fpl_points`, `repairs`, `roll_over_rate` and `violation_profile` series
  (and their `_season_to_date` counterparts) from `scores`; chips from `chips_used`; captain and
  transfer history by replaying `manager_states` across Gameweeks.

Two rules the UI must respect: only **Settled** Gameweeks appear, and a missing Gameweek is
announced rather than silently absent or filled with provisional numbers.

## A note the product owner should decide on

The prototype does **not** display the FPL track's demonstration qualification — the sentence
stored in `DEMONSTRATION_QUALIFICATION`, which the backend deliberately attaches to every row a
ranking can be read off ("One seat per Base Model means one Season path each…"). It was removed
from the header during design review. The spec (ADR-0003) requires the FPL ranking to be
labelled a demonstration, so confirm where it should live before launch — a footnote under the
leaderboard is the obvious home.

## Assets

None. Icons are inline Lucide SVG (moon, sun, menu) at 17–18px on `currentColor`, 2px stroke,
round caps. The jersey is a CSS `clip-path`, not an image. No photography is used; if any is
added later, it goes through the system's `.grayscale` wrapper.

## Files

| File | What it is |
|---|---|
| `FPL-Track-standalone.html` | the full prototype, self-contained — open it in a browser to click through every screen, variant and theme |
| `FPL Track.dc.html` | the source design component (template + logic + the placeholder dataset) |
| `modernist-styles.css` | the Modernist token sheet and component classes; note the accent in this file is the stock red — override it with the purple ramp above |
| `screenshots/` | reference captures of every screen, variant and breakpoint |

### Screenshots

| File | Shows |
|---|---|
| `leaderboard-table.png` | Screen 1, Table variant (default) |
| `leaderboard-race.png` | Screen 1, Race variant — line weights and HTML labels |
| `leaderboard-cards.png` | Screen 1, Cards variant — 2px grid gaps as rules |
| `squads-pitch-top.png` | Screen 2 header, picker and stat strip |
| `squads-pitch.png` | Screen 2 pitch view — jerseys, plates, armband, bench strip |
| `squads-list.png` | Screen 2 list view — 15-row table with role tags |
| `stats-charts.png` | Screen 3 — points bars, value/bank chart, chip timeline |
| `stats-history.png` | Screen 3 — captain picks, transfer log, operator footer |
| `squads-dark.png` | dark theme, showing the inverted ramps and the pitch |
| `mobile-leaderboard.png` | mobile header (one row) and collapsed table |
| `mobile-menu.png` | hamburger menu open |
| `mobile-squads.png` | mobile squad page with the stacked entrant picker |
