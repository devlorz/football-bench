import { describe, expect, test } from "vitest";
import {
  buildFplContext,
  type FplPlayer
} from "../src/context/build-fpl-context.js";

describe("building FPL-derived Match context", () => {
  test("shows the five highest-priced players and every absence explicitly", () => {
    const players: FplPlayer[] = [
      {
        fpl_id: 12, team_name: "Arsenal", web_name: "Saka",
        position: "MID", price_tenths: 95, status: "a",
        chance_of_playing_next_round: null, news: "", news_added: null
      },
      {
        fpl_id: 4, team_name: "Arsenal", web_name: "Gabriel",
        position: "DEF", price_tenths: 80, status: "a",
        chance_of_playing_next_round: null, news: "", news_added: null
      },
      {
        fpl_id: 13, team_name: "Arsenal", web_name: "Rice",
        position: "MID", price_tenths: 75, status: "a",
        chance_of_playing_next_round: null, news: "", news_added: null
      },
      {
        fpl_id: 25, team_name: "Arsenal", web_name: "Gyökeres",
        position: "FWD", price_tenths: 75, status: "a",
        chance_of_playing_next_round: null, news: "", news_added: null
      },
      {
        fpl_id: 26, team_name: "Arsenal", web_name: "Havertz",
        position: "FWD", price_tenths: 75, status: "a",
        chance_of_playing_next_round: null, news: "", news_added: null
      },
      {
        fpl_id: 5, team_name: "Arsenal", web_name: "J.Timber",
        position: "DEF", price_tenths: 65, status: "i",
        chance_of_playing_next_round: 0,
        news: "Groin injury - Expected back 21 Aug",
        news_added: new Date("2026-07-23T12:01:23.272Z")
      },
      {
        fpl_id: 30, team_name: "Arsenal", web_name: "Unlisted",
        position: "MID", price_tenths: 40, status: "d",
        chance_of_playing_next_round: null, news: "", news_added: null
      }
    ];

    expect(buildFplContext({
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      players
    })).toBe([
      "FPL-derived player context",
      "",
      "Arsenal",
      "Five highest-priced players:",
      "- Saka | MID | £9.5m | status: available",
      "- Gabriel | DEF | £8.0m | status: available",
      "- Rice | MID | £7.5m | status: available",
      "- Gyökeres | FWD | £7.5m | status: available",
      "- Havertz | FWD | £7.5m | status: available",
      "Players not fully available:",
      "- J.Timber | DEF | £6.5m | status: injured | chance of playing next round: 0% | news: Groin injury - Expected back 21 Aug | news added: 2026-07-23T12:01:23.272Z",
      "- Unlisted | MID | £4.0m | status: doubtful | chance of playing next round: not provided | news: not provided | news added: not provided",
      "",
      "Coventry City",
      "FPL player data status: team name did not resolve against the loaded snapshot.",
      "Five highest-priced players: unavailable because the team did not resolve.",
      "Players not fully available: unavailable because the team did not resolve."
    ].join("\n"));
  });

  test("states when a team has players but no absence markers", () => {
    const players: FplPlayer[] = [{
      fpl_id: 1, team_name: "Arsenal", web_name: "Raya",
      position: "GKP", price_tenths: 60, status: "a",
      chance_of_playing_next_round: null, news: "", news_added: null
    }];

    expect(buildFplContext({
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      players
    })).toContain("Players not fully available: none; all listed players are available.");
  });

  test("distinguishes a missing snapshot from an unresolved team", () => {
    expect(buildFplContext({
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      players: []
    })).toBe([
      "FPL-derived player context",
      "",
      "Arsenal",
      "FPL player data status: no player snapshot loaded for this Gameweek.",
      "Five highest-priced players: unavailable because no snapshot was loaded.",
      "Players not fully available: unavailable because no snapshot was loaded.",
      "",
      "Coventry City",
      "FPL player data status: no player snapshot loaded for this Gameweek.",
      "Five highest-priced players: unavailable because no snapshot was loaded.",
      "Players not fully available: unavailable because no snapshot was loaded."
    ].join("\n"));
  });
});
