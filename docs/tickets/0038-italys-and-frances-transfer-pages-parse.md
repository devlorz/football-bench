# Ticket: Italy's and France's transfer pages parse into the packet

**What to build:** the Squad Changes section of the `SA` and `FL1` packets, from each
country's English-Wikipedia transfer list behind curated club maps — with each page's
`format` read off the real page, never guessed. Deliberately off the activation tickets'
blocking path, on spec 0016 ticket 7's precedent: the section may trail into the Season.
Source: [spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 11–15.
Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0031](../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md),
[ADR-0018](../adr/0018-raw-signals-only-in-the-entrant-context.md) (never assert a fact
nobody published).

**Blocked by:** 0033 (the club maps key by the live source's spellings, which the
captures carry).

**Status:** ready-for-agent

- [ ] Each country's summer window is written down with its page title and its `format`
      determined by reading the real page — `{|` under a heading means wikitable, none
      means club-section — and each winter title frozen from the naming convention,
      marked unverifiable until the page exists.
- [ ] A page stating no date or fee stores both null, Spain's way; a page stating them
      stores them, England's way; the loan marker reads only the first clause of prose.
- [ ] Each league's football-data.org → Wikipedia club map is derived from the captured
      response against the page's own section headings — both sets the same size,
      nothing left over — holding article title and displayed name both.
- [ ] Both maps are reviewed and approved by a person before any fetch stores a row.
- [ ] One test per country carries the whole path — the recorded page, through the
      fetch, into the database, out through the context query, into the rendered
      section — including whichever null-date shape the page turned out to have.
- [ ] A fetch for one Competition provably cannot touch another's partition of the same
      Gameweek number.
- [ ] Neither frozen sha moves unless a window gate changes a rendering, and if one
      does, the move is recorded the documented way.
