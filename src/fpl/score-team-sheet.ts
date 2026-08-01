import {
  legalFormation,
  type Position,
  type TeamSheet
} from "./apply-gameweek-action.js";

/**
 * What a player did in one Settled Gameweek, as `fpl_player_points` stores it.
 * `minutes` is the appearance evidence: a starter who did not play is a row
 * with zero minutes, not a missing row.
 */
export interface PlayerGameweekPoints {
  fplId: number;
  minutes: number;
  totalPoints: number;
}

/**
 * A player's position, looked up across the Season rather than for one
 * Gameweek. Scoring never prices anybody, so it needs none of the rest of the
 * locked pool — and a Gameweek whose pre-Lock snapshot was missed still has to
 * be scoreable (migration 0011).
 */
export interface PlayerPosition {
  fplId: number;
  position: Position;
}

export interface ScoreTeamSheetOptions {
  teamSheet: TeamSheet;
  positions: readonly PlayerPosition[];
  points: readonly PlayerGameweekPoints[];
  /** Points owed for the Gameweek's paid Transfers, deducted here. */
  hits: number;
}

/** One member of the scored eleven, and whether the armband doubled him. */
export interface PlayerContribution {
  fplId: number;
  points: number;
  multiplier: number;
}

/**
 * Everything the total was made of, so a stored score can be traced back to
 * the Team Sheet and the settled points rather than recomputed to be believed.
 */
export interface ScoreDetail {
  players: PlayerContribution[];
  substitutions: Replacement[];
  /** Who actually wore the armband, or nobody when neither of the two played. */
  captain: number | null;
  hits: number;
}

export interface ScoredTeamSheet {
  points: number;
  detail: ScoreDetail;
}

/** One absent starter and the bench player who takes his place. */
export interface Replacement {
  out: number;
  in: number;
}

/**
 * Whether an eleven is a formation the game would accept. It is always eleven:
 * a starter who did not play is not vacated from the Team Sheet, so an absent
 * starter nobody could replace still holds his place — and still counts toward
 * the formation, at nothing. A player whose position is unknown makes the
 * eleven unjudgeable rather than counting toward no position, which would read
 * as a formation short of that place.
 *
 * The one goalkeeper is also why both goalkeepers sitting out stops no outfield
 * substitution: the absent starting goalkeeper keeps the side its goalkeeper.
 */
function legalEleven(
  eleven: readonly number[],
  positionOf: (fplId: number) => Position | undefined
): boolean {
  const positions = eleven.map(positionOf);
  return positions.every((position) => position !== undefined)
    && legalFormation(positions);
}

/** The eleven the Team Sheet becomes once the replacements are made. */
function afterReplacements(
  starters: readonly number[],
  plan: readonly Replacement[]
): number[] {
  return starters.map(
    (fplId) => plan.find(({ out }) => out === fplId)?.in ?? fplId
  );
}

/**
 * Which absent starters are replaced, and by whom. A bench player is not
 * eligible on his own account but on the eleven he would leave behind, which is
 * what lets a blocked player be passed over for one behind him.
 *
 * The game substitutes per absent starter rather than as one transaction: as
 * many places are taken as can legally be taken, and a starter nobody can
 * replace keeps his place at nothing rather than cancelling the replacements
 * that were possible. So the largest legal plan wins, and only among equally
 * large plans does the order the Entrant set decide — trying a bench player
 * before skipping him is what makes that preference bench-ordered.
 *
 * Which absent starter a substitute is paired with changes the formation but
 * never the points, since the man leaving scored nothing either way.
 */
function chooseReplacements(
  starters: readonly number[],
  absent: readonly number[],
  eligible: readonly number[],
  legal: (eleven: readonly number[]) => boolean,
  keeper: (fplId: number) => boolean
): readonly Replacement[] {
  const search = (
    index: number,
    plan: readonly Replacement[],
    target: number
  ): readonly Replacement[] | null => {
    if (plan.length === target) {
      return legal(afterReplacements(starters, plan)) ? plan : null;
    }
    const candidate = eligible[index];
    if (candidate === undefined) {
      return null;
    }
    for (const out of absent) {
      if (plan.some((replacement) => replacement.out === out)) {
        continue;
      }
      // The goalkeeping place is taken by a goalkeeper and an outfield place by
      // an outfielder. The finished formation cannot be trusted to enforce this
      // on its own: putting the reserve keeper in an outfielder's place and an
      // outfielder in the keeper's counts the same eleven positions and passes,
      // while naming two substitutions the game would never make.
      if (keeper(out) !== keeper(candidate)) {
        continue;
      }
      const found = search(
        index + 1,
        [...plan, { out, in: candidate }],
        target
      );
      if (found !== null) {
        return found;
      }
    }
    return search(index + 1, plan, target);
  };

  for (
    let target = Math.min(absent.length, eligible.length);
    target > 0;
    target -= 1
  ) {
    const plan = search(0, [], target);
    if (plan !== null) {
      return plan;
    }
  }

  return [];
}

export function scoreTeamSheet({
  teamSheet,
  positions,
  points,
  hits
}: ScoreTeamSheetOptions): ScoredTeamSheet {
  const positionOf = new Map(
    positions.map(({ fplId, position }) => [fplId, position])
  );
  const settled = new Map(points.map((player) => [player.fplId, player]));
  const played = (fplId: number): boolean =>
    (settled.get(fplId)?.minutes ?? 0) > 0;
  // Minutes are the appearance evidence, so they decide alone: a man who did
  // not play scores nothing for this Team Sheet whatever the feed carries
  // beside his name.
  const pointsOf = (fplId: number): number =>
    played(fplId) ? settled.get(fplId)?.totalPoints ?? 0 : 0;

  // A bench player who did not play cannot come on, so an absent starter the
  // bench cannot cover keeps his place and scores nothing.
  const plan = chooseReplacements(
    teamSheet.starters,
    teamSheet.starters.filter((fplId) => !played(fplId)),
    teamSheet.bench.filter(played),
    (eleven) => legalEleven(eleven, (fplId) => positionOf.get(fplId)),
    (fplId) => positionOf.get(fplId) === "GKP"
  );

  // The armband passes to the vice-captain only when the captain did not play
  // at all; a captain who played and scored nothing still doubles nothing.
  // When neither played there is nobody to double. A substitute never inherits
  // the armband from the man he replaced.
  const nominated = played(teamSheet.captain)
    ? teamSheet.captain
    : teamSheet.viceCaptain;
  const captain = played(nominated) ? nominated : null;

  const players = afterReplacements(teamSheet.starters, plan).map((fplId) => ({
    fplId,
    points: pointsOf(fplId),
    multiplier: fplId === captain ? 2 : 1
  }));
  const scored = players.reduce(
    (total, { points: scored, multiplier }) => total + scored * multiplier,
    0
  );

  return {
    points: scored - hits,
    detail: { players, substitutions: [...plan], captain, hits }
  };
}
