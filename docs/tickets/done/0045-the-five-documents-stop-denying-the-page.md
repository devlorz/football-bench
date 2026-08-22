# Ticket: The five documents stop denying the page

**What to build:** The record catches up with the decision. Five places state that no ranking
spans two Competitions and that a combined ranking is out of scope in any surface; one of them
is a footnote a reader sees on every league page, three pages away from the page that now does
it. After this ticket the site and its documents agree, and ADR-0035 keeps everything it decided
except the one sentence ADR-0051 replaced. Source:
[spec 0025](../../specs/0025-the-combined-ranking.md), "Documents updated in this change".

**Blocked by:** Ticket 0044 — the footnote must not advertise a page that does not exist yet,
and must not deny one that does.

**Status:** ready-for-agent

---

## What is already known

The five, and what each currently says:

| Where | What it says today |
| --- | --- |
| [ADR-0035](../../adr/0035-the-match-track-grows-a-competition-dimension.md) | "no combined cross-league ranking is published" |
| [ADR-0039](../../adr/0039-the-dashboard-gives-every-competition-its-own-path.md) | "the footnote states the separation and no surface computes across it" |
| [spec 0016](../../specs/0016-competition-expansion.md) | Out of Scope: "A combined cross-league ranking, in any surface" |
| [spec 0017](../../specs/0017-the-dashboard-per-competition-shape.md) | Out of Scope: the same line |
| the per-league leaderboard's **What this is not.** footnote | "Each Competition is its own benchmark: no ranking spans two…" |

**ADR-0035 is superseded in one sentence and stands in every other.** Its Competition dimension,
its per-league benchmark question and its per-league leaderboards are not reopened. An edit that
retires the whole ADR takes the schema decision with it and is wrong.

**The footnote's replacement still has a true thing to say.** Each Competition remains its own
benchmark and each leaderboard still spans one league; what stops being true is that no surface
computes across them. The sentence should say what the combined page is and where it is, not
merely delete the denial — a reader who has just been told two leagues are separate benchmarks
and then finds a page adding them up is owed the connection in the place they read the first
claim.

**CONTEXT.md gains a term rather than widening one.** **Combined Ranking**: one ranking over
every scored Competition of a Season, by raw season-to-date total. **Leaderboard** keeps its
meaning — one Competition, never two. Letting "leaderboard" mean both is how the distinction is
lost inside a week.

## Acceptance

- [x] ADR-0035 records that its no-combined-ranking sentence is superseded by ADR-0051, and every
      other decision in it reads unchanged.
- [x] ADR-0039's consequence no longer claims no surface computes across Competitions, and its
      switcher reasoning — which declined to carry a selection across a crossing — is left standing
      or explicitly revisited, not silently contradicted. Revisited: the switcher, standing on
      `/overall`, falls back to a league's leaderboard rather than a second `/overall`, stated in the
      same consequence bullet.
- [x] Both specs' Out of Scope lines are corrected rather than deleted, so a reader learns where the
      decision moved.
- [x] The per-league footnote states what is still true, names the combined ranking and links to it.
- [x] CONTEXT.md defines **Combined Ranking** beside **Leaderboard**, and the two definitions cannot
      be read as the same thing.
- [x] No document is left instructing a future reader that this page may not exist.
- [x] The per-league pages are otherwise unchanged, and no figure, query or endpoint moves.
