# Ticket: The roster module seats a Competition's second Edition

**What to build:** `roster:enter` can seat the five leagues' Edition 2 — ADR-0062's eight —
beside the ten Edition 1 rows that stay where they are: the four joining seats are
inserted under each league's standing Prompt Version, the four that play on are left
byte-for-byte as they were, and the six that leave are not named by the roster of
record and are already stamped, so ticket 0083's guard lets them stand. The cup is
untouched: `UNL` has one Edition and `matchRosterOf("UNL")` still answers its seven. The
dashboard's skeleton and the pre-flight's count read the size of the Edition they are
in, and `CLOSED_LEAGUE_EDITIONS` names Edition 1 as closed by ADR-0062 so the frozen
sentence renders. Source:
[ADR-0062](../adr/0062-eight-seats-open-the-leagues-second-edition.md),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md) *What
the record holds*. Decisions it must not bend:
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(the roster is checked as whole identities against a roster of record — now the
Edition's), ticket 0081's shape (exclusions and substitutions by name, sizes derived,
never a second ten-entry list), ticket 0083 (a withdrawn-and-unnamed stored seat passes;
a standing-and-unnamed one is refused), ADR-0047 (the FPL door and FPL reads are
untouched; `SEASON_ROSTER` and `SEASON_ROSTER_SIZE` keep describing the Season and the
FPL door).

**Blocked by:** None — can start immediately. ADR-0062 is accepted. **Must land, be
pushed and be deployed before 2026-10-09T11:00Z**, six hours ahead of BL1's Lock, which
is when the scheduled predict run first asks that Gameweek.

**Status:** drafted, 2026-10-08

---

## What is already known

**The roster of record gains a third list and an Edition.** Ticket 0081 made the roster of
record "the Season Roster, less named exclusions, with named substitutions". Edition 2
of the leagues needs one thing that shape cannot say — Claude Opus 5.5 is added, it
replaces nobody — and needs the whole shape keyed by Edition, because the same league has
two rosters of record now and `matchRosterOf("PL")` must not start answering eight for
a question about Edition 1. So: `MATCH_ADDITIONS` beside the two lists, each a whole
`Entrant` with its catalog facts, and all three lists keyed `{ [competition]: { [edition]:
… } }` with Edition 1 as today's entries. `matchRosterOf(competition, edition)` returns
the Season Roster less exclusions, with substitutions, plus additions, in that order, and
refuses by name an addition whose id the Season Roster already seats. `matchRosterSizeOf`
takes the Edition too.

**Which Edition a caller means is never guessed.** `roster:enter` reads `EDITION` from the
environment (default 1, so today's command is unchanged); the dashboard page already
holds an `EditionScope` and passes its number; the pre-flight's count stays
`EXPECTED_ENTRANT_COUNT`. No caller resolves "the latest Edition" from the database
inside this module — that is what the Editions row and the operator's `EDITION=2` say.

**The identity check is the Edition's.** `enterSeasonRoster` compares the roster it is
handed with `matchRosterOf(competition, edition)` entry by entry; the stored-record guard
(`refuseARosterTheRecordDisagreesWith`) checks each stored seat against its own Prompt
Version's roster of record for the Edition being entered. A stored seat that is stamped
and unnamed passes (0083); one standing and unnamed is refused — which is exactly the
protection against running `EDITION=2` before the six are stamped.

**The four new ids follow the roster's shape**: `match/claude-opus-5.5`, `match/gpt-6.1-sol`,
`match/grok-4.7`, `match/muse-spark-1.3`, prefixed per league as every seat is
(`match-bl1/…`). Names: "Claude Opus 5.5", "GPT-6.1 Sol", "Grok 4.7", "Muse Spark 1.3".
Catalog facts from ADR-0062's table, `catalogCheckedAt` 2026-10-08; `canonicalSlug` is the
catalog's expectation until the pre-flight reads it back.

**The closed-Edition constant is the deploy step ticket 0085 chose.** `CLOSED_LEAGUE_EDITIONS`
gains `{ number: 1, openedBy: "ADR-0062" }`; the sentence it feeds names ADR-0061 and
ADR-0062 and takes its Gameweek range from the body. The dashboard is rebuilt and
deployed with it, or `/edition-1/…` keeps answering as the current Edition.

**What this ticket does not do.** It does not stamp anybody, insert an Editions row, or
pre-flight — those are the operator's, in the order ADR-0062's *What it takes* gives and
ticket 0086's runbook writes down. It does not change `SEASON_ROSTER`.

## Acceptance

- [ ] `matchRosterOf("PL", 2)` is ADR-0062's eight, in Season Roster order with the
      addition last; `matchRosterOf("PL", 1)` and `matchRosterOf("PL")` are still the ten;
      `matchRosterOf("UNL", 1)` is still the seven; the five leagues answer the same eight.
      Class mix asserted four–two–two for Edition 2.
- [ ] An addition whose id the Season Roster already seats, an exclusion or substitution
      naming an unseated id, and an Edition with no entry for a league are each refused by
      name.
- [ ] On a record holding a league's ten Edition 1 rows with the six stamped,
      `EDITION=2 roster:enter` inserts exactly four rows, leaves the ten byte-for-byte
      (`created_at` and `withdrawn_at` included), and the four new rows carry `created_at`
      of the run; on a record where any of the six is not stamped it refuses by name.
- [ ] The cup's rows are untouched by an `EDITION=2` run (it has no Edition 2 entry and is
      skipped with a line saying so, not refused).
- [ ] The competition page's skeleton draws eight rows under an Edition 2 scope and ten
      under Edition 1; the FPL pages and the FPL roster suite are untouched.
- [ ] `CLOSED_LEAGUE_EDITIONS` names Edition 1 closed by ADR-0062; the frozen sentence's
      bytes are re-pinned with the ADR names; the two-Edition build renders the note on
      `/edition-1/pl` and not on `/pl`.
- [ ] The Edition 2 pre-flight count is read from `EXPECTED_ENTRANT_COUNT=8` with no code
      change; the runbook line for it is ticket 0086's.
