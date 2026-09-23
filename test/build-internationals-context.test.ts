import { describe, expect, test } from "vitest";
import {
  buildInternationalsContext,
  type InternationalMatch,
  type GroupFixture,
  type InternationalStats,
  type PlayedFixture
} from "../src/context/build-internationals-context.js";

const LOCK = new Date("2026-09-24T14:30:00Z");

const international = (
  row: Partial<InternationalMatch> & { played_on: string }
): InternationalMatch => ({
  home_team: "Kosovo",
  away_team: "Sweden",
  home_goals: 1,
  away_goals: 0,
  tournament: "Friendly",
  country: "Kosovo",
  neutral: false,
  ...row
});

const fixture = (
  row: Partial<PlayedFixture> & { kicked_off_at: Date }
): PlayedFixture => ({
  home_team: "Kosovo",
  away_team: "Republic of Ireland",
  home_goals: 1,
  away_goals: 0,
  home_shots: 14,
  away_shots: 9,
  home_shots_on_target: 5,
  away_shots_on_target: 3,
  home_xg: 1.31,
  away_xg: 0.88,
  ...row
});

const build = (
  options: {
    internationals?: InternationalMatch[];
    playedFixtures?: PlayedFixture[];
    internationalStats?: InternationalStats[];
    groupFixtures?: GroupFixture[];
    datasetUpdatedOn?: string | null;
    homeTeam?: string;
    awayTeam?: string;
  } = {}
): string => buildInternationalsContext({
  competition: "UNL",
  asOf: LOCK,
  homeTeam: options.homeTeam ?? "Kosovo",
  awayTeam: options.awayTeam ?? "Republic of Ireland",
  internationals: options.internationals ?? [],
  playedFixtures: options.playedFixtures ?? [],
  internationalStats: options.internationalStats ?? [],
  groupFixtures: options.groupFixtures ?? [],
  datasetUpdatedOn: "datasetUpdatedOn" in options
    ? options.datasetUpdatedOn ?? null
    : "2026-08-26"
});

describe("what each side of a cup's Fixture did last", () => {
  test("shows one side's five latest, newest first, and no sixth", () => {
    const section = build({
      internationals: [
        "2025-09-04", "2025-10-10", "2026-03-25", "2026-06-11", "2026-06-16",
        "2026-06-21"
      ].map((played_on) => international({ played_on }))
    });

    // Six stored, five shown, and the one left out is the oldest: what a side
    // did last is the question, so the window closes at the back.
    expect(section).toContain("Last 5 internationals:");
    const dates = [...section.matchAll(/\| (\d{4}-\d{2}-\d{2}) \|/g)]
      .map((match) => match[1]);
    expect(dates).toEqual([
      "2026-06-21", "2026-06-16", "2026-06-11", "2026-03-25", "2025-10-10"
    ]);
  });

  test("names the competition the source names, and marks a neutral venue",
    () => {
      // The source's own word for the competition, kept verbatim: "FIFA World
      // Cup" is a string from a CSV and not a Competition this record holds
      // (migration 0042). The venue is marked only where it is neutral --
      // home-team-first ordering already says who was at home, and a neutral
      // ground is the one case where that ordering means nothing.
      const section = build({
        internationals: [
          international({
            played_on: "2026-07-19",
            home_team: "Spain",
            away_team: "Kosovo",
            home_goals: 1,
            away_goals: 0,
            tournament: "FIFA World Cup",
            country: "United States",
            neutral: true
          }),
          international({
            played_on: "2026-03-25",
            home_team: "Kosovo",
            away_team: "Sweden",
            home_goals: 2,
            away_goals: 2,
            tournament: "FIFA World Cup qualification",
            country: "Kosovo"
          })
        ]
      });

      expect(section).toContain(
        "- FIFA World Cup | 2026-07-19 | Spain 1-0 Kosovo | L"
        + " | neutral venue in United States"
      );
      expect(section).toContain(
        "- FIFA World Cup qualification | 2026-03-25 | Kosovo 2-2 Sweden | D"
      );
      expect(section).not.toContain("2026-03-25 | Kosovo 2-2 Sweden | D |");
    });

  test("a side with nothing stored says so rather than going missing", () => {
    const section = build({
      internationals: [international({ played_on: "2026-03-25" })]
    });

    expect(section).toMatch(/Kosovo\n.*\nLast 5 internationals:\n-/);
    expect(section).toContain(
      "Last 5 internationals: no international stored for this side."
    );
  });

  test("nothing played after the Lock reaches a line", () => {
    // Both sources bounded, and the dataset's bound is the Lock's own UTC day
    // exclusive: a row dated 2026-09-24 says nothing about the hour, so a
    // match played that evening cannot leak onto a form line built for a
    // 14:30 Lock.
    const section = build({
      internationals: [
        international({ played_on: "2026-09-24", away_team: "Denmark" }),
        international({ played_on: "2026-03-25" })
      ],
      playedFixtures: [
        fixture({ kicked_off_at: new Date("2026-09-24T18:45:00Z") })
      ]
    });

    const lines = section.split("\n").filter((line) => line.startsWith("- "));
    expect(lines).toEqual([
      "- Friendly | 2026-03-25 | Kosovo 1-0 Sweden | W"
    ]);
    expect(section).toContain(
      "Last 5 internationals: no international stored for this side."
    );
  });

  test("a Fixture kicking off after midnight UTC is the one merge this does "
    + "not make", () => {
    // The dedupe key reads two clocks: the record's kickoff instant in UTC and
    // the day the file says the match was played on. No Fixture of this
    // Season's recorded schedule kicks off later than 19:45Z, so this cannot
    // happen to `UNL` -- and it is pinned here rather than left to be
    // discovered by the first Competition that plays outside Europe.
    const section = build({
      // The file dates the match the 6th, as the country it was played in
      // does; the record dates it the 7th, because 00:30 local is 00:30 UTC
      // here and the kickoff instant is what the record keys by.
      internationals: [international({
        played_on: "2026-09-06",
        home_team: "Kosovo",
        away_team: "Republic of Ireland",
        tournament: "UEFA Nations League"
      })],
      playedFixtures: [
        fixture({ kicked_off_at: new Date("2026-09-07T00:30:00Z") })
      ]
    });

    // One match, two lines in one side's list, because the two keys differ by
    // a day. The upgrade path is in the builder: match the adjacent day too.
    const kosovo = section.split("\n\n")
      .find((block) => block.startsWith("Kosovo\n"))!;
    expect(kosovo.split("\n").filter((line) => line.startsWith("- ")))
      .toHaveLength(2);
  });
});

describe("this Season's own Fixtures merged into the same list", () => {
  test("a dataset line carries a backfilled sheet, and says nothing without one",
    () => {
      const packet = build({
        internationals: [
          international({ played_on: "2024-11-15", away_team: "Romania" }),
          international({ played_on: "2024-11-19", away_team: "Sweden" })
        ],
        internationalStats: [{
          played_on: "2024-11-15",
          home_team: "Kosovo",
          away_team: "Romania",
          home_shots: 9,
          away_shots: 12,
          home_shots_on_target: 3,
          away_shots_on_target: 5,
          home_xg: 0.7,
          away_xg: 1.4
        }]
      });
      const kosovo = packet.split("Republic of Ireland")[0]!;
      // The sheet's figures on the line it belongs to, in the league's own
      // format; the other line is bare, and never the settled Fixture's
      // absence sentence, because no sheet was ever asked for it.
      expect(kosovo).toMatch(/2024-11-15 \| Kosovo 1-0 Romania \| W \| .*shots.*xG/);
      expect(kosovo).toMatch(/2024-11-19 \| Kosovo 1-0 Sweden \| W\n/);
      expect(kosovo).not.toContain("no shots or xG stored");
    });

  test("the group's table stands where the league table would, four sides from day one", () => {
    const groupFixture = (
      row: Partial<GroupFixture> & { home_team: string; away_team: string }
    ): GroupFixture => ({
      group_name: "Group A2", kickoff_at: new Date("2026-09-24T18:45:00Z"),
      home_goals: null, away_goals: null, ...row
    });
    const fixtures = [
      groupFixture({ home_team: "Kosovo", away_team: "Republic of Ireland", home_goals: 2, away_goals: 0, kickoff_at: new Date("2026-09-20T18:45:00Z") }),
      groupFixture({ home_team: "Sweden", away_team: "Romania", home_goals: 1, away_goals: 1, kickoff_at: new Date("2026-09-20T18:45:00Z") }),
      // After the Lock: settled, and not counted.
      groupFixture({ home_team: "Romania", away_team: "Kosovo", home_goals: 3, away_goals: 0, kickoff_at: new Date("2026-09-27T18:45:00Z") }),
      // Another group entirely, and not in this table.
      groupFixture({ group_name: "Group B1", home_team: "Wales", away_team: "Iceland", home_goals: 4, away_goals: 0, kickoff_at: new Date("2026-09-20T18:45:00Z") })
    ];
    const packet = build({ groupFixtures: fixtures });
    expect(packet).toContain("Group A2 table (results through 2026-09-20):");
    expect(packet).toContain("1. Kosovo | P 1 W 1 D 0 L 0 | GF 2 GA 0 GD +2 | Pts 3");
    expect(packet).toContain("2. Romania | P 1 W 0 D 1 L 0 | GF 1 GA 1 GD 0 | Pts 1");
    expect(packet).toContain("4. Republic of Ireland | P 1 W 0 D 0 L 1 | GF 0 GA 2 GD -2 | Pts 0");
    expect(packet).not.toContain("Wales");
    expect(packet).not.toContain("no league table");
    // Before anything is played the four still stand, at nought.
    const fresh = build({ groupFixtures: fixtures.map((f) => ({ ...f, home_goals: null, away_goals: null })) });
    expect(fresh).toContain("Group A2 table:\n1. Kosovo | P 0 W 0 D 0 L 0 | GF 0 GA 0 GD 0 | Pts 0");
    // A Competition whose schedule names no group keeps the stated absence.
    expect(build()).toContain("no league table for this Competition");
  });

  test("a sheet dated the next UTC day still finds its dataset line", () => {
    const packet = build({
      internationals: [international({ played_on: "2026-06-11", away_team: "Czechia", country: "Mexico", neutral: true })],
      internationalStats: [{
        played_on: "2026-06-12",
        home_team: "Kosovo",
        away_team: "Czechia",
        home_shots: 6, away_shots: 15, home_shots_on_target: 2,
        away_shots_on_target: 6, home_xg: 0.4, away_xg: 1.9
      }]
    });
    expect(packet).toMatch(/2026-06-11 \| Kosovo 1-0 Czechia \| W \| neutral venue in Mexico \| .*xG/);
  });

  test("carries the shots and xG the dataset has no column for", () => {
    const section = build({
      playedFixtures: [
        fixture({ kicked_off_at: new Date("2026-09-06T18:45:00Z") })
      ]
    });

    // Labelled the way the dataset labels this Competition, so the merged
    // list reads as one list rather than two.
    expect(section).toContain(
      "- UEFA Nations League | 2026-09-06 | Kosovo 1-0 Republic of Ireland"
      + " | W | shots 14-9, on target 5-3, xG 1.31-0.88"
    );
    // And it is on both sides' lists, from each side's own end.
    expect(section).toContain(
      "Kosovo 1-0 Republic of Ireland | L | shots 14-9"
    );
  });

  test("the record wins where the dataset has caught up with it", () => {
    // The dataset lags the record by up to a month, so the same match arrives
    // from the record first and from the file weeks later. One line, and the
    // one carrying the figures: the dataset has no column for them.
    const section = build({
      internationals: [international({
        played_on: "2026-09-06",
        home_team: "Kosovo",
        away_team: "Republic of Ireland",
        tournament: "UEFA Nations League"
      })],
      playedFixtures: [
        fixture({ kicked_off_at: new Date("2026-09-06T18:45:00Z") })
      ]
    });

    // Every line the merged match reaches, written out: the Season's own
    // coverage line, one form line per side carrying the record's figures,
    // and the score-only head-to-head. The dataset's copy of it is nowhere,
    // which is what "the record wins" means -- a second line for either side
    // would be the same match twice.
    const line = "- UEFA Nations League | 2026-09-06 | "
      + "Kosovo 1-0 Republic of Ireland";
    const stats = " | shots 14-9, on target 5-3, xG 1.31-0.88";
    expect(section.split("\n").filter((row) => row.includes("2026-09-06")))
      .toEqual([
        "This Season's results: 1 match played, through 2026-09-06.",
        `${line} | W${stats}`,
        `${line} | L${stats}`,
        line
      ]);
  });

  test("carries each side's xG for and against per game, home and away",
    () => {
      // ADR-0043's second rate, and the only table that can answer it for a
      // cup: the dataset has no xG column at all, so these are over this
      // Season's own Fixtures (spec 0027, story 41).
      const section = build({
        playedFixtures: [
          fixture({
            kicked_off_at: new Date("2026-09-06T18:45:00Z"),
            home_xg: 1.31,
            away_xg: 0.88
          }),
          fixture({
            kicked_off_at: new Date("2026-09-09T18:45:00Z"),
            home_team: "Denmark",
            away_team: "Kosovo",
            home_xg: 2.0,
            away_xg: 0.5
          }),
          // A hole: it counts in neither rate, and the coverage says so.
          fixture({
            kicked_off_at: new Date("2026-09-12T18:45:00Z"),
            away_team: "Norway",
            home_xg: null,
            away_xg: null
          })
        ]
      });

      expect(section).toContain(
        "Kosovo\nxG for and against per game, this Season's Fixtures: "
        + "0.91-1.44 (over 2 of 3 matches) overall, "
        + "1.31-0.88 (over 1 of 2 matches) home, "
        + "0.50-2.00 away."
      );
    });

  test("a side with no Fixture yet says so rather than reading unavailable",
    () => {
      expect(build()).toContain(
        "xG for and against per game, this Season's Fixtures: no Fixture "
        + "played yet."
      );
    });

  test("a Fixture with neither shots nor xG says so, and a hole does not",
    () => {
      // ADR-0058 as ticket 0072 amended it: a hole is a sheet with no xG and
      // both sides' shots still on it, and it reads the way the other five
      // Competitions' form lines already read. The frozen sentence belongs to
      // a settled Fixture no sheet was stored for at all.
      const section = build({
        playedFixtures: [
          fixture({
            kicked_off_at: new Date("2026-09-06T18:45:00Z"),
            home_shots: null,
            away_shots: null,
            home_shots_on_target: null,
            away_shots_on_target: null,
            home_xg: null,
            away_xg: null
          }),
          fixture({
            kicked_off_at: new Date("2026-09-09T18:45:00Z"),
            away_team: "Denmark",
            home_xg: null,
            away_xg: null
          })
        ]
      });

      expect(section).toContain(
        "| W | no shots or xG stored for this Fixture"
      );
      expect(section).toContain(
        "2026-09-09 | Kosovo 1-0 Denmark | W"
        + " | shots 14-9, on target 5-3, xG unavailable"
      );
    });
});

describe("what a cup does not have, and what its Season has done", () => {
  test("states the absent league table rather than saying nothing at all",
    () => {
      // A stated absence and not a Gap (ADR-0057, story 39): the league
      // section this one replaces opens with a table, and a packet that
      // simply dropped it would leave an Entrant to guess whether the table
      // was missing or the Competition has none.
      expect(build()).toContain(
        "League table: no league table for this Competition; a national side "
        + "plays no league."
      );
    });

  test("reads no result has been played yet this Season at Gameweek 1", () => {
    // Story 40, in the words every league's Gameweek 1 already renders: the
    // first Gameweek of a cup reads as the first Gameweek of a league does.
    expect(build()).toContain(
      "This Season's results: no result has been played yet this Season."
    );
  });

  test("counts the Season's settled Fixtures and dates the count", () => {
    // The coverage statement the league table's heading makes (ADR-0021),
    // over the one set a cup has: its own settled Fixtures. The Fixtures
    // themselves are on the two sides' form lines above; this line is what
    // says how much of the Season those lines are drawn from.
    const section = build({
      playedFixtures: [
        fixture({ kicked_off_at: new Date("2026-09-06T18:45:00Z") }),
        fixture({
          kicked_off_at: new Date("2026-09-09T18:45:00Z"),
          home_team: "Denmark",
          away_team: "Norway"
        }),
        // After the Lock, so it is in neither the count nor the date.
        fixture({
          kicked_off_at: new Date("2026-09-24T18:45:00Z"),
          home_team: "Austria",
          away_team: "Israel"
        })
      ]
    });

    expect(section).toContain(
      "This Season's results: 2 matches played, through 2026-09-09."
    );
  });
});

describe("what the two sides have done to each other", () => {
  test("shows their meetings from both sources, newest first and score-only",
    () => {
      // The section the league packet ends with, over the one table that can
      // answer it for a cup: two national sides have usually met, and
      // `international_results` holds the meetings. Score-only, on the rule
      // the league's section is score-only by -- performance signals belong
      // on the form lines, where recent performance is what the section is
      // for.
      const section = build({
        internationals: [
          international({
            played_on: "2025-10-10",
            home_team: "Republic of Ireland",
            away_team: "Kosovo",
            home_goals: 2,
            away_goals: 1,
            tournament: "FIFA World Cup qualification"
          }),
          // A third side's match, which is not a meeting of these two.
          international({ played_on: "2026-03-25", away_team: "Sweden" })
        ],
        playedFixtures: [
          fixture({ kicked_off_at: new Date("2026-09-06T18:45:00Z") })
        ]
      });

      // The whole block and not its first two lines: a third meeting that
      // should not be there -- the third side's match, or the same match
      // from both sources -- is only visible if the list is closed.
      const block = section
        .split("Head-to-head history:\n")[1]!
        .split("\n\n")[0]!;
      expect(block.split("\n")).toEqual([
        "- UEFA Nations League | 2026-09-06 | Kosovo 1-0 Republic of Ireland",
        "- FIFA World Cup qualification | 2025-10-10 | "
        + "Republic of Ireland 2-1 Kosovo"
      ]);
    });

  test("shows five meetings and no sixth, as the form lines do", () => {
    // The cap, which is the form lines' cap and is here for the same reason:
    // two national sides meet across decades and the oldest of those was a
    // different team. Six stored, five shown, and the one left out is the
    // oldest -- and they alternate ends, so the direction filter is walked
    // six times rather than once.
    const section = build({
      internationals: [
        "2024-09-05", "2025-03-21", "2025-10-10", "2026-03-25", "2026-06-11",
        "2026-06-16"
      ].map((played_on, index) => international({
        played_on,
        home_team: index % 2 === 0 ? "Kosovo" : "Republic of Ireland",
        away_team: index % 2 === 0 ? "Republic of Ireland" : "Kosovo",
        tournament: "FIFA World Cup qualification"
      }))
    });

    const block = section
      .split("Head-to-head history:\n")[1]!
      .split("\n\n")[0]!;
    expect(block.split("\n").map((line) => line.split(" | ")[1])).toEqual([
      "2026-06-16", "2026-06-11", "2026-03-25", "2025-10-10", "2025-03-21"
    ]);
  });

  test("says so where the two have never met", () => {
    expect(build({
      internationals: [international({ played_on: "2026-03-25" })]
    })).toContain("Head-to-head history:\nNo prior meeting in stored data.");
  });
});

describe("what the section says about its own source", () => {
  test("states the date the dataset was last updated", () => {
    expect(build()).toContain("Dataset last updated 2026-08-26.");
  });

  test("states an unread dataset rather than an absent line", () => {
    // The staleness of a monthly source belongs in what the Entrant reads
    // (ADR-0057), and so does its never having been read at all.
    expect(build({ datasetUpdatedOn: null })).toContain(
      "Dataset last updated: no read of the dataset is stored."
    );
  });

  test("a Competition the dataset has no name for is refused", () => {
    // The same rule ADR-0054 states for every map a registry entry points at,
    // asked at the render rather than only at the fetch: the alternative is a
    // merged line labelled with a Competition this source does not name.
    expect(() => buildInternationalsContext({
      competition: "PL",
      asOf: LOCK,
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      internationals: [],
      playedFixtures: [],
      datasetUpdatedOn: null
    })).toThrow(/reads the international results dataset/);
  });

  test("computes base rates over the stored internationals, not a league's",
    () => {
      // ADR-0043's anchor for a Competition that plays in no league. Matches
      // at a neutral venue are left out: a home-win share over a set in which
      // a third of the matches had no home side understates home advantage
      // for an Entrant reading a Fixture that has one.
      const section = build({
        internationals: [
          international({ played_on: "2026-03-25", home_goals: 2, away_goals: 0 }),
          international({ played_on: "2026-03-28", home_goals: 1, away_goals: 1 }),
          international({ played_on: "2026-06-01", home_goals: 0, away_goals: 3 }),
          international({ played_on: "2026-06-04", home_goals: 1, away_goals: 0 }),
          // Five-nil at a neutral venue, and it reaches neither the shares nor
          // the goals per match.
          international({
            played_on: "2026-06-08",
            home_goals: 5,
            away_goals: 0,
            neutral: true
          })
        ]
      });

      expect(section).toContain(
        "Base rates (internationals in every competition at a home venue, "
        + "2024-06-01 to this Lock, 4 matches): home wins 50.0%, "
        + "draws 25.0%, away wins 25.0%, 2.00 goals per match."
      );
    });

  test("says so rather than dividing by nothing", () => {
    expect(build({
      internationals: [
        international({ played_on: "2026-06-08", neutral: true })
      ]
    })).toContain("Base rates: no international played at a home venue is "
      + "stored.");
  });
});
