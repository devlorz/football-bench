# Ticket: The Bundesliga renders

**What to build:** a Bundesliga Fixture builds a complete packet and the site advertises
the league — its Prompt Version frozen at `match-bl1/2026-27-v1` and pinned, its two
divisions curated and admitted by the schema, and its Season's Head Coach article listed.
Source: [opening a Competition](../runbooks/opening-a-competition.md) edits 2, 3, 4 and 7.
Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md)
(one template, one Prompt Version per Competition),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) /
[ADR-0043](../adr/0043-base-rates-xg-rates-and-two-instruction-lines-join-the-restarted-match-versions.md)
(the current template it is born on).

**Blocked by:** 0056 (the suite stops asserting `BL1` has nothing behind it), 0057 (the
transfer windows exist, so the pin is read once and does not move).

**Status:** ready-for-agent

---

## What is already known

**No `retired` block.** Born on the current amended template, like Serie A and Ligue 1, so
there is no v1 to keep whole and the page carries no frozen block at all. A label there
would claim a Gameweek was played under a question nobody asked.

**The divisions entry and the check constraint are one change and neither half is safe
alone.** The migration must hold the two names character for character as the entry writes
them — the second division's is `2. Bundesliga`, period included — and `test/schema.test.ts`
checks the two against each other. The migration is the next number after 0035.

**`competitionName` must equal the top-flight name**, which `test/openrouter-entrant.test.ts`
requires: one packet must not call one league two things.

**The site advertises the league from the freeze, not from the activation.** Routes are
built from the frozen Prompt Version list, so `/bl1` and `/api/bl1/*` exist the moment this
lands and before any row does — the same way Serie A and Ligue 1 appeared, and the reason
the route-enumeration test gains its `BL1` entry here rather than in 0056. The read API
answers with an empty, unscored league; `/overall` keeps it out of the sum until it is both
Active and scored, so nothing there needs an edit.

**The Head Coach article is silent when it is missing.** An unlisted Season article stores
nothing and the packet says the article is not listed — no failure anywhere. The two
leagues before this one each needed their own column names read off the real page rather
than assumed.

**The pin hashes the suite's render, which is built from a literal and reads no database**,
so no later backfill can move it. What moves it is a rendering change — which is why 0057
comes first.

## Acceptance

- [ ] A Bundesliga Fixture renders a complete packet: every section present or stating its
      own absence, and the league table reading "no result has been played yet this
      Season" rather than unavailable.
- [ ] `match-bl1/2026-27-v1` is frozen with its sha read from that render, and the seats
      guard refuses a roster the record disagrees with.
- [ ] The divisions entry and the migration name the same two divisions, and the schema
      test proves it.
- [ ] The Season's Head Coach article is listed and its columns are read off the real page.
- [ ] `/bl1` builds and `/api/bl1/leaderboard` answers an empty league rather than a 404;
      `/overall` still sums only the leagues that are Active and scored.
