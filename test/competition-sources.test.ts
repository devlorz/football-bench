import { describe, expect, test } from "vitest";
import {
  COMPETITIONS_WITH_SOURCES, sourcesOf
} from "../src/fetch/competition-sources.js";
import { divisionsOf } from "../src/football-data/divisions.js";
import {
  FOOTBALL_DATA_SOURCE
} from "../src/football-data/fetch-season.js";
import { understatTeamNamesOf } from "../src/understat/team-identity.js";
import {
  scores365CompetitionIdOf,
  SCORES_365_SOURCE
} from "../src/365scores/fetch-match-stats.js";
import {
  datasetNameOf,
  INTERNATIONAL_RESULTS_SOURCE
} from "../src/international-results/fetch-results.js";
import {
  transferWindowsOf
} from "../src/squad-changes/transfer-window.js";
import {
  headCoachSource,
  HEAD_COACH_SEASON_ARTICLE_SOURCE
} from "../src/head-coach/head-coach-source.js";
import {
  nationalTeamSectionOf,
  NATIONAL_TEAM_HEAD_COACHES_SOURCE
} from "../src/head-coach/fetch-national-team-head-coaches.js";

/**
 * The registry names sources; the maps behind them decide whether naming one
 * means anything for a given Competition. Split across seven files, they can
 * disagree in a direction the daily-fetch suite cannot see: it lists two
 * Competitions, so `SA`, `BL1` and `FL1` reach no source in any test, and an
 * entry of theirs pointing at a map that has no row for them is a section that
 * renders as a calm absence over a source that was there all along — the
 * failure `docs/runbooks/opening-a-competition.md` exists to count.
 *
 * Driven from the registry's own key set, so a sixth entry is tested the day
 * it is written rather than the day someone remembers this file.
 */
describe("the source registry", () => {
  test("names, for every Competition, only sources that have a map for it",
    () => {
      for (const competition of COMPETITIONS_WITH_SOURCES) {
        const sources = sourcesOf(competition)!;

        // The Season is the one these entries describe. A Season article is
        // the only one of the five maps that is keyed by Season as well as by
        // Competition, so the absence it can produce is "this Season, not
        // listed" rather than "this Competition, never mapped".
        const held = {
          // Two sources under one name here too: a league's history is a
          // division file and a cup's is one CSV of every international ever
          // played (ADR-0057). The dataset needs no per-Competition id and no
          // club map -- the sides it filters by are read off the record's own
          // Fixtures -- so what it has to have a row for is the name it calls
          // the Competition, which every merged line in the packet carries.
          history: sources.history === FOOTBALL_DATA_SOURCE
            ? divisionsOf(competition) !== undefined
            : sources.history === INTERNATIONAL_RESULTS_SOURCE
              ? datasetNameOf(competition) !== undefined
              : null,
          // Two sources under one name, because a cup's shots come from
          // neither of the leagues' (ADR-0058): each is asked for its own map,
          // and an entry naming one while the other has the row would be the
          // drift this file exists to catch.
          stats: sources.stats === "understat"
            ? understatTeamNamesOf(competition) !== undefined
            : sources.stats === SCORES_365_SOURCE
              ? scores365CompetitionIdOf(competition) !== undefined
              : null,
          squadChanges: sources.squadChanges === "wikipedia-transfers"
            ? transferWindowsOf(competition) !== undefined
            : null,
          // Two sources under one name for the fourth time, and the last of
          // the five to grow its second (ticket 0074): a season article is
          // keyed by Season and Competition, and the current list is keyed by
          // the confederation section the Competition's sides are listed
          // under, with its own sides by trigram beside it.
          headCoaches: sources.headCoaches === HEAD_COACH_SEASON_ARTICLE_SOURCE
            ? headCoachSource(competition, "2026-27") !== undefined
            : sources.headCoaches === NATIONAL_TEAM_HEAD_COACHES_SOURCE
              ? nationalTeamSectionOf(competition) !== undefined
              : null
        };

        // `null` for a source the entry does not name, which is a Competition
        // that needs no map and is the state a cup is in for all four. The
        // assertion is written per Competition so a failure names the one that
        // drifted rather than reporting a boolean that came out false.
        //
        // The expectation reads the entry's own `null`s, because since the
        // first cup (ADR-0057) "every entry names all four" is no longer
        // true. It is not therefore a tautology: `held` asks whether *this
        // particular* source has a map, and the expectation only asks whether
        // a source is named — so an entry naming a history source this file
        // has never heard of is a red test rather than a check that quietly
        // stopped being made.
        expect({ competition, ...held }).toEqual({
          competition,
          history: sources.history === null ? null : true,
          stats: sources.stats === null ? null : true,
          squadChanges: sources.squadChanges === null ? null : true,
          headCoaches: sources.headCoaches === null ? null : true
        });
      }
    });

  test("has an entry for every Competition with a frozen Prompt Version",
    async () => {
      // Not the same set as this registry by definition — a Competition may be
      // registered before it is frozen, which is the order ticket 0071 takes —
      // but the other direction is a rule: a Competition with seats is one the
      // scheduler will reach, and reaching it without an entry fails its every
      // day. Imported here rather than at the top because the prompt module is
      // the heavy one, and this is the only test in the file that needs it.
      const { MATCH_PROMPT_COMPETITIONS } =
        await import("../src/predictions/openrouter-entrant.js");

      expect(
        MATCH_PROMPT_COMPETITIONS.filter(
          (competition) => sourcesOf(competition) === undefined
        )
      ).toEqual([]);
    });
});
