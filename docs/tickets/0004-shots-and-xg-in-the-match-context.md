# Tickets: Shots and xG in the match context

Four tracer-bullet slices that put per-match shots and xG on the last-five form lines and
freeze the result as `match/2026-27-v2` before the Season's first Lock. Source:
[spec 0004](../specs/0004-shots-and-xg-in-the-match-context.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0017](../adr/), especially
[ADR 0016](../adr/0016-raw-signals-only-in-the-entrant-context.md) and
[ADR 0017](../adr/0017-per-match-shots-and-xg-join-the-context-for-2026-27-v2.md).

Work the **frontier**: the first two tickets are independent and can run in parallel; the
context ticket needs both; the freeze ticket comes last and gates going live.

The hard deadline is the 2026/27 Season's first Gameweek deadline in mid-August. The two
signals are severable: if the Understat ticket threatens the freeze date, shipping v2 with
shots only is an operator decision that keeps the deadline.

---

## Shots ride the existing CSV into the record

**What to build:** Running the fetch stores each historical match with both sides' shots
and shots on target, parsed from the football-data.co.uk CSVs the pipeline already
downloads and archives — for the Premier League and the Championship alike. Seasons whose
CSVs predate the shot columns keep loading, with those fields simply absent.

**Blocked by:** None — can start immediately.

- [x] A migration adds nullable home/away shots and shots-on-target columns to the
      historical-matches table, and the schema tests cover them against real Postgres
- [x] Running the fetch on a CSV that carries `HS`, `AS`, `HST` and `AST` stores all four
      figures on each match row, for both divisions
- [x] A row whose shot columns are absent or blank loads with those fields null — the
      loader never invents zeros and never fails a season for lacking them
- [x] A row whose shot columns are present but malformed fails validation naming the row
      and field, and stores no derived rows
- [x] The raw CSV is archived byte-for-byte exactly as before
- [x] Tests inject canned CSV bodies through the existing outbound-HTTP seam: with shot
      columns, without them, and with a malformed value

---

## Understat xG fetched, stored, and survivable

**What to build:** The daily fetch pulls per-match xG for finished Premier League matches
from Understat's internal JSON endpoints into a new xG table, archiving every raw response
and failing loudly at the boundary — and a one-off backfill command ingests the prior
season so the form window that crosses the season boundary is covered from Gameweek 1. An
Understat outage degrades: the rest of the fetch proceeds and the failure is loudly logged,
because an enrichment source is never allowed to block the write path.

**Blocked by:** None — can start immediately.

- [x] A migration creates the xG table keyed by season and Understat match id, carrying
      kick-off time, both team names as Understat spells them, and both xG values — with
      deliberately no foreign key to historical matches, since a missing xG row is a
      legitimate state
- [x] The fetcher calls the internal JSON endpoints with the headers the reference guide
      documents as required, through the same injectable outbound-HTTP seam as every other
      source, ~~rate-limited between requests~~
- [x] Every raw response is archived exactly as received before any parsing
- [x] String-typed xG values are parsed to numbers at the boundary; matches without an xG
      field (not yet played) are skipped, never stored as zero
- [x] A response with an unexpected shape is archived, then fails validation naming every
      offending field, and stores no derived rows
- [x] Understat team names resolve through an explicit alias mapping; an unmapped name is a
      validation error, never a silent skip
- [x] A failed Understat fetch leaves the daily fetch alive and the stored xG untouched,
      and the failure is loudly logged; the football-data staleness guard still blocks as
      before
- [x] Re-running the fetch does not duplicate stored xG rows
- [x] A backfill command ingests the prior season's xG once; deeper history is not fetched
- [x] Tests replay canned Understat JSON through the HTTP seam: a healthy body, a reshaped
      body, an unknown team name, and an outage that the run survives

**Rate limiting struck, not skipped.** The criterion assumed the reference implementation's
per-team fetching (20 requests a season). Using `getLeagueData` instead, a whole Season's xG
is one request, so the daily fetch makes exactly one call to Understat per run and the
backfill makes one more, once. There is no gap between requests for a delay to occupy, and
speculative pacing machinery would be untested code. Revisit only if a future ticket
introduces a per-team or per-match loop.

**Two alias spellings are unverified.** `Coventry` and `Hull` in
`src/understat/team-identity.ts` are guesses: neither club appears in the Understat Premier
League seasons the guide covers, so their exact titles could not be confirmed offline.

Running the fetch before the Season starts does **not** confirm them. A match with no `xG`
field is skipped before the name check (`fetch-season-xg.ts:132`), and no match has an `xG`
field until it has been played — so the alias mapping is first exercised after GW1, which is
after the freeze.

If a spelling is wrong, one unmapped name fails validation for the whole body: no xG rows
are stored at all, and *every* team's form lines read `xG unavailable`, not just the
misspelled club's. Loud and recoverable by editing the mapping, but wider than it looks.

To actually confirm before the freeze: fetch `getLeagueData/EPL/2026` once and read the
archived `raw_snapshots` body — upcoming matches already carry `h.title` / `a.title`, so the
titles are there to be grepped even though the parser never validates them. Alternatively,
move the alias check ahead of the not-yet-played skip so a pre-season fetch validates every
name in the feed; that turns this into an automatic pre-flight check rather than a manual
grep, at the cost of a fetch that fails on a rename before any xG exists to lose.

---

## Form lines carry shots and xG

**What to build:** The context's last-five form lines carry both sides' shots, shots on
target, and per-match xG, in the decided format — and a match with no xG row says
`xG unavailable` explicitly, whether the gap comes from a promoted side's Championship
history, the early-season window, or an outage. Everything else in the context is
byte-identical to before: no aggregates, score-only head-to-head, unchanged FPL section.

**Blocked by:** Shots ride the existing CSV into the record · Understat xG fetched,
stored, and survivable.

- [ ] The context loader joins xG to historical matches by date and alias-resolved team
      names, and carries the shot columns through to the builder
- [ ] A form line for a match with full data reads like
      `W 2-1 v Chelsea (H) — shots 15-8, on target 7-3, xG 2.10-0.85`, both sides'
      numbers ordered this-team-first per the existing line convention
- [ ] A form line for a match with no xG row ends `xG unavailable`; every kind of gap
      renders identically
- [ ] A form line for a match with no shot data omits the shot segment rather than
      printing zeros
- [ ] No season-aggregate shots or xG appear anywhere; the head-to-head section stays
      score-only; the FPL player section and prompt envelope are untouched
- [ ] All matches feeding the lines remain strictly before the Gameweek's deadline
- [ ] Pure-builder tests assert the emitted strings exactly, in the pattern of the
      existing historical-context tests

---

## Freeze match/2026-27-v2 and re-run pre-flight

**What to build:** The enriched context ships as a new frozen pair: the Prompt Version
becomes `match/2026-27-v2` with a recomputed hash, every Entrant points at it, and
pre-flight runs against contexts that look like the real opening-day article — prior-season
xG in place, promoted sides showing their explicit gaps. The v1 constant and every
rehearsal artifact recorded under it stay intact and attributable.

**Blocked by:** Understat xG fetched, stored, and survivable · Form lines carry shots and
xG.

- [ ] The prompt-version constant reads `match/2026-27-v2` and its stored hash matches the
      new template bytes; the version-match assertion still refuses a mismatched Entrant
- [ ] All nine Entrant rows point at the new Prompt Version before the Season's first Lock
- [ ] Contexts are stored and hashed under v2 exactly as under v1, and Fill runs reuse the
      stored bytes verbatim
- [ ] Rehearsal contexts and attempts recorded under v1 remain in the record, attributable
      to v1
- [ ] Pre-flight is re-run against the enriched context for every Entrant and its verdict
      recorded, with the prior season's xG ingested first so the contexts match opening
      day
- [ ] No digested forecast — odds, Elo, strength ratings, lambdas — appears anywhere in
      the emitted context

---
