# Ticket: Each side's last five internationals, and the date the dataset was read

**What to build:** the `UNL` packet shows, for each side, its five most recent
internationals before the Lock across every competition — World Cup, qualifiers,
friendlies — with the competition named and a neutral venue marked, merged with the
Season's own settled Fixtures from the record so no match appears twice, and one line
stating the date the dataset was last updated. The daily fetch reads the dataset once a
day. Source: [spec 0027](../specs/0027-the-nations-league-opens.md) stories 28–32, 41.
Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(the packet section; the dataset's staleness belongs in what the Entrant reads).

**Blocked by:** 0070 — `international_results`; 0071 — the settled `UNL` Fixtures the
section merges with, and the stored spelling the dataset's names map onto.

**Status:** ready-for-agent

---

## What is already known

**The dataset.**
`https://raw.githubusercontent.com/martj42/international_results/master/results.csv`,
one CSV: `date, home_team, away_team, home_score, away_score, tournament, city, country,
neutral`. Every men's international since 1872; 658 "UEFA Nations League" rows through
the June 2025 Finals; the whole 2026 World Cup (104 rows); latest row 2026-08-26.
Commits land roughly monthly (2026-07-19, 07-31, 08-26). Recorded on 2026-09-14 as
`test/fixtures/martj42-international-results-2026-08-26-recorded.csv.gz`.

**Two names differ from the stored spelling**: "Czech Republic" → "Czechia", "Turkey" →
"Türkiye". A row naming one of the fifty-four under any other spelling is refused by
name; rows for sides outside the fifty-four are simply not stored.

**Store from 2024-06-01 forward, for the fifty-four sides only.** Keyed by date and the
two sides. The read is idempotent: every daily fetch re-reads the file and upserts.
The file's latest row date is what the packet prints; where it is kept (the snapshot's
metadata, or one row) is this ticket's call, the least code that survives a dry run.

**The section.** Per side, the five latest rows before the Lock, newest first, each
line: date, opponent, home/away/neutral, score, tournament. Merged with the Season's
settled `UNL` Fixtures from the record (which the dataset will lag by up to a month),
deduplicated on date and sides. One trailing line: "dataset last updated 2026-08-26".
The section is present and empty ("no international stored for this side") for a side
with no rows; it is absent for a Competition whose registry names no history source,
so no league packet grows it.

**The base rates of ADR-0043** for `UNL` are computed over `international_results` and
never over `historical_matches`.

## Acceptance

- [ ] The registry names the dataset as `UNL`'s history source; the daily fetch reads
      it for `UNL` alone and archives the body (daily-fetch seam).
- [ ] Over the recorded CSV, `international_results` holds every row from 2024-06-01
      for the fifty-four sides and nothing else; the two-name map resolves with nothing
      left over; an unmapped spelling of one of the fifty-four is refused by name.
- [ ] The after-first-deadline guard, reading the registry, asks `international_results`
      for `UNL` and never `historical_matches`; a `UNL` with no stored rows after its
      Gameweek 1 deadline fails by name.
- [ ] The `UNL` packet renders each side's five latest internationals before the Lock,
      merged with settled `UNL` Fixtures without duplicates, followed by the
      dataset-date line (context seam); a `PL` packet does not grow the section.
- [ ] Base rates for `UNL` are computed over `international_results`.
- [ ] The contamination test holds in both directions: no `UNL` row in a league packet,
      no league row in a `UNL` packet.
