# Ticket: The runbooks name the Guest door

**What to build:** an operator reading "A new Base Model arrives" sees the Guest Seat as a
door beside the Exhibition Run and waiting for an Edition. The runbook says when each door
fits:
- a Guest when the question is whether the Base Model can forecast;
- an Exhibition when the question is only where it would have stood;
- an Edition when a roster ADR is due.

An operator reading "Opening an Edition" is told to settle every Guest at the boundary:
seat it, renew it, or withdraw it at the boundary's first Lock. A Guest the ADR does not
name is withdrawn. Spec: [0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

**Blocked by:** [0114](0114-a-guest-answers-at-the-lock-and-stands-nowhere-yet.md),
[0118](0118-the-exhibition-replay-stops-where-its-guest-begins.md). A door is documented
once it exists.

---

## What is already known

- **The Guest door's steps, in order:**
  1. an ADR naming the Base Model, its pin, its Competitions and its pre-approved spend,
     with at most two Guests at once;
  2. a pre-flight in every Competition the Base Model has not answered;
  3. the insert, which sets the first Lock;
  4. a top-up replay of any Exhibition row to that Lock;
  5. no further Exhibition replay.
- **The decision table in section 1** gains a row. Section 6 says the Exhibition row stops
  where a Guest begins.

## Acceptance

- [x] "A new Base Model arrives" lists the Guest door, its steps and when to choose it
- [x] "Opening an Edition" has the step that settles every Guest, and says silence ends it
- [x] Both name ADR-0064 and point at ADR-0065 as the worked example

## What was verified

Docs only, so there is no test. Checked by reading, and one query run:

- **A new Base Model arrives.** A new section 9 holds the Guest door and its five steps.
  Sections 1 to 8 keep their numbers, because pre-flight reports from 2026-08 and 2026-09
  cite sections 3 and 6 by number. Section 1's table splits the post-Lock window by
  question: Guest (section 9, while fewer than two stand), Exhibition (section 6) or
  Edition (section 8). Section 6 says the replay stops where a Guest begins and quotes
  0118's CLI sentence, which was checked against `src/cli/exhibition-replay.ts`. Section
  8's interim door is now "section 6 or section 9".
- **Section 9's step 2** pre-flights a `candidate/…` row with the Guest's pin and config,
  then deletes it. A second `exhibition` row of the same Base Model would stop the combined
  row: `pairUp` in `dashboard/src/combine-rows.ts` pairs exactly one Exhibition row with
  one Guest row. The pre-flight would accept a `guest` row
  (`src/preflight/preflight-base-models.ts`), but one inserted before passing is asked at
  the next Lock and its Gaps alert nobody. Step 3 asks for the latest migration, says to apply a pending one with
  `db:migrate` and rehearse again, and asks for
  `psql -P pager=off -v ON_ERROR_STOP=1`. Step 4 is approved separately and is skipped when
  the Exhibition row already ends at the Gameweek before the first Lock.
- **Opening an Edition.** Section 1 asks the roster ADR to name every standing Guest. A new
  4d stamps withdrawn and seated Guests at the first Lock and says silence is withdrawal.
  The claim that nothing refuses a skipped 4d was checked: `src/season-roster.ts` reads
  only `role = 'entrant'`. 4d's SQL takes placeholders, not 4a's Edition 2 values, and
  checks `g.deadline_at > m.created_at`. Without that check, a Guest created after the
  boundary would be stamped before its own `created_at`, `firstLockOf` would find no Lock,
  and its whole record would drop. With PL and 6 filled in, it was run as `EXPLAIN` inside
  a rolled-back transaction on the local `football_bench` database. It parsed. It was not
  run against production.
- **Both runbooks** name ADR-0064 and point at ADR-0065 as the worked example.
- **Dropped after review:** ending a Guest before its boundary (ADR-0064 ends one only at
  the boundary) and renewing in some Competitions only (no ADR describes it).
