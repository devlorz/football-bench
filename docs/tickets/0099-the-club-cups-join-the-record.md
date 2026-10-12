# Ticket: The club cups join the record

**What to build:** the record can hold the UEFA Champions League (`UCL`), Europa League
(`UEL`) and Conference League (`UECL`). The three codes join the `competition_code`
domain. The two tables a club cup needs exist: `club_results` and `club_head_coaches`.
Each cup has its Edition 1 row starting at Gameweek 1. Each cup has a source registry
entry that names UEFA for its schedule and no other source, because no other fetch
exists for it yet. CONTEXT.md lists nine Competitions and carries ADR-0063's amended
naming rule. Nothing reads any of this yet. No daily fetch walks a cup until a
`competitions` row lists it, and that row is the operator's (ticket 0106).

Source: [ADR-0063](../adr/0063-the-three-uefa-club-cups-open-at-their-league-phases-second-matchday.md),
[spec 0028](../specs/0028-the-uefa-club-cups-open.md) stories 1–9.

Decisions it must not bend:
- ADR-0057: new rows go in new tables, and `historical_matches` and its Division check do
  not move.
- ADR-0054: a listed Competition with no registry entry fails by name.
- The registry's own rule: naming a source before its fetch exists is the lie, because
  the fetch would believe it.

**Blocked by:** None — can start immediately. **On the `UCL` critical path**: the cut line
is 2026-10-13T06:00Z.

**Status:** ready-for-agent

---

## What is already known

- **One migration file**, as ADR-0063's Consequences says, so the operator applies one
  file to production.
- **`club_results`** is keyed `(source, source_match_id)`. It holds `kicked_off_at`,
  `home_team`, `away_team`, both scores (non-negative) and `competition_name`, and has no
  Season, Division or Competition column. A club plays in several competitions under none
  of this record's codes, which is the reason `international_results` has none either.
- **`club_head_coaches`** is keyed `(team, observed_on)`. It holds `observed_at` and a
  nullable `head_coach`, and has **no** `assumed_on`: an infobox carries no appointment
  date. That is why `national_team_head_coaches` (migration 0045) is not reused, since
  its check demands a date for every named coach.
- **The Editions rows** are `(UCL|UEL|UECL, 2026-27, 1, 1)`. The table's check
  `edition > 1 or first_gw = 1` holds because Gameweek *n* is matchday *n* and `MD1` is
  Gameweek 1, which arrives as Locked history.
- Row-level security is enabled on both new tables, as on every table since migration
  0042.
- **A migration is five filename-list edits across two suites.** Targeted runs never find
  `rehearse-migration.test.ts`, so run it by name.
- **Registry**: the `history` and `headCoaches` unions each gain one name, for the
  365Scores club results and for the Wikipedia club infobox. The three entries use
  neither yet. They are `schedule: "uefa"`, `stats: null`, `history: null`,
  `squadChanges: null`, `headCoaches: null`. Tickets 0101, 0103 and 0104 fill them.

## Acceptance criteria

- [ ] The domain accepts `UCL`, `UEL`, `UECL` and still refuses an unknown code; the six existing codes are unchanged.
- [ ] Both tables exist with the keys and checks above; a `club_head_coaches` row with a coach and no date is accepted.
- [ ] Each cup has exactly one Editions row, Edition 1 from Gameweek 1.
- [ ] Each cup's registry entry exists and names only `uefa`, and the registry test holds the registry against the domain.
- [ ] CONTEXT.md's Competition entry lists nine and states the amended naming rule; its Gameweek entry says what a Gameweek is for a club cup.
- [ ] The migration filename lists in both suites name the new file, and the rehearsal test passes when run by name.
- [ ] Every existing schema, registry and daily-fetch test still passes.
