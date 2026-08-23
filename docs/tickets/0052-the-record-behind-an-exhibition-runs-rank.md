# Ticket: The record behind an Exhibition Run's rank

**What to build:** A reader who sees an Exhibition Run ranked on a Competition's leaderboard
can open its record and find what every Entrant's record holds — Match Points and Bet Points
per Gameweek and season-to-date, tiers, market hits, RPS — carrying the "ran after Gameweek N"
label and the recall-versus-skill caveat. One figure is missing on purpose, and the page says
so in a sentence rather than leaving a cell blank: Gap rate is withheld, because an Entrant's
Gap is a missed deadline and an Exhibition Run's is an operator's run failing, and one column
cannot carry both meanings. What the rate was hiding is shown instead — the Fixtures the row
answered against the Fixtures the Gameweek's Lock owned. Source:
[spec 0026](../specs/0026-exhibition-runs-reach-the-remaining-surfaces.md). Decision:
[ADR-0052](../adr/0052-an-exhibition-run-shows-up-wherever-it-answered.md).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

---

## What is already known

**This ticket owns the shared condition, and the two after it inherit it.** Three
per-Competition endpoints answer the question "which rows exist" and today only the
leaderboard's answer admits an Exhibition Run — derived from stored `predicted_at` standing
against the Gameweek deadlines, never asserted from configuration. Write that condition once
here and select through it; a copy in each endpoint would be three places to disagree about
who is on the page, and the spec's "one condition, three endpoints" is exactly that refusal.

**`rps` is published and `gaps` is not, and the difference is the rule.** A caveat can qualify
a number that means the same thing as its neighbours; it cannot rescue a number that means
something else. RPS is the same figure computed the same way and the caveat says precisely what
is wrong with reading it — the repo's own precedent for publishing a figure with the reason it
proves nothing is `RETIRED_GAMEWEEK_CAVEAT`. Gap rate is a different number wearing the same
name.

**The count that replaces the rate is already in the body, twice.** Every `EntrantGameweek`
carries the Fixtures the Gameweek's Lock owned beside the Fixtures the row settled a Prediction
on. Nothing new is stored and no field is added to carry a number the body already has.

**A blank cell is the failure mode this ticket exists to avoid.** An empty cell in a column of
rates reads as nought, which is the most flattering possible misreading of a withheld figure.

## Acceptance

- [ ] An Exhibition Run holding Predictions in a Competition has a record at that Competition's
      entrant-record endpoint, carrying the same fields an Entrant's does
- [ ] The row carries the "ran after Gameweek N" label, derived from its stored `predicted_at`
      against the Gameweek deadlines and never from configuration
- [ ] The recall-versus-skill caveat is present in the body exactly when a row carrying that
      label is in it, and absent when none is
- [ ] `rps` is published for the Exhibition row under the same conventions as the roster's
- [ ] The Gap rate is withheld rather than computed, and the page renders a sentence naming the
      withholding — never an empty cell in the rate's place
- [ ] The record shows the Fixtures the row answered against the Fixtures the Gameweek's Lock
      owned, taken from the figures already in the body
- [ ] The condition deciding which rows the endpoint returns is written once and shared, so the
      leaderboard and this endpoint cannot answer differently about who exists
- [ ] With no Exhibition Run seated, the endpoint's body is byte-identical to what it answers
      today
- [ ] Every roster figure — the Entrants' records, their order among themselves, the Comparison
      Anchor, the published intervals and the Gap rates — is identical with the Exhibition rows
      present and absent, proven by comparing two runs of the same request
