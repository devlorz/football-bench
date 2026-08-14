/**
 * The scenario an operator rehearses: one Squad drawn from the archived pool,
 * a scripted answer for every Entrant in every Gameweek, and the points each
 * Gameweek settled with.
 *
 * It lives here rather than in the test suite because the command runs it. A
 * script the tests owned would leave the operator rehearsing something no test
 * had ever asserted, which is the opposite of the point — the hand-computed
 * totals in `test/rehearse-fpl-track.test.ts` are what hold these values to
 * account.
 */
import type { Chip } from "../fpl/apply-gameweek-action.js";

export interface ScriptedPoints {
  minutes: number;
  totalPoints: number;
}

/**
 * The Squad every rehearsed Entrant opens with, named from the archived pool:
 * £98.5m over two goalkeepers, five defenders, five midfielders and three
 * forwards, three of them Arsenal, which leaves £1.5m in the bank and sits
 * exactly on the club limit.
 */
export const OPENING = JSON.stringify({
  transfers_in: [
    1, 58, 6, 356, 229, 173, 66, 154, 427, 13, 132, 163, 411, 55, 107
  ],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 6, 356, 229, 173, 154, 427, 13, 132, 411, 55],
    bench: [58, 66, 163, 107],
    captain: 411,
    vice_captain: 154
  }
});

/** The same Team Sheet again with no Transfer: what inaction looks like. */
export const STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: (JSON.parse(OPENING) as { team_sheet: unknown }).team_sheet
});

/**
 * The opening with the armband on a substitute: every player is still being
 * bought legally, so the only rule broken is the captain's.
 *
 * Only usable at an opening. Its fifteen Transfers are what makes an opening an
 * opening, and replaying them in a later Gameweek would buy players the
 * Entrant already owns — which breaks a different rule, and would make a test
 * about captaincy pass for a reason that has nothing to do with it.
 */
export const BENCHED_CAPTAIN_OPENING = JSON.stringify({
  ...JSON.parse(OPENING) as object,
  team_sheet: {
    ...(JSON.parse(OPENING) as { team_sheet: object }).team_sheet,
    captain: 107
  }
});

/**
 * The same mistake in a later Gameweek: nothing is transferred and the armband
 * is on a substitute, so what comes back is a sentence about captaincy and
 * nothing else.
 */
export const BENCHED_CAPTAIN = JSON.stringify({
  ...JSON.parse(STAND_PAT) as object,
  team_sheet: {
    ...(JSON.parse(STAND_PAT) as { team_sheet: object }).team_sheet,
    captain: 107
  }
});

/**
 * Watkins and Furo out, Isak and Mheuka in, forward for forward. Two Transfers
 * against one banked Free Transfer, so the second is a Hit — and Watkins is the
 * player the pool moves under, so what is received for him is Selling Price
 * rather than either his purchase price or his listing.
 */
export const SELL_INTO_A_RISE = JSON.stringify({
  transfers_in: [379, 169],
  transfers_out: [55, 107],
  chip: null,
  team_sheet: {
    starters: [1, 6, 356, 229, 173, 154, 427, 13, 132, 411, 379],
    bench: [58, 66, 163, 169],
    captain: 411,
    vice_captain: 154
  }
});

/** The rebuilt Squad standing pat, which is legal only where the rebuild lasted. */
export const REBUILT_STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: (JSON.parse(SELL_INTO_A_RISE) as { team_sheet: unknown })
    .team_sheet
});

/**
 * The same Squad with only three Defenders starting and a Forward first off
 * the bench. That is where the substitution ordering rule is hard: with a
 * Defender absent, Furo cannot come on without leaving the formation illegal,
 * so Thomas is taken from behind him.
 */
export const THREE_AT_THE_BACK = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 6, 356, 229, 154, 427, 13, 132, 163, 411, 55],
    bench: [58, 107, 173, 66],
    captain: 411,
    vice_captain: 154
  }
});

/**
 * The same action played under a Chip. Typed to the four the rules know, so a
 * script cannot name a fifth and reach the reducer as a schema failure.
 */
export function withChip(action: string, chip: Chip): string {
  return JSON.stringify({ ...JSON.parse(action) as object, chip });
}

/**
 * What the opening Squad came to in a settled Gameweek, hand-computed.
 *
 * The eleven who start score 6+2+5+1+2+9+3+7+2+12+8 = 57, Haaland's armband
 * adds his 12 again for 69, and the four on the bench are worth 42 between
 * them — deliberately more than several starters, so a rule that quietly
 * counted them would show as a number nobody can reach by accident.
 */
export const EVERYONE_PLAYED: Readonly<Record<number, ScriptedPoints>> = {
  1: { minutes: 90, totalPoints: 6 },
  6: { minutes: 90, totalPoints: 2 },
  356: { minutes: 90, totalPoints: 5 },
  229: { minutes: 90, totalPoints: 1 },
  173: { minutes: 90, totalPoints: 2 },
  154: { minutes: 90, totalPoints: 9 },
  427: { minutes: 90, totalPoints: 3 },
  13: { minutes: 90, totalPoints: 7 },
  132: { minutes: 90, totalPoints: 2 },
  411: { minutes: 90, totalPoints: 12 },
  55: { minutes: 90, totalPoints: 8 },
  58: { minutes: 90, totalPoints: 10 },
  66: { minutes: 90, totalPoints: 9 },
  163: { minutes: 90, totalPoints: 11 },
  107: { minutes: 90, totalPoints: 12 }
};

/** The plain Gameweek every Entrant's opening Squad scores. */
export const OPENING_GAMEWEEK_POINTS = 69;

/** The same Gameweek with the named players left out of the matchday squads. */
export function absent(
  fplIds: readonly number[]
): Record<number, ScriptedPoints> {
  return Object.fromEntries(
    Object.entries(EVERYONE_PLAYED).map(([id, scored]) =>
      [id, fplIds.includes(Number(id))
        ? { minutes: 0, totalPoints: 0 }
        : scored])
  );
}

/** Watkins rises three tenths, so selling him pays purchase plus one. */
export const WATKINS_RISE: Readonly<Record<number, number>> = { 55: 83 };

/** Soler, bought at the opening for £4.0m and traded by one seat. */
export const SOLER = 66;

/**
 * Soler falls three tenths, so selling him pays his lower current price rather
 * than the £4.0m he was bought for — the mirror of Watkins' rise, and the fall
 * the faller seat sells into.
 */
export const SOLER_FALL: Readonly<Record<number, number>> = { [SOLER]: 37 };

/** García, who replaces Soler at the same £4.0m the fall was measured from. */
export const GARCIA = 38;

/**
 * Soler out, García in, Defender for Defender at £4.0m apiece.
 *
 * One Transfer against one banked Free Transfer, so no Hit — which leaves the
 * bank saying one thing only: what a fallen player sold for. Like for like at
 * the listing, so what comes back cannot be a bargain the replacement found.
 * García is Villa's second seat and Bournemouth loses one, so the club limit
 * the opening Squad sits on is untouched.
 */
export const SELL_THE_FALLER = JSON.stringify({
  transfers_in: [GARCIA],
  transfers_out: [SOLER],
  chip: null,
  team_sheet: {
    starters: [1, 6, 356, 229, 173, 154, 427, 13, 132, 411, 55],
    bench: [58, GARCIA, 163, 107],
    captain: 411,
    vice_captain: 154
  }
});

/**
 * The Squad after that sale standing pat, which is what leaves Gameweek 3
 * asking whether a replacement who never plays can be substituted on.
 */
export const FALLER_STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: (JSON.parse(SELL_THE_FALLER) as { team_sheet: unknown })
    .team_sheet
});
