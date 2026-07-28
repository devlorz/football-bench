# Complete-case pairing, with manual Gap closing before the Lock

Every comparison on the leaderboard is computed over the Fixtures where all Entrants
produced a Prediction. Pairwise deletion — letting each pair use whatever Fixtures that pair
happens to share — was rejected: it lets the leaderboard produce intransitive rankings,
where X beats Y beats Z beats X because each comparison rests on a different sample. A
leaderboard that can contradict itself is not usable as a public artifact.

Because the intersection means one Entrant's Gaps cost every comparison sample, closing Gaps
before the Lock matters. A manually dispatched run can re-attempt any Fixture with no
Prediction, reusing the stored context verbatim.

## Consequences

- Every published comparison shows its n, not just a mean and an interval.
- A blocked Gap — one Entrant missing a whole Gameweek because its pinned provider was down
  through both scheduled runs — removes that Gameweek from every comparison, including
  between Entrants that were working fine.
- Dropping a persistently broken Entrant from the intersection is allowed, but as a single
  recorded decision applied to the whole Season, never as a week-by-week judgement call.
- Manual re-attempts are safe by construction rather than by discipline: `predictions` is
  insert-only, so a re-run can fill an empty slot but can never replace an existing
  Prediction, and every attempt is logged. Re-rolling until the answer looks better is not
  possible.
- The Lock is enforced in the insert path as well as in scoring, so a manual run after the
  deadline simply cannot write a scorable Prediction.
- The repair run must raise an alert when it finishes with Gaps outstanding. Without it,
  nobody knows there is anything to close until scoring runs on Monday.
