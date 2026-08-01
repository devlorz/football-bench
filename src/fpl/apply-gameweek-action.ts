export type Position = "GKP" | "DEF" | "MID" | "FWD";

export const OPENING_BUDGET_TENTHS = 1000;

export interface PoolPlayer {
  fplId: number;
  position: Position;
  club: string;
  priceTenths: number;
}

export interface OwnedPlayer {
  fplId: number;
  purchasePriceTenths: number;
}

export interface TeamSheet {
  starters: number[];
  bench: number[];
  captain: number;
  viceCaptain: number;
}

/**
 * The `active` and `free_hit_stash` keys are the storage shape pinned by
 * ADR-0017 and spec 0003, so they are spelled here exactly as they are stored.
 */
export interface SquadEnvelope {
  active: OwnedPlayer[];
  free_hit_stash: null | {
    squad: OwnedPlayer[];
    team_sheet: TeamSheet;
    bank: number;
  };
}

export type Chip = "wildcard" | "free_hit" | "triple_captain" | "bench_boost";

/** One set per half-Season; the first expires unspent at the GW19 deadline. */
export interface ChipsUsed {
  firstHalf: Chip[];
  secondHalf: Chip[];
}

export interface ManagerState {
  squad: SquadEnvelope;
  teamSheet: TeamSheet | null;
  bankTenths: number;
  freeTransfers: number;
  /** Points owed for this Gameweek's paid Transfers, deducted when it scores. */
  hits: number;
  chipsUsed: ChipsUsed;
  chipActive: Chip | null;
}

export interface GameweekAction {
  transfersIn: number[];
  transfersOut: number[];
  chip: null;
  teamSheet: TeamSheet;
}

export type ViolationKind =
  | "budget"
  | "squad_quota"
  | "club_limit"
  | "unknown_player"
  | "formation"
  | "captain";

export const STARTERS = 11;

/** One goalkeeper exactly; the outfield minimums the real game enforces. */
export const FORMATION_MINIMUMS: Readonly<Record<Position, number>> = {
  GKP: 1,
  DEF: 3,
  MID: 2,
  FWD: 1
};

/**
 * Whether eleven positions are a formation the game would accept. One rule,
 * one place: the reducer judges a proposed Team Sheet with it before the Lock
 * and scoring judges a substituted eleven with it after, and neither can drift
 * from the other by being written down twice.
 */
export function legalFormation(positions: readonly Position[]): boolean {
  const held = (position: Position): number =>
    positions.filter((at) => at === position).length;

  return positions.length === STARTERS
    && held("GKP") === FORMATION_MINIMUMS.GKP
    && held("DEF") >= FORMATION_MINIMUMS.DEF
    && held("MID") >= FORMATION_MINIMUMS.MID
    && held("FWD") >= FORMATION_MINIMUMS.FWD;
}

export const MAX_PLAYERS_PER_CLUB = 3;

/** Free Transfers accrue one per Gameweek and stop banking here. */
export const MAX_FREE_TRANSFERS = 5;

/** What one Transfer beyond the banked Free Transfers costs. */
export const HIT_POINTS = 4;

export const SQUAD_QUOTA: Readonly<Record<Position, number>> = {
  GKP: 2,
  DEF: 5,
  MID: 5,
  FWD: 3
};

export interface Violation {
  kind: ViolationKind;
  message: string;
}

/**
 * The one vocabulary of Violations, frozen for the Season (ADR-0004): these are
 * what an Entrant is shown, so their wording cannot drift while the task is
 * being measured. Several messages may share a kind — the kind drives the
 * violation profile, the message tells the Entrant what to correct.
 */
const VIOLATIONS = {
  budget: {
    kind: "budget",
    message: "A Squad must cost no more than £100.0m."
  },
  duplicatePlayer: {
    kind: "squad_quota",
    message: "A Squad must name fifteen different players."
  },
  squadQuota: {
    kind: "squad_quota",
    message: "A Squad must contain exactly two goalkeepers, five defenders, "
      + "five midfielders and three forwards."
  },
  clubLimit: {
    kind: "club_limit",
    message: "A Squad must contain no more than three players from one club."
  },
  unknownPlayer: {
    kind: "unknown_player",
    message: "Every player must be in this Gameweek's player pool."
  },
  unownedTransferOut: {
    kind: "unknown_player",
    message: "A Transfer can only sell a player your Squad owns."
  },
  repeatedTransferOut: {
    kind: "unknown_player",
    message: "A Transfer can only sell a player once."
  },
  ownedTransferIn: {
    kind: "unknown_player",
    message: "A Transfer can only buy a player your Squad does not own."
  },
  formation: {
    kind: "formation",
    message: "A Team Sheet must start eleven players in a legal formation: "
      + "one goalkeeper, at least three defenders, at least two midfielders "
      + "and at least one forward."
  },
  bench: {
    kind: "formation",
    message: "A Team Sheet must name, in order, the four Squad members who do "
      + "not start."
  },
  captainNotStarting: {
    kind: "captain",
    message: "A Team Sheet's captain and vice-captain must both be among the "
      + "eleven starters."
  },
  captainIsViceCaptain: {
    kind: "captain",
    message: "A Team Sheet's captain and vice-captain must be two different "
      + "players."
  }
} as const satisfies Readonly<Record<string, Violation>>;

/**
 * The same frozen sentences, ordered as rules rather than as complaints, in the
 * order `applyGameweekAction` enforces them. An Entrant is told up front
 * exactly what it will be told if it breaks one, and there is no second wording
 * of a rule that could drift from this one. Every rule the reducer enforces
 * belongs here: refusing an action for a rule the Entrant was never shown
 * changes the difficulty of the task (ADR-0004).
 */
/**
 * Every sentence the reducer can refuse an action with, in no order. Exported
 * so a test can hold `OPENING_RULES` to the invariant stated below rather than
 * leaving it to whoever adds the next Violation to remember.
 */
export const ENFORCED_VIOLATIONS: readonly string[] =
  Object.values(VIOLATIONS).map(({ message }) => message);

export const OPENING_RULES: readonly string[] = [
  VIOLATIONS.unknownPlayer.message,
  VIOLATIONS.unownedTransferOut.message,
  VIOLATIONS.repeatedTransferOut.message,
  VIOLATIONS.ownedTransferIn.message,
  VIOLATIONS.duplicatePlayer.message,
  VIOLATIONS.budget.message,
  VIOLATIONS.squadQuota.message,
  VIOLATIONS.clubLimit.message,
  VIOLATIONS.formation.message,
  VIOLATIONS.bench.message,
  VIOLATIONS.captainNotStarting.message,
  VIOLATIONS.captainIsViceCaptain.message
];

export type GameweekOutcome = { state: ManagerState } | { violation: Violation };

function violation(
  name: keyof typeof VIOLATIONS
): { violation: Violation } {
  return { violation: VIOLATIONS[name] };
}

export function openingManagerState(): ManagerState {
  return {
    squad: { active: [], free_hit_stash: null },
    teamSheet: null,
    bankTenths: OPENING_BUDGET_TENTHS,
    freeTransfers: 0,
    hits: 0,
    chipsUsed: { firstHalf: [], secondHalf: [] },
    chipActive: null
  };
}

/**
 * What an Entrant receives for a player it owns: what it paid, plus half of
 * the rise since, rounded down (CONTEXT.md, Selling Price). Only a rise is
 * halved — a fall is passed on in full, so a player worth less than he cost
 * sells for what he is now worth. The recorded purchase price is the system of
 * record, not the pool's current price (ADR-0003), which is why Manager State
 * carries it at all.
 */
export function sellingPrice(paidTenths: number, listedTenths: number): number {
  return listedTenths <= paidTenths
    ? listedTenths
    : paidTenths + Math.floor((listedTenths - paidTenths) / 2);
}

export function applyGameweekAction(
  state: ManagerState,
  action: GameweekAction,
  pool: PoolPlayer[]
): GameweekOutcome {
  const byId = new Map(pool.map((player) => [player.fplId, player]));
  const bought: PoolPlayer[] = [];
  for (const fplId of action.transfersIn) {
    const player = byId.get(fplId);
    if (player === undefined) {
      return violation("unknownPlayer");
    }
    bought.push(player);
  }

  // An opening Squad is empty, so this refuses every sale before the Season
  // starts and keeps refusing sales of players never owned afterwards.
  const owned = new Map(
    state.squad.active.map((player) => [player.fplId, player])
  );
  if (action.transfersOut.some((fplId) => !owned.has(fplId))) {
    return violation("unownedTransferOut");
  }

  // Before a penny is counted: Selling Price is paid once per named sale, but
  // the Squad below loses each sold player once however many times he is
  // named. A repeat would mint the difference out of nothing, and every later
  // rule still reads a legal fifteen.
  if (new Set(action.transfersOut).size !== action.transfersOut.length) {
    return violation("repeatedTransferOut");
  }

  // A Transfer buys an unowned player (CONTEXT.md, Transfer), judged against
  // the Squad as the Gameweek found it rather than after the sales: selling a
  // player and buying him straight back is the same refusal, and it has to be,
  // because that swap would reset what he cost to what he now costs and hand
  // back a price rise the Entrant is meant to be carrying. Buying a player
  // kept in the Squad is the other half — it would seat fourteen men in
  // fifteen slots while every count below still read legal.
  if (action.transfersIn.some((fplId) => owned.has(fplId))) {
    return violation("ownedTransferIn");
  }

  let received = 0;
  for (const fplId of action.transfersOut) {
    const listed = byId.get(fplId);
    if (listed === undefined) {
      return violation("unknownPlayer");
    }
    const paid = owned.get(fplId)?.purchasePriceTenths ?? 0;
    received += sellingPrice(paid, listed.priceTenths);
  }

  // Without this every later count would admit one player bought twice, which
  // reads as a full Squad but leaves only fourteen players to seat.
  if (new Set(action.transfersIn).size !== action.transfersIn.length) {
    return violation("duplicatePlayer");
  }

  const purchases = bought.map(({ fplId, priceTenths }) => ({
    fplId,
    purchasePriceTenths: priceTenths
  }));
  const spent = purchases.reduce(
    (total, { purchasePriceTenths }) => total + purchasePriceTenths,
    0
  );
  const bankTenths = state.bankTenths + received - spent;
  if (bankTenths < 0) {
    return violation("budget");
  }

  // Every rule below is about the Squad the Entrant ends the Gameweek with,
  // not about what it bought: at the opening those are the same fifteen
  // players, and from Gameweek 2 they are not.
  const sold = new Set(action.transfersOut);
  const squad = [
    ...state.squad.active.filter(({ fplId }) => !sold.has(fplId)),
    ...purchases
  ];
  const held = squad
    .map(({ fplId }) => byId.get(fplId))
    .filter((player): player is PoolPlayer => player !== undefined);

  const quotaMet = Object.entries(SQUAD_QUOTA).every(([position, required]) =>
    held.filter(({ position: at }) => at === position).length === required
  );
  if (!quotaMet) {
    return violation("squadQuota");
  }

  const perClub = new Map<string, number>();
  for (const { club } of held) {
    perClub.set(club, (perClub.get(club) ?? 0) + 1);
  }
  if ([...perClub.values()].some((count) => count > MAX_PLAYERS_PER_CLUB)) {
    return violation("clubLimit");
  }

  const starters = action.teamSheet.starters
    .map((fplId) => byId.get(fplId))
    .filter((player): player is PoolPlayer => player !== undefined);
  if (!legalFormation(starters.map(({ position }) => position))) {
    return violation("formation");
  }

  const seated = [...action.teamSheet.starters, ...action.teamSheet.bench];
  const squadIds = new Set(squad.map(({ fplId }) => fplId));
  const benchSeatsTheRest = new Set(seated).size === seated.length
    && seated.length === squadIds.size
    && seated.every((fplId) => squadIds.has(fplId));
  if (!benchSeatsTheRest) {
    return violation("bench");
  }

  const startingIds = new Set(action.teamSheet.starters);
  if (
    !startingIds.has(action.teamSheet.captain)
    || !startingIds.has(action.teamSheet.viceCaptain)
  ) {
    return violation("captainNotStarting");
  }
  if (action.teamSheet.captain === action.teamSheet.viceCaptain) {
    return violation("captainIsViceCaptain");
  }

  // Nothing is owned before the Season, so the opening fifteen cost no Hit:
  // they are not Transfers beyond an allowance, they are how one begins.
  const paidTransfers = state.squad.active.length === 0
    ? 0
    : Math.max(0, action.transfersIn.length - state.freeTransfers);

  return {
    state: {
      squad: { active: squad, free_hit_stash: null },
      teamSheet: action.teamSheet,
      bankTenths,
      freeTransfers: Math.min(
        Math.max(0, state.freeTransfers - action.transfersIn.length) + 1,
        MAX_FREE_TRANSFERS
      ),
      hits: paidTransfers * HIT_POINTS,
      chipsUsed: state.chipsUsed,
      chipActive: action.chip
    }
  };
}
