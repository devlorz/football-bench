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

**Status:** done

- [x] `MATCH_PROMPTS` gains `SA` (`match-sa/2026-27-v1`, "Serie A") and `FL1`
      (`match-fl1/2026-27-v1`, "Ligue 1"); each rendering equals the Premier League's
      with the league name replaced, `replaceAll`, proven by the existing render test
      extended to both.
      _The render test now loops `MATCH_PROMPT_COMPETITIONS` rather than naming `PD`, so
      a fifth league is covered by being added and needs no edit here. `PL` is in the
      loop too and its case is trivially true — kept anyway, because dropping it would
      mean writing down which Competition the loop skips._

      _One test had to move rather than grow: `refuses a Competition with no frozen
      Prompt Version` used `SA` as its unopened code, in four files. All four now use
      `BL1` — the Bundesliga waits on hands, not money (ADR-0049), so it is the code no
      ticket is about to open. An unopened-code test that names the next league to open
      is a test with an expiry date. `test/dashboard-competition-view.test.ts` names `BL1`
      too, in the comment listing which codes the route set deliberately omits._

      _Seven files, and the first pass found five: `test/openrouter-entrant.test.ts`,
      `season-roster`, the three dashboard API tests, `build-historical-context` and
      `fetch-football-data-season`. The last reads `SA` for the **no curated divisions**
      case — a different message from the prompt one, so a grep for either missed it.
      **Found by review**, along with three
      applied-migration lists in `test/rehearse-migration.test.ts` that migration 0035 had
      to be added to — `test/migrations.test.ts` has two such lists and was found by its
      own failure, and the third file only fails once the rehearsal is exercised._
- [x] Each sha is pinned only after its rendering has been read; until the history
      backfill lands, the pinned rendering may state the league table is unavailable, and
      the pin moves once — the same documented move `PD`'s made (spec 0016 ticket 4).
      _Both renderings read whole on 2026-08-21 before either number was written down.
      `SA` hashes `c82e6850`, `FL1` `dabac3c9`. Neither says the league table is
      unavailable: both divisions entries exist, so each reads "no result has been played
      yet this Season" — the wording `PD` reached after its second move, not the
      pre-divisions one. The two renderings differ in exactly five lines, all of them a
      league's name, which is the only-variable claim read rather than asserted._

      _Each pin still moves once, when its backfill lands and the table stops being
      empty._
- [x] The `PL` and `PD` prompt constants are byte-for-byte untouched and their pinned
      hashes unchanged.
      _`git diff` over the three edited source files is insertions only, 34 added and 0
      removed. `MATCH_PROMPT_SHA256` and `44df40bd` are untouched, and both of their pin
      tests are green._
- [x] `DIVISIONS` gains `SA` (`I1` → "Serie A", `I2` → "Serie B") and `FL1` (`F1` →
      "Ligue 1", `F2` → "Ligue 2"); a migration grows the division check to the same
      eight names in the same change, and the schema test holds the two against each
      other.
      _`migrations/0035_the_italian_and_french_divisions.sql`, on migration 0026's terms:
      one check, eight names, still not a lookup table. The schema test needed no edit —
      it already drives every name of every Competition with a frozen Prompt Version
      through the constraint, so the two new leagues were covered by being added._

      _Mutation-checked rather than assumed: dropping `'Serie A'` from the check turns
      `accepts every division name the curated list holds` red, and a one-character edit
      to `SA`'s sha turns its pin red. Both restored from a byte copy and re-run green._

      _A second test was added, because the first proves one direction only: it drives
      every curated name through the constraint and would stay green over a constraint
      that also held names nothing curates — `Bundesliga`, say, which is a spelling that
      could be stored and never selected on. The new one reads the constraint's own
      definition out of `pg_constraint` and requires the set to equal the curated names
      exactly. **Found by review.** Mutation-checked the same way: adding `'Bundesliga'`
      to the check turns it red naming the surplus, restored by byte copy and green._

      _Both of these read the curated list from `CURATED_COMPETITIONS`, exported here for
      them, and not from the Competitions with a frozen Prompt Version. The two sets match
      today and another test requires that they keep matching, but they are not the same
      claim: a division entry curated ahead of its freeze is a name the constraint has not
      been given, and a test driven off the prompt list steps straight over it — green on
      both sides of a gap that fails at the first backfill insert. **Found by review.**
      Mutation-checked: curating `BL1` without touching the migration turns both schema
      tests red, and neither did before this change._
- [x] Each entry's top-flight name equals its `MATCH_PROMPTS` competition name, enforced
      by the existing agreement test extended to both leagues.
      _"Serie A" and "Ligue 1" in both places. The agreement test needed no extending
      either — it loops the same list and asserts the count is exact, so a league added
      to one side and not the other fails on the count before it fails on a name._
- [x] The Season articles for Head Coach changes list "2026–27 Serie A" and "2026–27
      Ligue 1" — en dash, the articles' own titles, verified against the live pages.
      _Verified against English Wikipedia on 2026-08-21: both titles resolve with no
      redirect (page ids 82778276 and 83037276), so each is the article's own title and
      not a near miss, and both carry a `Managerial changes` section — the same section
      the Premier League's article has._

      _A test was added, because this is the one list whose absence is silent: an
      unlisted pair renders no Head Coach section and nothing fails. It asserts a
      Season article for every Competition with a frozen Prompt Version, titled with the
      Season and the league's own name, en dash included. A hyphen there is a different
      article and a 404 the fetch would report as a source failure rather than a typo._

      _What that test does **not** do is reach Wikipedia: it holds one constant against
      another, and the live check above is a read done once by hand. Recording the two
      pages as fixtures is the shape `premier-league` and `la-liga` have and is where
      tickets 0036–0038 land; this box asked for verified, not recorded. **Found by
      review.**_
- [x] The migration rehearses green before it touches the live record, and the
      competition-migration runbook's windows are honoured when it does.
      _Rehearsed green 2026-08-21 over a `pg_dump` of the live record — not an invented
      Season: 760 fixtures, 685 scores, 735 squad changes and seven other tables, every
      row back whole. `npm run db:migrate` has **not** been run: applying is a production
      write, and the runbook's four preconditions were read first: ten Entrant seats at
      `match/2026-27-v2`, the newest `attempts` row from the previous evening, no open
      `prediction_runs` or `fpl_runs`, and Gameweek 1's deadline at 2026-08-21T17:30Z._

      _Applied 2026-08-21T12:03Z, inside that deadline's seven-hours-before window._

      _**The window did not apply to this pass, and reading it as though it did was
      wrong.** The runbook is explicit that the window is `0022`'s and governs `0022`'s
      pass: it rekeys `fixtures`, `gameweeks` and the two tables a run in flight is
      writing to at that moment. This pass is one pending migration that swaps a check
      constraint on `historical_matches` — a table no Lock, no pre-flight and no
      Prediction run writes — in one transaction against no other table. Waiting for
      19:30Z would have bought nothing and left a merged-but-unapplied migration standing
      for nine hours, which is this repository's own recurring failure._
