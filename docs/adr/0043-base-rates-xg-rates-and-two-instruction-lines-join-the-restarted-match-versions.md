# Base rates, xG rates and two instruction lines join the restarted match versions

The restart (ADR-0042) exists to carry three additions, all built from data already
stored, all landing before the restarted versions freeze. Each closes an early-season
gap a review of the Gameweek 1 packet named: the context anchors an Entrant's
probabilities in nothing but its training-data priors, its Prior-Season line carries
points but no underlying performance, and the ask itself leaves two things unsaid that
every Entrant must currently guess.

## The three additions

- **Prior-Season league base rates.** One line per context, from the prior Season's
  top-flight results alone: the home-win / draw / away-win shares, goals per match, and
  the match count they are computed over. An anchor for turning a read of two teams
  into a distribution, without leaning on a prior from training data that may be
  years stale.
- **Prior-Season xG rates.** xG for and against per game — overall, home and away —
  appended to the existing Prior-Season points-per-game line, computed over the club's
  prior-Season top-flight matches under the form lines' both-or-nothing rule: a match
  counts only when both sides' figure is stored, the covered count is announced when it
  falls short, and a club with no covered matches reads `unavailable` rather than a
  silent zero. A promoted club is unavailable by nature — Understat carries no second
  division — which is the same explicit gap its Championship history already produces.
- **Two instruction lines**, exactly:

  > score is the exact final scoreline you judge most likely — not expected goals
  > rounded.

  > Probabilities are scored with the ranked probability score over the ordered
  > outcomes Home, Draw, Away; lower is better.

## Why these pass ADR-0018

Both data additions are sums over raw stored results — the same arithmetic the league
table already performs — not a digested forecast of the Fixture being predicted; an
Entrant still has to reason its way from them to a distribution. The RPS line is not a
signal at all: it is the game's rule. A benchmark whose competitors do not know how
they are judged measures ignorance of the rule mixed into overconfidence, and only the
second of those is worth measuring.

## Coherence changes meaning, and that is accepted

Telling Entrants the score must be their most likely scoreline turns Coherence from an
emergent property into an instructed one: it now measures instruction-following where
it used to measure whether an Entrant agreed with itself unprompted. Accepted on
ADR-0026's logic — an ambiguity every Entrant trips over equally is noise, not the
signal the track exists to measure. The expected effect is a lower incoherence rate
across the board; the metric still catches whoever misses.

## Considered and rejected

- **"Absent a strong signal, hold to the base rate."** Rejected. The base rate is
  admitted as a fact; telling Entrants what to do with it is coaching, and coaching
  pushes every Entrant toward the same answer — the direction ADR-0008 and ADR-0018
  exist to resist.
- **Per-player prior-Season minutes and points-per-game.** Deferred, not refused: it is
  the right replacement for price as a who-plays signal, but it needs a fetch change
  and a migration under ADR-0042's hard clock. It waits for the next version boundary.
- **Reference odds as a control arm.** Out of scope here and blocked by nothing: a
  Reference Line lives outside the context, needs no version window, and proceeds on
  its own.
