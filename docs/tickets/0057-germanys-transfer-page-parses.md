# Ticket: Germany's transfer page parses

**What to build:** the Bundesliga's Squad Changes, end to end — the country's two transfer
windows written down with their page titles and their format, the eighteen clubs mapped to
their Wikipedia identities, and the real archived page parsed into stored rows. Source:
[opening a Competition](../runbooks/opening-a-competition.md) edit 6 and §4. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0031](../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md).

First, and not last, because writing a Competition's windows down opens the Squad Changes
gate and changes what its packet renders. Landing this after ticket 0058 moves a pinned
sha that has no reason to move.

**Blocked by:** None — can start immediately.

**Status:** done — every box green, the map's two judgement calls approved 2026-08-27. No
fetch has stored a row anywhere yet, and none can: `BL1` has no `competitions` row until
0060 activates it.

---

## What is already known

**The format is unknown and is not guessable from the title.** The runbook records three
shapes across four countries: England's two wikitables (`twoTables`), Italy's one
(`oneTable`) with loans stated in the fee column, and Spain's and France's club sections of
`{{fs player}}` lists with no date and no fee anywhere on the page (`clubSections`).
Germany is the fifth country and may be a fourth shape. Read the page before writing the
window down: look for `{|` under a heading — none means club sections; one or more means
count the tables.

Every previous country also brought page furniture that was a silent refusal until the
reader was widened — Italy's `{{dts}}` dates and `{{Sort}}` names, France's bare-text club
headings that made the *displayed* name the identity. Assume Germany brings its own and
find it on the archived bytes, not in production.

**The club map is derived, not transcribed.** Its keys are the roster spelling `fixtures`
carries, which for every Competition but the Premier League is football-data.org's long
official name. Both sets — the live source's eighteen team names and the page's own club
section headings — must come out the same size with nothing left over on either side.
**Eighteen, not twenty**, and a reviewer should know that before they read the map.

**The window dates are two frozen dates and a page title per window, not curation**, read
off the page's own lead where it states them. England's, Spain's and Italy's do; France's
does not, and its dates came from the LFP's announcement instead. If Germany's lead is
silent, the DFL's own announcement is the source, and which one was used is written down
beside the dates.

The winter page for a Season does not exist in August. Its title is frozen from the naming
convention the previous editions used and is not verifiable until it is created — the same
standing gap the other four carry.

## Acceptance

- [x] The two windows are registered with their page titles, their frozen dates, the
      source each date was read from, and a `format` that matches what the page actually
      is.

      _The real page was fetched before anything was written down:
      `en.wikipedia.org/w/index.php?title=List_of_German_football_transfers_summer_2026&action=raw`,
      277,407 bytes / 275,754 characters, sha256 `0c34450d…`. It carries no `{|` anywhere —
      zero wikitable markers — and 72 `{{fs start}}`/`{{fs end}}` lists under 36 bare-text
      `===Club===` headings, eighteen under `==Bundesliga==` and eighteen under
      `==2. Bundesliga==`. So Germany is Spain's and France's shape, not a fourth one:
      `format: "clubSections"`, and it needed no parser change at all — the reader already
      widened for France's bare headings and multi-clause loan prose read all 319 Bundesliga
      rows on the first run._

      _Germany's page states no window dates either, exactly as France's does not — its lead
      names only which two divisions are listed. Unlike France, only the **summer** window
      has an archivable announcement behind it; the winter window is customary, on the same
      terms as England's, Spain's and Italy's, because no equivalent announcement for it
      could be found and archived the way the summer one could._

      | Window | Opens | Closes | `since` | Read off |
      | --- | --- | --- | --- | --- |
      | `germany-summer-2026` | 1 Jul 2026 | 31 Aug 2026 | 2 Feb 2026 | `bundesliga.com`'s "Official Bundesliga transfer centre: Summer 2026" article, archived as `test/fixtures/bundesliga-transfer-centre-summer-2026.html.gz` — "The Bundesliga's summer transfer window is open from 1 July to 31 August 2026."; `since` from the "January 2026" article, archived alongside it — "The Bundesliga's winter transfer window closed at 8pm CET on Monday, 2 February." |
      | `germany-winter-2026-27` | 1 Jan 2027 | 2 Feb 2027 | 31 Aug 2026 | customary — no `bundesliga.com` article for winter 2026-27 exists yet to archive, so this follows the same convention England's, Spain's and Italy's winters do rather than an announcement |

      _A first pass dated the summer close 1 September and the winter window 1-31 January,
      each sourced to a search-engine paraphrase of a DFL tweet rather than to a page this
      session actually fetched and could archive — `test/fetch-squad-changes.test.ts`'s own
      standing rule for this pipeline ("every other source in this pipeline is archived")
      caught it. **Found by review.** Both numbers are corrected above to what the two
      archived `bundesliga.com` pages actually state, and the winter window is now customary
      rather than a second unverifiable announcement. The winter page itself does not exist
      yet: `List of German football transfers winter 2026–27` answered **404** on
      2026-08-27, the same standing gap the other four countries' winter pages carry._

- [x] The eighteen-club map is derived from the live source's names against the page's own
      headings, both sets the same size with nothing left over, and is reviewed by a person
      before anything reads it.

      _Captured live from `api.football-data.org/v4/competitions/BL1/matches?season=2026`
      on 2026-08-27 — 291,567 bytes, 306 matches, confirming ADR-0054's count exactly
      (18 clubs, first kickoff 2026-08-28T18:30Z) — and archived as
      `test/fixtures/football-data-org-2026-27-BL1-recorded.json.gz`. Both sets, asserted in
      `test/fetch-squad-changes.test.ts`, are eighteen with nothing left over:_

      _**football-data.org's eighteen:** 1. FC Köln, 1. FC Union Berlin, 1. FSV Mainz 05,
      Bayer 04 Leverkusen, Borussia Dortmund, Borussia Mönchengladbach, Eintracht Frankfurt,
      FC Augsburg, FC Bayern München, FC Schalke 04, Hamburger SV, RB Leipzig, SC Freiburg,
      SC Paderborn 07, SV 07 Elversberg, SV Werder Bremen, TSG 1899 Hoffenheim,
      VfB Stuttgart._

      _The page heads its eighteen Bundesliga sections in bare text — `===Schalke 04===` —
      exactly as France's does and every Spanish winter edition, so the **displayed name**
      is what resolves a club here, and it is the page's own shorthand in nine of the
      eighteen cases: `Union Berlin`, `Mainz 05`, `Bayer Leverkusen`, `Bayern Munich`,
      `Schalke 04`, `SC Paderborn`, `SV Elversberg`, `Werder Bremen`, `TSG Hoffenheim`. Every
      one of those nine was confirmed rather than guessed, by finding the page's own link to
      the club elsewhere on the page (a counterpart cell, a reserve-side mention, a loan
      destination) — `[[1. FC Union Berlin|Union Berlin]]`, `[[1. FSV Mainz 05|Mainz 05]]`,
      `[[Bayer 04 Leverkusen|Bayer Leverkusen]]`, `[[FC Bayern Munich|Bayern Munich]]`,
      `[[FC Schalke 04|Schalke 04]]`, `[[SC Paderborn 07|SC Paderborn]]`,
      `[[SV Werder Bremen|Werder Bremen]]`, `[[TSG 1899 Hoffenheim|TSG Hoffenheim]]`, and a
      bare `[[SV Elversberg]]` for the live source's `SV 07 Elversberg`.

      **Two judgement calls, approved 2026-08-27:** sixteen of the eighteen `article`s
      are the live source's own spelling outright. The two that are not are the same two
      the `name`s above needed a link to confirm — `FC Bayern München` links as `FC Bayern
      Munich`, English Wikipedia's article title rather than the German name, and
      `SV 07 Elversberg` links as `SV Elversberg`, the page dropping the "07" every other
      mention of the club on the page also drops. Neither is ambiguous against another club:
      `FC Bayern München` and `Bayer 04 Leverkusen` do share "Bayer" as a prefix, but neither
      is ever written bare — the heading is `Bayern Munich` or `Bayer Leverkusen`, always
      with its own disambiguating word — and no other club is any spelling of Elversberg._

      _No fetch has stored a row, and none can yet: `BL1` has no `competitions` row and no
      `gameweeks` row until 0060 activates it, so `fetchSquadChanges` would find no upcoming
      Gameweek to file a partition under even if it ran._

- [x] A real archived snapshot of the page parses into stored rows: arrivals and
      departures both, loans stored as loans, and a null fee where the page states none.

      _Committed as the bytes `fetch().text()` would return —
      `test/fixtures/wikipedia-transfers-germany-summer-2026.txt.gz`, sha256
      `0c34450d253299a69966fe20adfd278b5a3bcaf4a930b4d5462cc6bac8c451fa`, re-checked by the
      test before every read the way the other four countries' fixtures are. Parsed, it
      holds **319** Bundesliga rows across the eighteen clubs (12 to 26 per club), both
      arrivals and departures, both null the whole way down — this shape carries no date and
      no fee anywhere on the page, exactly like Spain's and France's._

      _`test/fetch-squad-changes.test.ts` carries the whole path once, in
      `describe("fetching a fifth Competition's Squad Changes")`: the recorded page, through
      `fetchSquadChanges`, into `squad_changes` under `BL1`'s own Gameweek 1 (the real
      2026-08-28T17:00Z deadline ADR-0054 read), with Felipe Chávez's Bayern-to-Magdeburg
      loan asserted as the stored row — direction `out`, fee `null`, `loan` `true`. A second
      test proves a `BL1` fetch cannot touch the Premier League's Gameweek 1 partition of the
      same number, on the same pattern the other four Competitions are already checked
      against._

      _The parser needed no widening: the intra-league moves (Rocco Reitz,
      Mönchengladbach→RB Leipzig), the loan/non-loan prose ambiguity ("to Hannover 96,
      previously on loan" stores as a permanent departure; "on loan to 1. FC Magdeburg,
      previously on loan at 1. FC Köln" stores as a loan), and the second-division sections
      sharing the page (`==2. Bundesliga==`, skipped, with a club relegated out of the map
      failing loudly rather than rendering as one that stood still) all read correctly on
      the first run — every one of these is the same shape France's page already proved the
      reader against._

      _The "displayed names are exactly the page's own section headings" check was written
      once as a standalone Ligue 1 test and once again, nearly verbatim, as a standalone
      Germany one — every other test in that `describe` block is a `test.each` row.
      **Found by review**, and merged into one `test.each(["FL1", ..., "BL1", ...])` row
      instead of two copies that would drift the next time either page changed shape._

- [x] If the page needs a fourth format or a widened reader, the shape is added to the
      runbook's §4 alongside the three already there.

      _It needed neither. Germany is Spain's and France's `clubSections` shape — no
      wikitable anywhere on the page — and every piece of page furniture it carries (bare
      headings, multi-clause loan prose, a second division sharing the page) is a shape the
      reader was already widened for. No new format entry was added to §4; this ticket is
      the confirmation that the fourth format spec 0054 warned might exist did not turn out
      to be needed. §4's prose did move — "for any of the four" now reads "the five", and
      the paragraph on countries whose page states no dates now names Germany beside France
      and explains why only France's winter is announced rather than customary — an
      incidental correction landing a fifth country forces on text that counted to four,
      not a new shape._

## Mutation checks

Each mutation was applied to the source, the file confirmed changed, the suite run, and
the source restored from a byte copy taken before the run — never `git checkout`.

| Mutation | Result |
| --- | --- |
| `FC Bayern München`'s article changed to the German spelling | 2 red |
| `SV 07 Elversberg`'s displayed name changed to the live source's own spelling | 8 red |
| `germany-summer-2026`'s `opensOn` pushed to October | 2 red |
| `germany-summer-2026`'s `closesOn` reverted to the unarchived 1 September date | 1 red |
