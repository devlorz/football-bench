# Ticket: Both leagues render — prompts, divisions, season articles

**What to build:** a Serie A packet and a Ligue 1 packet render under their own frozen
Prompt Versions, differing from the Premier League's rendering by exactly the league's
name — with each league's divisions named, the division check grown to match, and each
league's Season article listed for Head Coach changes. Source:
[spec 0024](../specs/0024-serie-a-and-ligue-1-open.md), stories 1–7 and 16. Decisions:
[ADR-0049](../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md),
[ADR-0042/0043](../adr/) (the current template both leagues inherit from birth).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `MATCH_PROMPTS` gains `SA` (`match-sa/2026-27-v1`, "Serie A") and `FL1`
      (`match-fl1/2026-27-v1`, "Ligue 1"); each rendering equals the Premier League's
      with the league name replaced, `replaceAll`, proven by the existing render test
      extended to both.
- [ ] Each sha is pinned only after its rendering has been read; until the history
      backfill lands, the pinned rendering may state the league table is unavailable, and
      the pin moves once — the same documented move `PD`'s made (spec 0016 ticket 4).
- [ ] The `PL` and `PD` prompt constants are byte-for-byte untouched and their pinned
      hashes unchanged.
- [ ] `DIVISIONS` gains `SA` (`I1` → "Serie A", `I2` → "Serie B") and `FL1` (`F1` →
      "Ligue 1", `F2` → "Ligue 2"); a migration grows the division check to the same
      eight names in the same change, and the schema test holds the two against each
      other.
- [ ] Each entry's top-flight name equals its `MATCH_PROMPTS` competition name, enforced
      by the existing agreement test extended to both leagues.
- [ ] The Season articles for Head Coach changes list "2026–27 Serie A" and "2026–27
      Ligue 1" — en dash, the articles' own titles, verified against the live pages.
- [ ] The migration rehearses green before it touches the live record, and the
      competition-migration runbook's windows are honoured when it does.
