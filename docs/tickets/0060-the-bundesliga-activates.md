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

**Status:** activated — boxes 1, 2 and 4 green; 3 is open, by operator decision (see box
3); 5 and 6 wait on the Lock at 2026-08-28T17:00Z

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
      held. **The checklist's own §5 rehearsal step did not**, and box 3 records why —
      naming that here rather than only inside box 3, the way box 1 read short in ticket
      0040 until review caught it. `npm run fetch` (the command `fetch.yml` itself runs)
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
- [ ] A `COMPETITION=BL1` dry run is green against the archived snapshots before the first
      Lock: every club name resolves, every present section renders, expected Gaps match.
      **Open, unresolved as of 2026-08-27, by the operator's explicit choice not to block
      on it** — not backdated and not written off, since the Lock (2026-08-28T17:00Z) has
      not passed. `prepareArchivedGameweek` calls `runDailyFetch` unhandled
      (`prepare-archived-gameweek.ts:104`), so the same missing `D1.csv` above — an
      `ArchiveReplayMissError` with no snapshot captured, then a `FootballDataSourceValidationError`
      once the `300` body from the hand-run fetch was captured as one — crashes the
      rehearsal before it reaches a verdict, with or without a prior fetch. That is a
      reason the rehearsal tool could be fixed (making `runDailyFetch`'s failure here as
      isolable as it already is in production) or worked around, not a reason it cannot
      be; neither was attempted in this ticket. What was done instead: direct read-only
      queries (below) confirmed everything the real predict/Lock path reads — 306
      `fixtures` rows, correct Gameweek deadlines, the frozen Prompt Version, the seated
      roster, prior-Season `historical_matches`/xG from ticket 0059 — is already correct,
      and that `D1` carries nothing for Gameweek 1's context since zero Bundesliga matches
      have been played this Season. Given that, and the Lock still about a day off (read
      2026-08-27T14:40Z), the operator chose to let scheduled `predict.yml` run for real
      rather than block activation on fixing this rehearsal gap first.
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
