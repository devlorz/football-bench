import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { seedSeason } from "../src/seed-season.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { FPL_POINTS_METRIC } from "../src/fpl/demonstration-record.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import { VIOLATIONS } from "../src/fpl/apply-gameweek-action.js";

const { Client } = pg;

const SEASON = "2026-27";

describe("the seeded FPL Season", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches, competitions
       restart identity cascade`
    );
  });

  test("pre-season enters nine FPL seats and no Manager State", async () => {
    await seedSeason({ database: client, season: SEASON, stopAt: "pre-season" });

    const seats = await client.query<{ id: string }>(
      `select id from models
        where role = 'entrant' and prompt_version = $1
        order by id`,
      [FPL_PROMPT_VERSION]
    );
    expect(seats.rows.map(({ id }) => id)).toEqual([
      "fpl/claude", "fpl/deepseek", "fpl/gemini", "fpl/glm", "fpl/gpt",
      "fpl/grok", "fpl/kimi", "fpl/minimax", "fpl/qwen"
    ]);

    // Carrying what ADR-0014 pins, exactly as the Match seats do: the Base
    // Model Class is a property of the Base Model, not of the track, and the
    // open-weight seats are pinned to a precision.
    const classes = await client.query<{ class: string; count: string }>(
      `select config ->> 'baseModelClass' as class, count(*) as count
         from models where role = 'entrant' and prompt_version = $1
        group by 1 order by 1`,
      [FPL_PROMPT_VERSION]
    );
    expect(classes.rows).toEqual([
      { class: "First-party", count: "1" },
      { class: "Frontier", count: "3" },
      { class: "Open-weight", count: "5" }
    ]);
    const unpinned = await client.query<{ count: string }>(
      `select count(*) as count from models
        where prompt_version = $1 and config ->> 'baseModelClass' = 'Open-weight'
          and quantization is null`,
      [FPL_PROMPT_VERSION]
    );
    expect(unpinned.rows[0]?.count).toBe("0");

    // The empty state the pages must render: the seats are entered for the
    // Season and the track has not started, so there is nothing to rank.
    const started = await client.query<{ count: string }>(
      "select count(*) as count from manager_states where season = $1",
      [SEASON]
    );
    expect(started.rows[0]?.count).toBe("0");
  });

  test("nine Entrants play five Gameweeks and four of them are scored",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      const played = await client.query<{
        gw: number;
        states: string;
        sheets: string;
        scored: string;
      }>(
        `select s.gw,
                count(*) as states,
                count(s.team_sheet) as sheets,
                count(distinct p.model_id) as scored
           from manager_states s
           left join scores p
             on p.model_id = s.model_id and p.season = s.season and p.gw = s.gw
            and p.track = 'fpl' and p.metric = $2
          where s.season = $1
          group by s.gw order by s.gw`,
        [SEASON, FPL_POINTS_METRIC]
      );

      // Five Gameweeks, and the fourth is the one an Entrant never answered:
      // eight Manager States rather than nine, so the Gameweek is nobody's
      // (ADR-0011) and the Settled span it sits inside has a hole in it.
      expect(played.rows).toEqual([
        { gw: 1, states: "9", sheets: "9", scored: "9" },
        { gw: 2, states: "9", sheets: "9", scored: "9" },
        { gw: 3, states: "9", sheets: "9", scored: "9" },
        { gw: 4, states: "8", sheets: "8", scored: "0" },
        { gw: 5, states: "9", sheets: "9", scored: "9" }
      ]);
    });

  test("every state a screen has to show is played by somebody", async () => {
    await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

    const present = await client.query<Record<string, boolean>>(
      `select
         bool_or(hits > 0) as hit,
         bool_or(free_transfers > 1) as banked,
         bool_or(chip_active is not null) as chip,
         bool_or(rolled_over) as rolled_over,
         bool_or(attempts_used > 0 and not rolled_over) as repaired
       from manager_states where season = $1`,
      [SEASON]
    );
    expect(present.rows[0]).toEqual({
      hit: true,
      banked: true,
      chip: true,
      rolled_over: true,
      repaired: true
    });

    // Every call that produced nothing, and what it produced nothing for. The
    // Repair is one refusal; the Roll Over is the whole conversation refused —
    // the first answer and all three Repairs (ADR-0004); and the Gap is four
    // calls a provider never answered, which is how a Gap comes about.
    const refused = await client.query<{
      model_id: string;
      attempts: string;
      last: number;
      kinds: string;
    }>(
      `select model_id, count(*) as attempts, max(attempt_no) as last,
              string_agg(distinct error_kind, ',') as kinds
         from attempts
        where season = $1 and track = 'fpl' and not ok
        group by model_id order by model_id`,
      [SEASON]
    );
    expect(refused.rows).toEqual([
      { model_id: "fpl/gemini", attempts: "1", last: 0, kinds: "formation" },
      { model_id: "fpl/kimi", attempts: "4", last: 3, kinds: "formation" },
      { model_id: "fpl/minimax", attempts: "4", last: 3, kinds: "provider" }
    ]);

    // And an Entrant is refused in the Season's own frozen words (ADR-0004),
    // not in a sentence the seed made up: a page rendering the last violation
    // would otherwise show one production never says.
    const wording = await client.query<{ error_detail: string }>(
      `select distinct error_detail from attempts
        where season = $1 and track = 'fpl' and error_kind = $2`,
      [SEASON, VIOLATIONS.formation.kind]
    );
    expect(wording.rows).toEqual([
      { error_detail: VIOLATIONS.formation.message }
    ]);
  });

  test("the stored states replay to the captains and Transfers they were made by",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      // The derivation the Entrant-record endpoint has no match-track
      // precedent for (spec 0014): captain and Transfer history read back out
      // of `manager_states` alone. The seat that took the Hit, since a Transfer
      // whose cost is wrong is the one that would go unnoticed.
      const stored = await client.query<{
        gw: number;
        squad: { active: Array<{ fplId: number }> };
        team_sheet: { captain: number; viceCaptain: number };
        hits: number;
      }>(
        `select gw, squad, team_sheet, hits from manager_states
          where season = $1 and model_id = 'fpl/claude' order by gw`,
        [SEASON]
      );

      let held: number[] = [];
      const replayed = stored.rows.map(({ gw, squad, team_sheet, hits }) => {
        const owned = squad.active.map(({ fplId }) => fplId);
        const history = {
          gw,
          captain: team_sheet.captain,
          vice: team_sheet.viceCaptain,
          out: held.filter((fplId) => !owned.includes(fplId)),
          in: owned.filter((fplId) => !held.includes(fplId)),
          cost: hits
        };
        held = owned;
        return history;
      });

      // Every Gameweek is one line: the opening buys fifteen, Gameweek 2 sells
      // Rogers and Watkins for Kudus and Wissa at the cost of one Hit, and
      // nothing moves after it. The armband never does — this seat captains
      // Raya all Season, which is what makes its Gameweek points its own.
      expect(replayed).toEqual([
        {
          gw: 1, captain: 1, vice: 3, cost: 0, out: [],
          in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        },
        { gw: 2, captain: 1, vice: 3, cost: 4, out: [12, 15], in: [17, 19] },
        { gw: 3, captain: 1, vice: 3, cost: 0, out: [], in: [] },
        { gw: 4, captain: 1, vice: 3, cost: 0, out: [], in: [] },
        { gw: 5, captain: 1, vice: 3, cost: 0, out: [], in: [] }
      ]);
    });

  test("the Gap is one Entrant's, and the Gameweeks around it are scored",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      const gapped = await client.query<{ id: string }>(
        `select m.id from models m
          where m.prompt_version = $1
            and not exists (
              select 1 from manager_states s
               where s.model_id = m.id and s.season = $2 and s.gw = 4
            )`,
        [FPL_PROMPT_VERSION, SEASON]
      );
      expect(gapped.rows.map(({ id }) => id)).toEqual(["fpl/minimax"]);

      // The hole is inside the span rather than at its end: the Gameweek after
      // it is scored, so a page reading the Settled span has a Gameweek to
      // announce as missing rather than a span that simply stops early.
      const scored = await client.query<{ gw: number }>(
        `select distinct gw from scores
          where season = $1 and track = 'fpl' order by gw`,
        [SEASON]
      );
      expect(scored.rows.map(({ gw }) => gw)).toEqual([1, 2, 3, 5]);
    });

  test("a player has risen and another has fallen since they were bought",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      // Read as the endpoint will: what each Entrant paid, against what the
      // latest Gameweek's Lock lists him at.
      const moved = await client.query<{
        fpl_id: number;
        paid: number;
        listed: number;
      }>(
        `select (owned ->> 'fplId')::int as fpl_id,
                (owned ->> 'purchasePriceTenths')::int as paid,
                p.price_tenths as listed
           from manager_states s
           cross join lateral jsonb_array_elements(s.squad -> 'active') as owned
           join fpl_players p
             on p.season = s.season and p.gw = 5
            and p.fpl_id = (owned ->> 'fplId')::int
          where s.season = $1 and s.gw = 5
            and p.price_tenths <> (owned ->> 'purchasePriceTenths')::int
          group by 1, 2, 3 order by 1`,
        [SEASON]
      );
      expect(moved.rows).toEqual([
        { fpl_id: 8, paid: 110, listed: 120 },
        { fpl_id: 14, paid: 70, listed: 65 }
      ]);
    });

  test("the pool carries two duties for the player FPL names them for, and none for the rest",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      const duties = await client.query<{
        fpl_id: number;
        penalties_order: number | null;
        direct_freekicks_order: number | null;
        corners_and_indirect_freekicks_order: number | null;
      }>(
        `select fpl_id, penalties_order, direct_freekicks_order,
                corners_and_indirect_freekicks_order
           from fpl_players
          where season = $1 and gw = 1
            and (penalties_order is not null
              or direct_freekicks_order is not null
              or corners_and_indirect_freekicks_order is not null)
          order by fpl_id`,
        [SEASON]
      );
      expect(duties.rows).toEqual([{
        fpl_id: 8,
        penalties_order: 1,
        direct_freekicks_order: 2,
        corners_and_indirect_freekicks_order: null
      }]);
    });

  test("every FPL scores row is the real scorer's and none is the seed's",
    async () => {
      // `scored_at` is left out: the FPL scorer takes no clock, so the one
      // column a second run moves is the one the seed never set.
      const storedScores = async (): Promise<unknown[]> => {
        const rows = await client.query(
          `select model_id, gw, metric, value, n, detail
             from scores where season = $1 and track = 'fpl'
            order by model_id, gw, metric`,
          [SEASON]
        );
        return rows.rows;
      };

      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });
      const seeded = await storedScores();
      expect(seeded.length).toBeGreaterThan(0);

      await client.query("delete from scores where track = 'fpl'");
      expect(await storedScores()).toEqual([]);
      for (let gameweek = 1; gameweek <= 5; gameweek += 1) {
        await scoreFplGameweek({ database: client, season: SEASON, gameweek });
      }

      expect(await storedScores()).toEqual(seeded);
    });
});
