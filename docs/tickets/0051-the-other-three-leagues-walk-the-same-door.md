# Ticket: The other three leagues walk through the same door

**What to build:** La Liga, Serie A and Ligue 1 each get their own Exhibition row for
`stealth/ox-alpha` at their own frozen Prompt Version, each is pre-flighted against a
Fixture of its own league, and each Season is replayed. At the end the same Base Model
stands, labelled, on all four readable rankings, and the record shows one league's row
cannot be called under another's name. Decision:
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md) for why this is four rows and
not one.

**Blocked by:** [0050](0050-the-premier-league-season-replayed-by-a-model-nobody-seated.md)
— the path is proven on one league before it is repeated on three.

**Status:** ready-for-agent

---

## What is already known

An Exhibition Run is one Competition's. The match track seats one Prompt Version per
Competition, the replay loads its row at the version the Competition builds, and a row
carrying another version is refused before the first call — so a La Liga row named under
`PL` costs nothing to get wrong. That refusal is worth exercising once rather than trusting.

**The three rows, and where each version comes from:**

| Competition | id | Prompt Version |
| --- | --- | --- |
| `PD` | `exhibition-pd/ox-alpha` | `match-pd/2026-27-v2` |
| `SA` | `exhibition-sa/ox-alpha` | `match-sa/2026-27-v1` |
| `FL1` | `exhibition-fl1/ox-alpha` | `match-fl1/2026-27-v1` |

Every other column is the Premier League row's, unchanged: the Base Model, the provider,
the null quantization, the role and the `config`. Nothing about the Base Model differs by
league, and a second answer to any of those columns would be a second place to be wrong.

**La Liga's retired Gameweek is not this ticket's to reopen.** `PD` sits on `v2` because
its `v1` was used and retired, and Gameweek 1 is kept whole under its own label. The
replay reads the version this row carries, so the Exhibition covers what `v2` covers and
Gameweek 1 stays where ADR-0042 put it. Do not seat a `v1` row to reach it.

**Three leagues, three pre-flights.** The call path is identical, but the Fixture, the
context and the league's own prompt are not, and a pre-flight is cheap. A refusal that
appears only in Serie A's wording is exactly the thing a single Premier League pre-flight
cannot report.

## Acceptance

- [ ] Three `models` rows exist, one per Competition, each at that Competition's frozen
      Prompt Version and identical to the Premier League row in every other column
- [ ] A row is refused, with a message naming the mismatch, when a replay or a pre-flight
      is aimed at it under a Competition whose Prompt Version it does not carry — proven
      once rather than assumed
- [ ] Each of the three passes a single-model pre-flight against a Fixture of its own
      league, and the three reports join the Premier League's in `docs/reports`
- [ ] Each league's Settled Gameweeks are replayed, and re-running any of them is a no-op
- [ ] All four readable rankings show the Exhibition Run ranked among that league's
      Entrants under its "ran after Gameweek N" label, each label derived from the
      timestamps of that league's own Predictions
- [ ] Every roster figure in all four Competitions is identical with the Exhibition rows
      present and absent, and the combined ranking counts none of them
