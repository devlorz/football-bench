# An Exhibition Run shows up wherever it answered

ADR-0032 admitted Exhibition Runs to the record and named the surface they could reach:
"the readable Match Points and Bet Points tables only". That was the scope of the work then
pending, and it has been read since as the rule. This replaces it with a test rather than a
list, because three more surfaces now exist and the list cannot answer them.

**An Exhibition Run appears, labelled and caveated, on every surface that publishes what it
answered — rankings included. It enters no figure of the evidential layer: no Comparison
Anchor, no complete-case intersection, no published interval.** That is ADR-0032's own
prohibition, kept exactly, and the line it draws is between a figure a reader reads and a
figure a claim rests on. Every question below is that one question asked of a particular
page, and the answers differ only where a page's figures differ.

The reason has not moved and is not negotiated here: a Base Model shown a Gameweek that has
already been played may remember how it ended, and no figure taken over that answer can tell
forecasting skill from recall (spec 0001, ADR-0032). `EXHIBITION_CAVEAT` says so wherever an
Exhibition Run is described, and that obligation reaches every surface this ADR opens.

## The Fixture page shows it only on Fixtures it answered

`/api/{code}/fixtures` gains the Exhibition Run as a row beside the roster's ten — on a Fixture
it has answered, and **not at all** on one it has not.

The absence is the decision. That page holds one invariant on purpose: the same ten seats in
the same order on every Fixture, "which is what makes a Gap a slot rather than a shorter list".
An empty slot there means one thing — this seat was asked before the Lock and did not answer.
An Exhibition Run on an unplayed Fixture was never asked, and by construction cannot be until
the match is over. Giving it a slot would spend the page's only signal for a Gap on something
that is not one, on every unplayed Fixture of every league, for a row that is not competing.

So the row comes and goes, and its coming and going is itself readable: it is present exactly
where the Fixture has been played and the replay has reached it. A Fixture that is played and
still has no Exhibition row is the honest picture of a Gap — the same reading, arrived at
without a slot.

- **Always present, with a third "not yet run" state** — rejected. It invents a state on every
  Fixture row in four leagues to describe a row that is not in the competition, and the state
  it invents is "this is not a Gap", which is what absence already says.
- **A separate Exhibition block under the roster's ten** — rejected here and taken on the
  entrant record instead. On a Fixture page the comparison is the point: what each seat said
  about this match, side by side, is the whole content, and a block below it says the same
  thing further away.

## The entrant record publishes two of its four figures

`/api/{code}/entrants` publishes more than points. It carries season-to-date RPS and Gap rate,
and those two are not the same kind of number as Match Points.

**Match Points and Bet Points, per Gameweek and cumulative: published.** They are what ADR-0032
already admitted, and the record page is the same reading at more resolution.

**RPS: published, under the caveat.** It is the same number computed the same way, and what is
wrong with reading it is exactly what the caveat says. This repo's precedent is to publish a
figure with the reason it proves nothing rather than to withhold it —
`RETIRED_GAMEWEEK_CAVEAT` does that for a Gameweek that supports no claim, and this is that
shape. What must not happen is the figure entering a Paired Difference or an interval, and that
prohibition is ADR-0012's and ADR-0032's and is untouched.

**Gap rate: withheld, and the page says it is withheld.** Not because the number is unflattering
but because it is a different number wearing the same name. An Entrant's Gap is a Fixture it was
asked about before the Lock and did not answer. An Exhibition Run's Gaps come from an operator's
run failing — two of Ligue 1's six were `rate_limit`, HTTP 429 from a free-tier endpoint, on a
Base Model that had answered the other four — and no Repair addresses that, so the asking ended
there. Rate over what, measured against whom, is unanswerable in the roster's terms. In its place
the record shows the plain count of Fixtures it answered against the count the roster was asked,
which is the fact a reader wanted from the rate.

That is the line this ADR draws and it is worth stating once in general: **a caveat can qualify
a number that means the same thing as its neighbours. It cannot rescue a number that means
something else.** RPS is the first case; Gap rate is the second.

## The combined ranking includes it, on the same terms as every league's

`/overall` ranks the Exhibition Run among the Entrants, labelled, with the caveat under the
table. No condition, no threshold, no separate block.

ADR-0051 excluded it and gave this reason: an Exhibition Run "is Competition-scoped by its
Prompt Version filter (ADR-0032) and **exists in one league by construction**". That premise
is no longer true — ticket 0051 seated `stealth/ox-alpha` in all four Competitions, each at
its own frozen Prompt Version, and `entrantSlug` folds all four to `ox-alpha`. This ADR
supersedes that paragraph, conclusion and reason together.

The conclusion goes because the exclusion was never consistent with what the rest of the
dashboard already does. **Four per-league leaderboards rank this row among the Entrants
today**, by ADR-0032's own decision — ranked position, moving every Entrant's rank number and
the bar each is drawn against. A combined ranking is those four rankings added up. Refusing
the row there while publishing it four times over says that summing is a stronger claim than
ranking, and nothing in this record supports that: the sum is raw, it is the number a reader
gets by adding the four pages by hand (ADR-0051), and a reader who can do that arithmetic has
already been given every input.

What the page must not do is let the row read as a competitor's. It carries the label
`Exhibition Run` (and not a single Gameweek label, since the row spans several) and
`EXHIBITION_CAVEAT` under the table, and the qualification ADR-0051 already requires gains one
clause: that an Exhibition Run's total may be over fewer Fixtures, and in fewer leagues, than
the rows it is ranked beside. The arithmetic does not correct for that, exactly as it does
not correct for leagues of different sizes — ADR-0051 chose stating a confound over normalising
it, and this is the same choice about the same table.

An Exhibition Run's row is keyed apart from the roster's rather than by slug alone. One Base
Model can hold an Entrant's seat in one league and an Exhibition Run's in another — section 3
of the new-Base-Model runbook puts every candidate in exactly that state — and a shared key
would add the two into one row, publishing a total that is half a competitor's and half a
replay's under one name.

- **Excluding it until its coverage matches the roster's** — rejected. It makes the row's
  presence turn on how an operator's replay went, so the page would gain and lose a row for
  reasons that are not about the Season. The label and the caveat say what the row is; a
  threshold would say it only sometimes.
- **A separate Exhibition block below the combined table** — rejected. It publishes the same
  total in the same units beside the same rows, with a rule between them, and asks the reader
  to treat position as meaningless in one block and meaningful in the other.

## Consequences

- ADR-0032's "readable Match Points and Bet Points tables only" is superseded by the test at the
  top of this ADR. The prohibition it protected — no Comparison Anchor, no complete-case
  intersection, no published interval — is unchanged and is not what this ADR touches.
- ADR-0051's "Exhibition Runs are excluded" paragraph is superseded whole — the exclusion and
  the stale premise it rested on. `overallRanking` drops the filter, `OverallRow` gains an
  `exhibition` flag so the page can label the row, and rows are keyed apart from the roster's.
  ADR-0051's qualification gains the clause named above; the evidence line's per-league counts
  remain the roster's denominator and are unchanged (ticket 0054).
- The Gap-rate withholding is the first figure this dashboard declines to publish for a row it
  otherwise publishes. It needs its own sentence in the record page, not an empty cell: an empty
  cell in a column of rates reads as nought, which is the most flattering possible misreading.
- The Fixture page's ten-slot invariant survives with its meaning intact, and gains a documented
  exception: an eleventh row that is present or absent rather than filled or empty.
- Three surfaces now carry `EXHIBITION_CAVEAT` where one did. It is already a module constant and
  needs no new form.
- CONTEXT.md's **Exhibition Run** entry should carry the test rather than the old surface list, so
  the next surface added does not need a fourth ADR to answer the same question.
- The write path, the scorer, the scheduler and the schema are untouched. This ADR is a read.
