# Ticket: `match-ucl/2026-27-v1` is frozen

**What to build:** a `UCL` packet renders whole, and its Prompt Version is pinned from
that render, read line by line. The packet holds:
- the Fixture line;
- the league-phase table of all 36 sides, with the bands line;
- the cup's played Fixtures with shots and xG;
- the five recent matches (ticket 0103) and the Head Coach lines (ticket 0104), each only
  if it is green by the cut line, and otherwise stated absent;
- Squad Changes, stated "not read for this Competition".

Availability is silent. `match-ucl/2026-27-v1` is added to the frozen prompts with
competition name "UEFA Champions League" and its sha. Every existing pin is unchanged.
The dashboard's `UCL` routes appear with this entry.

Source: ADR-0063 *The packet* and *The cut line*, ADR-0026, ADR-0038, spec 0028 stories
43–48, 53–63.

**Blocked by:** 0101 and 0102, and 0103 and 0104 if green by the cut.

**Hard deadline:** pinned and committed by **2026-10-13T06:00Z**. Pushed and deployed by
**09:15Z**, which is Lock − 6h, because cron runs `origin/main`.

**Status:** ready-for-agent

---

## What is already known

- **The table** is ticket 0087's group-table builder, given one group of 36. It shows
  every side from the first day, ordered by points, goal difference and goals scored,
  with UEFA's tie-breaks not applied, as the existing line says.
- **The bands line is new and frozen**: places 1–8 go to the round of 16, 9–24 to the
  knockout play-off round, 25–36 are out. It is a constant keyed by Competition and never
  derived. The same line serves `UEL` and `UECL`, whose league phases use the same bands.
- **At Gameweek 2** the table counts `MD1`'s 18 settled results, and every side has one
  played Fixture with xG.
- **At the cut**: a section that is not green has `null` in `UCL`'s registry entry, and
  its absence is stated in words, so it does not read as a failed fetch. The section
  stays absent for `UCL`'s whole league phase. `UEL` and `UECL` are not affected.
- **The pin is read off the suite's render.** No production `UCL` packet exists before
  ticket 0106's insert, the same circumstance as `UNL`'s 0075. The ticket records the
  render as read.
- Squad Changes wording: "not read for this Competition", not "none". Clubs have a
  window, and January's opens before `MD7`.

## Acceptance criteria

- [ ] A `UCL` Gameweek 2 render over seeded rows shows the sections above in the template's order, the 36-row table with the bands line, and 18 played Fixtures with xG.
- [ ] The render reaches nothing stored after the Lock.
- [ ] `MATCH_PROMPTS.UCL` exists with its version, competition name and sha; the pin test fails on any one-byte change.
- [ ] The six existing pins and the competition-name agreement for every Competition pass.
- [ ] The ticket records which sections were green at the cut, and, if any was cut, the registry `null` and the stated absence.
- [ ] Committed by 06:00Z; the push is asked for, not assumed.
