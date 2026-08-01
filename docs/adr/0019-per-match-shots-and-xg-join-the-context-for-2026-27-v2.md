# Per-match shots and xG join the context for 2026-27-v2

Before the season's first Lock, the frozen context gains two raw signals on each line of
the last-five form section: shots and shots on target (football-data.co.uk columns already
being downloaded and discarded) and per-match xG (Understat, EPL only, ported from the
reference implementation in `docs/understat/`). They appear per match, never as season
aggregates — averaging five data points is the Entrant's job, not the context builder's —
and the head-to-head section stays score-only. This supersedes the context contents listed
in ADR 0008; the change ships as a new frozen Prompt Version, `match/2026-27-v2`, because a
Prompt Version is a frozen pair and the rehearsal data recorded under v1's hash stays
attributable to v1.

## Considered options

- Understat xG covers no Championship matches, so newly promoted sides open the season
  with xG-less form lines. Accepted: the gap is explicit ("no xG for this match"), every
  Entrant sees the identical gap, Paired Differences compare Entrants on the same Fixture,
  and shots — present for both divisions — are kept on every line partly to floor this
  asymmetry. Restricting shots to promoted sides only was rejected: it would make context
  shapes differ per team instead of per match.
- Understat is scraped from undocumented endpoints and will sometimes be down. A failed xG
  fetch degrades the affected lines to an explicit "xG unavailable" marker and is loudly
  logged — it never blocks the write path. Blocking (as the football-data staleness guard
  does) was rejected: per ADR 0005 the write path ships first, and losing a Gameweek of
  Predictions to an enrichment source inverts that priority. football-data keeps its
  blocking guard because results and form are the skeleton of the context.
- Understat history is fetched two seasons deep: 2025-26 once at setup, 2026-27 through
  the daily fetch. The prior season exists only because the five-match form window crosses
  the season boundary until roughly GW6; deeper history has nowhere to appear and was
  rejected as dead data.
