# Ticket: A Competition reads the sources its registry names

**What to build:** the daily fetch stops assuming every listed Competition reads every
source. A per-Competition source registry names where each Competition's schedule,
history, shots and xG, and head coaches come from; the four league-only loops
(football-data.co.uk, Understat, Squad Changes, Head Coach changes) and the
after-first-deadline guard walk only the Competitions whose entry names them; a listed
Competition with no entry fails the run by name before any source is reached. The five
open Competitions get entries that describe exactly what they read today, so nothing
about their days moves. In the same change, one migration: `UNL` joins the
`competition_code` domain, and the two tables a cup needs — `international_results` and a
team-stats table keyed by source and source match id — are created. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 1–6, 43–46. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
("which sources a Competition has is data the fetch reads, not a flag"; "new rows go in
new tables"), [ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md)
(a missing map fails loudly).

**Blocked by:** None — can start immediately. This is the prefactor every later ticket
stands on: make the change easy, then make the easy change.

**Status:** ready-for-agent

---

## What is already known

**Today the dispatch is a code test.** The daily fetch reads football-data.org for
"every listed Competition but `PL`", and then walks every listed Competition through
football-data.co.uk, Understat, Squad Changes and Head Coach changes; each of those
throws for a Competition it has no entry for ("no curated divisions", "no Understat
league"), and the guard after the first deadline asks `historical_matches` for rows a cup
will never have. Listing `UNL` today fails four ways a day.

**The registry is the field the fetch already needs.** One readonly map from Competition
code to the names of its schedule source, history source, stats source and head-coach
source. `PL` reads FPL for its schedule and the domestic four for the rest; the four
leagues read football-data.org and the same four; `UNL`'s entry is written by ticket
0071, not here — an entry naming sources that do not exist yet would be a lie the fetch
believes.

**`historical_matches` cannot hold a cup.** Its key is one meeting per pair per Season
under a Division, and its Division check names the ten league divisions. National sides
meet twice a year in different competitions under no Division. `international_results`
is keyed by date and the two sides and carries the competition name, the venue country
and the neutral flag. The team-stats table is keyed `(season, competition, source,
source_match_id)`, carries the kickoff and both sides for the join, and per side nullable
shots, shots on target and xG — nullable because a hole is a row that is read again
(ADR-0058), not a row that is absent.

**Migration 0022's shape is the precedent**: the domain is widened by `alter domain`, the
migration follows [the Competition migration](../runbooks/the-competition-migration.md),
and it is applied to production by the operator, never by this ticket.

## Acceptance

- [ ] A source registry names, per Competition, its schedule, history, stats and
      head-coach sources; `PL`, `PD`, `SA`, `BL1`, `FL1` have entries describing what
      they read today, and the daily-fetch test proves each still reaches exactly the
      sources it reached before this change and no other.
- [ ] A listed Competition with no registry entry fails the daily fetch by name before
      any HTTP request is made, and the failure is collected the way every
      per-Competition failure is: the other Competitions' days land, the run fails at
      the end.
- [ ] The four league-only loops and the after-first-deadline guard read the registry;
      a Competition whose entry names no history source is not asked for
      `historical_matches` rows.
- [ ] One migration adds `UNL` to `competition_code`, creates `international_results`
      and the team-stats table with the keys above, and leaves
      `historical_matches_division_check` untouched; the schema test holds the registry's
      codes against the domain both ways.
- [ ] The migration is recorded as pending in the runbook's terms; it is not applied to
      production by this ticket.
- [ ] Every existing test is green; no packet rendering changes (the `PL`/`PD` pins do
      not move).
