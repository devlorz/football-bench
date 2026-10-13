# Ticket: A Competition adopted mid-Season shows its seats

**What to build:** the Champions League's dashboard shows its eight seats.

Today the fixtures page reads "0 of 0 predicted" on every Gameweek 2 Fixture, and the
leaderboard answers `entrants: []`. Production holds 144 Predictions, 8 seats × 18
Fixtures, all asked at Gameweek 2's Lock.

After this ticket:
- each Fixture counts its eight seats;
- the leaderboard lists the eight;
- the leagues, the Nations League and every Edition boundary answer exactly as they do
  today.

The same fix covers `UEL` and `UECL`, which open the same way.

Source: found on production 2026-10-13, after the dashboard deploy that first served
`UCL`. Decisions it must not bend:
- ticket 0096: a seat is expected at a Lock only if it was entered at or before it, and
  a seat that joined later is not expected earlier;
- ADR-0061: an Edition's roster is read within the Edition;
- ADR-0063: `UCL`'s Edition 1 begins at Gameweek 1, its `MD1`, adopted as Locked
  history;
- the policy-from-data rule: no flag and no list of Competitions.

**Blocked by:** None — can start immediately. Urgent: `UCL`'s Gameweek 2 Locks
2026-10-13T15:15Z, and the page is live.

**Status:** ready-for-agent

---

## What is already known

- **The read API's seat query asks the wrong Lock.** The seat query shared by the
  fixtures, leaderboard and entrant-record endpoints keeps an entrant only if it was
  asked at the Lock of one Gameweek: the Edition's first ranked Gameweek.
  - For `UCL` that is Gameweek 1, whose Lock was 2026-09-08T15:15Z.
  - The eight `match-ucl/…` seats were entered 2026-10-13, so none passes.
  - The record itself is right. The predict job asked them at Gameweek 2's Lock, and
    the scorer applies the rule per Gameweek, so Gameweek 1 holds no Gaps.
- **Why nothing else hit it.** Every earlier Competition and Edition entered its seats
  before its first Gameweek's Lock. `UCL` is the first Competition opened by adopting
  its first Gameweek as history (ADR-0015, ADR-0063).
- **The fix, read off data.** The Lock a seat is asked at becomes that of the first
  Gameweek of the Edition's ranked range whose Lock is at or after the earliest entry of
  any entrant seat under the Competition's Prompt Version.
  - `UCL`: the earliest entry is 10-13, so the Lock is Gameweek 2's and all eight pass.
  - The leagues' Edition 2 (seats from August, first Gameweek 6–8): unchanged.
  - Edition 1 and `UNL`: Gameweek 1, unchanged.
  - A seat entered after that Lock is still not expected there.

## Acceptance criteria

- [ ] A Competition whose seats were entered after Gameweek 1's Lock and before Gameweek 2's shows them on Gameweek 2's fixtures page and on its leaderboard. A seat entered after Gameweek 2's Lock does not show.
- [ ] Every existing read-API suite passes unchanged, including the Edition-boundary cases (`m`, `n`, `w`).
- [ ] After the deploy, production's `/api/ucl/fixtures` counts eight seats per Fixture and `/api/ucl/leaderboard` lists eight entrants.
