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
      message says which read and what to add. **The claim's boundary, stated rather than
      implied:** the suite reads the source, so it holds for a query written into this
      repository as SQL. It refuses the shapes that would hide one — an interpolated table
      name, a table or column split across quoted strings, a query assembled at run time —
      and it cross-checks the marker against the parameters beside the literal. What no
      text scan can catch is an author who aliases the Prompt Version *and* writes a
      `-- roster:` line that says something untrue. That is not inattention, which is what
      this test is for; it is a false claim in the source, and the reader it is written for
      is a reviewer. **Proved by mutation, with the source restored
      byte-for-byte after each:** the filter dropped from the squads read; a plain new
      unfiltered read; a read written as a common table expression; a read whose Prompt
      Version comes from an aliased constant; a filtered read that stops being recognised
      because its SQL was concatenated; a match read swapped for an unfiltered FPL read,
      leaving the file's count unchanged; a read assembled at run time out of quoted
      fragments; a table name reached through an interpolation; a table name split across
      two quoted strings; a match read repointed at this track's Prompt Version with its
      marker left intact; the same with the parameters padded past any fixed lookahead; and
      a table name held in a bare quoted string. **Twelve mutations, twelve failures.** The
      record of them is the session they were run in and not an artefact in the tree, which
      is the whole of what this ticket can claim for them.
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
ordinary strings cannot be classified by any text search, so the suite refuses three ways of
building one. No quoted string in `src` may name `models` or `prompt_version` — one fragment
each was enough to split `"from " + "models where prompt_version = $1"` past an earlier
draft. No query may reach its table through an expression: `prompt_version` lives on
`models` and nowhere else, so a query naming the column names the table. Every one of these
was a rule the codebase already followed; they are enforced now.

**And the marker is checked against the query, not only for its presence.** A match read
repointed at `FPL_PROMPT_VERSION` while keeping the `-- roster: the match track's` line it
was written with would wear a sentence that stopped being true. So a query handed this
track's Prompt Version must be filtered or be the exception, whatever its marker says. The
check reads the parameters beside the literal — a narrower thing to look at than the query,
and layered on the marker rather than replacing it, so it can only ever add a failure.

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
