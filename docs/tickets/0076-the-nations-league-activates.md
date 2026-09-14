# Ticket: The Nations League activates

**What to build:** the operator inserts the `UNL` row for `2026-27`, ten seats are
entered under `match-unl/2026-27-v1`, and the next daily fetch lands the schedule, Locks
the first Gameweek whose derived deadline has not passed, and adopts any Gameweek it
missed as Locked history. Before that: the three name maps reviewed by a person, a dry
run green over the recorded feeds, the runbook grown a cup column, and ADR-0051's
"league" corrected. Source: [spec 0027](../specs/0027-the-nations-league-opens.md)
stories 47–49, 51–52. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md) (no
target Gameweek; no hand-set Lock),
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md).

**Blocked by:** 0075 — nothing activates before its Prompt Version is frozen; and
through it, every earlier ticket.

**Status:** ready-for-agent

---

## What is already known

**The insert is the operator's act and is never taken by the implementing agent.** It is
the first step that spends money on the next scheduled run (ADR-0049, ADR-0054). This
ticket prepares everything up to it, hands the operator the command and the checklist,
and records which Gameweek the Competition actually opened at once they have run it.

**Order.** Migration 0070 applied to production (the Competition-migration runbook) →
three maps reviewed (the reviews are diffs against the recorded sources, not
transcriptions) → `COMPETITION=UNL npm run dry-run` green over the recorded feeds → the
pre-cron checklist's advance check grown for the four new sources → `competitions`
insert → `roster:enter` under `match-unl/2026-27-v1`.

**Clocks.** Gameweek 1's deadline is 2026-09-24T14:30Z, Gameweek 2's 2026-09-27T11:30Z,
Gameweek 3's 2026-10-01T14:30Z. A Gameweek the insert misses is let go; its Fixtures
arrive as Locked history through the mid-Season adoption path and are not predicted.
Missing Gameweeks 1 and 2 costs fifty-two Fixtures, about $16, and nothing else. No
Lock is set by hand.

**The runbook.** [Opening a Competition](../runbooks/opening-a-competition.md) lists a
league's eight edits. A cup makes three of them (the domain, `MATCH_PROMPTS`, and — in
place of the three league maps — its registry entry, its two tables and its three name
maps) and none of the other five. The page grows a second column or a second section
saying so, so the seventh Competition counts what the change is.

**`/overall`.** The Combined Ranking sums every Active and scored Competition with no
edit; ADR-0051's prose and the code comments that say "league" become wrong the day
`UNL` is first scored and are corrected here.

## Acceptance

- [ ] The three name maps (365Scores, dataset, trigrams) are derived from the recorded
      sources by tests and reviewed by a person; the review is recorded in this ticket.
- [ ] `COMPETITION=UNL npm run dry-run` is green over the recorded feeds and reaches no
      Base Model.
- [ ] The pre-cron checklist's advance check names the four `UNL` sources.
- [ ] The runbook says which edits a cup makes and which it does not.
- [ ] ADR-0051's prose and the "four/five leagues" code comments say Competition where
      they meant it.
- [ ] The operator has the insert and `roster:enter` commands; once run, this ticket
      records the date, the Gameweek `UNL` opened at, and which Gameweeks were adopted
      as history.
- [ ] Nothing in this ticket inserts the `competitions` row or reaches a Base Model.
