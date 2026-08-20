import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  MATCH_PROMPT_VERSION,
  matchPromptOf
} from "../src/predictions/openrouter-entrant.js";
import {
  enterActiveCompetitionRosters, enterFplRoster, enterSeasonRoster,
  FPL_ROSTER_SIZE, FPL_WITHDRAWALS,
  SEASON_ROSTER, SEASON_ROSTER_SIZE, seatPrefixOf, seatSlug
} from "../src/season-roster.js";
import {
  FPL_PROMPT_VERSION
} from "../src/context/build-fpl-track-context.js";

const { Client } = pg;

const SEASON = "2026-27";

interface ModelRow {
  id: string;
  name: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  prompt_version: string;
  role: string;
  config: Record<string, unknown>;
  created_at: Date;
  withdrawn_at: Date | null;
}

describe("entering the Season Roster", () => {
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
      "truncate models, competitions restart identity cascade"
    );
  });

  const entrants = async (): Promise<ModelRow[]> => (
    await client.query<ModelRow>(
      "select * from models where role = 'entrant' order by id"
    )
  ).rows;

  test("writes the ten seats of ADR-0034 under the Season's Prompt Version",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE);
      expect(rows.map(({ prompt_version }) => prompt_version))
        .toEqual(Array<string>(SEASON_ROSTER_SIZE).fill(MATCH_PROMPT_VERSION));

      const classes = rows.reduce<Record<string, number>>((counts, row) => {
        const name = String(row.config.baseModelClass);
        return { ...counts, [name]: (counts[name] ?? 0) + 1 };
      }, {});
      expect(classes).toEqual({
        Frontier: 3, "First-party": 2, "Open-weight": 5
      });

      // ADR-0009: an open-weight seat served at another precision is another
      // model, so every one of them is pinned — and nothing else is. Qwen3.8
      // Max is the single exception, for the reason recorded beside it in
      // `src/season-roster.ts` and inherited from its predecessor: one
      // endpoint exists for that Base Model, so the provider pin fixes the
      // precision on its own, and an `fp8` filter matches nothing and 404s
      // the seat.
      const unpinnedOpenWeight = new Set(["match/qwen3.8-max"]);
      for (const row of rows) {
        const pinned = row.config.baseModelClass === "Open-weight"
          && !unpinnedOpenWeight.has(row.id);
        expect([row.id, row.quantization !== null]).toEqual([row.id, pinned]);
      }
    });

  test("names the dated Base Model each seat resolves to, never as the request id",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);

      for (const row of await entrants()) {
        const entrant = SEASON_ROSTER.find(({ id }) => id === row.id);
        expect(entrant?.canonicalSlug).toBe(row.config.canonical_slug);
        // Beside it, when that resolution was last looked at. Per seat, so a
        // refresh that opened three Base Models' pages cannot date the seven
        // it never opened.
        expect(entrant?.catalogCheckedAt).toBe(row.config.catalog_checked_at);
        // The pin is recorded beside a stable request name rather than sent
        // as one, which is what keeps a snapshot swap detectable.
        expect(row.base_model).not.toBe(row.config.canonical_slug);
        expect(entrant?.canonicalSlug.startsWith(`${row.base_model}-`))
          .toBe(true);
      }
    });

  test("re-entering changes nothing and keeps a key it did not write",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);
      const before = await entrants();
      const [first] = before;
      await client.query(
        `update models set config = config || '{"entered_by": "operator"}'
          where id = $1`,
        [first?.id]
      );

      await enterSeasonRoster(client, "PL", SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE);
      expect(rows[0]?.config.entered_by).toBe("operator");
      expect(rows).toEqual(before.map((row) => (
        row.id === first?.id
          ? { ...row, config: { ...row.config, entered_by: "operator" } }
          : row
      )));
    });

  test("leaves the two seats ADR-0034 declined to move exactly as they were",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);

      // The DeepSeek and Gemini rejections are recorded in ADR-0034 as an
      // absence of change, which is invisible in a roster of ten unless
      // something says what the absence was.
      const rows = await entrants();
      expect(rows.find(({ id }) => id === "match/deepseek-v4-pro"))
        .toMatchObject({
          name: "DeepSeek V4 Pro",
          base_model: "deepseek/deepseek-v4-pro",
          provider: "novita",
          quantization: "fp8",
          config: expect.objectContaining({
            canonical_slug: "deepseek/deepseek-v4-pro-20260423"
          })
        });
      expect(rows.find(({ id }) => id === "match/gemini-3.1-pro-preview"))
        .toMatchObject({
          name: "Gemini 3.1 Pro Preview",
          base_model: "google/gemini-3.1-pro-preview",
          provider: "google-ai-studio",
          quantization: null,
          config: expect.objectContaining({
            canonical_slug: "google/gemini-3.1-pro-preview-20260219"
          })
        });
    });

  test("refuses any roster but the Season Roster of record", async () => {
    // A seat dropped from the constant, or one added to it, is a Season
    // entered at a size no decision records — and every number read against
    // the roster would still be produced, meaning something else.
    const short = SEASON_ROSTER.slice(1);
    await expect(enterSeasonRoster(client, "PL", SEASON, short))
      .rejects.toThrow(
        `PL would be seated with ${SEASON_ROSTER_SIZE - 1} Entrants`
      );
    await expect(enterSeasonRoster(
      client, "PL", SEASON, [...SEASON_ROSTER, SEASON_ROSTER[0]!]
    )).rejects.toThrow(
      `PL would be seated with ${SEASON_ROSTER_SIZE + 1} Entrants`
    );

    // And a swap, which keeps the count: the door ADR-0034 shut at the first
    // Lock is exactly the one a Competition opening later would reopen, and a
    // guard that counted alone would hold it open (story 39).
    const swapped = [
      { ...SEASON_ROSTER[0]!, id: "match/late-arrival" },
      ...SEASON_ROSTER.slice(1)
    ];
    await expect(enterSeasonRoster(client, "PD", SEASON, swapped))
      .rejects.toThrow(
        `PD seat 1 (${SEASON_ROSTER[0]!.id}) disagrees with the Season Roster `
        + "as it stood at the Season's first Lock on id"
      );

    // And a transplant, which keeps the count *and* the ids: the seat reads
    // as the roster's while the Base Model behind it is one the cutoff
    // excluded. Ids alone would have admitted it — a `models` row's identity
    // is the whole row, and `base_model` is what goes on the wire.
    const transplanted = [
      ...SEASON_ROSTER.slice(0, 9),
      {
        ...SEASON_ROSTER[9]!,
        baseModel: "vendor/late-arrival",
        canonicalSlug: "vendor/late-arrival-20260901"
      }
    ];
    await expect(enterSeasonRoster(client, "PD", SEASON, transplanted))
      .rejects.toThrow(
        `PD seat ${SEASON_ROSTER_SIZE} (${SEASON_ROSTER[9]!.id}) disagrees `
        + "with the Season Roster as it stood at the Season's first Lock on "
        + "baseModel, canonicalSlug"
      );

    // And it refuses before writing anything, not part way through.
    expect(await entrants()).toHaveLength(0);
  });

  // The guard above compares an argument against the constant, which across a
  // deployment is the constant compared with itself: `SEASON_ROSTER` is
  // editable, and an edit that kept the ids would be invisible to it. What
  // stood at the Season's first Lock is in the database, so these three drive
  // the drift through the stored rows rather than through the argument.
  describe("against the seats the record already holds", () => {
    test("refuses a Base Model swapped in behind a seat that is already stored",
      async () => {
        await enterSeasonRoster(client, "PL", SEASON);
        // Indistinguishable, from here, from `SEASON_ROSTER` having been
        // edited after the Premier League was seated: stored and constant
        // disagree, and only the stored row is evidence of the first Lock.
        await client.query(
          "update models set base_model = 'vendor/late' where id = $1",
          [SEASON_ROSTER[0]!.id]
        );

        // A Competition opening later must not get the new Base Model...
        await expect(enterSeasonRoster(client, "PD", SEASON)).rejects.toThrow(
          `Seat ${SEASON_ROSTER[0]!.id} is stored as a different Base Model `
          + "and the Season Roster closed at the Season's first Lock: "
          + `base_model vendor/late -> ${SEASON_ROSTER[0]!.baseModel}`
        );
        // ...and re-entering the Competition already seated must not rewrite
        // its identity through the upsert, which is the same door from the
        // inside.
        await expect(enterSeasonRoster(client, "PL", SEASON)).rejects
          .toThrow(/closed at the Season's first Lock/);

        const stored = await client.query<{ base_model: string }>(
          "select base_model from models where id = $1",
          [SEASON_ROSTER[0]!.id]
        );
        expect(stored.rows[0]?.base_model).toBe("vendor/late");
        expect(await entrants()).toHaveLength(SEASON_ROSTER_SIZE);
      });

    test("refuses a stored Match seat the roster no longer names", async () => {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ('match/late-arrival', 'Late Arrival', 'vendor/late',
                   'vendor', $1, 'entrant')`,
        [MATCH_PROMPT_VERSION]
      );

      await expect(enterSeasonRoster(client, "PD", SEASON)).rejects.toThrow(
        "Seat match/late-arrival is stored at Prompt Version "
        + "match/2026-27-v2 and is not in the roster being entered"
      );
    });

    test("lets a re-checked seat through: the date is not an identity",
      async () => {
        await enterSeasonRoster(client, "PL", SEASON);
        // ADR-0009's per-seat catalog check moves whenever an operator looks
        // again. Refusing that would make the guard a reason not to check.
        await client.query(
          `update models
              set config = config || '{"catalog_checked_at": "2026-09-01"}'
            where id = $1`,
          [SEASON_ROSTER[0]!.id]
        );

        await enterSeasonRoster(client, "PD", SEASON);

        expect(await entrants()).toHaveLength(SEASON_ROSTER_SIZE * 2);
      });
  });

  // The seat prefix is the Prompt Version's leading segment, and it is what
  // the upsert keys on — so a `MATCH_PROMPTS` entry at another track's version
  // would overwrite that track's seats in silence. Neither refusal is
  // reachable through `MATCH_PROMPTS` as it stands, which is the reason to
  // walk into them here rather than take them on trust.
  test("refuses a Prompt Version that is not this Season's match track", () => {
    expect(seatPrefixOf(MATCH_PROMPT_VERSION, SEASON)).toBe("match");
    expect(seatPrefixOf("match-pd/2026-27-v1", SEASON)).toBe("match-pd");

    expect(() => seatPrefixOf("fpl/2026-27-v2", SEASON))
      .toThrow("Prompt Version fpl/2026-27-v2 is not the match track's");
    expect(() => seatPrefixOf("matchless/2026-27-v1", SEASON))
      .toThrow("is not the match track's");
    expect(() => seatPrefixOf(MATCH_PROMPT_VERSION, "2027-28"))
      .toThrow(`SEASON 2027-28 does not own Prompt Version ${
        MATCH_PROMPT_VERSION}`);
  });

  test("refuses a Season the frozen Prompt Version does not name", async () => {
    await expect(enterSeasonRoster(client, "PL", "2027-28")).rejects
      .toThrow(/does not own Prompt Version/);
    expect(await entrants()).toHaveLength(0);
  });

  test("refuses a Competition with no frozen Prompt Version", async () => {
    await expect(enterSeasonRoster(client, "SA", SEASON)).rejects
      .toThrow("Competition SA has no frozen Prompt Version");
    expect(await entrants()).toHaveLength(0);
  });

  test("seats the same ten in a second Competition under its own version",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);
      await enterSeasonRoster(client, "PD", SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE * 2);

      // The same ten Base Models, seated twice: what multiplies is seats, not
      // Entrants (ADR-0038).
      const byVersion = new Map<string, string[]>();
      for (const row of rows) {
        byVersion.set(row.prompt_version, [
          ...byVersion.get(row.prompt_version) ?? [],
          row.base_model
        ]);
      }
      const baseModels = SEASON_ROSTER.map(({ baseModel }) => baseModel).sort();
      // Read from the constants rather than spelled out: what this test is
      // about is that each Competition seats under its own version, and a
      // literal here turns every restart (ADR-0042) into a false failure.
      expect([...byVersion.keys()].sort())
        .toEqual([matchPromptOf("PD").version, MATCH_PROMPT_VERSION].sort());
      for (const seated of byVersion.values()) {
        expect(seated.sort()).toEqual(baseModels);
      }

      // Distinct ids, because `models.id` is the primary key — and the
      // Premier League's ten are the ones that do not move.
      expect(rows.filter(({ id }) => id.startsWith("match-pd/")))
        .toHaveLength(SEASON_ROSTER_SIZE);
      expect(rows.map(({ id }) => id)).toContain("match/claude-opus-5");
      expect(rows.map(({ id }) => id)).toContain("match-pd/claude-opus-5");
    });

  // ADR-0042: La Liga's v1 ran a Gameweek, so its ten rows carry sixty
  // Predictions and cannot be relabelled. The seeding door is the same one --
  // what changes is that the ids it writes step aside.
  test("seats a restarted Competition beside its retired seats, not over them",
    async () => {
      const retiredVersion = "match-pd/2026-27-v1";
      for (const entrant of SEASON_ROSTER) {
        await client.query(
          `insert into models (
             id, name, base_model, provider, quantization, prompt_version, role
           ) values ($1, $2, $3, $4, $5, $6, 'entrant')`,
          [
            entrant.id.replace(/^match\//, "match-pd/"), entrant.name,
            entrant.baseModel, entrant.provider, entrant.quantization,
            retiredVersion
          ]
        );
      }

      await enterSeasonRoster(client, "PD", SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE * 2);

      // The retired ten stand exactly as the Gameweek they played left them:
      // their ids are the ones the Predictions point at, and their version is
      // still the retired one -- which is what the restart would have
      // destroyed by upserting the standing version over them.
      const retired = rows.filter(
        ({ prompt_version }) => prompt_version === retiredVersion
      );
      expect(retired.map(({ id }) => id).sort()).toEqual(
        SEASON_ROSTER
          .map(({ id }) => id.replace(/^match\//, "match-pd/")).sort()
      );

      // And the standing ten are new rows under the version's own segment,
      // seating the roster whole: a re-seat, not a roster change (ADR-0034).
      const standing = rows.filter(
        ({ prompt_version }) => prompt_version === matchPromptOf("PD").version
      );
      expect(standing.map(({ id }) => id).sort()).toEqual(
        SEASON_ROSTER
          .map(({ id }) => `${matchPromptOf("PD").version}/${seatSlug(id)}`)
          .sort()
      );

      // Whole identities and not the Base Model alone (story 14): a door that
      // copied the names and dropped the provider or the quantization pin
      // would seat ten rows with the right ids in front of Base Models the
      // Season was never run with, and a count-and-id assertion would call it
      // a re-seat.
      const identity = ({ name, base_model, provider, quantization }: ModelRow):
      string => JSON.stringify([name, base_model, provider, quantization]);
      expect(standing.map(identity).sort()).toEqual(
        SEASON_ROSTER
          .map(({ name, baseModel, provider, quantization }) =>
            JSON.stringify([name, baseModel, provider, quantization ?? null]))
          .sort()
      );

      // Re-entering is the operator running the door twice, which is how it is
      // run: the ids have to be the same answer both times or the second run
      // seats a third set.
      await enterSeasonRoster(client, "PD", SEASON);
      expect(await entrants()).toHaveLength(SEASON_ROSTER_SIZE * 2);
    });

  test("seats every Competition the Season lists, read from the table",
    async () => {
      await client.query(
        `insert into competitions (competition, season)
         values ('PL', $1), ('PD', $1)`,
        [SEASON]
      );

      // Opening a league is the insert above and no edit here — the shape the
      // scheduler, the scorer and the daily fetch already take.
      const entered = await enterActiveCompetitionRosters(client, SEASON);

      expect(entered).toHaveLength(SEASON_ROSTER_SIZE * 2);
      expect(await entrants()).toHaveLength(SEASON_ROSTER_SIZE * 2);
    });
});

describe("entering the FPL track's Season Roster", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query("truncate models restart identity cascade");
  });

  const fplSeats = async (): Promise<ModelRow[]> => (
    await client.query<ModelRow>(
      `select * from models
        where role = 'entrant' and prompt_version = $1
        order by id`,
      [FPL_PROMPT_VERSION]
    )
  ).rows;

  test("writes one seat per Base Model of the roster, named for the match seat",
    async () => {
      const entered = await enterFplRoster(client, SEASON);

      // The whole roster as one value: a track is ten seats or it is not this
      // Season's, and `startFplTrack` refuses anything else.
      expect(entered).toEqual(
        SEASON_ROSTER.map(({ id }) => `fpl/${seatSlug(id)}`)
      );
      expect((await fplSeats()).map((row) => [
        row.id, row.name, row.base_model, row.provider, row.quantization,
        row.config.baseModelClass, row.config.canonical_slug,
        row.config.catalog_checked_at
      ])).toEqual(
        SEASON_ROSTER
          .map((entrant) => [
            `fpl/${seatSlug(entrant.id)}`, entrant.name, entrant.baseModel,
            entrant.provider, entrant.quantization, entrant.baseModelClass,
            entrant.canonicalSlug, entrant.catalogCheckedAt
          ])
          .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
      );
    });

  test("re-entering seats the same ten, not a second ten", async () => {
    await enterFplRoster(client, SEASON);
    await enterFplRoster(client, SEASON);

    expect((await fplSeats()).map(({ id }) => id)).toEqual(
      SEASON_ROSTER
        .map(({ id }) => `fpl/${seatSlug(id)}`)
        .sort((left, right) => left.localeCompare(right))
    );
  });

  test("leaves the match track's seats where they are, and is left alone",
    async () => {
      await enterSeasonRoster(client, "PL", SEASON);
      await enterFplRoster(client, SEASON);

      // The two tracks are twenty rows, not ten written twice: the doors share
      // a roster and no id, which is the whole reason the FPL one exists
      // rather than an `fpl/` Prompt Version being handed to the match door.
      const rows = await client.query<ModelRow>(
        "select id, prompt_version from models where role = 'entrant'"
      );
      expect(rows.rows).toHaveLength(SEASON_ROSTER_SIZE * 2);
      expect(new Set(rows.rows.map(({ prompt_version }) => prompt_version)))
        .toEqual(new Set([MATCH_PROMPT_VERSION, FPL_PROMPT_VERSION]));
    });

  test("refuses a Season that does not own the FPL Prompt Version", async () => {
    await expect(enterFplRoster(client, "2027-28")).rejects
      .toThrow(`SEASON 2027-28 does not own Prompt Version ${FPL_PROMPT_VERSION}`);
    expect(await fplSeats()).toEqual([]);
  });

  test("refuses to re-enter a seat the record holds as another Base Model",
    async () => {
      // The Season Roster closed at the first Lock (ADR-0034), and an FPL seat
      // is what an insert-only `manager_states` points at: relabelling one
      // rewrites a Season path already played.
      await enterFplRoster(client, SEASON);
      const [seat] = SEASON_ROSTER;
      const id = `fpl/${seatSlug(seat?.id ?? "")}`;
      await client.query(
        "update models set base_model = $1 where id = $2",
        ["z-ai/glm-5.2", id]
      );

      await expect(enterFplRoster(client, SEASON)).rejects.toThrow(
        `Seat ${id} is stored as a different Base Model and the Season Roster `
        + `closed at the Season's first Lock: base_model z-ai/glm-5.2 -> `
        + `${seat?.baseModel} (ADR-0034)`
      );
    });

  const withdrawalOf = async (): Promise<Record<string, string | null>> =>
    Object.fromEntries((await fplSeats()).map((row) => [
      row.id,
      row.withdrawn_at === null ? null : row.withdrawn_at.toISOString()
    ]));

  test("seats every Base Model and dates the ones that left the track",
    async () => {
      await enterFplRoster(client, SEASON);

      // Every seat of the Season Roster is still a row: a withdrawal keeps the
      // Base Model in the record and takes it off the roster (ADR-0047).
      expect((await fplSeats())).toHaveLength(SEASON_ROSTER_SIZE);
      expect(await withdrawalOf()).toEqual(
        Object.fromEntries(SEASON_ROSTER.map(({ id }) => {
          const seat = `fpl/${seatSlug(id)}`;
          const left = FPL_WITHDRAWALS.find((row) => row.id === seat);
          return [
            seat,
            left === undefined
              ? null
              : new Date(left.withdrawnAt).toISOString()
          ];
        }))
      );
      expect(
        (await fplSeats()).filter((row) => row.withdrawn_at === null)
      ).toHaveLength(FPL_ROSTER_SIZE);
    });

  test("leaves a withdrawal where it is when the door runs again", async () => {
    await enterFplRoster(client, SEASON);
    const dated = await withdrawalOf();
    // A date that moved would say the seat left the day the door last ran,
    // which is a different fact from the one the record is for.
    await client.query(
      "update models set withdrawn_at = $1 where id = $2",
      ["2026-08-19T00:00:00Z", FPL_WITHDRAWALS[0]?.id ?? ""]
    );

    await enterFplRoster(client, SEASON);

    expect(await withdrawalOf()).toEqual({
      ...dated,
      [FPL_WITHDRAWALS[0]?.id ?? ""]: "2026-08-19T00:00:00.000Z"
    });
  });

  test("leaves a withdrawn seat's attempts and contexts where they are",
    async () => {
      // The foreign keys are the whole reason this is a date and not a delete:
      // `attempts` and `contexts` hold the calls the withdrawal is read from.
      const id = FPL_WITHDRAWALS[0]?.id ?? "";
      await enterFplRoster(client, SEASON);
      await client.query(
        `insert into gameweeks (competition, season, gw, deadline_at)
         values ('PL', $1, 1, '2026-08-21T17:30:00Z')`,
        [SEASON]
      );
      await client.query(
        `insert into attempts (
           model_id, season, gw, track, trigger, attempt_no, ok, attempted_at
         ) values ($1, $2, 1, 'fpl', 'main', 0, false, now())`,
        [id, SEASON]
      );
      await client.query(
        `insert into contexts (season, gw, track, model_id, hash, body)
         values ($1, 1, 'fpl', $2, 'hash', 'body')`,
        [SEASON, id]
      );

      await enterFplRoster(client, SEASON);

      expect((await client.query(
        "select count(*)::int as n from attempts where model_id = $1", [id]
      )).rows[0].n).toBe(1);
      expect((await client.query(
        "select count(*)::int as n from contexts where model_id = $1", [id]
      )).rows[0].n).toBe(1);
      expect((await client.query(
        "select count(*)::int as n from models where id = $1", [id]
      )).rows[0].n).toBe(1);
    });

  test("leaves every match seat standing, withdrawn Base Models included",
    async () => {
      // A withdrawal is a fact about one track's row. The same Base Models
      // predict Fixtures on the match track and did not leave it (ADR-0047).
      await enterSeasonRoster(client, "PL", SEASON);
      await enterFplRoster(client, SEASON);

      const matchSeats = await client.query<ModelRow>(
        `select * from models
          where role = 'entrant' and prompt_version = $1 order by id`,
        [MATCH_PROMPT_VERSION]
      );
      expect(matchSeats.rows).toHaveLength(SEASON_ROSTER_SIZE);
      expect(matchSeats.rows.every((row) => row.withdrawn_at === null))
        .toBe(true);
    });
});
