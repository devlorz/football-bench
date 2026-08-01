# Spec 0005 — Player performance in the FPL context

**Status:** ready-for-agent
**Scope:** everything that must land before the FPL track's first Lock for the pool to
carry per-player performance under a new frozen Prompt Version, `fpl/2026-27-v2`
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0020](../adr/),
especially [ADR 0018](../adr/0018-raw-signals-only-in-the-entrant-context.md) and
[ADR 0020](../adr/0020-per-player-gameweek-performance-joins-the-fpl-context-for-2026-27-v2.md)
**Siblings:** [spec 0003](./0003-fpl-track.md) (the FPL track this extends) ·
[spec 0004](./0004-shots-and-xg-in-the-match-context.md) (the Match track's equivalent move)

---

## Problem Statement

The FPL context hands an Entrant a six-hundred-player pool described only by name, club,
position, price and availability. Every Base Model's knowledge cutoff predates the 2026-27
season, so an Entrant picks and manages a Squad from priors about a season that no longer
exists: a breakout player is invisible, a faded star looks safe, and the hole the track
exists to watch Entrants climb out of cannot even be seen by the Entrant standing in it.
The per-player numbers that would fix this are already flowing — the live endpoint's full
stat set arrives with every settled-points fetch and is archived byte-for-byte — but the
pipeline keeps only minutes and total points, and the context shows none of it.

## Solution

Each pool line gains two aggregate windows of raw performance — the whole Season and the
last five Settled Gameweeks — carrying points, minutes, appearances, goals, assists, clean
sheets, bonus, cards, saves and FPL's per-Gameweek xG, xA and xGC. The pool stays complete:
every player FPL lists is present and purchasable, and cost is contained by lossless
compression rather than curation. The windows are built only from Settled Gameweeks, and
the context announces the Gameweek they run through, so the stored text never depends on
when the fetch ran. The change ships as the frozen Prompt Version `fpl/2026-27-v2`.

---

## User Stories

### Collecting the stats

1. As an operator, I want the settled-points fetch to store the full raw stat set for every
   player, so that the context windows and future scoring detail read from one audited table.
2. As an operator, I want the stat columns typed and constrained in the schema, so that a
   malformed upstream value fails at the boundary instead of flowing into a context.
3. As an operator, I want a Gameweek fetched before this change to be back-fillable from its
   archived `fpl_live` snapshot, so that widening the fetch loses nothing already collected.
4. As an operator, I want a table that already holds narrow rows to refuse the widening
   until those rows are back-filled, so that old rows cannot silently read as "played and
   did nothing".
5. As an auditor, I want the raw live response to remain the archived source of truth, so
   that any stored stat can be traced back to the bytes it came from.

### What the Entrant sees

6. As an Entrant, I want each player's Season-to-date performance, so that I can tell who
   has actually produced over the year rather than guessing from a stale prior.
7. As an Entrant, I want each player's last-five-Settled-Gameweeks performance, so that a
   cold streak or a breakout is visible when I decide who to transfer.
8. As an Entrant, I want minutes and appearances in both windows, so that I can tell a
   rotation risk from a nailed starter and divide totals into rates myself.
9. As an Entrant, I want the raw events behind the points — goals, assists, clean sheets,
   bonus, cards, saves — so that I can tell where a player's points come from.
10. As an Entrant, I want xG, xA and xGC alongside the events, so that I can separate
    sustainable form from luck by my own reasoning.
11. As an Entrant, I want no digested numbers — no form rating, no ICT, no expected points,
    no ownership percentage — so that any forecast in my answer is mine.
12. As an Entrant, I want every player FPL lists present in the pool, so that a differential
    or a cheap enabler is as buyable for me as it is in the real game.
13. As an Entrant, I want the context to state the Gameweek its stats run through, so that
    an unsettled Gameweek is announced to me rather than silently missing.
14. As an Entrant, I want a legend defining the abbreviated stat keys once, so that the
    compressed lines stay unambiguous.

### Fairness and audit

15. As an auditor, I want every Entrant of a Gameweek handed the identical context text, so
    that Paired Differences reflect Base Models rather than information asymmetry.
16. As an auditor, I want the v2 context stored and hashed exactly as v1 was, so that "it
    saw only this" stays verifiable.
17. As an auditor, I want everything recorded under `fpl/2026-27-v1`'s hash to stay
    attributable to v1, so that the Prompt Version remains a frozen pair.
18. As an operator, I want the transfer-pricing readback to keep working on v2 context
    bodies, so that an action is still priced from the text on record.
19. As an analyst, I want the per-call token cost measured from recorded attempts after the
    first Gameweek, so that the cost of the richer context is a fact rather than a guess.

### Proving it

20. As a reviewer, I want the windows verified against hand-computed aggregates including a
    player who moved between them, so that the boundary between "season" and "last five" is
    checked rather than described.
21. As a reviewer, I want a player with Settled minutes but a zero in one stat verified to
    omit that field and a player with no Settled minutes verified to carry no stat block,
    so that compression is proven lossless rather than assumed.
22. As a reviewer, I want the unsettled-Gameweek case verified end to end — windows stop at
    the last Settled Gameweek and the announcement line says so — so that a tight midweek
    turnaround cannot leak provisional numbers.

---

## Implementation Decisions

### The stat set is frozen with the Prompt Version

Per player and Settled Gameweek, the record widens from minutes and total points to:
goals, assists, clean sheets, bonus, yellow cards, red cards, saves, and FPL's expected
goals, expected assists and expected goals conceded (decimal strings upstream, fixed-point
in the schema). Appearances are derived — a Settled row with positive minutes — not stored.
The set is frozen for the Season along with the Prompt Version; that is why the storage is
typed columns rather than a JSONB envelope (ADR 0020).

The digested layer — form, ICT index, expected points next round, ownership percentage —
is deliberately excluded under ADR 0018, and its absence is a feature to protect, not a
gap to fill.

### Two windows, Settled Gameweeks only

Each player carries two aggregate blocks: the whole Season, and the five most recent
Settled Gameweeks. Aggregation is summation of raw events; averaging is the Entrant's job.
Settled-ness is read from the feed exactly as scoring reads it — a Gameweek without stored
points rows contributes nothing, and the context opens the pool section by naming the
Gameweek the windows run through (or stating that none has settled yet, which is Gameweek
1's normal case). Provisional live numbers never appear.

### The pool stays complete; compression is lossless

The pool remains the priced universe of legal transfers, so it is never filtered. Cost is
contained three ways, none of which drops information: a player with no Settled minutes in
a window carries no stat block for it (absence of a block is the statement "no Settled
appearance"), zero-valued fields inside a block are omitted, and keys are abbreviated with
a one-time legend above the pool.

### One context per Gameweek, as before

The context builder stays a pure function; the stat windows arrive as one more input
computed from the points table by the opening flow. Storage, hashing and the
read-back-then-price flow are unchanged. The pool readback parser tolerates the new stat
fields while continuing to validate the fields it prices from.

### The Prompt Version bumps to `fpl/2026-27-v2`

The constant changes once, before the track's first Lock. `fpl/2026-27-v1` is never edited
in place: whatever was produced under its hash stays attributable to it, matching the
Match track's precedent in ADR 0019.

---

## Testing Decisions

A good test asserts external behaviour at an existing seam — the stored context text, the
rows a fetch writes, the action a stored context prices — never the private steps that
produced them. No new seam is introduced; the three that exist are enough:

- **Outbound HTTP**, for the widened fetch: scripted live-endpoint bodies drive
  `fetchFplPlayerPoints`, asserting the rows written and the boundary rejection of a
  malformed stat. Prior art: the settled-player-points tests.
- **A real Postgres**, for the migration, the guard against un-backfilled rows, and the
  window aggregation. Prior art: the schema tests.
- **The pure context builder**, called directly with state, pool and stat windows:
  rendering of both windows, zero-field omission, the missing block for a player without
  Settled minutes, the legend, the Settled-through announcement, and the readback
  round-trip on a v2 body. Prior art: the existing FPL context and pool-fixture tests.

The highest seam proves the whole: `openFplGameweek` driven through HTTP and Postgres,
asserting on the stored, hashed context body — the one place every behaviour in this spec
converges.

## Out of Scope

- **Scoring detail beyond what spec 0003 defines.** The wider columns exist for the
  context; per-stat scoring breakdowns remain future work.
- **The Match track's context**, extended separately by spec 0004.
- **Any change to the rules reducer, the Repair loop or the Lock.**
- **Backfill tooling as a product.** Re-deriving old rows from archived snapshots is a
  runbook action; only the guard that demands it is in scope.
- **Prompt-wording changes beyond the stat sections.** v2 is v1 plus performance; it is
  not a rewrite.

## Further Notes

**Cost is measured, not estimated.** The projected addition is ~18k input tokens per call
at its late-season worst — roughly $15–25 across the nine-Entrant roster for a Season —
and spec 0003's rule stands: read the real figure from `attempts.tokens_in` after the
first Gameweek.

**Migration numbering must be checked at merge time.** Migration work is in flight in a
parallel working tree; the migration this spec adds must take the next free number when it
lands, not fight over one.

**Gameweek 1 is the empty case, not an edge case.** The track's first context will carry
no Settled Gameweek and therefore no stat blocks at all; the announcement line is what
tells the Entrant this is by design. Tests treat it as the first-class path it is.
