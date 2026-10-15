# Ticket: The Europa League opens

**What to build:** `UEL` opens at its Gameweek 2 (Lock 2026-10-15T15:15Z) with every
section of ADR-0063's packet: table and bands, played Fixtures with xG, five recent
matches, Head Coach lines, and the Squad Changes absence. It does not inherit any cut
`UCL` took. It has its three reviewed maps: 365Scores names, competitor ids and article
titles. Its registry entry names every source, and `match-uel/2026-27-v1` is pinned from
a render read whole. It is activated by the runbook's *Opening a club cup*.

Source: ADR-0063, spec 0028 stories 59, 61, 75–80.

**Blocked by:** 0106 (the runbook), 0103 and 0104 (both sources green), and 0111 (history
lines carry their sheets' figures; ADR-0063 as amended 2026-10-13). If 0111 is not green by
2026-10-15T06:00Z, this ticket pins scores-only history lines and proceeds. Migration 0051
is applied on production after `db:rehearse` and before `UEL`'s insert.

**Hard deadline:** pinned and deployed by 2026-10-15T09:15Z. The fallback is Gameweek 3,
Lock 10-22T15:15Z.

**Status:** done, 2026-10-15. `UEL` opened at Gameweek 2, its Lock 2026-10-15T15:15Z, and not at the Gameweek 3 fallback.

---

## What is already known

- `UEL` `MD1` was read 2026-10-12: 18 of 18 sheets carry xG for both sides.
- Its 36 sides cover 22 countries, 12 of them clubs in the five leagues. 365Scores'
  spellings were not compared for `UEL`, because the listing request timed out on the
  first try. Derive the map from the archive like `UCL`'s.
- Head Coach acceptance includes Lech Poznań (Frederiksen) and Viktoria Plzeň (Kováč).
- The pre-flight is paid: eight calls, roughly $0.30, and asked for separately.
- **From 0103**: club results read one page a side, and `previousPage` is not followed.
  Check that every side has five competitive matches on its page. `FRIENDLIES` in
  `src/365scores/fetch-club-results.ts` holds only the names in `UCL`'s 2026-10-12
  archive. Check this cup's archive for friendlies under other names, and check again
  in January for winter-break tournaments.

## Acceptance criteria

- [x] The three `UEL` maps are derived from the archive with nothing left over. 16 spellings, 36 competitor ids and 36 titles, each derived by a test from archives recorded 2026-10-13.
- [x] A `UEL` Gameweek 2 render holds every section, with history lines carrying their sheets' figures (or scores only, if 0111 missed its cut, recorded here); `MATCH_PROMPTS.UEL` is pinned; every other pin unchanged. 0111 was green before its cut, so the history lines carry figures. `b3b605c6…e6bf` was read whole from the suite's render on 2026-10-13.
- [x] The dry run over the hand-run first fetch shows `MD1` adopted with 18 sheets. Run 2026-10-14 over production's archive at `deadline-6h`: 18 contexts, "Predictions: 0 (expected 0), Gaps: 144 (expected 144). Dry run matched the archive's expected outcome." No answers were replayed, because the pre-flight ran on `uel_preflight` and production archived none of them.
- [x] Production answers `UEL` with eight seats and its caveat; the boundary is recorded.
      - After the 2026-10-14 deploy, the live Worker answered `/api/uel/…` with 8 entrants, the roster caveat, and 18 Fixtures × 8 slots.
      - Read on production at 15:06Z on 10-15, nine minutes before the Lock: 144 Predictions, 8 seats × 18 Fixtures, no Gap. They were stored from 09:44Z to 09:52Z by the first predict run after Lock − 6h.
      - Every slot was already filled, so the Lock had nothing left to ask.
      - Gemini 3.1 Pro Preview took 35 attempts for its 18, through Repair turns, as it did for `UCL`.
      - The boundary is Gameweek 2.
- [x] Pushed and deployed by 2026-10-15T09:15Z; the `origin/main` gap checked first. `1a6f4a3` was pushed 2026-10-13, and `origin/main` was 0 behind and 0 ahead at the insert. The jobs run `origin/main`.
- [x] Pre-flight's paid half on `uel_preflight`: eight calls, about $0.30, asked for separately. It ran 2026-10-13 at 20:22Z on Fixture 2050076, Lyon–Crystal Palace, Gameweek 2.
      - Seven seats were `parseable`, each resolved to its pinned dated id.
      - Gemini 3.1 Pro Preview was `unparseable` on shape alone: `fixture_id` came as the string `"2050076"`.
      - Its `probs` and `score` were well-formed objects, and its rationale reads the packet's figures.
      - The operator went on to the insert rather than re-running. That is the runbook's §5 step 3 rule and `UCL`'s precedent, where Repair turns produced all 18 of Gemini's Predictions.
- [x] The operator's `competitions` insert and `EDITION=1 roster:enter` on production, with `DATABASE_URL` set inline.
      - `INSERT 0 1`.
      - `roster:enter` entered the eight `match-uel/…` seats and re-confirmed `UCL`'s eight and `UNL`'s seven, which writes nothing.
      - It printed "Left as they stand, not in Edition 1: BL1, FL1, PD, PL, SA".
- [x] The first fetch by hand, then `context:show` for `UEL` Gameweek 2. Run 2026-10-14 from 09:34Z to 09:44Z.
      - 144 Fixtures in Gameweeks 1–8, with `MD1` Locked: 18 results and 18 of 18 sheets with xG.
      - Gameweek 2's deadline is 2026-10-15T15:15Z.
      - `club_results` holds 688 rows, with 409 sheets read and 195 carrying xG.
      - `club_head_coaches` holds 108 rows.
      - `context:show` built 18 packets, each with every section.
      - The history lines carry sheet figures, with "xG unavailable" on 76 lines from leagues without it.
- [x] The dashboard deploy by hand. Deployed 2026-10-14 in `9e061ec` as Worker version `87f6aceb`, with the `deployed` tag moved. Ticket 0113's deploy, `80cf176`, followed it.
- [x] Migration 0051 applied on production (operator).
- [x] (moved from 0111) A row shared by a `UCL` side and a `UEL` side is read once. A `UCL`-only row is never read. Proven through `runDailyFetch` (`test/daily-fetch.test.ts`).
- [x] (moved from 0111) A `UEL` packet shows figures on a line whose sheet has them, shots and "xG unavailable" where it has no xG, and the score alone where no sheet is stored. Nothing observed after the Lock appears. See `test/match-uel-packet.test.ts`.
- [x] (from 0111's review) The guard sits inside `fetchClubResultSheets`; a call with a Competition whose constant is no throws by name. Its positive tests switch from `UCL` to `UEL`.
- [x] (from 0111's review) A `UEL` sheet whose sides do not match its row fails `UEL`'s day by name through `runDailyFetch`, and the other listed Competitions land.

## Outcome

Code green 2026-10-13 (targeted suites, `tsc`). The production boxes wait on the operator's
steps in the runbook's *Opening a club cup*.

- **Recorded 2026-10-13**, all free:
  - 365Scores' `MD1` listings and its 18 sheets, each with xG for both sides;
  - the standings and all 36 sides' results pages;
  - two Sparta Praha league sheets without xG;
  - Wikipedia's section 0 for the 36 articles.
- **Friendlies.** `UEL`'s pages list none under a name `FRIENDLIES` lacks, so the list is
  unchanged. Every side has at least five competitive matches on its one page.
- **The infobox alias.** Torreense's article opens `{{Football club infobox`, the other
  name for the same template. `INFOBOX` now matches both, and Torreense reads Luís
  Tralhão.
- **A side's name is one name across cups.** `club_results` is keyed by match, and each
  cup named a non-cup opponent through its own map. Crystal Palace v Man City was written
  "Man City" by `UCL` and "Manchester City" by `UEL`, so the cup that wrote last decided
  whether `UCL`'s Man City still had the row. A side of any cup is now named by its
  competitor id, and anyone else by 365Scores' spelling. The test fails with the old
  naming.
  `UCL`'s stored opponents that are `UEL` sides change spelling with it: 19 rows in
  `UCL`'s 2026-10-12 archive, such as "Olympique de Marseille" to "Marseille" and
  "Union St. Gilloise" to "Union SG". The review counted 40, but that was every listed
  game; 19 are the ones stored after friendlies and pre-July matches are dropped.
  `UCL`'s Gameweek 3
  packet (Lock 2026-10-20) is the first to print the new names; its pin does not move.
  Recorded in ADR-0063's 0103 amendment.
- **Head Coaches.** Lech Poznań reads Frederiksen and Viktoria Plzeň reads Kováč, from
  `UEL`'s own recording.
- **The guard.** The daily fetch still asks `historyCarriesFigures` before calling, so
  `UCL`'s day does not fail on the guard.
- **Routes.** `/uel` appears on the dashboard with the `MATCH_PROMPTS` entry, as `/ucl`
  did in 0105.
- **The pre-flight's free half on real sources**, 2026-10-13, on the throwaway database
  `uel_preflight` (kept for the paid half):
  - `EDITION=1 roster:enter` entered the eight `match-uel/…` seats;
  - the fetch landed 144 Fixtures, `MD1`'s 18 settled, and 18 sheets with xG;
  - Gameweek 2's deadline is 2026-10-15T15:15Z;
  - `club_results` holds 409 rows, every sheet read: 195 with xG and 214 without;
  - `club_head_coaches` holds 36 of 36;
  - `context:show` renders 18 packets with every section.
