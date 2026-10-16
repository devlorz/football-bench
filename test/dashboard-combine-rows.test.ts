import { describe, expect, test } from "vitest";
import {
  combineEntrants, combineRecords
} from "../dashboard/src/combine-rows.js";
import {
  combinedOverallLabel, EXHIBITION_LABEL, GUEST_LABEL_PREFIX, partsLabel
} from "../dashboard/src/exhibition-view.js";
import type {
  EntrantGameweek, EntrantRecord, LeaderboardEntrant
} from "../src/dashboard/read-api.js";

/**
 * One Base Model's Exhibition and Guest rows as one (ticket 0119, spec 0029):
 * hand-built split rows in, combined rows out. No DOM, no fetch.
 */

const entrant = (over: Partial<LeaderboardEntrant> = {}): LeaderboardEntrant => ({
  id: "match/claude-opus-5",
  name: "Claude Opus 5",
  baseModelClass: "frontier",
  matchPoints: 30,
  betPoints: 12,
  n: 20,
  exhibition: null,
  role: "entrant",
  baseModel: "anthropic/claude-opus-5",
  guest: null,
  ...over
});

const exhibitionRow = (over: Partial<LeaderboardEntrant> = {}) => entrant({
  id: "exhibition/gemini-4-argon",
  name: "Gemini 4 Argon",
  role: "exhibition",
  baseModel: "google/gemini-4-argon",
  matchPoints: 18,
  betPoints: 7,
  n: 12,
  exhibition: { ranAfterGw: 8, firstGw: 1, lastGw: 6 },
  ...over
});

const guestRow = (over: Partial<LeaderboardEntrant> = {}) => entrant({
  id: "guest/gemini-4-argon",
  name: "Gemini 4 Argon",
  role: "guest",
  baseModel: "google/gemini-4-argon",
  matchPoints: 5,
  betPoints: 2,
  n: 4,
  guest: { fromGw: 7, gapRate: 0.2 },
  ...over
});

describe("a leaderboard", () => {
  test("combines one Base Model's Exhibition and Guest rows into one, summing them",
    () => {
      const [combined, ...rest] =
        combineEntrants([exhibitionRow(), entrant(), guestRow()])
          .filter(({ baseModel }) => baseModel === "google/gemini-4-argon");
      expect(rest).toEqual([]);
      expect(combined).toMatchObject({
        name: "Gemini 4 Argon",
        matchPoints: 23,
        betPoints: 9,
        n: 16,
        guest: { fromGw: 7, gapRate: 0.2 },
        parts: { exhibition: { firstGw: 1, lastGw: 6 }, guest: { fromGw: 7 } }
      });
      // The Exhibition part is in range, so the row carries what the caveat
      // is keyed on.
      expect(combined!.exhibition).not.toBeNull();
    });

  test("passes the Guest's null Gap rate through, never a nought", () => {
    const [combined] = combineEntrants([
      exhibitionRow(), guestRow({ guest: { fromGw: 7, gapRate: null } })
    ]);
    expect(combined!.guest!.gapRate).toBeNull();
  });

  test("keeps null figures null on a Season with nothing scored", () => {
    const [combined] = combineEntrants([
      exhibitionRow({ matchPoints: null, betPoints: null, n: null }),
      guestRow({ matchPoints: null, betPoints: null, n: null })
    ]);
    expect(combined).toMatchObject({ matchPoints: null, betPoints: null, n: null });
  });

  test("with an Exhibition part empty in range, is the Guest's row with no caveat",
    () => {
      const [combined] = combineEntrants([
        exhibitionRow({
          matchPoints: 0, betPoints: 0, n: 0,
          exhibition: { ranAfterGw: 8, firstGw: null, lastGw: null }
        }),
        guestRow()
      ]);
      expect(combined).toMatchObject({
        matchPoints: 5, betPoints: 2, n: 4, exhibition: null,
        parts: { exhibition: null, guest: { fromGw: 7 } }
      });
    });

  test("never combines a Guest with an Entrant or a Shadow of its Base Model", () => {
    const rows = [
      entrant({ id: "match/gemini-4-argon", baseModel: "google/gemini-4-argon" }),
      entrant({
        id: "shadow/gemini-4-argon", role: "shadow", baseModel: "google/gemini-4-argon"
      }),
      guestRow()
    ];
    expect(combineEntrants(rows)).toEqual(rows);
  });

  test("never combines two Base Models", () => {
    const rows = [exhibitionRow({ baseModel: "x-ai/grok-5" }), guestRow()];
    expect(combineEntrants(rows)).toEqual(rows);
  });

  test("passes through a row from a body cached before baseModel or firstGw existed",
    () => {
      const stale = (row: LeaderboardEntrant) =>
        ({ ...row, baseModel: undefined }) as unknown as LeaderboardEntrant;
      const noRange = exhibitionRow({
        exhibition: { ranAfterGw: 8 } as LeaderboardEntrant["exhibition"]
      });
      for (const rows of [
        [stale(exhibitionRow()), stale(guestRow())],
        [noRange, guestRow()]
      ]) {
        expect(combineEntrants(rows)).toEqual(rows);
      }
    });

  test("combines only one Exhibition row with one Guest row of a Base Model", () => {
    // A Guest withdrawn and seated again within the Edition is two Guest rows
    // (the case 0118's test builds); two Exhibition rows is the mirror.
    for (const rows of [
      [exhibitionRow(), exhibitionRow({ id: "exhibition/gemini-4-argon-2" }), guestRow()],
      [exhibitionRow(), guestRow(), guestRow({ id: "guest/gemini-4-argon-2" })]
    ]) {
      expect(combineEntrants(rows)).toEqual(rows);
    }
  });

  test("never combines parts whose Gameweeks overlap", () => {
    const rows = [
      exhibitionRow({ exhibition: { ranAfterGw: 8, firstGw: 1, lastGw: 7 } }),
      guestRow()
    ];
    expect(combineEntrants(rows)).toEqual(rows);
  });

  test("leaves a body with nothing to combine as it was", () => {
    const rows = [entrant(), exhibitionRow(), entrant({ id: "match/other" })];
    expect(combineEntrants(rows)).toEqual(rows);
  });
});

describe("the frozen labels", () => {
  test("name both parts, or the Guest alone when the Exhibition part is empty",
    () => {
      expect(partsLabel({ exhibition: { firstGw: 1, lastGw: 6 }, guest: { fromGw: 7 } }))
        .toBe("Exhibition GW 1–6 · Guest from GW 7");
      expect(partsLabel({ exhibition: { firstGw: 6, lastGw: 6 }, guest: { fromGw: 7 } }))
        .toBe("Exhibition GW 6 · Guest from GW 7");
      expect(partsLabel({ exhibition: null, guest: { fromGw: 7 } }))
        .toBe(GUEST_LABEL_PREFIX + 7);
    });

  test("spell the Exhibition part with one constant, as the Guest's", () => {
    expect(EXHIBITION_LABEL).toBe("Exhibition");
  });

  test("on /overall, name each part's Competitions", () => {
    expect(combinedOverallLabel(["PL", "SA"], ["PL", "SA", "PD"]))
      .toBe("Exhibition · PL, SA · Guest · PL, SA, PD");
  });
});

const week = (gw: number, over: Partial<EntrantGameweek> = {}): EntrantGameweek => ({
  gw, fixtures: 10, settled: 10, matchPoints: 3, betPoints: 1,
  exact: 1, outcome: 4, rps: 0.2, gaps: null, ...over
});

const record = (over: Partial<EntrantRecord> = {}): EntrantRecord => ({
  id: "exhibition/gemini-4-argon",
  name: "Gemini 4 Argon",
  exhibition: { ranAfterGw: 8 },
  role: "exhibition",
  baseModel: "google/gemini-4-argon",
  guest: null,
  matchPoints: 6,
  betPoints: 2,
  rps: 0.2,
  gaps: null,
  n: 20,
  tiers: [{ points: 5, count: 2 }, { points: 3, count: 0 }, { points: 2, count: 3 },
    { points: 0, count: 15 }],
  markets: [{ market: "result", hits: 5, n: 20 }, { market: "btts", hits: 9, n: 20 }],
  // The Exhibition record spans the field's Gameweeks, noughts after its last.
  gameweeks: [week(1), week(2), week(3, { settled: 0, matchPoints: 0, betPoints: 0,
    exact: 0, outcome: 0, rps: null })],
  ...over
});

const guestRecord = (over: Partial<EntrantRecord> = {}) => record({
  id: "guest/gemini-4-argon",
  exhibition: null,
  role: "guest",
  guest: { fromGw: 3, gapRate: 0.1 },
  matchPoints: 4,
  betPoints: 3,
  rps: 0.5,
  gaps: 1,
  n: 10,
  tiers: [{ points: 5, count: 1 }, { points: 3, count: 1 }, { points: 2, count: 0 },
    { points: 0, count: 8 }],
  markets: [{ market: "result", hits: 2, n: 10 }, { market: "btts", hits: 6, n: 10 }],
  gameweeks: [week(3, { gaps: 1, rps: 0.5 })],
  ...over
});

describe("a record", () => {
  test("is one history naming the part that answered each Gameweek", () => {
    const [combined] = combineRecords([record(), guestRecord()]);
    expect(combined!.gameweeks.map(({ gw, part }) => [gw, part])).toEqual([
      [1, "exhibition"], [2, "exhibition"], [3, "guest"]
    ]);
    expect(combined).toMatchObject({
      matchPoints: 10,
      betPoints: 5,
      n: 30,
      gaps: 1,
      guest: { fromGw: 3, gapRate: 0.1 },
      parts: { exhibition: { firstGw: 1, lastGw: 2 }, guest: { fromGw: 3 } },
      tiers: [{ points: 5, count: 3 }, { points: 3, count: 1 }, { points: 2, count: 3 },
        { points: 0, count: 23 }],
      markets: [{ market: "result", hits: 7, n: 30 }, { market: "btts", hits: 15, n: 30 }]
    });
    // (0.2 × 20 + 0.5 × 10) / 30
    expect(combined!.rps).toBeCloseTo(0.3, 10);
    expect(combined!.exhibition).not.toBeNull();
  });

  test("names the replayed range by the weeks answered, not by a hole before the Guest", () => {
    // Before the top-up replay (ADR-0065), the Exhibition's last answered week
    // can sit short of the Guest's first Lock: Gameweek 3 here answered nothing.
    const [combined] = combineRecords([
      record(),
      guestRecord({ guest: { fromGw: 4, gapRate: 0.1 }, gameweeks: [week(4, { gaps: 1 })] })
    ]);
    expect(combined!.parts).toEqual({
      exhibition: { firstGw: 1, lastGw: 2 }, guest: { fromGw: 4 }
    });
    expect(combined!.gameweeks.map(({ gw, part }) => [gw, part])).toEqual([
      [1, "exhibition"], [2, "exhibition"], [3, "exhibition"], [4, "guest"]
    ]);
  });

  test("with an Exhibition part empty in range, carries no caveat", () => {
    const empty = record({
      matchPoints: 0, betPoints: 0, rps: null, n: 0,
      gameweeks: [week(3, { settled: 0, matchPoints: 0, rps: null })]
    });
    const [combined] = combineRecords([empty, guestRecord()]);
    expect(combined).toMatchObject({
      exhibition: null, rps: 0.5, n: 10,
      parts: { exhibition: null, guest: { fromGw: 3 } }
    });
    expect(combined!.gameweeks.map(({ gw, part }) => [gw, part])).toEqual([[3, "guest"]]);
  });

  test("never combines records whose answered Gameweeks overlap", () => {
    const records = [
      record({ gameweeks: [week(1), week(2), week(3)] }),
      guestRecord()
    ];
    expect(combineRecords(records)).toEqual(records);
  });

  test("keeps a tier or market only one part holds", () => {
    const [combined] = combineRecords([
      record({ markets: [{ market: "result", hits: 5, n: 20 }, { market: "btts", hits: 9, n: 20 }] }),
      guestRecord({ markets: [{ market: "result", hits: 2, n: 10 }] })
    ]);
    expect(combined!.markets).toEqual([
      { market: "result", hits: 7, n: 30 }, { market: "btts", hits: 9, n: 20 }
    ]);
  });

  test("passes an Entrant's record through untouched", () => {
    const entrantRecord = record({
      id: "match/gemini-4-argon", role: "entrant", exhibition: null
    });
    expect(combineRecords([entrantRecord, guestRecord()]))
      .toEqual([entrantRecord, guestRecord()]);
  });
});
