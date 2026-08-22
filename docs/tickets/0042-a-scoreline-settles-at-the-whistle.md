# Ticket: A Premier League scoreline settles at the whistle, not at FPL's confirmation

**What to build:** The Match track records a Premier League Fixture's result as soon as the
FPL feed reports the match over, rather than waiting for `finished` — the flag FPL sets
only once bonus points and defensive contributions are confirmed. Neither of those can
move a scoreline, and a scoreline is all the Match track computes from a result. A played
Fixture then reaches the leaderboard on the next scoring run, the way Ligue 1's and La
Liga's already do. Source:
[spec 0002](../specs/0002-match-track-scoring.md) stories 2 and 3, the first of which this
ticket amends and the second of which it keeps.

**Blocked by:** None — can start immediately. Gameweek 1's one played Fixture is missing
from the Premier League leaderboard for as long as this stands, and every Gameweek after
it arrives late the same way.

**Status:** ready-for-agent

---

## What is already known

At 2026-08-22T05:51Z, nine hours after Arsenal 3-0 Coventry City kicked off at
2026-08-21T19:00Z and roughly seven after it ended, the FPL Fixtures feed still reported:

| Field | Value |
| --- | --- |
| `finished` | `false` |
| `finished_provisional` | `true` |
| `minutes` | `90` |
| `team_h_score` / `team_a_score` | `3` / `0` |
| Gameweek 1 `data_checked` | `false` |

The bonus points were already in the same payload's `stats`, so what `finished` is still
waiting on is not a number anybody here reads.

The two leaderboards that morning, over rounds equally part-played:

| Competition | `settledFixtures` | `throughGw` | What a reader saw |
| --- | --- | --- | --- |
| `PL` | 0 | `null` | the pre-season page, "the table fills after the first Gameweek is settled" |
| `FL1` | 1 | 1 | a ranking |

**`fixtures.result` is the Match track's column and no other track's.** It is read by Match
scoring, by the dashboard's settled count, and by the Exhibition replay. The FPL track
scores from its own per-player points, which are gated separately on `data_checked`, and
builds its league table from `historical_matches`. Nothing FPL confirms after the whistle
reaches the Match track at all.

**The reason on record does not survive the split.** Spec 0002 story 2 asks for `finished`
"so that bonus points and defensive contributions have settled before anything is computed
from them". That sentence was written when the FPL feed served one track; it is a
per-player concern, and it now guards a column no per-player metric reads. Story 3 — that
scoreability is decided by what the feed reports rather than by what time the job ran — is
untouched by this ticket and must stay true: `finished_provisional` is the feed reporting,
not the clock inferring.

**[ADR-0020](../adr/0020-per-player-gameweek-performance-joins-the-fpl-context-for-2026-27-v2.md)
is not being reopened.** Its rejection of "provisional numbers for an unsettled Gameweek"
is about per-player stat blocks in the FPL context, which do depend on FPL's confirmation.
That decision stands exactly as written, and the amended spec should say so in the same
breath, so the two rules are never read as one.

**The live score is the hazard the gate must keep.** FPL carries `team_h_score` and
`team_a_score` from `started` onward, so "has a score" is not the test and never was. What
replaces `finished` has to be the feed's own statement that the match is over.

## Acceptance

- [x] A Fixture the feed reports over — whether it says so provisionally or with its later
      confirmation — stores its result, and the two flags are read as either-or rather
      than combined as an `and not`: spec 0002's warning that `finished_provisional` may
      still be true once `finished` turns true is the reason that combination was wrong
      then and stays wrong now.
- [x] A Fixture in play stores nothing. A fetch run at half time finds a score in the feed
      and must leave `fixtures.result` as it was.
- [x] The source-contradiction check that rejects a settled Fixture carrying no goals uses
      the same predicate as the write, so a Fixture the feed calls over without a score is
      reported rather than silently passed over as unplayed.
- [x] A score that changes after it was first stored still updates the Fixture, and the
      next scoring run recomputes every figure from it. Provisional-then-corrected is the
      case this ticket makes ordinary, and it is the one that must not need a human.
- [ ] The Premier League leaderboard publishes a ranking over the Fixtures of a Gameweek
      that have been played, while the rest of that Gameweek is still to come — the state
      Ligue 1 was already in on 2026-08-22 and the Premier League could not reach.
- [x] Spec 0002 story 2 is amended so the record and the code agree, and the amendment
      names what still waits for FPL's confirmation — the FPL track's per-player points,
      gated on `data_checked` — so the two gates are not later collapsed into one by
      somebody reading only the new sentence.
- [x] The test pinning "provisional alone is not scoreable" is inverted rather than
      deleted, and a mid-match Fixture joins the same case, so the behaviour that replaces
      it is pinned by the test that used to forbid it.
- [ ] Arsenal 3-0 Coventry City is in `fixtures.result` and on the leaderboard after one
      ordinary daily fetch and one ordinary scoring run, with no manual step and no
      backfill.
