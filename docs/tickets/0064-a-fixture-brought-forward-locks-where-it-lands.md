# Ticket: A Fixture brought forward Locks where it lands

**What to build:** the football-data.org fetch attaches a Fixture to the Gameweek its
kickoff falls in, and derives each Gameweek's deadline over the Fixtures attached to it —
so one match a league pulls forward is predicted with the Gameweek it is played in, and
the rest of its round keeps its own Lock. Today the fetch groups kickoffs by the source's
matchday label, and on 2026-09-03 one La Liga Fixture moved twelve days ahead of its round
dragged the whole of Gameweek 6's Lock with it: ten Fixtures predicted, nine of them
twelve to fourteen days before kick-off, a day before Gameweek 4 had even Locked.
Decisions this touches:
[ADR-0036](../adr/0036-a-new-competitions-schedule-results-and-lock-come-from-football-data-org.md)
(amended 2026-09-03 by this ticket — the rule is stated there, and the decision to leave
Gameweek 6's Predictions standing is recorded there),
[ADR-0015](../adr/0015-a-fixture-owns-its-locked-gameweek.md) (`locked_in_gw` is the
attachment this ticket writes), [ADR-0013](../adr/0013-a-postponed-fixture-keeps-its-original-prediction.md)
(why nothing already predicted is touched).

**Blocked by:** None — can start immediately. The next La Liga Lock is Gameweek 4 at
2026-09-04 17:30Z; nothing in this ticket has to land before it, because no further
Fixture is currently out of order, but the daily fetch runs every day and the next
rearrangement is a matter of when.

**Status:** open

---

## What is already known

**The record, read 2026-09-03 against production.** `gameweeks` joined to `fixtures` for
`PD`, `2026-27`:

| gw | deadline_at | first kickoff | last kickoff | Fixtures | attempts |
| --: | --- | --- | --- | --: | --: |
| 4 | 2026-09-04 17:30Z | 2026-09-04 19:00Z | 2026-09-07 19:30Z | 10 | 0 |
| 5 | 2026-09-11 17:30Z | 2026-09-11 19:00Z | 2026-09-14 19:00Z | 10 | 0 |
| **6** | **2026-09-03 17:30Z** | **2026-09-03 19:00Z** | 2026-09-17 19:30Z | 10 | 150 |

The 3 September kickoff is Real Sociedad–Celta, matchday 6. The other nine matchday-6
Fixtures kick off 15–17 September. `prediction_runs` shows Gameweek 6's `main` run at
11:33Z and `fill` at 15:35Z on the 3rd, both completed; Gameweeks 4 and 5 have not run.
All ten Fixtures now carry `locked_in_gw = 6`, which migration 0022 makes immutable and
which, through migration 0025, freezes Gameweek 6's deadline at 17:30Z on the 3rd.

**Why the scheduler picked 6.** `run-scheduled-predictions.ts` orders due work by
`deadline_at - lead_time`, never by `gw`. That is correct and stays: it is what lets five
leagues share one scheduler. The number 6 came from the deadline, and the deadline came
from the fetch.

**Where the fetch goes wrong, precisely.** In `fetch-competition.ts`:

- `kickoffsByGameweek` is built from `match.matchday` — the label — so a single moved
  Fixture sets its round's earliest kickoff and therefore its round's deadline.
- The one place a Fixture's deadline is allowed to differ from its label, the
  `lockedInGameweek` decision before the upsert, handles only a Fixture first seen after
  its own Gameweek has Locked (it joins the next open one). A Fixture pulled *ahead* of
  a lower-numbered open Gameweek falls through with `null` and is treated as its label.
- `deriveDeadline` itself (`derived-deadline.ts`) is pure over a list of kickoffs and is
  not at fault; it derives correctly over whatever list it is handed.

**Why FPL never met this.** FPL's `event` is chronological: a Premier League Fixture
brought forward is relabelled by FPL into the Gameweek it lands in, so the whole-Gameweek
Lock of ADR-0006 never saw a Fixture out of order. football-data.org's `matchday` is the
league's round number. ADR-0036 stored one as the other; the amendment written with this
ticket separates them again.

**What already reads the right column.** The predict path selects work by
`coalesce(locked_in_gw, gw)` (`predict-gameweek.ts`), scoring attributes by
`locked_in_gw` (`score-match-gameweek.ts`), the gap alert joins on it, and the dashboard's
Gameweek range and fixtures listing already use `coalesce(locked_in_gw, gw)`
(`read-api.ts`). Once the fetch writes the attachment, every downstream reader picks the
moved Fixture up under the Gameweek it is actually predicted with, unchanged. This ticket
touches the fetch and its tests, and nothing else.

**What is not built.** No per-Fixture Lock, no second key dimension on `predictions`, no
change to the scheduler, no change to `derived-deadline.ts`, no change to ADR-0006's
whole-Gameweek Lock. And no repair of Gameweek 6 here: that is ticket 0065, a migration
that withdraws the nine early Predictions and re-Locks their Fixtures into Gameweek 5.
The two are independent — 0065 writes `locked_in_gw` by hand for one Gameweek that has
already happened; this ticket makes the fetch write it for every one that has not.

## Acceptance

- [ ] **The attachment rule, in the fetch.** For every scheduled match this fetch observes
      whose Fixture is not yet Locked (`locked_in_gw is null`): the window of each
      matchday is the earliest kickoff among the matches the source *labels* with it; the
      match attaches to the latest **open** Gameweek whose window has opened by the
      match's own kickoff. When that is its own label, nothing is written. When it is
      another Gameweek, `locked_in_gw` is written to it — and written on the update path
      too, not only on first insert as today, since a row the record already holds with
      `locked_in_gw is null` is exactly the row this rule exists for. When no open
      Gameweek's window has opened by the kickoff (every candidate has Locked), the
      existing next-open rule applies — the earliest open Gameweek whose Lock precedes the
      kickoff — including its refusal when none does. Under this one rule Real
      Sociedad–Celta on the 3rd goes to Gameweek 4 (nothing open had opened; next open
      whose Lock precedes it), and a matchday-6 Fixture on the 15th whose own Gameweek has
      already Locked goes to Gameweek 5 (the latest open window that had opened), which is
      also what ticket 0065 writes by hand. Windows are read from labels and attachments
      are written to `locked_in_gw`, so the computation cannot feed on its own output.
- [ ] **The deadline is derived over attachments.** `kickoffsByGameweek` groups by the
      Gameweek a match attaches to — `coalesce(locked_in_gw, label)` after the rule above
      has run — not by `match.matchday`. Against the 2026-09-03 La Liga schedule this gives
      Gameweek 4 a deadline of 2026-09-03 17:30Z and Gameweek 6 a deadline of 2026-09-15
      15:30Z; the test that says so uses those exact kickoffs.
- [ ] **A Locked Fixture is never re-attached.** A match whose Fixture already has
      `locked_in_gw` keeps it whatever the schedule now says, exactly as today; the 0022
      trigger enforces it and the fetch does not try. The test moves a Locked Fixture's
      kickoff and asserts no change to its attachment and no change to the deadline it is
      Locked under.
- [ ] **An attachment written before the Lock is immutable, and the cost is recorded.**
      A Fixture attached to an earlier Gameweek and then moved back by the source before
      that Gameweek Locks stays attached — the same immutability the next-open rule has
      always had — and is predicted with the earlier Gameweek, then flagged `deferred`
      when it moves after the Lock (ADR-0013). This box is a test and a comment, not new
      code: the behaviour falls out of 0022, and the ticket records that it was considered
      and not relaxed.
- [ ] **A whole round ahead of a lower-numbered one attaches wholesale.** Every match of
      the later round attaches to the earlier open Gameweek, which becomes a Double
      Gameweek; the later Gameweek's row survives with the deadline it last had (the
      existing behaviour for a Gameweek whose every Fixture was withdrawn) and the predict
      run and gap alert for it complete with nothing to do. The test builds that schedule
      and runs both.
- [ ] **A moved attachment is visible in the fetch's output.** When the rule attaches a
      match to a Gameweek other than its label, the fetch says so — Competition, Fixture,
      label, attached Gameweek — through the same channel the daily fetch already reports
      through, without throwing. An operator reading the job log sees "matchday 6 Fixture
      attached to Gameweek 4" the day it happens rather than reading it off the bill.
- [ ] **Nothing else moves.** `derived-deadline.test.ts`, `run-scheduled-predictions.test.ts`
      and `predict-gameweek.test.ts` pass unmodified. The Premier League path is untouched.
      New tests live in `fetch-football-data-org-competition.test.ts`.
- [ ] **The record is left to ticket 0065.** No row of `predictions`, `attempts`,
      `fixtures` or `gameweeks` for La Liga Gameweek 6 is altered by this ticket, and this
      ticket ships no migration; the withdrawal and re-Lock are 0065's, and this ticket's
      tests do not depend on whether 0065 has been applied.
