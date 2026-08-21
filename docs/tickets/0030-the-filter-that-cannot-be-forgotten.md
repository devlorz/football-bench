# Ticket: The filter that cannot be forgotten

**What to build:** a test that fails when an Entrant read on the FPL track omits the
withdrawal filter, so that the read site written next Season by someone who never read
ADR-0047 cannot reinstate three Base Models by inattention. Source:
[spec 0023](../specs/0023-seven-seats-open-the-fpl-track.md), story 24.

**Blocked by:** 0028 and 0029 — every read site must be final before the check can be
written against them.

**Status:** ready-for-agent

Spec 0023 chose to inline the filter at each of the six read sites rather than extract a
shared one: the reads differ in their columns, their joins and their parameter positions,
so the only thing they could share is a fragment of a `where` clause, which is not enough
structure to be worth the indirection. The cost of that choice is that the filter is a
convention, and a convention decays. This test is the price paid for the smaller change.

- [x] A test asserts that every Entrant read filtered on the FPL Prompt Version also
      carries the withdrawal filter.
- [x] The Gameweek run's by-id read is named as the single exception, with its reason
      inline: it reads from the started-roster record, which already records which seats
      hold a Season path.
- [x] Adding a new FPL Entrant read without the filter fails this test, and the failure
      message says which read and what to add. **Proved by mutation, twice, with the source
      restored byte-for-byte after each:** dropping the filter from the squads read failed
      with `src/dashboard/read-api.ts:1658 — select m.id, m.name, m.base_model, m.provider,`,
      and adding a fresh unfiltered read to the context renderer failed with
      `src/cli/show-fpl-context.ts:29 — select id from models`. The second is the case this
      ticket exists for — a read nobody has written yet.
- [x] The test does not fire on Match track reads, which are deliberately unfiltered.

**A guard on the guard.** A structural check that finds nothing reports success, which is the
one way this kind of test lies. So it also asserts it found at least six reads: a refactor
that moved the queries out of template literals would fail here rather than pass silently.

**What it does not cover, stated so the next reader is not misled.** The scan judges a read
by two things — it names `models` and `prompt_version`, and its parameters name
`FPL_PROMPT_VERSION`. A read that took the version from a variable, or built its SQL by
concatenation, would be invisible to it. Both are foreign to this codebase today, and the
day one arrives is the day this test needs to grow rather than the day it silently stops
working — which is what the six-read floor above is for.

## Not in this ticket

**Extracting the FPL Entrant read into one place.** Weighed and declined in spec 0023: six
reads that share a `where` fragment and nothing else are not one read, and this test is the
cheaper half of that trade. The day the reads converge on a real shared shape — same
columns, same joins — is the day to revisit it, and this test is what makes that revisit
safe.

**A similar check for the Match track.** Nothing to check; no Match read filters on
withdrawal.
