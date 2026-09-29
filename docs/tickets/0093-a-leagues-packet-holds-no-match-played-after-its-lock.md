# Ticket: A league's packet holds no match played after its Lock

**What to build:** the league history a Match packet is built from is bounded by the
Lock's instant for real. Today the bound compares each match's day against the Lock
instant. A match played later on the Lock's own day passes it, and so the match being
predicted can appear in its own packet with its result. In production this cannot happen
yet; every packet built after a result has landed shows it.

**Blocked by:** None to start. Whether it may *land* before the next Prompt Version of
each league is the question in "The version question" below, and the operator decides it.

**Status:** done (2026-09-29), with the instant-exact fix.

---

## What is already known

**Found by ticket 0091's rehearsal (2026-09-28).** The packet for Arsenal v Coventry,
rebuilt from bytes observed after that Gameweek was played, carried the line "Arsenal
3-0 Coventry".

**Why, read off the code on 2026-09-29.**

- The league history (`historical_matches`) stores `played_on` as a `timestamptz`.
  The football-data.co.uk CSVs carry a date. The fetch stores that date as UTC midnight,
  and so does the projection of the Season's own settled Fixtures.
- The context loader bounds the history with `played_on < deadline`, and the renderer
  applies the same bound again (`playedBefore`).
- A match on the Lock's day is stored at 00:00Z, which is before any deadline that day,
  so both bounds let it through whatever its kickoff.
- Understat xG is bounded by `kicked_off_at`, a real instant, and is not affected. A
  leaked match therefore shows its score without its xG.

**Why production has not seen it.** The Match context is built by the prediction run,
before the Lock. A Fixture of the Gameweek kicks off after its deadline, so its result
does not exist yet when the packet is built; the Fill reuses the stored context. The
leak needs a packet built after a result on the Lock's day has landed:

- the scoring rehearsal (ticket 0091);
- a dry run over a late archive;
- `context:show` for a Gameweek already played.

Any future job that rebuilds a packet after the fact would join this list.

**What the naive fix changes.** Bounding by the Lock's UTC day, exclusive, as
`international_results` does, also drops a match played earlier on the Lock's day that
really was before the Lock. An example is a deferred Fixture of the previous Gameweek
kicked off at 12:30Z under a 17:00Z deadline. Rare, but a packet built in time would lose
a result it rightly had. The history has no kickoff instant to tell the two apart. The
Season's settled Fixtures do (the projection reads `kickoff_at`), and football-data.co.uk
CSVs carry a `Time` column for recent Seasons.

## The version question

Every league's Match Prompt Version is past first use, so under ADR-0026 its rendering
is frozen.

- A packet built in time never contains a match from after the Lock. The instant-exact
  fix therefore changes no packet production would build. It changes only the ones
  built late, which are wrong today.
- The day-exclusive fix does change a packet built in time in the rare case above.

So the operator decides one of two things:

- the instant-exact fix is a correction that needs no new version, which is to be
  recorded as such (an ADR note, not a silent change); or
- both fixes wait for the next version.

Either way, if a pinned render moves, it lands with a new version, as ticket 0092 does.

**Answered 2026-09-29: the instant-exact fix, as a correction with no new version.**
It is recorded as an amendment to ADR-0026, and the ruling covers this ticket only.

- The kickoff comes from `fixtures.kickoff_at` of the Season being built.
- A current-Season top-flight row is joined to its Fixture by its two stored names, with
  no date. The Fixture's names go through `footballDataTeamName`.
  - The table's key is (season, division, home, away), and a club plays in one division
    a Season, so within the top flight a pairing is one Fixture.
  - This holds for double round-robin leagues only. A Competition whose sides meet twice
    at one venue needs the day in this key.
- A current-Season top-flight row with no Fixture is handled by its day:
  - If it is dated before the Lock's UTC day, it keeps its day bound. That day already
    places it before the Lock.
  - If it is dated on the Lock's day or later, it is refused with an error rather than
    bounded by its day, because that bound is the leak. The likeliest cause is a name
    that `teamNamesOf` does not map.
  - Refusing only from the Lock's day on keeps a spelling change from failing every
    in-time packet and turning a Gameweek into Gaps. In time, a Lock-day row exists only
    for an earlier kickoff on the deadline day, which is rare.
- The second division has no Fixtures, so it keeps its day bound. None of its clubs is a
  side in this Season's top-flight packets.
- Every earlier Season keeps its day bound too, because it ended before any Lock.
- The loader's SQL `played_on < deadline` is only a coarse prefilter. The bound is
  `playedBefore`, which the loader and the renderer share.

**Verified 2026-09-29** against the archive observed 2026-09-28T13:23Z:

- `npm run match:rehearse` with `GAMEWEEK=1` passes: 10 of 10 settled, 10 contexts.
- The Gameweek 1 packet for Arsenal v Coventry now reads "no result has been played yet
  this Season", where it carried "Arsenal 3-0 Coventry".
- The Gameweek 4 packet still carries the earlier Gameweeks' table (through
  2026-09-06) and their form lines.
- `npm run match:rehearse` with `GAMEWEEK=4` passes.
- `context:show` for Gameweek 6 of PL, PD, SA, FL1 and BL1 against production renders
  every packet. Every current-Season top-flight row that football-data.co.uk wrote found
  its Fixture, so nothing was refused.

## Acceptance

- [x] A test builds a league packet over a history holding a match on the Lock's day
      that kicked off after the deadline. The match and its result are absent from
      every line of the packet: form, the Season table, and head-to-head. A match on the
      same day that kicked off before the deadline is still present, unless the operator
      chose the day-exclusive fix, in which case the ticket says so.
- [x] Both bounds, the loader's and the renderer's, apply the same rule, so neither can
      drift from the other.
- [x] The version question above is answered in this ticket before the change lands,
      and the pins say what that answer says: unchanged, or moved under a new version.
- [x] The scoring rehearsal's output (ticket 0091) stops listing "results from the
      Lock's day" among what its packets carry, or says why it still must.

## What this ticket does not do

- **The Nations League.** Its dataset reads are already bounded by the Lock's UTC day,
  and its Season Fixtures by `kickoff_at`.
- **Other sections built from bytes newer than the Lock** in a replay (the Head Coach
  state). Ticket 0091 records those as what a late replay carries.
