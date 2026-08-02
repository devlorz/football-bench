import {
  applyGameweekAction,
  openingManagerState,
  type GameweekAction,
  type GameweekOutcome,
  type ManagerState,
  type PoolPlayer
} from "../src/fpl/apply-gameweek-action.js";
import { LOCKED_POOL } from "./fpl-pool-fixture.js";

export interface ReplayOptions {
  /** The Gameweek the first action is played in. */
  openingGameweek?: number;
  /** The pool as each Gameweek's Lock found it, defaulting to unmoved prices. */
  pools?: readonly PoolPlayer[][];
}

/**
 * One reducer step that the caller asserts is legal. A test that means to set
 * a Manager State up rather than to judge an action wants the state, not an
 * outcome to unwrap — and wants a loud failure if the fixture it built on
 * stops being legal, rather than a confusing assertion three lines later.
 */
export function legalStateFrom(
  action: GameweekAction,
  from: ManagerState = openingManagerState(),
  gameweek = 1
): ManagerState {
  const outcome = applyGameweekAction(from, action, LOCKED_POOL, gameweek);
  if ("violation" in outcome) {
    throw new Error(
      `the fixture action must be legal: ${outcome.violation.kind}`
    );
  }
  return outcome.state;
}

/**
 * A sequence is the unit of test here (spec 0003, §Testing Decisions), so this
 * folds the reducer over a list of actions and stops at the first violation.
 *
 * It stays in the test suite deliberately: production has no consumer for a
 * replay yet, and an exported helper with no caller would be an interface
 * invented by its tests. It lives in its own module rather than beside either
 * suite for the same reason the fixtures do — the Transfer sequences and the
 * Chip sequences prove their rules against one fold, so neither can drift onto
 * a way of replaying a Season the other has never seen.
 *
 * The Gameweek each action is played in matters to the Chip rules and to
 * nothing else, which is why the Transfer sequences leave it at its default.
 */
export function replay(
  actions: readonly GameweekAction[],
  { openingGameweek = 1, pools = [] }: ReplayOptions = {}
): GameweekOutcome {
  return actions.reduce<GameweekOutcome>(
    (outcome, action, played) => "violation" in outcome
      ? outcome
      : applyGameweekAction(
        outcome.state,
        action,
        pools[played] ?? LOCKED_POOL,
        openingGameweek + played
      ),
    { state: openingManagerState() }
  );
}

/** The pool as a later Gameweek's Lock would find it, with prices moved. */
export function repriced(moves: Record<number, number>): PoolPlayer[] {
  return LOCKED_POOL.map((player) => ({
    ...player,
    priceTenths: moves[player.fplId] ?? player.priceTenths
  }));
}
