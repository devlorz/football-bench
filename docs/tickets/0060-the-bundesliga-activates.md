# Ticket: The Bundesliga activates

**What to build:** the first real Bundesliga Gameweek — the `competitions` row inserted,
ten Entrants seated, the pre-cron checklist run in order, the dry run green, and the first
Gameweek whose derived deadline still stood open at activation predicted and Locked before
kickoff. **An operator ticket: the insert is the point the scheduled runs begin to spend,
and it is the operator's act alone**
([ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)) — no
implementing agent takes it. Decisions: ADR-0054, the
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
banner (no hand-set Lock, ever again).

**Blocked by:** 0058 (the league renders and its Prompt Version is frozen), 0059 (its
history and xG are curated and reviewed).

**Status:** activated — boxes 1, 2, 3 and 4 green; 5 and 6 wait on the Lock at
2026-08-28T17:00Z

---

## What is already known

**The clocks, read on 2026-08-27.** 306 Fixtures across 34 Gameweeks, 18 clubs, none of
them played. Gameweek 1's earliest kickoff is 2026-08-28T18:30Z, so its derived deadline is
2026-08-28T17:00Z; Gameweek 2's is 2026-09-04T17:00Z. **No target Gameweek**: the league
opens at the first Gameweek whose derived deadline has not passed when it is activated, and
a Gameweek the activation misses is let go. Which one that turned out to be is this
ticket's to record.

**`FOOTBALL_DATA_SEASON` is one variable over five leagues now.** The pre-cron checklist's
advance check grows from eight files to ten as `D1` and `D2` join, and a Season in which the
sources publish at different times fails more fetches more loudly before the variable can
move.

**In order, and the order is the one spec 0016's launch met out of order:** secrets
verified, then the `competitions` insert, then `roster:enter` — which seats ten Entrants
per listed Competition and must run after the insert, not before — then the prior-Season xG
check, then the dry run.

## Acceptance

- [x] The pre-cron checklist runs in order, with the advance check covering all ten
      football-data.co.uk files. Run 2026-08-27: secrets already set (`DATABASE_URL`,
      `OPENROUTER_API_KEY`, `FOOTBALL_DATA_ORG_TOKEN`), then the `competitions` insert,
      then `roster:enter`, then the ten-file advance check
      (`pre-cron-checklist.md` grown from eight files to ten, and its own now-stale
      2026-08-21 "cannot be advanced yet" text corrected in the same edit — `git diff`
      that file for both). Secrets, the insert, `roster:enter` and the advance check all
      held. **The checklist's own §5 rehearsal step did not, on the day** — box 3 records
      why it failed and how it was made to pass, naming that here rather than only
      inside box 3, the way box 1 read short in ticket 0040 until review caught it. `npm run fetch` (the command `fetch.yml` itself runs)
      was hand-run in the same session to populate `BL1`'s archive snapshots and, per
      §5's own stated purpose, to confirm the Understat alias mapping against the live
      feed: it resolved every `BL1` club and every present-Gameweek match in
      `understat:2026-27:Bundesliga` without a naming error, and failed on exactly one
      source, `football_data:2026-27:D1` (below). The prior-Season xG check was already
      satisfied by ticket 0059's backfill and needed no re-run here.

      Read the same day: nine of the ten files name their own division; `D1` alone
      answers `300 Multiple Choices`, because the Bundesliga has played no match yet for
      football-data.co.uk to publish a result against. This is the same shape ticket 0039
      recorded at its own activation (`E0 I1 I2 F1` then answering `<html><head>` while
      `E1 SP1 SP2 F2` were ready) — 0040 did not record its own per-file read, so only
      0039 is precedent here. The consequence neither of those tickets had a reason to
      state: `D1` is now the only file, among all ten across the five Competitions
      `FOOTBALL_DATA_SEASON` covers, still answering anything other than its own division.
- [x] `roster:enter` seats ten Entrants under `match-bl1/2026-27-v1`. Run 2026-08-27,
      after the insert: 50 Entrants total across the five listed Competitions. See the
      query below — `match-bl1/2026-27-v1` names exactly ten.
- [x] A `COMPETITION=BL1` dry run is green against the archived snapshots before the first
      Lock: every club name resolves, every present section renders, expected Gaps match.
      **Green, 2026-08-27, before the Lock.** Run against the archive with the Season
      variable production actually holds:

      ```bash
      set -a; . ./.env; set +a
      COMPETITION=BL1 GAMEWEEK=1 npm run --silent dry-run
      ```

      ```
      Archive: 61 snapshots, 77 Entrants, observed 2026-08-27T14:23:39.767Z
      BL1 2026-27 Gameweek 1
      Deadline:    2026-08-28T17:00:00.000Z
      Ran at:      2026-08-28T11:00:00.000Z (deadline-6h)
      Contexts:    9
      Predictions: 0 (expected 0)
      Gaps:        90 (expected 90)
      Dry run matched the archive's expected outcome.
      ```

      All three of the box's clauses: nine Contexts built, which is every club name
      resolving — an unresolved one raises rather than renders; every present section
      rendered; and 90 Gaps against 90 expected.

      **The recorded cause was wrong, and the correction is the point. Found by review.**
      This box first read "open, unresolved" over a diagnosis naming
      `prepareArchivedGameweek`'s unhandled `runDailyFetch` call
      (`prepare-archived-gameweek.ts:104`). That call is unhandled, and the sentence
      about it is true, but it is not what failed the rehearsal: the run that failed had
      `FOOTBALL_DATA_SEASON` set forward to `2026-27`, and at that value the fetch asks
      for `2627/D1.csv`, which football-data.co.uk has not published and answers with the
      `300 Multiple Choices` body box 1 records. The parser refuses that body —
      `football_data:2026-27:D1.header.Div: required column is missing`, and five more —
      exactly as it should. Reproduced both ways on 2026-08-27: forward to `2026-27` it
      raises that error, and at `.env`'s own `2025-26` it is the green run above.

      So no tool needed fixing, and the guard that catches this is the process one, not a
      code one: [the pre-cron checklist](../runbooks/pre-cron-checklist.md) §4 already
      says `FOOTBALL_DATA_SEASON` does not advance until every file names its own
      division, and `D1` is the one file across five Competitions that still does not. A
      rehearsal run past that rule is asking the archive for bytes the source has never
      published, which is a wrong question rather than a broken tool. Adding a catch
      inside `prepareArchivedGameweek` would have made that wrong question answer quietly
      — the one thing a rehearsal must never do.

      **What this rehearsal does not cover, stated rather than implied:** 90 Gaps means
      the archive holds no `BL1` answer to replay, so what is proven is the context path
      — nine packets built from the real builder over archived bytes — and not the
      answering path. That is inherent to a first activation and was equally true of
      Serie A's and Ligue 1's; the answering path is first exercised by the scheduled run
      itself, or by a `preflight` nobody has spent here.
- [x] The Bundesliga opens at the first Gameweek whose derived deadline had not passed at
      activation; earlier Gameweeks, if any, arrive as Locked history with no Fixture queued
      for prediction. **Gameweek 1.** The `competitions` insert landed 2026-08-27, with
      Gameweek 1's derived deadline (2026-08-28T17:00Z) still open and no Gameweek before it
      to lose.
- [ ] No Lock is set by hand under any clock; a missed deadline means the Gameweek is let
      go. Waits on the Lock at 2026-08-28T17:00Z; nothing has set one yet.
- [ ] The first Gameweek's Predictions are made and Locked before its earliest kickoff, and
      the spend is stated once it settles. Waits on the same Lock; `predict.yml` polls
      every 30 minutes and the due window opens at deadline − 6h = 2026-08-28T11:00Z.

### The record, as queries rather than as pasted output

Every figure above was read off production. Run 2026-08-27, `DATABASE_URL` from `.env`:

```sql
-- Five leagues listed, BL1 among them. Expect BL1, FL1, PD, PL, SA.
select competition from competitions where season = '2026-27' order by competition;
-- => BL1, FL1, PD, PL, SA

-- Ten seats under the frozen Bundesliga version, and no other. Expect one row: 10.
select prompt_version, count(*)::int as seats
  from models where prompt_version = 'match-bl1/2026-27-v1'
 group by prompt_version;
-- => match-bl1/2026-27-v1 | 10

-- Gameweek 1's stored deadline, which the derivation above must equal.
-- Expect 1 | 2026-08-28 17:00:00+00.
select gw, deadline_at from gameweeks
 where competition = 'BL1' and season = '2026-27' and gw = 1;
-- => 1 | 2026-08-28 17:00:00+00

-- The full schedule landed. Expect 306.
select count(*)::int as n from fixtures where competition = 'BL1';
-- => 306

-- What the hand-run fetch actually captured, and where it stopped.
select source, length(body) as len, first_seen_at from raw_snapshots
 where source in (
   'football_data_org:2026-27:BL1', 'football_data:2026-27:D1',
   'football_data:2026-27:D2', 'understat:2026-27:Bundesliga',
   'wikipedia:head-coach-changes:2026-27-bundesliga'
 )
 order by source;
-- => football_data:2026-27:D1                        1134 2026-08-27T14:17:44.450Z
--    football_data:2026-27:D2                        9288 2026-08-27T14:17:44.450Z
--    football_data_org:2026-27:BL1                 291431 2026-08-27T14:14:01.291Z
--    understat:2026-27:Bundesliga                       36 2026-08-27T14:18:02.701Z
--    wikipedia:head-coach-changes:2026-27-bundesliga 25854 2026-08-27T14:19:34.198Z
```

`football_data:2026-27:D1`'s 1,134 bytes are the `300 Multiple Choices` response body,
stored because `storeRawSnapshots` runs before the status check that then throws — it is
evidence the source was reached, not evidence of a result.
