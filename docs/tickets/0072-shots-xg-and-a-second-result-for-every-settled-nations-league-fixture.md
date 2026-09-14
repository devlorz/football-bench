# Ticket: Shots, xG and a second result for every settled Nations League Fixture

**What to build:** the morning after a Nations League Fixture settles, the daily fetch
reads its 365Scores match sheet and stores each side's expected goals, total shots and
shots on target against the Fixture; a Fixture whose sheet holds no xG is asked again
every day and renders as "no shots or xG stored for this Fixture" until it does; the
365Scores score is compared with the UEFA result and any disagreement is reported. The
packet's shot lines and xG rates for `UNL` read these rows. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 21–27, 41. Decisions:
[ADR-0058](../adr/0058-the-nations-leagues-shots-and-xg-come-from-365scores.md),
[ADR-0056](../adr/0056-results-have-a-second-source-shots-have-one.md),
[ADR-0050](../adr/0050-a-row-the-source-has-no-result-for-is-not-corruption.md).

**Blocked by:** 0071 — the sheets are looked up by the stored Fixtures' kickoff dates and
joined to them by side and date; 0070 — the team-stats table.

**Status:** ready-for-agent

---

## What is already known

**Two endpoints, no key.** The listing:
`https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&competitions=7016&startDate=DD/MM/YYYY&endDate=DD/MM/YYYY`
answers `games[]` with `id`, `homeCompetitor`/`awayCompetitor` (`id`, `name`), `startTime`
(ISO, UTC), `groupName` ("League A - Group 2"), `statusText`. The sheet:
`…/web/game/stats/?…&games=<id>` answers `statistics[]` rows of `{competitorId, name,
value}` with `"Expected Goals"`, `"Total Shots"`, `"Shots On Target"` among thirty-eight
names — or, for a hole, thirty-eight rows with no `"Expected Goals"` at all. Recorded on
2026-09-14 as `test/fixtures/365scores-UNL-games-2026-09-24-recorded.json.gz`,
`365scores-UNL-games-2025-06-08-recorded.json.gz`,
`365scores-UNL-stats-4444714-portugal-spain-recorded.json.gz` (a full sheet) and
`365scores-UNL-stats-4051269-spain-switzerland-no-xg-recorded.json.gz` (a hole).

**The listing takes the date, so the fetch asks per kickoff date.** For every date the
stored `UNL` schedule has a kickoff on and that is not in the future, one listing read;
for every settled Fixture whose stats row is absent or whose xG is null, one sheet read.
Twenty-six sheets a Gameweek, plus retries of holes until the Season closes.

**Three names differ from the stored spelling**: "Ireland" → "Republic of Ireland",
"Turkiye" → "Türkiye", "Bosnia & Herzegovina" → "Bosnia and Herzegovina". The other
fifty-one match character for character. A listed side outside the map and outside the
fifty-four is refused by name, never skipped.

**Team level only.** The value read is the sheet's own "Expected Goals" per side; no
per-shot map is summed (ADR-0058 records why).

**The second result.** The listing carries each side's score once a game has ended;
compare it with the Fixture's stored result and report a disagreement in the daily
fetch's outcome the way `movedAttachments` are reported. Change neither.

**How far back the listing reaches is not established**: a probe for 2024-09-05 returned
no games while November 2024, March 2025 and June 2025 did. This ticket relies on the
listing only for the current Season, and records what it finds about reach.

## Acceptance

- [ ] The registry names 365Scores as `UNL`'s stats source and the daily fetch reaches
      it for `UNL` alone (daily-fetch seam); a 365Scores failure is a `UNL` failure and
      costs no other Competition.
- [ ] Over the recorded listing and sheets, a settled Fixture gets one team-stats row
      under source `365scores` with both sides' xG, shots and shots on target; a hole
      gets a row with null xG and is read again on the next run; a later full sheet
      fills it (per-source seam).
- [ ] The three-name map resolves the recorded listing's fifty-four sides onto the
      stored names with nothing left over; an unmapped name is refused by name.
- [ ] A disagreement between the 365Scores score and the stored result is reported in
      the run's outcome and changes no row.
- [ ] The `UNL` packet's shot lines and xG rates (ADR-0043) are computed over the
      team-stats table and never over `understat_match_xg` or `historical_matches`; a
      settled Fixture with null xG renders "no shots or xG stored for this Fixture"
      (context seam).
- [ ] Every 365Scores response is archived in `raw_snapshots` under its own source name
      before validation.
