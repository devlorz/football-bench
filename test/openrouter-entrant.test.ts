import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  ENTRANT_MAX_OUTPUT_TOKENS,
  MATCH_PROMPT_COMPETITIONS,
  MATCH_PROMPT_SHA256,
  matchContext,
  matchPromptOf,
  openRouterRequest
} from "../src/predictions/openrouter-entrant.js";
import { divisionsOf } from "../src/football-data/divisions.js";
import { headCoachSource } from "../src/head-coach/head-coach-source.js";
import {
  buildMatchContext,
  type MatchContextData
} from "../src/predictions/build-match-context.js";

const FIXTURE = {
  fixture_id: 1,
  home_team: "Arsenal",
  away_team: "Coventry City",
  kickoff_at: new Date("2026-08-21T19:00:00Z")
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

/**
 * One packet's worth of facts, rendered under whichever Competition is asked
 * for. Shared between the two frozen hashes below on purpose: what differs
 * between a Competition's rendering and the Premier League's has to be the
 * Competition, and it cannot be if the inputs differ too.
 */
const contextData = (competition: string): MatchContextData => ({
  competition,
  season: "2026-27",
  deadline: new Date("2026-08-21T17:30:00Z"),
  // Between them these four span every way a form line can render, so
  // the pinned hash moves if the shots or xG formatting changes -- not
  // only if the template or the builder's overall shape does.
  historicalMatches: [
    {
      // Shots and xG both present.
      season: "2025-26",
      division: "Premier League",
      played_on: new Date("2026-05-01T00:00:00Z"),
      home_team: "Arsenal",
      away_team: "Everton",
      home_goals: 3,
      away_goals: 1,
      home_shots: 15,
      away_shots: 8,
      home_shots_on_target: 7,
      away_shots_on_target: 3,
      home_xg: 2.1,
      away_xg: 0.85
    },
    {
      // Full data with Arsenal away, pinning the home-team-first
      // ordering against the scoreline beside it.
      season: "2026-27",
      division: "Premier League",
      played_on: new Date("2026-08-10T00:00:00Z"),
      home_team: "Fulham",
      away_team: "Arsenal",
      home_goals: 0,
      away_goals: 2,
      home_shots: 9,
      away_shots: 17,
      home_shots_on_target: 2,
      away_shots_on_target: 6,
      home_xg: 0.64,
      away_xg: 1.9
    },
    {
      // Neither signal: the shot segment is dropped, not zeroed, and the
      // line still states the xG gap outright.
      season: "2024-25",
      division: "Championship",
      played_on: new Date("2025-05-02T00:00:00Z"),
      home_team: "Coventry",
      away_team: "Stoke",
      home_goals: 1,
      away_goals: 1
    },
    {
      // Shots without xG -- the ordinary Championship case, where
      // football-data carries shots and Understat covers no such match.
      season: "2025-26",
      division: "Championship",
      played_on: new Date("2026-05-02T00:00:00Z"),
      home_team: "Coventry",
      away_team: "Hull",
      home_goals: 2,
      away_goals: 0,
      home_shots: 19,
      away_shots: 6,
      home_shots_on_target: 8,
      away_shots_on_target: 2
    }
  ],
  fplPlayers: [
    {
      fpl_id: 12,
      team_name: "Arsenal",
      web_name: "Saka",
      position: "MID",
      price_tenths: 95,
      status: "a",
      chance_of_playing_next_round: null,
      news: "",
      news_added: null
    },
    {
      fpl_id: 5,
      team_name: "Arsenal",
      web_name: "J.Timber",
      position: "DEF",
      price_tenths: 65,
      status: "i",
      chance_of_playing_next_round: 0,
      news: "Groin injury - Expected back 21 Aug",
      news_added: new Date("2026-07-23T12:01:23.272Z")
    },
    {
      fpl_id: 200,
      team_name: "Coventry City",
      web_name: "Coventry Player",
      position: "FWD",
      price_tenths: 60,
      status: "a",
      chance_of_playing_next_round: null,
      news: "",
      news_added: null
    }
  ],
  // An amount, a fee stated in words and a loan, against a club with no
  // movement at all: between them every shape the section can take, so
  // the pinned hash moves if any of them is reformatted.
  squadChanges: [
    {
      club: "Arsenal",
      direction: "in" as const,
      player: "Signed Player",
      counterpart_club: "Newcastle United",
      fee: "£92.5m",
      loan: false,
      dated_on: new Date("2026-07-06T00:00:00Z")
    },
    {
      club: "Arsenal",
      direction: "in" as const,
      player: "Free Player",
      counterpart_club: "Burnley",
      fee: "Free",
      loan: false,
      dated_on: new Date("2026-07-01T00:00:00Z")
    },
    {
      club: "Arsenal",
      direction: "out" as const,
      player: "Loaned Player",
      counterpart_club: "Hull City",
      fee: null,
      loan: true,
      dated_on: new Date("2026-08-01T00:00:00Z")
    }
  ],
  // A departure with its manner, the arrival that answered it, a second
  // vacancy nobody has filled, and an appointment dated after the deadline
  // that the render must not reach -- against an away club that kept its Head
  // Coach and so costs no line. Between them every shape this section can
  // take, so the pinned hash moves if any of them is reformatted or if the
  // bound stops holding.
  headCoachChanges: [
    {
      club: "Arsenal",
      direction: "out" as const,
      head_coach: "Departed Coach",
      manner: "Sacked",
      dated_on: "2026-05-30"
    },
    {
      club: "Arsenal",
      direction: "in" as const,
      head_coach: "Arrived Coach",
      manner: null,
      dated_on: "2026-06-04"
    },
    {
      club: "Arsenal",
      direction: "out" as const,
      head_coach: "Interim Coach",
      manner: "End of interim spell",
      dated_on: "2026-08-10"
    },
    {
      club: "Arsenal",
      direction: "in" as const,
      head_coach: "Unseen Coach",
      manner: null,
      dated_on: "2026-09-01"
    }
  ],
  // The home club's incumbent, and an away club whose only stored row was
  // observed after the deadline -- so the render carries both a name and the
  // announced Gap, and the pinned hash moves if either sentence is reworded or
  // if the observed bound stops holding.
  headCoaches: [
    {
      club: "Arsenal",
      head_coach: "Arrived Coach",
      observed_at: new Date("2026-08-21T06:00:00Z")
    },
    {
      club: "Coventry City",
      head_coach: "Unseen Coach",
      observed_at: new Date("2026-08-21T18:00:00Z")
    }
  ]
});

describe("the Match Prompt Version", () => {
  test("pins the frozen template and context builder to a reviewed checksum",
    () => {
      expect(sha256(buildMatchContext(FIXTURE, contextData("PL"))))
        .toBe(MATCH_PROMPT_SHA256);
    });

  // The same mechanism, over La Liga's rendering of the same facts: no
  // availability section (ADR-0037), and a league table that reads "no result
  // has been played yet this Season" rather than one that states it is
  // unavailable. Read off `matchPromptOf` rather than a constant of its own,
  // because which version La Liga stands on is the thing that moves: this pin
  // is `match-pd/2026-27-v2`'s, taken from this suite's own render and not
  // from a real one -- production has no `head_coaches` to render the section
  // from, and the constant's doc block carries what closes that. Its v1 was
  // used -- Gameweek 1, six contexts and sixty
  // Predictions -- and is retired unamendable (ADR-0042), so this is a new
  // version being frozen and not a frozen prompt changing.
  // Serie A and Ligue 1 join it on the same terms, born on the current
  // template: both pins were read before they were written -- each rendering
  // names its own league in every line that names one, and each states no
  // result has been played yet this Season rather than that the table is
  // unavailable -- and each moves once when its history backfill lands.
  test.each(MATCH_PROMPT_COMPETITIONS)(
    "pins %s's own rendering under its own Prompt Version",
    (competition) => {
      expect(sha256(buildMatchContext(FIXTURE, contextData(competition))))
        .toBe(matchPromptOf(competition).sha256);
    });

  // Story 38: the only-variable claim, checked mechanically rather than read
  // off two constants that happen to look alike. The history is one literal
  // for every rendering so that the template is the only thing under test.
  test("renders per Competition differing by exactly the Competition name",
    () => {
      const history = "Recent form: no matches on record.";

      // `replaceAll`, not `replace`: the claim is that the league's name is
      // the variable wherever it appears, and replacing the first occurrence
      // only would still pass a template that named the league twice.
      for (const competition of MATCH_PROMPT_COMPETITIONS) {
        expect(matchContext(FIXTURE, history, competition)).toBe(
          matchContext(FIXTURE, history, "PL")
            .replaceAll(
              "Premier League",
              matchPromptOf(competition).competitionName
            )
        );
      }
      expect(matchContext(FIXTURE, history, "PL"))
        .toContain("Predict this Premier League Fixture.");
    });

  // Two sources render a Competition's name into one packet: the prompt's
  // opening line from `MATCH_PROMPTS`, and the division headings from
  // `DIVISIONS`. Today they agree on "Premier League" and the split is
  // invisible. Ticket 6 is where it can bite — Spanish divisions named
  // "LaLiga" or "Primera División" would have one packet calling one league
  // two things, with the frozen sha holding the disagreement in place.
  // Cheaper to fail here than to freeze it. **Found by review.**
  test("names a Competition the same way its divisions do", () => {
    const named = MATCH_PROMPT_COMPETITIONS
      .map((competition) => ({
        competition,
        prompt: matchPromptOf(competition).competitionName,
        division: divisionsOf(competition)?.[0].name
      }))
      .filter(({ division }) => division !== undefined);

    // Every Competition with a frozen Prompt Version now has divisions, so the
    // count is exact rather than merely non-zero: `toBeGreaterThan(0)` stayed
    // green if `DIVISIONS.PD` were deleted, which is the edit this test is
    // here to refuse. A Competition legitimately awaiting curation moves this
    // number and should have to say so. **Found by review.**
    expect(named.length).toBe(MATCH_PROMPT_COMPETITIONS.length);
    for (const { competition, prompt, division } of named) {
      expect([competition, prompt]).toEqual([competition, division]);
    }
  });

  // The third list a Competition has to appear in before its packet is whole,
  // and the only one whose absence is silent: an unlisted pair renders no Head
  // Coach section and nothing fails. The en dash is asserted because a hyphen
  // there is a different article title and a 404 the fetch reports as a source
  // failure rather than as a typo -- the module's own docblock says to read it
  // twice, which is a thing a test can do every run instead.
  //
  // The title is written as the Season and the league's own name because all
  // four articles are titled that way, not because Wikipedia promises it. A
  // league whose article is titled otherwise fails here and is written out as
  // the exception it is, which is the outcome wanted -- an unread title is how
  // this list goes wrong.
  test("lists a Season article for every Competition, en dash and all", () => {
    for (const competition of MATCH_PROMPT_COMPETITIONS) {
      const article = headCoachSource(competition, "2026-27");
      expect([competition, article?.page]).toEqual([
        competition,
        `2026–27 ${matchPromptOf(competition).competitionName}`
      ]);
    }
  });

  // ADR-0043's two sentences, verbatim and beside the shape rules they
  // qualify: the rules above say what the JSON must look like, these two say
  // what `score` means and by what rule the probabilities are judged. A
  // drifted word is a different question asked of every seat, so the strings
  // are asserted whole.
  test("closes with the two instruction sentences ADR-0043 fixes", () => {
    expect(matchContext(FIXTURE, "Recent form: no matches on record.", "PL"))
      .toContain([
        "Probabilities must each be between 0 and 1 and sum to 1. "
          + "Goals must be non-negative integers.",
        "score is the exact final scoreline you judge most likely — not "
          + "expected goals rounded.",
        "Probabilities are scored with the ranked probability score over the "
          + "ordered outcomes Home, Draw, Away; lower is better."
      ].join("\n"));
  });

  // `BL1`, because it is the code migration 0022's domain holds that no ticket
  // has opened: the Bundesliga waits on hands, not money (ADR-0049). This test
  // named `SA` until Serie A was opened, which is the drift a real unlisted
  // code avoids.
  test("refuses a Competition with no frozen Prompt Version", () => {
    expect(() => matchContext(FIXTURE, "", "BL1"))
      .toThrow("Competition BL1 has no frozen Prompt Version");
  });
});

describe("what a call says it will pay for", () => {
  const bodyOf = (): { max_tokens?: number } =>
    JSON.parse(openRouterRequest(
      "key",
      { baseModel: "deepseek/v4-pro", provider: "DeepSeek", quantization: null },
      "Who wins?"
    ).body!) as { max_tokens?: number };

  // The literal, not the constant: a request whose ceiling moved is a request
  // priced differently by the provider, and it should not move without this
  // line and the report behind it moving too.
  test("names 32,000 output tokens on the wire, so the provider prices the "
    + "request by that rather than by the Base Model's own maximum", () => {
    expect(bodyOf().max_tokens).toBe(32_000);
    expect(ENTRANT_MAX_OUTPUT_TOKENS).toBe(32_000);
  });

  // The 402s came from a ceiling nobody set; a ceiling set too low truncates a
  // legitimate answer instead, which is the same Gap by another route. 6,138 is
  // the longest completion any seat finished on 2026-08-20 (report of that day).
  test("clears the longest answer any seat has been seen to finish", () => {
    expect(ENTRANT_MAX_OUTPUT_TOKENS).toBeGreaterThan(6_138);
  });
});
