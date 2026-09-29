# Ticket: A league's packet holds no match played after its Lock

**What to build:** the league history a Match packet is built from is bounded by the
Lock's instant for real. Today the bound compares each match's day against the Lock
instant. A match played later on the Lock's own day passes it, and so the match being
predicted can appear in its own packet with its result. In production this cannot happen
yet; every packet built after a result has landed shows it.

**Blocked by:** None to start. Whether it may *land* before the next Prompt Version of
each league is the question in "The version question" below, and the operator decides it.

**Status:** needs-triage.

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

## Acceptance

- [ ] A test builds a league packet over a history holding a match on the Lock's day
      that kicked off after the deadline. The match and its result are absent from
      every line of the packet: form, the Season table, and head-to-head. A match on the
      same day that kicked off before the deadline is still present, unless the operator
      chose the day-exclusive fix, in which case the ticket says so.
- [ ] Both bounds, the loader's and the renderer's, apply the same rule, so neither can
      drift from the other.
- [ ] The version question above is answered in this ticket before the change lands,
      and the pins say what that answer says: unchanged, or moved under a new version.
- [ ] The scoring rehearsal's output (ticket 0091) stops listing "results from the
      Lock's day" among what its packets carry, or says why it still must.

## What this ticket does not do

- **The Nations League.** Its dataset reads are already bounded by the Lock's UTC day,
  and its Season Fixtures by `kickoff_at`.
- **Other sections built from bytes newer than the Lock** in a replay (the Head Coach
  state). Ticket 0091 records those as what a late replay carries.
