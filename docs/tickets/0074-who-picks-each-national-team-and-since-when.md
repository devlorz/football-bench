# Ticket: Who picks each national team, and since when

**What to build:** the `UNL` packet names each side's head coach and the date they
assumed the role, and shows a Head Coach Change when two daily snapshots of the source
disagree. The daily fetch archives Wikipedia's current-managers list each day and parses
its UEFA table. Source: [spec 0027](../specs/0027-the-nations-league-opens.md) stories
33–37. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(the packet section), [ADR-0045](../adr/0045-the-packet-names-who-picks-each-team-not-only-who-changed.md).

**Blocked by:** 0071 — the fifty-four-entry trigram map is derived from the recorded
UEFA feed's `countryCode` against the stored names, and there is nothing to attach a
coach to until Fixtures carry those names.

**Status:** ready-for-agent

---

## What is already known

**The page.** `List of current national association football team managers`, raw
wikitext, one `==UEFA==` section holding a `wikitable sortable` of fifty-five rows:
`| {{fb|ALB}}`, then the manager cell (`{{flagicon|ITA}} [[Rolando Maran]]` with a
`data-sort-value`), then `{{dts|format=dmy|19 May 2026}}`, then references. Recorded on
2026-09-14 as `test/fixtures/wikipedia-current-national-team-managers-2026-09-14-recorded.wikitext.gz`.
It is a *current* list: a change is an edit, not a row in a changes table, so a Change is
the difference between two archived snapshots and is visible only from the first
snapshot stored.

**This is a different parser and a different store from the Season-article one.** The
league builder reads a managerial-changes table per Season and a current-holders list;
this reads one holder per side with an assumption date. Reuse the existing
`head_coaches`/`head_coach_changes` tables if their shape fits a side with no Division;
otherwise one small table keyed by side and observed date. Do not extend the
Season-article parser with a fourth country shape — this is a fourth *page* shape, and
[the runbook](../runbooks/opening-a-competition.md) records what happened last time a
shape was guessed.

**Trigrams to stored names.** The table keys sides by FIFA trigram; UEFA's feed carries
`countryCode` on every side. Derive the fifty-four-entry map from the recorded feed
against the stored names and require both sets the same size with nothing left over;
the fifty-fifth UEFA member (not in this Season's Nations League) is expected to be the
one row left on the page's side. A trigram on the page that maps to none of the
fifty-four is refused by name.

**Vacancies.** A row whose manager cell names no person renders as vacant, never as the
previous holder.

**The section.** For each side: the coach and "since <date>"; below it, a Change when
the latest snapshot's holder differs from the previous snapshot's, dated by the day it
was first observed. Absent for a Competition whose registry names no head-coach source.

## Acceptance

- [ ] The registry names the Wikipedia managers list as `UNL`'s head-coach source; the
      daily fetch reads and archives it for `UNL` alone (daily-fetch seam).
- [ ] Over the recorded wikitext, the parser yields one holder and one assumption date
      for each of the fifty-four sides, and a vacancy renders as vacant (per-source seam,
      with a hand-edited vacancy case).
- [ ] The trigram map is derived from the recorded UEFA feed and reviewed; a page row
      outside it is refused by name.
- [ ] Two snapshots that disagree on a side yield one Head Coach Change dated by the
      later snapshot; two that agree yield none.
- [ ] The `UNL` packet names each side's coach and date, and a Change when there is
      one; a league packet does not grow the section (context seam).
