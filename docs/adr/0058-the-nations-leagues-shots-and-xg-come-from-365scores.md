# The Nations League's shots and xG come from 365Scores

> Amended 2026-09-15 by ticket 0072, the ticket that built this fetch: **a hole is a
> sheet with no xG and both sides' shots still on it** — the recorded Spain–Switzerland
> sheet carries 21 and 11 — so "the packet renders 'no shots or xG stored for this
> Fixture'" below is true only of a settled Fixture that has neither. A hole renders its
> shots beside the "xG unavailable" the other five Competitions already read. Spec 0027
> story 24 ("a settled Fixture with no stored shots or xG") already reads this way; this
> note's own prose did not, and the sentence is what ticket 0073 renders.

**For `UNL`, per-team expected goals, total shots and shots on target are read from
365Scores' web API, and its scores are the second source of results ADR-0056 asks for.**
The Nations League opens on it ([ADR-0057](0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md));
this note records why this source and not the other one that has the same numbers.

## What was found, read 2026-09-14

No documented source publishes xG for national teams at any price this project would
pay: Understat has no international competition, FBref answers a Cloudflare challenge and
its Wayback snapshots of the Nations League pages hold no table, Sofascore answers 403 on
every host and header tried, StatsBomb's open data stops at the Euros, and UEFA's own
match-statistics paths answer 404. Two undocumented feeds carry Opta-grade team xG for
every Nations League match sampled, Leagues A to D, play-offs and Finals alike:

- **FotMob** — `api/data/matchDetails` gives team xG, xGOT, open-play and set-play xG,
  and a per-shot map. Its `robots.txt` says `Disallow: /api/*` for every user agent and
  its footer says "the use of automatic services (robots, crawler, indexing etc.) as well
  as other methods for systematic or regular use is not permitted". A daily fetch is
  systematic and regular use.
- **365Scores** — `webws.365scores.com/web/games/?competitions=7016&startDate=…` lists
  the Fixtures by day with the group named; `web/game/stats/?games=<id>` gives, per
  team, "Expected Goals", "Total Shots", "Shots On Target" and the rest of a match sheet.
  The API host has no `robots.txt`; the terms page is rendered by script and could not be
  read by a program, which is stated here rather than read as permission.

**The two agree.** Eighty matches read from both (matchdays 5–6 of November 2024, the
March 2025 play-offs and quarter-finals, the June 2025 Finals): over the 154 team
readings both held, Pearson r = 0.987, median absolute difference 0.02 xG, 100 of 154
within 0.05, four beyond 0.5 (the largest 0.81, England 5–0 Ireland at 3.87 against
3.06). Total shots agreed exactly in 149 of 154, never by more than one. The same match
sheet, read at different times or lightly re-graded; not two models.

**365Scores has holes.** Three of the eighty — Bulgaria–Belarus, Liechtenstein–San Marino
and Spain–Switzerland, all of 2024-11-18 — return a thirty-eight-row sheet with no xG at
all, on repeated reads. About four per cent, and not confined to the small nations.

## The decision

**365Scores, because the other source has said no.** The benchmark's claim rests on a
record a skeptic can re-derive from sources anyone may read; a source whose published
policy is "do not read this by machine" would put that claim on a footing this project
has refused since ADR-0036. 365Scores has published nothing either way, and that is the
whole of what can be said for it: the risk that it says no later, or moves, or closes,
is accepted and named, and every response is archived in `raw_snapshots` so the numbers
already in the record survive the source.

**Team-level figures only.** Team xG, total shots and shots on target, read from the
match sheet by their English names. Per-shot maps are not summed: FotMob's shot map, the
one read, includes the kicks of a penalty shootout and sums to 5–8 xG for a match that
finished 2–2 in ninety minutes; the lesson is recorded here so the next source's shot
map is not summed either.

**A hole is retried, never filled.** A settled Fixture whose sheet holds no xG is asked
again on every daily fetch until the Season closes, and the packet renders "no shots or
xG stored for this Fixture" in the meantime and, if the source never posts them, for
good. ADR-0050's rule: a row the source has no figure for is not corruption and is not
invented.

**365Scores' scores are the second source of results.** ADR-0056 asks that results have
two sources and shots one; here the source already read for shots also carries the
score, so the Fixture's result from UEFA's feed is checked against it without a third
host. A disagreement is reported, not resolved by preferring either.

**Names are mapped, three of them.** "Ireland", "Turkiye" and "Bosnia & Herzegovina" onto
the UEFA spellings ADR-0057 stores; the other fifty-one match character for character.

## Considered Options

- **FotMob** — the fuller feed, rejected on its stated policy, above. Not "deferred":
  the policy would have to change, not this project.
- **No xG for the Nations League** — the packet would carry results alone, and
  ADR-0043's xG rates would be absent for one Competition of six. Rejected because the
  numbers exist, agree across two readings, and cost twenty-six free requests a
  Gameweek; a Competition read without them would be compared to five read with them.
- **Both sources, one as a check on the other** — rejected: it re-admits the source
  rejected above, and the eighty-match reading already is the check.
- **ESPN's summary endpoint** — shots and possession but no xG. Rejected for xG; not
  needed for results once 365Scores is read.

## Consequences

- **One more undocumented host in the daily fetch**, one request per day for the
  listing and one per settled Fixture for the sheet, 156 sheet reads a Season plus
  retries of holes. The listing needs the dates, which the UEFA feed already supplies.
- **The four-per-cent hole is a structural difference between Competitions**, stated in
  the packet Fixture by Fixture rather than averaged away, and it is the first Competition
  where "no xG for this match" is expected rather than exceptional.
- **A table keyed by source and source match id** holds the readings, so a second source
  for any Competition can land beside them without renaming a column; `understat_match_xg`
  keeps its name and its five leagues.
- **The reading of 2026-09-14 is the baseline.** If 365Scores' numbers drift from what a
  future spot-check against another source shows, this note is where the agreement was
  last measured, and the check is repeatable from the archived responses.
