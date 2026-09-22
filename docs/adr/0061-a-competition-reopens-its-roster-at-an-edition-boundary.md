---
status: proposed
---

# A Competition reopens its roster at an Edition boundary

**A Competition may, once in a Season and by a recorded decision, end the roster it is
playing with at a named Gameweek and open a new one at the next — an Edition. The
Gameweeks already played stay on the record whole, ranked by the roster that played them,
and are shown as the earlier Edition. The Prompt Version does not move; the roster does.**

This was decided on 2026-09-22, twenty-six scored Gameweeks into 2026-27 across the five
leagues, because the operator wants to take some Base Models off the match track and seat
new ones, without throwing away what the first roster produced and without pretending the
new roster played the old Gameweeks. Under ADR-0034 that was not possible: a Season Roster
is irreversible from its first Lock, a Base Model released after 2026-08-19 "does not join
this Season's roster however new it is", and the only doors left were an Exhibition Run
(ADR-0032), which supports no claim of forecasting skill, or waiting for 2027-28. This ADR
narrows ADR-0034's irreversibility from the Season to the Edition and leaves every other
part of it standing inside the Edition.

**This ADR decides the mechanism only. It does not say who leaves, who joins, or why. That
is a second ADR — see *What this ADR does not decide* — and no seat is entered, withdrawn
or pre-flighted under this mechanism until that ADR is accepted.**

## The vocabulary

An **Edition** is an unbroken run of one Competition's Gameweeks within a Season, played by
the roster the decision opening that Edition named (CONTEXT.md). Three things follow from
the definition and are the whole of what the mechanism has to hold:

- **It belongs to a Competition.** The five leagues can be in Edition 2 while the Nations
  League, opening on 2026-09-24 with the seven seats ADR-0060 named, is in its Edition 1 and
  stays there. An Edition number carries nothing across Competitions, which is why the
  Combined Ranking below is per Edition set and not per Season.
- **It is not a Season.** `2026-27` stays `2026-27`; the campaign is the outer scope of every
  identifier and is not renumbered. "Season 1" and "Season 2" are the words the operator
  first reached for and are refused in CONTEXT.md, because a reader of the page would take
  them for `2026-27` and `2027-28`.
- **It is not a restart.** ADR-0042's restart changed the Prompt Version and left the roster
  window open as a side effect. An Edition changes the roster and leaves the Prompt Version
  exactly where it is. Bumping `match/2026-27-v2` to a v3 whose rendered context hashes to
  the same bytes would have recorded a prompt change that never happened; nothing in the
  tests would have refused it (the freeze is a sha256 over the rendered context, pinned per
  version, with no uniqueness check), and the dishonesty would have been in the record, not
  the code.

## The rules

1. **An Edition opens only by an ADR that names its roster and its first Gameweek in
   advance**, per Competition, before that Gameweek's Lock. The five leagues' Edition 2 is
   expected to open at the first league Gameweek after the September international break —
   read from production on 2026-09-22:

   | Competition | Edition 1 scored through | Edition 2 opens at | that Gameweek's Lock |
   | --- | ---: | ---: | --- |
   | BL1 | Gameweek 4 | Gameweek 5 | 2026-10-09T17:00Z |
   | FL1 | Gameweek 5 | Gameweek 6 | 2026-10-09T17:15Z |
   | PD | Gameweek 7 | Gameweek 8 | 2026-10-09T17:30Z |
   | PL | Gameweek 5 | Gameweek 6 | 2026-10-10T10:00Z |
   | SA | Gameweek 5 | Gameweek 6 | 2026-10-10T11:30Z |

   These are the expected boundaries, not set ones. ADR-0054's rule holds — no target
   Gameweek, no hand-set Lock — so if Edition 2 is not ready when a league's next Lock
   arrives, Edition 1 plays that Gameweek and the boundary moves one Gameweek later for that
   league. A Gameweek is never left unpredicted between two Editions. The boundary is what
   the record shows once the second ADR's roster is entered, and it is written down then.
2. **An Edition's roster is irreversible from its first Lock.** ADR-0034's rule, applied to
   the Edition instead of the Season. Changing a roster after that is opening another
   Edition, with another ADR.
3. **The Edition before must have at least one scored Gameweek.** An Edition that never
   played is not an Edition; it is a roster that was corrected before its first Lock, which
   ADR-0034 and ADR-0042 already allow.
4. **A Base Model joins an Edition only if it was released before the date of the ADR that
   opens the Edition**, and only after the two pre-flights ADR-0034 requires — alone as a
   temporary `role = 'exhibition'` row, then the full roster — both before the Edition's
   first Lock. The ADR's date is the cutoff so that the cutoff is read off a decision and not
   computed, and so that a Base Model released the day after the decision cannot be argued
   into an Edition already announced.
5. **The roster size stays what ADR-0034 made load-bearing** unless the opening ADR says
   otherwise and re-derives what depends on it: the complete-case intersection, ADR-0016's
   N−1 comparisons, the concurrency the predict job is sized to.
6. **The FPL track has no Editions.** Its Season Roster stands as ADR-0047 left it and
   `manager_states` is insert-only. A Base Model that leaves the match track at an Edition
   boundary keeps its FPL seat to the end of the Season; a Base Model that joins the match
   track does not join the FPL track in 2026-27. The runbook's "both tracks move together or
   neither moves" forbade one Entrant name covering two Base Models, and that stays
   forbidden; it did not forbid the two tracks seating different Base Models, which ADR-0047
   already established.

## What the record holds

- **The boundary is a row, and the first Edition has one too.** A table of
  (Competition, Season, Edition, first Gameweek), with a row for every Edition including
  each Competition's Edition 1 at Gameweek 1 and the Nations League's Edition 1 at
  Gameweek 1. Presence is the fact, as it is for `competitions`; nothing is inferred from a
  missing row. The Edition's first Lock is not stored, because `gameweeks.deadline_at` of
  its first Gameweek already is, and is immutable once a Fixture locks into it.
- **A seat that plays on keeps its row.** Claude Opus 5's `match/claude-opus-5` holds its
  Edition 1 and Edition 2 Predictions in one row, told apart by Gameweek. No id changes, no
  row is rewritten, and "the earlier Edition is untouched" is true because nothing touches
  it.
- **A seat that leaves is withdrawn.** `models.withdrawn_at`, dated at the Edition's first
  Lock — ADR-0047's representation and ADR-0047's meaning: the row, its attempts, its
  contexts and its Predictions stay where they are, and the seat is no longer on the roster
  the next Lock asks. This is the first use of `withdrawn_at` on the match track, and the
  match predict path today selects seats by `prompt_version` alone and does not read it —
  the same gap ADR-0060 named. Landing the filter is the first ticket under this ADR.
- **A seat that joins is a new row**, entered through `roster:enter` before the Edition's
  first Lock, with `created_at` as its date of entry. Its pre-flight row is a different id,
  as ADR-0034's candidates were.
- **Membership is derived, not listed.** A seat is on Edition N's roster when its
  `created_at` is at or before Edition N's first Lock and its `withdrawn_at` is null or at or
  after that Lock. No per-Edition roster table: the two dates the record already keeps say
  it, and a third place to say it would be a third place to disagree.
- **Every read that selects a Competition's seats by Prompt Version learns the Edition.**
  As of this ADR there are nine such reads and four writes on the match track — the
  dashboard's seat CTE, the predict path's roster and work list, the Gap alert, the scorer's
  expected roster, the pre-flight's count, the roster module's identity check, and the
  retired-Gameweek read — and each one either bounds its Gameweeks by the Edition or filters
  its seats by the two dates, or both. That count is the cost of this decision and is stated
  here so the ticket that pays it is not surprised.

## What the dashboard shows

- **Three views, switchable, all live**: Edition 1 (the five leagues through their
  boundaries), UNL Edition 1 (the cup alone), Edition 2 (the five leagues from their
  boundaries). Every page — leaderboard, Fixtures, Entrant record, `/overall` — exists in
  each view, served by the same API with the Edition as a parameter and the same page code.
  No static snapshot of Edition 1: nothing in it changes after its boundary, so a live read
  equals a snapshot without there being one.
- **The current Edition keeps today's URLs.** `/pl`, `/overall`, `/api/pl/leaderboard` go on
  meaning the Edition now playing, so nothing shared before this ADR breaks. Earlier
  Editions live under a prefix, `/edition-1/pl`, `/api/edition-1/pl/leaderboard`.
- **Every figure is within one Edition.** Season-to-date points, the Comparison Anchor and
  every Paired Difference, the settled-Fixture evidence line and n, the Gap count — all read
  from the Edition's first Gameweek. Spend across the whole Season is still in `attempts`
  and belongs in a report, not on a leaderboard.
- **`/overall` sums an Edition set, not "every Active Competition".** ADR-0051's sentence is
  amended: the Combined Ranking of Edition 2 sums the five leagues' Edition 2 and nothing
  else; the Nations League is not added to any set, because its roster is not either
  league roster's (ADR-0060) and it is its own Edition. UNL Edition 1's `/overall` is its
  leaderboard.
- **An earlier Edition's pages say why they end where they do**, in a frozen sentence that
  names this ADR and the one that opened the next Edition, as a constant in the code
  beside `RETIRED_GAMEWEEK_CAVEAT` and never as a row. The numbers on the label — "Edition 1
  · Gameweek 1–5" — come from the Editions table.
- **An Exhibition Run crosses the boundary as a playing seat does.** Jev's five rows keep
  their ids; a replay of an Edition 2 Gameweek writes into the same row and is read within
  Edition 2, under the caveat ADR-0059 froze.

## What it costs, stated rather than discovered later

- **ADR-0034's wall has a door in it.** The Season Roster was irreversible so that the
  benchmark could not follow the standings. Rule 1 (an ADR, in advance, per Competition)
  and rule 4 (the ADR's date as the cutoff) are what remain of the wall, and they are
  weaker than "never". A reader should assume the next roster change will be argued for
  the way this one was, and the second ADR has to state its reason as plainly as ADR-0060
  stated its own: if the reason is standing, say standing.
- **Edition 2 will be shorter than Edition 1 was long, and every Season-to-date total in
  it starts at zero** on the day the Nations League is at Gameweek 3 and the leagues are at
  Gameweek 5 to 8. The pages will show two n's for months.
- **Selection on the outcome, again.** Whichever Base Models leave, they leave after
  twenty-six scored Gameweeks of their own results, and a reader of Edition 2 should be
  told its field was cut by Edition 1's standings if it was.
- **Nine reads and four writes**, a migration, a prefix in the worker's routes, a
  three-way switcher, and two paid pre-flights before 2026-10-09. The international break
  is what makes that possible; it is not why the boundary is there.
- **The Exhibition door narrows in meaning.** ADR-0032 said a late Base Model's only way in
  is an Exhibition Run. From here it has a second: wait for an Edition. That does not
  change what an Exhibition Run supports — nothing — but it changes what a vendor can ask
  for.

## What this ADR does not decide

> **A second ADR must name Edition 2's roster before anything under this one is used.**
> It has to say: which of the ten leave (and whether they are ADR-0060's three — DeepSeek
> V4 Pro, MiniMax M3, Qwen3.8 Max — or another set), which Base Models join, each one's
> release date against rule 4's cutoff, each one's OpenRouter pin as ADR-0034 read it, the
> Base Model Class mix that results against the three-two-five ADR-0034 seated, the reason
> per seat, and the roster size if it is not ten. Until that ADR is accepted: no
> `withdrawn_at` is stamped on a match seat, no candidate is pre-flighted, no row is
> entered, and the Editions table holds only Edition 1 rows. The operator has not yet
> decided the roster as of this ADR's date.

## Considered options

- **Stop the Season and call the results "Season 1".** The operator's first phrasing.
  Rejected: nothing would have been stopped — the same leagues go on being predicted by a
  different roster — and the label lies about the campaign. Deleting the `competitions`
  rows, the only stop lever today, would also have turned five scored leagues into
  "unopened" pages and dropped them from `/overall`.
- **A restart under new Prompt Versions, as ADR-0042.** The mechanism exists, the roster
  module already seats a restarted Competition beside its retired seats, and the retired
  block is already rendered. Rejected because the prompt is not changing: a version bump
  with an identical rendered context would record a change that did not happen, and the
  retired block is one Gameweek's small table under a ranking, not a dashboard a reader can
  switch to. Extending it to a range would have been the cheaper build and the wrong
  record.
- **A new Season label, `2026-27b` or the like.** Rejected: `SEASON` is `YYYY-YY` by
  validation, every source is fetched by campaign, and a Season is the outer scope of every
  Fixture id.
- **A per-Edition roster table** listing each Edition's seats. Rejected in favour of the
  two dates the record already keeps; a list would be a decision recorded twice.
- **A static build of Edition 1.** Rejected: one API with an Edition parameter is one code
  path, and Edition 1 does not change after its boundary.
- **Open Editions only at international breaks.** Rejected: the break gives time and is not
  a reason, and a rule tied to the calendar would be argued around the first time the
  calendar did not cooperate.
- **Withdraw the three from the leagues mid-Season without an Edition**, as ADR-0060
  considered and refused. Still refused, for ADR-0060's reasons: frozen totals beside moving
  ones, holes in every Paired Difference, half-Season rows in the sum. The Edition is what
  makes a mid-Season roster change readable at all.

## Consequences

- CONTEXT.md gains **Edition**, its Season Roster entry seats "for each of its Editions",
  and Season and Edition each refuse "Season 1 / Season 2".
- ADR-0034 is amended by this ADR: "irreversible from the first Lock" is per Edition;
  the 2026-08-19 arrival cutoff binds Edition 1 and each later Edition has its opening
  ADR's date as its own.
- ADR-0051 is amended: the Combined Ranking sums an Edition set.
- ADR-0060's *What it takes* — "a per-Competition exclusion in the roster module, the
  predict path reading `withdrawn_at`" — is satisfied by the tickets under this ADR; ADR-0060
  itself stands and the Nations League opens as its own Edition 1 with the seven it names.
- The runbook *A new Base Model arrives* gains a fourth door — wait for an Edition — and
  its "both tracks move together" paragraph is reworded to say what it forbids.
- **The second ADR, naming Edition 2's roster, is required before any seat moves.** Tickets
  under this ADR, drafted 2026-09-22: 0082 (the Editions table and its Edition 1 rows),
  0083 (the match track's `withdrawn_at` predicate — needed by ADR-0060 regardless), 0084
  (the Edition through the API's reads and the route prefix), 0085 (the switcher, the
  label and the frozen sentence), 0086 (the runbooks and the amendment notes). Ticket 0081
  seats the Nations League's seven under ADR-0060 and is not an Edition boundary.
