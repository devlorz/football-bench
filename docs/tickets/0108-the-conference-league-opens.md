# Ticket: The Conference League opens

**What to build:** `UECL` opens at its **Gameweek 1**, `MD1`, Lock 2026-10-15T15:15Z
(ADR-0063 as amended 2026-10-14; it was first written for Gameweek 2). It opens with every
section of ADR-0063's packet, six Gameweeks only, its three reviewed maps, its registry
entry, and `match-uecl/2026-27-v1` pinned from a render read whole. It is activated by
the runbook's *Opening a club cup*. Its whole league phase is predicted, and no Gameweek
is adopted as history.

Source: ADR-0063, spec 0028 stories 59, 61, 75–80.

**Blocked by:** 0106 (the runbook), 0103, 0104 and 0111 (history lines carry their
sheets' figures). If 0111 is not green by 2026-10-22T03:45Z, this ticket pins scores-only
history lines and proceeds.

**Hard deadline:** inserted, seated and fetched by **2026-10-15T09:15Z** (Gameweek 1's
Lock − 6h, when the predict run first asks). The absolute limit is a few predict runs
before the 15:15Z Lock. The fallback is ADR-0054's: Gameweek 2, Lock 2026-10-22T13:00Z,
with `MD1` adopted as history, which is this ticket as first written. If that is missed
too, Gameweek 3, Lock 11-05T16:15Z.

**Status:** done but for the `MD1` sheets, 2026-10-15. `UECL` opened at **Gameweek 1**, its Lock 2026-10-15T15:15Z (ADR-0063 as amended 2026-10-14). The last box waits for tonight's matches and the next fetch.

---

## What is already known

- `UECL`'s feed holds 108 league-phase matches over `MD1`–`MD6`, plus 258 qualifiers,
  which is the most of the three.
- Only 5 of its 36 clubs play in the five leagues. Its sides are the ones the record
  knows least about, and history and Head Coach lines carry the most weight here.
- Atalanta is in `UECL`. Its history shows no fixture between 09-20 and 10-12, and that is
  real.
- `UECL`'s `MD1` sheets do not exist yet. A 2025-26 `UECL` sheet sampled carried xG.
  Whether every `MD1` sheet of 2026-27 does is read after 10-15. ADR-0063 states that
  "at least one match with xG from Gameweek 2" holds for `UECL` once those sheets exist.
- The pre-flight is paid: eight calls, roughly $0.30, and asked for separately.
- **From 0103**: club results read one page a side, and `previousPage` is not followed.
  Check that every side has five competitive matches on its page. `FRIENDLIES` in
  `src/365scores/fetch-club-results.ts` holds only the names in `UCL`'s 2026-10-12
  archive. Check this cup's archive for friendlies under other names, and check again
  in January for winter-break tournaments.

## Acceptance criteria

- [x] The three `UECL` maps are derived from the archive with nothing left over. 20 spellings, 36 competitor ids and 36 titles, each derived by a test from archives recorded 2026-10-14.
- [ ] After `MD1` is played (2026-10-15), all 18 of its sheets are read and the count with xG is recorded here. They are a predicted Gameweek's sheets, read by the daily fetch as any settled Fixture's are.
- [x] A `UECL` Gameweek 2 render holds every section, with history lines carrying their sheets' figures (or scores only, if 0111 missed its cut, recorded here); `MATCH_PROMPTS.UECL` is pinned; every other pin unchanged. 0111 was green, so the history lines carry figures. `ee69297f…2146` was read whole from the suite's render on 2026-10-14; it is `UEL`'s rendering but for the Competition's name.
- [x] Production answers `UECL` with eight seats and its caveat; the boundary is recorded.
      - After the 2026-10-14 deploy, the live Worker answered `/api/uecl/…` with 8 entrants, the roster caveat, `nextLock` Gameweek 1, and 18 Fixtures × 8 slots.
      - Read on production at 15:06Z on 10-15, nine minutes before the Lock: 144 Predictions, 8 seats × 18 Fixtures, no Gap. They were stored from 09:39Z to 09:44Z.
      - Every slot was already filled, so the Lock had nothing left to ask.
      - Gemini 3.1 Pro Preview took 34 attempts for its 18.
      - The boundary is Gameweek 1. No `UECL` Gameweek is adopted as history.
- [x] Pre-flight's free half on `uecl_preflight`: `EDITION=1 roster:enter`, the fetch, and `context:show` for **Gameweek 1** rendering 18 packets. It is read line by line for the empty state no cup has rendered yet: the 36-side table at nought, the played-Fixtures section with no match, five recent matches a side, and Head Coach lines.
      Run 2026-10-14 at 12:21–12:28Z:
      - 8 seats;
      - 6 Gameweeks, Gameweek 1's deadline 2026-10-15T15:15Z;
      - 108 Fixtures, none settled;
      - 534 `club_results` rows, all of their sheets read and 158 with xG;
      - 36 of 36 Head Coaches.

      Gent–Aarhus was read whole:
      - "League table:" carries no "results through" date, because there are none;
      - all 36 sides sit at nought, in alphabetical order, beneath the usual ordering line. `UNL`'s Gameweek 1 rendered the same way;
      - the played-Fixtures section reads "This cup's played Fixtures: no result has been played yet this Season.", which is `UNL`'s Gameweek 1 wording;
      - each side has five lines, with figures or "xG unavailable";
      - the Squad Changes absence is stated;
      - the Head Coach lines and the no-appointment-date line are present.

      One shape no story names: a sheet read with neither shots nor xG renders "xG unavailable" alone, e.g. `DBU Pokalen | Skjold 1-6 Aarhus`. It is correct, because the sheet stated no figure, and it is already in `UEL`'s pinned template.
- [x] Pre-flight's paid half on `uecl_preflight`, on a **Gameweek 1** Fixture: eight calls, about $0.30, asked for separately.
      Run 2026-10-14 at 12:33Z on Fixture 2050312, Gent–Aarhus.
      - Seven seats were `parseable`, each resolved to its pinned dated id.
      - Gemini 3.1 Pro Preview was `unparseable` on shape alone: `fixture_id` came as the string `"2050312"`, with well-formed `probs` and `score`. This is `UEL`'s case exactly.
      - The operator went on to the insert, the runbook's §5 step 3 rule.

      The first attempt refused before any call: `readCompetition` admitted two- or three-letter codes only, and `UECL` is the first four-letter one. It was widened to four letters, with `UECL` added to its test. Only the pre-flight and the preview read it; cron reads `competitions`.
- [x] Pushed and deployed by 2026-10-15T09:15Z, with the `origin/main` gap checked first. `d70c5ef` was pushed 2026-10-14 at about 12:50Z, with `origin/main` 0 behind and 0 ahead. The 09:15Z predict window found `UECL` listed and seated.
- [x] The operator's `competitions` insert and `EDITION=1 roster:enter` on production, with `DATABASE_URL` set inline.
      - `INSERT 0 1`.
      - The eight `match-uecl/…` seats were entered.
      - `UCL`, `UEL` and `UNL` were re-confirmed, which writes nothing.
      - It printed "Left as they stand, not in Edition 1: BL1, FL1, PD, PL, SA".
      - Production then listed nine Competitions.
- [x] The first fetch by hand, then `context:show` for `UECL` Gameweek 1.
      Run 2026-10-14 at 12:35–12:47Z:
      - 6 Gameweeks, Gameweek 1's deadline 2026-10-15T15:15Z;
      - 108 Fixtures;
      - `club_results` holds 1131 rows, with 875 sheets read and 316 carrying xG. The rest are `UCL`-only rows or less than a day old;
      - 36 of 36 `UECL` Head Coaches today;
      - 18 packets, each with every section and the empty-state played-Fixtures line.
- [x] The dry run of Gameweek 1 over the hand-run first fetch builds 18 contexts and matches its expected outcome. Run at `deadline-6h`: 18 contexts, "Predictions: 0 (expected 0), Gaps: 144 (expected 144). Dry run matched the archive's expected outcome."
- [x] The dashboard deploy by hand. Deployed 2026-10-14 in `d70c5ef` as Worker version `05d9fc70`, with the `deployed` tag moved.

## Outcome

Code green 2026-10-14 (targeted suites, `tsc`). `MD1`'s sheets and the production
boxes wait for 10-15 and the operator.

- **Recorded 2026-10-14**, all free:
  - 365Scores' `MD1` listing (18 Fixtures, unplayed);
  - the standings and all 36 sides' results pages;
  - Wikipedia's section 0 for the 36 articles.
  UEFA's pages are the committed 2026-10-12 recordings.
- **The standings are wrong about one side.** 365Scores' `UECL` table seats
  CSKA 1948 Sofia (53248), but UEFA's draw and `MD1`'s listing both have
  CSKA Sofia (2276). The competitor ids are derived from the `MD1` listing
  instead, and the test asserts both facts.
- **Spellings.** 20 pairs, derived from the listing's kick-offs and sides
  (no scores yet).
- **Friendlies.** `UECL`'s pages list none under a name `FRIENDLIES` lacks, so the
  list is unchanged. Every side has at least five competitive matches on its one page.
- **Head Coaches.** All 36 infoboxes name someone. Two needed the parser widened:
  - Inter Escaldes' infobox puts each line's pipe at the end (`manager = [[Felip Ortiz]] |`);
  - Iberia 1999 writes `{{fbaicon|GEO}}` before "Levan Korgalidze (acting)".
  `fbaicon` joins the flag templates `cellSource` strips. Every Wikipedia
  parser suite stays green.
  Atalanta reads Maurizio Sarri.
- **The packet test** runs over `UEL` and `UECL` (`test/match-uel-packet.test.ts`).
- **Routes.** `/uecl` appears on the dashboard with the `MATCH_PROMPTS` entry.
