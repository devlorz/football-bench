# Tickets: Player performance in the FPL context

Three tracer-bullet slices that put two Settled performance windows on every pool line and
freeze the result as `fpl/2026-27-v2` before the FPL track's first Lock. Source:
[spec 0005](../specs/0005-player-performance-in-the-fpl-context.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0018](../adr/), especially
[ADR 0016](../adr/0016-raw-signals-only-in-the-entrant-context.md) and
[ADR 0018](../adr/0018-per-player-gameweek-performance-joins-the-fpl-context-for-2026-27-v2.md).

Work the **frontier**: the first two tickets are independent and can run in parallel; the
opening ticket needs both.

---

## The full stat set rides the settled-points fetch into the record

**What to build:** Running the settled-points fetch stores the full raw stat set for every
player of a Settled Gameweek — goals, assists, clean sheets, bonus, yellow and red cards,
saves, and FPL's xG, xA and xGC alongside the existing minutes and total points — in typed,
constrained columns. The archived `fpl_live` snapshot remains the byte-for-byte source of
truth every stored stat traces back to.

**Blocked by:** None — can start immediately.

- [ ] A migration widens the per-player points table with typed, non-negative stat columns,
      the expected-goals family stored as fixed-point matching the source's two decimals
- [ ] A table already holding narrow rows refuses the widening with an error naming the
      backfill, so old rows cannot silently read as "played and did nothing"
- [ ] Running the fetch on a live body stores every stat for every player, verified against
      hand-picked values from a scripted response
- [ ] A live body with a malformed stat is archived, then fails validation at the boundary
      and stores no rows
- [ ] The migration number is the next free one at merge time — migration work is in flight
      in a parallel working tree
- [ ] Tests drive the outbound-HTTP seam against a real Postgres, following the
      settled-points prior art

## The pool lines carry two Settled windows

**What to build:** The FPL context builder renders each pool player with two aggregate
performance blocks — the whole Season and the five most recent Settled Gameweeks — under
the new frozen Prompt Version `fpl/2026-27-v2`, compressed losslessly and announcing the
Gameweek the windows run through.

**Blocked by:** None — can start immediately.

- [ ] Each player with Settled minutes carries a season block and a last-five block of
      points, minutes, appearances and the raw event and expected-goals stats
- [ ] Zero-valued fields are omitted from a block, and a player with no Settled minutes in
      a window carries no block for it at all
- [ ] A legend above the pool defines every abbreviated key exactly once
- [ ] The pool section announces the Settled Gameweek the windows run through, and states
      plainly when no Gameweek has settled yet — Gameweek 1's normal case
- [ ] No digested number — form, ICT, expected points, ownership — appears anywhere in the
      context
- [ ] The pool readback continues to price transfers from a v2 body, tolerating the stat
      fields while still validating the fields it prices from
- [ ] The Prompt Version constant reads `fpl/2026-27-v2`; nothing recorded under v1 is
      touched
- [ ] The builder is tested as the pure function it is, including hand-computed window
      aggregates for a player whose form moved between the two windows

## Opening a Gameweek hands the Entrant the performance record

**What to build:** Opening an FPL Gameweek computes the two Settled windows from the stored
per-player points and hands every Entrant the identical v2 context — stored, hashed and
read back for pricing exactly as v1 was.

**Blocked by:** The full stat set rides the settled-points fetch into the record · The pool
lines carry two Settled windows.

- [ ] The opening flow derives the Settled-through Gameweek and both windows from the
      points table alone — a Gameweek without stored points rows contributes nothing
- [ ] The stored, hashed context body carries the stat blocks, the legend and the
      announcement line, verified end to end through the HTTP and Postgres seams
- [ ] Opening the track's first Gameweek — nothing Settled — produces a context with no
      stat blocks and the announcement saying so, as a first-class path
- [ ] A transfer in the returned action is priced from the stored v2 body, never from a
      snapshot that may have moved since
- [ ] Every Entrant of the Gameweek is handed the identical stored text, so the windows
      introduce no information asymmetry
