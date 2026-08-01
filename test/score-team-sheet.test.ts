import { describe, expect, test } from "vitest";
import { scoreTeamSheet } from "../src/fpl/score-team-sheet.js";
import type { TeamSheet } from "../src/fpl/apply-gameweek-action.js";
import { FPL_POOL, positionsOf } from "./fpl-pool-fixture.js";
import { OPENING_ACTION as OPENING } from "./fpl-action-fixture.js";
import { EVERYONE_PLAYED, absent } from "./fpl-points-fixture.js";

const POSITIONS = positionsOf(FPL_POOL);

/**
 * The opening eleven with the bench reordered so the goalkeeper is third.
 * Bench order is the Entrant's to choose, and putting outfielders ahead of the
 * reserve keeper is what makes the goalkeeping rule observable.
 */
const KEEPER_BENCHED_THIRD: TeamSheet = {
  ...OPENING.teamSheet,
  bench: [7, 12, 2, 15]
};

/**
 * The same fifteen in a 1-3-4-3. Three at the back is what makes an absent
 * defender's place load-bearing: lose it and the formation is illegal, so the
 * eleven can only stay legal if he keeps it.
 */
const THREE_AT_THE_BACK: TeamSheet = {
  starters: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
  bench: [2, 6, 7, 12],
  captain: 8,
  viceCaptain: 13
};

/**
 * Palmer captains and did not play. Nobody on the bench played either, so no
 * substitute is eligible and the eleven score as they stand — which keeps this
 * a test of the armband alone.
 */
const CAPTAIN_ABSENT = absent([8, 2, 7, 12, 15]);

describe("Scoring a Team Sheet whose eleven starters all played", () => {
  /**
   * The eleven score 6+2+5+1+2+9+3+7+2+4+8 = 49. Palmer captains and is
   * counted a second time for 9 more, so 58. The four on the bench outscore
   * them between them and contribute nothing.
   */
  test("counts the starters once, the captain twice and the bench never", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: EVERYONE_PLAYED,
      hits: 0
    })).toMatchObject({ points: 58 });
  });

  /** The same Gameweek after one paid Transfer: 58 - 4 = 54. */
  test("deducts the Hits owed for this Gameweek's paid Transfers", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: EVERYONE_PLAYED,
      hits: 4
    })).toMatchObject({ points: 54 });
  });
});

describe("Scoring a Team Sheet whose captain did not play", () => {
  /**
   * The ten who played score 6+2+5+1+2+3+7+2+4+8 = 40 with Palmer contributing
   * nothing. Jimenez is vice-captain and played, so he takes the armband and is
   * counted a second time for 4 more.
   */
  test("promotes a vice-captain who played", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: CAPTAIN_ABSENT,
      hits: 0
    })).toMatchObject({ points: 44 });
  });
});

describe("Substituting a starter who did not play", () => {
  /**
   * Garner, a midfielder, did not play. The bench reads Kelleher, Cucurella,
   * Alcaraz, Wilson, so the first outfielder on it is Cucurella, a defender —
   * and a 1-5-3-2 is legal, so he comes on rather than the midfielder behind
   * him. The ten who played score 6+2+5+1+2+9+3+7+4+8 = 47, Cucurella adds 9
   * for 56, and Palmer captains for 9 more.
   */
  test("takes the first bench player whose formation stays legal", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: absent([11]),
      hits: 0
    })).toMatchObject({ points: 65 });
  });

  /**
   * Raya did not play, and this Entrant benched Kelleher third. Two outfielders
   * who played stand ahead of him, so a rule that merely took the bench in
   * order would bring Cucurella on; only Kelleher can fill a goalkeeping
   * vacancy. The ten score 2+5+1+2+9+3+7+2+4+8 = 43, Kelleher adds 10 for 53,
   * and Palmer captains for 9 more.
   */
  test("fills a goalkeeping vacancy from the bench goalkeeper alone", () => {
    expect(scoreTeamSheet({
      teamSheet: KEEPER_BENCHED_THIRD,
      positions: POSITIONS,
      points: absent([1]),
      hits: 0
    })).toMatchObject({ points: 62 });
  });

  /**
   * Collins and Ajer both missed, leaving two defenders where three are
   * required and two places to fill. Kelleher heads the bench and played, but
   * a second goalkeeper is no formation at all, so he is skipped for Cucurella
   * and Alcaraz behind him — a 1-3-5-2. The nine who played score
   * 6+2+5+9+3+7+2+4+8 = 46, the two substitutes add 9+11 = 20 for 66, and
   * Palmer captains for 9 more.
   */
  test("skips a bench player the formation blocks and takes the next", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: absent([5, 6]),
      hits: 0
    })).toMatchObject({ points: 75 });
  });

  /**
   * Ndiaye and Garner both missed, and of the bench only Kelleher and
   * Cucurella played — two places open and two men who could take them, but no
   * pair of them is a formation, because Kelleher would be a second
   * goalkeeper. Rather than abandon both substitutions the game makes the one
   * it can: Cucurella comes on into a 1-5-2-2 of ten, and the eleventh place
   * stays empty and scores nothing. The nine who played score
   * 6+2+5+1+2+9+3+4+8 = 40, Cucurella adds 9 for 49, and Palmer captains for 9
   * more.
   */
  test("fills what it can and leaves the rest of the side short", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: absent([10, 11, 12, 15]),
      hits: 0
    })).toMatchObject({ points: 58 });
  });

  /**
   * Neither goalkeeper played. Raya keeps his place and scores nothing, because
   * Kelleher is the only man who could have taken it and he did not play —
   * which leaves the side one goalkeeper, so Garner's place can still be filled
   * from the bench as it always could. The ten outfielders and the empty
   * goalkeeper score 0+2+5+1+2+9+3+7+4+8 = 41, Cucurella adds 9 for 50, and
   * Palmer captains for 9 more.
   */
  test("substitutes outfielders while both goalkeepers sit out", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: absent([1, 2, 11]),
      hits: 0
    })).toMatchObject({ points: 59 });
  });

  /**
   * A 1-3-4-3, so every defender is one of the three the formation needs.
   * Collins and Garner missed, a defender and a midfielder, and Alcaraz is the
   * only bench player who played. He replaces Garner and not Collins: taking
   * the defender's place would leave two defenders, while taking the
   * midfielder's leaves the eleven legal — because Collins, absent, is not
   * vacated and still holds the third defending place at nothing. The ten who
   * count score 6+2+5+9+3+7+4+8+12 = 56 with Collins at nothing, Alcaraz adds
   * 11 for 67, and Palmer captains for 9 more.
   */
  test("leaves an unreplaceable starter in place at nothing", () => {
    expect(scoreTeamSheet({
      teamSheet: THREE_AT_THE_BACK,
      positions: POSITIONS,
      points: absent([5, 11, 2, 6, 7]),
      hits: 0
    })).toMatchObject({ points: 76 });
  });
});

describe("Scoring a starter the bench could not replace", () => {
  /**
   * Collins played no minutes but carries stored points anyway. He keeps his
   * place because nobody on the bench played, and an absent starter scores
   * nothing whatever the feed says beside his name — minutes are the
   * appearance evidence, so the ten who played score 6+2+5+2+9+3+7+2+4+8 = 48
   * and Palmer's armband adds 9 for 57.
   */
  test("scores him nothing even when the feed carries points for him", () => {
    const stored = EVERYONE_PLAYED.map((player) => {
      if (player.fplId === 5) {
        return { fplId: 5, minutes: 0, totalPoints: -3 };
      }
      return [2, 7, 12, 15].includes(player.fplId)
        ? { ...player, minutes: 0, totalPoints: 0 }
        : player;
    });

    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: stored,
      hits: 0
    })).toMatchObject({
      points: 57,
      detail: {
        players: expect.arrayContaining([
          { fplId: 5, points: 0, multiplier: 1 }
        ])
      }
    });
  });

  /**
   * Raya and Garner both missed, and this Entrant benched Alcaraz ahead of
   * Kelleher. Two places and two men to take them, but only one pairing is the
   * game: Kelleher takes the goalkeeping place and Alcaraz the midfielder's.
   * Swapping the pair over leaves the same eleven positions and so the same
   * total, which is exactly why the record has to name the pairs rather than
   * be trusted because the number looked right. The pairs are recorded in the
   * order the substitutions happen, which is the order of the bench.
   */
  test("never puts a goalkeeper in an outfielder's place", () => {
    expect(scoreTeamSheet({
      teamSheet: { ...OPENING.teamSheet, bench: [12, 2, 7, 15] },
      positions: POSITIONS,
      points: absent([1, 11, 7, 15]),
      hits: 0
    }).detail.substitutions).toEqual([
      { out: 11, in: 12 },
      { out: 1, in: 2 }
    ]);
  });
});

describe("The record a scored Team Sheet leaves behind", () => {
  /**
   * The hard case again, this time after a paid Transfer: Collins and Ajer
   * missed, Cucurella and Alcaraz replaced them, Palmer captained and four
   * points were owed. Every number in the total is named — the eleven who
   * counted with what each contributed and who was doubled, both replacements,
   * and the Hit — so 6+2+5+9+11+9+3+7+2+4+8 = 66, the armband's 9 and the
   * Hit's -4 can each be traced from the record rather than recomputed.
   */
  test("names the eleven, the replacements, the armband and the Hit", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: absent([5, 6]),
      hits: 4
    })).toEqual({
      points: 71,
      detail: {
        players: [
          { fplId: 1, points: 6, multiplier: 1 },
          { fplId: 3, points: 2, multiplier: 1 },
          { fplId: 4, points: 5, multiplier: 1 },
          { fplId: 7, points: 9, multiplier: 1 },
          { fplId: 12, points: 11, multiplier: 1 },
          { fplId: 8, points: 9, multiplier: 2 },
          { fplId: 9, points: 3, multiplier: 1 },
          { fplId: 10, points: 7, multiplier: 1 },
          { fplId: 11, points: 2, multiplier: 1 },
          { fplId: 13, points: 4, multiplier: 1 },
          { fplId: 14, points: 8, multiplier: 1 }
        ],
        substitutions: [
          { out: 5, in: 7 },
          { out: 6, in: 12 }
        ],
        captain: 8,
        hits: 4
      }
    });
  });

  /**
   * The armband moved: Palmer captained and did not play, so Jimenez wore it
   * instead. The record names who was actually doubled rather than who the
   * Team Sheet nominated, and no bench player played, so nothing was replaced.
   */
  test("names the vice-captain when the armband passed to him", () => {
    expect(scoreTeamSheet({
      teamSheet: OPENING.teamSheet,
      positions: POSITIONS,
      points: CAPTAIN_ABSENT,
      hits: 0
    }).detail).toMatchObject({ captain: 13, substitutions: [] });
  });
});
