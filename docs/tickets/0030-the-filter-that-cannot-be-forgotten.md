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
      restored byte-for-byte after each:** the filter dropped from the squads read; a plain
      new unfiltered read; a read written as a common table expression; a read whose Prompt
      Version comes from an aliased constant with its parameters far from the literal; a
      filtered read that stops being recognised because its SQL was concatenated; **a match
      read swapped for an unfiltered FPL read, leaving the file's count unchanged**; and
      **a read assembled at run time out of quoted fragments**. Seven mutations, seven
      failures, every source restored.
- [x] The test does not fire on Match track reads, which are deliberately unfiltered.

**It fails closed, which the first draft did not.** That draft recognised a read by asking
whether `FPL_PROMPT_VERSION` appeared within four hundred characters after the literal, and
whether the literal opened with `select`. Both were fail-open: a common table expression
opens with `with`, an aliased constant never names the constant, and a long argument list
pushes the parameters past the window. Each of those walked straight past it, and review
caught what the mutations had not been asked.

What the suite does now is classify rather than detect, and it classifies **per query**. The
population is every SQL literal in `src` that reads `models` and names a `prompt_version` —
twenty today — and each must either filter on `withdrawn_at is null` or carry a `-- roster:`
line in its own SQL saying whose roster it reads. The shape of the query stopped mattering.

The marker lives in the query and not in a table in the test, because a table keyed by file
and count hands a file a quota. `read-api.ts` holds four match reads; swap one for an
unfiltered FPL read and the arithmetic still balances, so the new read inherits a reason
nobody wrote for it. A marker cannot be inherited — the author either writes the claim down
where a reviewer will read it, or the suite names the query.

**Run-time assembly is closed by refusing it, not by documenting it.** A query built out of
ordinary quoted strings cannot be classified by any text search, so the suite asserts that
no `models` read is written that way: every one is a template literal. That is a rule the
codebase already followed, now enforced, and it is what makes "a new FPL read without the
filter fails this test" true rather than nearly true.

**A guard on the guard.** The six FPL reads are asserted by file and count as an identity,
not as a floor: a floor lets one read stop being recognised while the suite still passes,
which is the same failure one layer up. A concatenated read that vanishes from the scan
fails this assertion.

**What it still does not cover.** A read issued from outside `src` — a migration, a psql
session, a script in another repository. Nothing there reads the roster to ask an Entrant
for anything, and a Season path is written from `src` or not at all.

## Not in this ticket

**Extracting the FPL Entrant read into one place.** Weighed and declined in spec 0023: six
reads that share a `where` fragment and nothing else are not one read, and this test is the
cheaper half of that trade. The day the reads converge on a real shared shape — same
columns, same joins — is the day to revisit it, and this test is what makes that revisit
safe.

**A similar check for the Match track.** Nothing to check; no Match read filters on
withdrawal.
