# Ticket: The Bundesliga's history and xG land behind reviewed maps

**What to build:** one prior Season of German results and per-match xG stored under `BL1`,
mirroring exactly what the four open leagues hold — behind the two identity maps that
decide whether any of it can be read back. Source:
[opening a Competition](../runbooks/opening-a-competition.md) edit 5 and §2. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md)
(what the packet holds and what the curation costs).

**Blocked by:** 0058 — the divisions and the check constraint must exist before the first
insert, and a backfill without them fails on the first row.

**Status:** ready-for-agent

---

## What is already known

**Two maps, both derived and both reviewed by a person before the backfill runs.**

- *Understat name → football-data.co.uk name*, read out of the league's own Understat
  feed against the stored results' `HomeTeam` column, both sets the same size with nothing
  left over. The league slug is scoped per Competition on purpose: a wrong slug resolves
  every club, complains about nothing, and relabels another league's whole Season of xG
  away, because the writer's key does not carry `competition`.
- *Live-source name → football-data.co.uk name*, football-data.org's long official names
  against what the stored results spell. Without it every club's history section reads
  "none in stored data" over a complete backfill, and nothing fails.

**That second map has no row in the runbook's table.** It appears only in §2, and three
comments in the codebase each call opening a league "one entry" in their own file. The
table grows an eighth row here, so the next reader counts what the change is rather than
finding the gap the way this one was found.

**A name missing from a map fails loudly; a name mapped wrongly fails nothing, ever.** The
clock is not a reason to find that out in a packet.

**What the sources may not have yet.** football-data.co.uk publishes a new Season's files
late and answers a request for one it does not hold by redirecting to a near-miss filename,
which the per-file `Div` check refuses. Understat opens a Season with an empty `dates`, so
a promoted club cannot be mapped until it publishes and arrives as `unknown Understat team
name` at the first pre-Season fetch — which is where that failure is meant to land.
`HISTORICAL_COMPETITION` is required and has no default: the database refuses a Competition
left unset and nothing refuses one that is stated and wrong.

## Acceptance

- [ ] Both maps are derived from the real feeds, each pair of sets the same size with
      nothing left over, and reviewed by a person before any backfill runs.
- [ ] The prior Season's results and per-match xG are stored under `BL1`, and the counts of
      each are recorded in this ticket the way Serie A's and Ligue 1's were.
- [ ] A real packet is read whole over the stored rows: the league table renders, every
      club's history section resolves, and the xG join rate is stated rather than assumed.
- [ ] The runbook's table lists the live-source → football-data.co.uk map as its own row.
