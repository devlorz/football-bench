# Ticket: The Nations League packet carries its group table

**What to build:** a `UNL` packet opens with the table of the group the two sides are in
-- every side of the group from the first day, at nought, ordered by points, goal
difference and goals scored, counting only results settled before the Lock -- where it
used to state "no league table for this Competition". The group comes from UEFA's own
feed and is stored on each Fixture. Decided the day before the cup's first Lock, so the
render moves under ADR-0026 and not under a restart. Source: the operator's reading of a
real Gameweek 1 packet on 2026-09-23. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(amended 2026-09-23: the table is no longer deferred),
[ADR-0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md).

**Blocked by:** None -- 0076 is done and `UNL` is listed; this must land before
2026-09-24T14:30Z or wait for a new Prompt Version.

**Status:** built 2026-09-23, migration `0047` **pending on production** -- see the
handover below. The pin moved to `0c463838…fc71`.

---

## What is already known

- Every archived UEFA match carries `group.metaData.groupName` ("Group A2"); fourteen
  groups over the fifty-four sides, none missing, which the UEFA fetch test now holds.
- The shared schedule writer (ticket 0071) carries what every source has; the group is
  written beside it by the UEFA fetch in a second, idempotent `update`, so the engine's
  "by construction" claim stands untouched.
- The table counts only results settled before the Lock and lists every side of the
  group from the draw, so Gameweek 1 shows four rows at nought rather than nothing.
- UEFA's own tie-breaks put head-to-head before goal difference; the table applies the
  league table's ordering and says so on its last line rather than pretending.
- Migration `0047` adds one nullable column, `fixtures.group_name`; the leagues never
  write it. The rehearsal's verifier learned to ignore columns a migration adds (it
  compared whole rows as JSON and would have called every Fixture "lost").
- The dry run *will* show the table once the migration is applied, because the group
  comes through the replayed UEFA fetch -- unlike the backfilled sheets, which reach
  production only by hand.

## Acceptance

- [x] The UEFA fetch stores each league-phase Fixture's group; the fetch test holds
      fourteen groups and none missing over the recorded Season.
- [x] The builder renders the group's table with every side from the first day, only
      pre-Lock results counted, another group's Fixture excluded, and the ordering line;
      a Competition whose schedule names no group keeps the stated absence.
- [x] The render test lists "Group A2 table" as a cup heading a league never renders,
      and the `UNL` pin is re-read; the five league pins are unchanged.
- [x] The rehearsal verifier ignores columns a migration adds and still fails on a row
      lost or a column dropped; the migration filename lists carry `0047`.
- [ ] Migration `0047` rehearsed and applied to production, then one hand-run
      `npm run fetch` so the 156 Fixtures carry their group before the Lock. **The
      operator's.**
- [ ] `COMPETITION=UNL GAMEWEEK=1 npm run dry-run` shows the group table on every
      packet. After the box above.

## The handover

```bash
set -a; . ./.env; set +a
npm run --silent db:rehearse
npm run --silent db:migrate            # applies 0047
npm run --silent fetch                 # writes group_name on the 156 Fixtures; free
psql "$DATABASE_URL" -At -c "select count(*) filter (where group_name is null), count(distinct group_name) from fixtures where competition='UNL'"   # expect 0 | 14
SEASON=2026-27 COMPETITION=UNL GAMEWEEK=1 npm run --silent context:show | head -40
```

## What this ticket did not do

- **Promotion, relegation and quarter-final stakes per position.** They differ by League
  (A to D) and were not stated rather than stated wrongly; the Base Models know the
  format, and the table gives them the standings to apply it to.
- **UEFA's head-to-head tie-break.** Stated as not applied.
- **The backfilled sheets in the dry run.** Separate; see the note in ticket 0072's
  successor work on the daily fetch asking for dataset internationals' sheets.
