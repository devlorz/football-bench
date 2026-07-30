import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  MATCH_PROMPT_SHA256,
  matchContext
} from "../src/predictions/openrouter-entrant.js";
import { buildMatchContext } from "../src/predictions/build-match-context.js";

describe("the Match Prompt Version", () => {
  test("pins the frozen template and context builder to a reviewed checksum", () => {
    const fixture = {
      fpl_id: 1,
      home_team: "Arsenal",
      away_team: "Coventry City",
      kickoff_at: new Date("2026-08-21T19:00:00Z")
    };
    const context = buildMatchContext(
      fixture,
      {
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
        ]
      }
    );

    expect(
      createHash("sha256").update(context, "utf8").digest("hex")
    ).toBe(MATCH_PROMPT_SHA256);
  });
});
