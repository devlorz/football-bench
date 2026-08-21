# Ticket: Serie A's history and xG land behind reviewed maps

**What to build:** the curation and backfill that make the `SA` packet real — one prior
Season (2025-26) of Italian first- and second-division history and one of Understat xG,
behind two identity maps derived from the real feeds and reviewed by a person before any
row lands. Demoable: an `SA` context renders its history, league table, prior-Season
points per game and xG. Source: [spec 0024](../specs/0024-serie-a-and-ligue-1-open.md),
stories 9–10, 12–13, 20–22. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md).

**Blocked by:** 0033 (the captured `SA` response is the source of the live-source
spellings), 0034 (the divisions and the check must exist before the backfill's first
insert).

**Status:** ready-for-agent

- [ ] The Understat league slug for `SA` is listed, and the Understat →
      football-data.co.uk map is derived, not transcribed: every key a title in the real
      Understat feed, every value a `HomeTeam` in the real `I1` file, both sets exactly
      twenty with nothing left over. Keyed by Competition, so a wrong slug resolves
      nothing and raises on the first match.
- [ ] The football-data.org → football-data.co.uk map is derived the same way from the
      captured response — twenty long official names against twenty stored short ones,
      nothing left over on either side.
- [ ] Both maps are reviewed and approved by a person **before** the backfill runs, and
      the review records what it was actually asked to decide — which pairs were
      judgement calls, and what rules a swap out.
- [ ] `HISTORICAL_COMPETITION=SA` backfills 2025-26 `I1` and `I2` history and the
      Understat xG, every response archived under its own source name before anything is
      read from it, and replayable through the archive fetcher.
- [ ] The join rate between xG and stored results is read and recorded, `PD`'s way: a
      mis-mapped club shows as tens of missing joins, and the number is the check.
- [ ] An `SA` packet rendered from the backfilled record shows history, the league
      table and xG; the contamination test extends to prove it holds no other league's
      rows, both directions.
- [ ] `MATCH_PROMPTS.SA`'s sha is re-pinned if the table's rendering moved, the
      documented once.
