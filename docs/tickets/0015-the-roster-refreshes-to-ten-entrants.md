# Tickets: the roster refreshes to ten Entrants

Four slices that take the codebase from ADR-0014's nine to ADR-0034's ten: a prefactor
that gives the rehearsal's world a falling price, the atomic move of everything the
roster size guards, the dashboard skeleton, and the tests that prove the road in refuses
its half-done states. Source: [spec 0015](../specs/0015-the-roster-refreshes-to-ten-entrants.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0034](../adr/), especially
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md).

The size guard couples on purpose: the roster constant, its declared size and the
rehearsal's seat script must move together or the guards fire — which is why the second
slice is atomic and the first exists to keep it small. The road-in tickets change no
behaviour; they prove the loudness the spec's Further Notes warns an implementer not to
relax.

---

## A price falls in the rehearsal's world

**What to build:** The rehearsal's replayed world contains a player whose price has fallen
since a seat bought him, named and asserted, with all nine current seats leaving him
untouched. This is the prefactor that makes the faller seat a script rather than a data
expedition: the fall exists, nobody trades on it yet, and every existing expectation holds
to the point.

**Blocked by:** None — can start immediately.

- [x] A named player's price is lower in a later rehearsed Gameweek than the price a seat
      paid for him
- [x] No existing seat buys or sells that player, and every existing seat's expectations
      pass unchanged
- [x] The fall is asserted by the rehearsal suite, so a future edit that flattens the
      price is caught here and not by the faller's arithmetic going quietly right

## Ten seats of record

**What to build:** The roster of record holds ADR-0034's ten — the Qwen and Grok
successions, Muse Spark 1.2 as a first-party seat — and everything the size is
load-bearing for moves in the same change: the declared size, the tenth rehearsal seat
("faller", selling the fallen player at his lower current price with no half-rise), and
the prose that still says nine or cites ADR-0014 as the size in force. One command against
a local database enters ten seats; the rehearsal runs and verifies ten.

**Blocked by:** "A price falls in the rehearsal's world".

- [x] Entering the roster writes ten Entrant rows at the frozen Prompt Version, and
      re-entering is idempotent
- [x] A roster constant whose length disagrees with the declared size is refused at the
      entry door
- [x] The DeepSeek and Gemini seats are byte-for-byte the seats of ADR-0014's roster
- [x] Muse Spark 1.2 and Grok 4.6 carry a provider pin and no quantization; Qwen3.8 Max
      carries its predecessor's single-endpoint justification in place
- [x] The faller seat's bank after selling proves the Selling Price of a fallen player is
      his lower current price, and the rehearsal verifier counts ten seats
- [x] No comment or docstring in the changed modules states nine as the size in force

## The skeleton holds ten rows

**What to build:** The leaderboard's loading state renders ten placeholder rows, so the
page does not move when the real ten land — the one dashboard change the refresh needs,
because every other surface reads the roster from the data.

**Blocked by:** "Ten seats of record".

- [x] The loading skeleton renders exactly as many rows as the Season Roster holds
- [x] The comment beside it still explains why the count is fixed rather than guessed
- [x] Spec 0011's nine-step manual checklist recorded below: seven steps walked, steps 6
      and 7 waived for this slice with the reason written beside them

**Manual acceptance record** (spec 0011 §"The pages", required by `dashboard/README.md`
before a slice that touches a page is complete). Walked 2026-08-15 against the design
seed on the local Postgres, `astro dev` on :4322 proxying the running read API on :8787.
Both leaderboards read `SEASON_ROSTER_SIZE` at build time; `astro check` reports no
diagnostics and the built pages carry ten placeholder rows each.

Steps 1–5 were walked at a 1440px viewport. Steps 8 and 9 were walked at 601px, which is
below the 760px collapse, so what they were read against is the narrow layout with the
nav behind its burger. Neither step is about the breakpoint, but the width is recorded
rather than implied — and 601px is not 375px, so step 7 is not closed by it.

| # | Step | light | dark | 375 |
|---|------|-------|------|-----|
| 1 | Nav links reach their page and mark themselves current | pass | pass | — |
| 2 | Sort reorders and recomputes ranks; URL updates; reload holds; Back leaves the page | pass | — | — |
| 3 | Picking an Entrant redraws every chart, list and row; URL updates; reload holds | pass | — | — |
| 4 | Opening a rationale closes the one already open | pass | — | — |
| 5 | Theme toggle flips and holds across a nav and a reload | pass | pass | — |
| 6 | Tab reaches every control; the ring is the accent one | waived | waived | — |
| 7 | 375px: nav collapses, one column, no sideways scroll | — | — | waived |
| 8 | Worker stopped: one error line, no spinner | pass | pass | — |
| 9 | Pre-season seed: each page shows its pre-season state | pass | pass | — |

Steps 2 and 5's Back and reload assertions were read off `history.length` staying put
across sort toggles, which is what `replaceState` buys and what Back leaving the page
rests on.

Step 8 was walked with the read API stopped and all four pages loaded — leaderboard,
fixtures, entrant record, FPL leaderboard. Each showed its own error line and no visible
placeholder: the skeleton blocks are still in the DOM but inside the section the failure
hides, which is the shape the page was built with and not a spinner left running.

Step 9 was walked after `npm run seed -- "pre-season" --reset`. The leaderboard and the
FPL leaderboard showed their pre-season panels with the entered field listed and no
ranking, the entrant record showed "No settled gameweeks", and the fixtures page showed
Gameweek 1's ten fixtures under the "No predictions stored" banner. The database was
seeded back to the design's stage afterwards and the read API restarted against it.

**Steps 6 and 7 were waived, not walked**, by the operator's decision on 2026-08-15, and
the table says `waived` rather than `pass` so that no later reader mistakes this for an
observation. Neither was driveable from the session that walked the rest: synthetic Tab
never left `document.body`, and the window would not resize below a 601px viewport, so
375px was never rendered.

The waiver's reason is what this slice changed — the number of placeholder rows in a
loading state, from nine to ten. Step 6 tests focus order and the focus ring; a skeleton
block is `aria-hidden`, holds no control, takes no focus, and is replaced the moment data
arrives, so a tenth block cannot reach what step 6 reads. Step 7 tests the nav collapse,
the single column and sideways scroll; a tenth row adds height, not width, and sits on
the same grid as the real rows the page already renders at 375px.

The waiver is this slice's alone. `dashboard/README.md` requires the nine steps of any
slice that touches a page, and the rule earns its keep by not letting the author of a
change decide it is exempt — this record is an exception written down, not the rule
loosening. A slice that changes a control, a width, or a breakpoint gets no such
argument. Steps 6 and 7 remain unobserved for these pages until some later slice walks
them.

## The road in is loud

**What to build:** Proof that the operator's path from nine to ten cannot be walked half
way in silence: a full pre-flight against a table still holding the outgoing seats is
refused by count, one holding fewer than ten likewise, and a temporary Exhibition row is
checked alone through the door ADR-0032 built — while an Entrant row through that same
door is refused by role. No production behaviour changes; the tickets before this one
made the states possible, this one pins them down.

**Blocked by:** None — can start immediately.

- [x] A roster pre-flight expecting ten refuses a table holding eleven or twelve Entrant
      rows at the frozen Prompt Version, naming both numbers
- [x] A roster pre-flight expecting ten refuses a table holding nine
- [x] A single temporary `role = 'exhibition'` row is pre-flighted alone, touching no
      Entrant row
- [x] An Entrant row aimed at the Exhibition door is refused by role, so a typo cannot
      check the wrong thing

Three of the four were already pinned before this slice, in
`test/preflight-base-models.test.ts`: "refuses to run when the roster does not match its
configured size" expects ten against nine, "checks one Exhibition on its own, at the frozen
Prompt Version" asserts a single call, and "refuses a targeted model that is missing or is
not an Exhibition" names the role. Only the grown roster was missing, and it is the one
test this slice adds. The fixtures keep writing the count as a literal on purpose:
`expectedEntrantCount` reaches the pre-flight from the operator's `EXPECTED_ENTRANT_COUNT`
(`src/cli/config.ts`), not from `SEASON_ROSTER_SIZE`, and a test that imported the constant
would stop failing on the day the roster grows without the operator's environment moving
with it.
