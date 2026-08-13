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

/**
 * Every Chip, in the order the Premier League's 2026/27 Chips announcement
 * lists them. This tuple is the one inventory: the `Chip` type is read off it,
 * the boundary that parses an Entrant's action enumerates it, and the context
 * that tells an Entrant what it still holds prints it. Three readers, one
 * list — spelling the four names out a second time somewhere else is what
 * would let a Chip exist in the rules and be unplayable at the boundary, or
 * be offered in the context and unjudgeable by the rules.
 */
export const CHIPS = [
  "wildcard",
  "free_hit",
  "triple_captain",
  "bench_boost"
] as const;

export type Chip = (typeof CHIPS)[number];

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
  chip: Chip | null;
  teamSheet: TeamSheet;
}

/**
 * Every kind a refused action can be recorded under. The `Violation` type is
 * read off this tuple so that the kinds are one list rather than a type in one
 * place and a vocabulary in another, and the reason to spell them as values at
 * all is that the violation profile counts them: a profile is only complete if
 * something can enumerate the columns it must have.
 *
 * A malformed response is not here. It breaks no rule of the game — it is not
 * an action at all — and counting it beside a club-limit breach would put a
 * failure to return JSON into a profile of how an Entrant manages a Squad.
 */
export const VIOLATION_KINDS = [
  "budget",
  "squad_quota",
  "club_limit",
  "unknown_player",
  "formation",
  "captain",
  "chip_unavailable"
] as const;

export type ViolationKind = (typeof VIOLATION_KINDS)[number];

/**
 * The last Gameweek of the first half-Season. The first set of Chips is
 * playable up to and including its deadline and cannot be carried past it:
 * "they cannot be carried over into the second half" (Premier League, 2026/27
 * Chips announcement). Nothing has to discard the set, because which set an
 * action draws from is decided by the Gameweek it is played in.
 */
export const FIRST_HALF_FINAL_GAMEWEEK = 19;

function halfOf(gameweek: number): keyof ChipsUsed {
  return gameweek <= FIRST_HALF_FINAL_GAMEWEEK ? "firstHalf" : "secondHalf";
}

/**
 * How many Chips an Entrant still holds for a Gameweek it has yet to play —
 * `playedIn` is the Gameweek a Chip counted here would be played in, and never
 * one already behind the Entrant.
 *
 * Both sets while the first is still playable and the second alone after it,
 * because the first set expires unspent at the Gameweek 19 deadline: a count
 * of eight less what was spent would go on offering four Chips nobody can play
 * for the whole second half. The boundary is the deadline and not the Gameweek,
 * which is why a caller reading a Settled Gameweek 19 asks about Gameweek 20 —
 * by the time that Gameweek has settled its deadline is long past, and the set
 * with it.
 *
 * It says nothing about what that Gameweek would *accept*, which is a different
 * question with a different answer: `chipRefusal` is the one that knows a Free
 * Hit is withheld the Gameweek after a Free Hit.
 */
export function chipsRemaining(used: ChipsUsed, playedIn: number): number {
  const second = CHIPS.length - used.secondHalf.length;
  return playedIn <= FIRST_HALF_FINAL_GAMEWEEK
    ? second + CHIPS.length - used.firstHalf.length
    : second;
}

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
 *
 * Exported so that anything writing a refusal quotes one of these rather than
 * wording its own. `ENFORCED_VIOLATIONS` below is the same values without
 * their names, which is what a caller wanting a particular refusal needs.
 */
export const VIOLATIONS = {
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
  },
  chipAlreadySpent: {
    kind: "chip_unavailable",
    message: "A Chip can only be played once in each half of the Season."
  },
  openingGameweekChip: {
    kind: "chip_unavailable",
    message: "A Wildcard or Free Hit cannot be played in the Gameweek the "
      + "track opens on, where every Transfer is already free."
  },
  consecutiveFreeHit: {
    kind: "chip_unavailable",
    message: "A Free Hit cannot be played in the Gameweek straight after a "
      + "Free Hit."
  }
} as const satisfies Readonly<Record<string, Violation>>;

/**
 * Every refusal the reducer can return, in no order. Exported so a test can
 * hold `GAMEWEEK_RULES` to the invariant stated below, and `VIOLATION_KINDS` to
 * the one above it, rather than leaving either to whoever adds the next
 * Violation to remember.
 */
export const ENFORCED_VIOLATIONS: readonly Violation[] =
  Object.values(VIOLATIONS);

/**
 * The same frozen sentences, ordered as rules rather than as complaints, in the
 * order `applyGameweekAction` enforces them. An Entrant is told up front
 * exactly what it will be told if it breaks one, and there is no second wording
 * of a rule that could drift from this one. Every rule the reducer enforces
 * belongs here: refusing an action for a rule the Entrant was never shown
 * changes the difficulty of the task (ADR-0004).
 *
 * These are every Gameweek's rules, not the opening Gameweek's. The list once
 * held only rules an opening Squad could break, and the Chips brought it rules
 * that need a Season behind them — a Chip already spent, a Free Hit straight
 * after a Free Hit. It is shown in full every Gameweek, because a rule an
 * Entrant is not shown is a rule it cannot be refused by.
 */
export const GAMEWEEK_RULES: readonly string[] = [
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
  VIOLATIONS.captainIsViceCaptain.message,
  VIOLATIONS.chipAlreadySpent.message,
  VIOLATIONS.openingGameweekChip.message,
  VIOLATIONS.consecutiveFreeHit.message
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

/**
 * What the Gameweek after this one opens with. Ordinarily each Transfer spends
 * a banked Free Transfer and the Gameweek grants one more, capped at five.
 *
 * Either transfer-oriented Chip leaves the count exactly as it found it. The
 * official FPL FAQ (verified 2 August 2026) says so in as many numbers: "when
 * playing a Wildcard, any saved free transfers are maintained. If you had 2
 * saved free transfers, you will still have 2 saved free transfers the
 * following Gameweek." Two things follow, and the second is the one worth
 * writing down: the Gameweek's Transfers take nothing from the bank, and the
 * Free Transfer the Gameweek would have granted goes with the Chip. Normal
 * accrual resumes in the Gameweek after.
 */
function bankedAfter(
  freeTransfers: number,
  chip: Chip | null,
  transfersMade: number
): number {
  if (chip === "wildcard" || chip === "free_hit") {
    return freeTransfers;
  }
  const kept = Math.max(0, freeTransfers - transfersMade);
  return Math.min(kept + 1, MAX_FREE_TRANSFERS);
}

/**
 * The Chip inventory after this action. A Chip is recorded against the half of
 * the Season the Gameweek falls in, which is what makes the first set expire
 * unspent at the Gameweek 19 deadline without anything having to expire it.
 */
function chipsSpentAfter(
  chipsUsed: ChipsUsed,
  chip: Chip | null,
  gameweek: number
): ChipsUsed {
  if (chip === null) {
    return chipsUsed;
  }
  const half = halfOf(gameweek);
  return { ...chipsUsed, [half]: [...chipsUsed[half], chip] };
}

/**
 * What a Free Hit displaces: the permanent Squad with its purchase prices, the
 * permanent Team Sheet and the permanent bank, carried in the row so that the
 * next reducer step can restore them without reading an earlier Gameweek
 * (ADR-0017). Null for every other Chip and for no Chip at all.
 *
 * A state with no standing Team Sheet is a state with no Squad, and the
 * opening rule refuses a Free Hit there — so the null arm is what makes this
 * total, not a second reading of the rule.
 */
function displacedByFreeHit(
  state: ManagerState,
  chip: Chip | null
): SquadEnvelope["free_hit_stash"] {
  if (chip !== "free_hit" || state.teamSheet === null) {
    return null;
  }
  return {
    squad: state.squad.active,
    team_sheet: state.teamSheet,
    bank: state.bankTenths
  };
}

/**
 * What a stored Manager State means at the start of the Gameweek after it. A
 * Free Hit lasted one Gameweek, so the next one opens by putting back the
 * permanent Squad, purchase prices, Team Sheet and bank it stashed. The stash
 * travels in the state itself, so this reads no earlier Manager State and the
 * fold survives whatever the next action turns out to be — including a Roll
 * Over (ADR-0017). Every other state passes through, and applying this twice
 * is applying it once.
 *
 * Exported because the reducer must not be the only reader of it. The FPL
 * context is built from the same stored row, and an Entrant shown the borrowed
 * Squad while being judged on the permanent one would be picking a Team Sheet
 * from fifteen players it does not own. One function, both callers.
 */
export function carriedIntoNextGameweek(state: ManagerState): ManagerState {
  const stash = state.squad.free_hit_stash;
  if (stash === null) {
    return state;
  }
  return {
    ...state,
    squad: { active: stash.squad, free_hit_stash: null },
    teamSheet: stash.team_sheet,
    bankTenths: stash.bank
  };
}

/**
 * What a Gameweek nobody legally acted in leaves behind. The action that failed
 * its third Repair is discarded whole and the Gameweek is played on the Squad
 * and Team Sheet already standing (ADR-0004), so this takes no action at all —
 * there is no legal one to take.
 *
 * Three things follow from discarding the action rather than scoring the
 * Gameweek zero, and each is a line below. No Transfer was made, so the Free
 * Transfer the Gameweek grants is banked exactly as an untouched Gameweek's
 * would be. No Transfer was paid for, so the Hit the previous Gameweek owed is
 * not owed again by this one. And no Chip was played, so `chipActive` is null
 * and the half-Season sets are untouched — a Chip named in the discarded action
 * is not spent by naming it.
 *
 * The reversion comes first, so a Roll Over immediately after a Free Hit gives
 * back the permanent Squad, Team Sheet and bank rather than making the borrowed
 * ones permanent. That is the case ADR-0017 put the stash in the row for.
 */
export function rolledOverState(previous: ManagerState): ManagerState {
  const state = carriedIntoNextGameweek(previous);
  return {
    ...state,
    freeTransfers: bankedAfter(state.freeTransfers, null, 0),
    hits: 0,
    chipActive: null
  };
}

/**
 * Whether this is the Gameweek the track opens on. Read off the Squad rather
 * than off the calendar: ADR-0003 lets the track join the Season at a Gameweek
 * and run forward, so what makes a Gameweek an opening is having nothing yet,
 * not being the first of the Season. Two rules turn on it — the Transfers that
 * fill an empty Squad cost no Hit, and neither transfer Chip can be played.
 */
function isOpening(state: ManagerState): boolean {
  return state.squad.active.length === 0;
}

/**
 * Why a Chip cannot be played in this Gameweek, or null if it can. Every rule
 * about a Chip's own availability lives here and nowhere else.
 *
 * Exported because the reducer must not be the only reader of it. An Entrant
 * that is shown a whole half-Season set and refused for reaching into it has
 * been sent to spend a Repair on a rule it was never told applied now
 * (ADR-0004) — so the context asks the same question of every Chip and prints
 * the answer. One function, both callers.
 *
 * Every rule here is about a named Chip and a Gameweek, and none is about
 * whether the rules carry that Chip out: all four are carried out, the two
 * transfer Chips below and the two scoring Chips in `scoreTeamSheet`, which
 * reads the `chipActive` this reducer records. A fifth Chip would have to
 * arrive with its effect (spec 0003) rather than be gated here until one came.
 */
export function chipRefusal(
  state: ManagerState,
  chip: Chip,
  gameweek: number
): Violation | null {
  if (state.chipsUsed[halfOf(gameweek)].includes(chip)) {
    return VIOLATIONS.chipAlreadySpent;
  }

  // The FAQ's reason for barring both Chips from an opening — "you have
  // infinite transfers in this Gameweek" — is a fact about the opening rather
  // than about the date. A Free Hit has the second reason besides: nothing yet
  // to revert to.
  if (isOpening(state) && (chip === "wildcard" || chip === "free_hit")) {
    return VIOLATIONS.openingGameweekChip;
  }

  // The two sets make one Free Hit per half, so the only two Gameweeks this
  // can fall between are the nineteenth and the twentieth. `chipActive` on the
  // state the Gameweek began with is the Chip the Gameweek before played,
  // which is the whole history the rule needs.
  if (chip === "free_hit" && state.chipActive === "free_hit") {
    return VIOLATIONS.consecutiveFreeHit;
  }

  return null;
}

export function applyGameweekAction(
  previous: ManagerState,
  action: GameweekAction,
  pool: PoolPlayer[],
  gameweek: number
): GameweekOutcome {
  // Reversion happens before the action is judged, so every rule below reads
  // the Squad the Entrant actually owns again rather than the one it borrowed.
  const state = carriedIntoNextGameweek(previous);

  // Chip legality is judged before a penny of the action is counted, so an
  // Entrant reaching for a Chip it cannot play is told that rather than
  // whichever Squad rule its rebuild happened to break as well.
  if (action.chip !== null) {
    const refusal = chipRefusal(state, action.chip, gameweek);
    if (refusal !== null) {
      return { violation: refusal };
    }
  }

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
  // they are not Transfers beyond an allowance, they are how one begins. Both
  // transfer-oriented Chips buy the same thing for one Gameweek in the middle
  // of it — a Wildcard permanently, a Free Hit for that Gameweek only.
  const unlimitedTransfers = isOpening(state)
    || action.chip === "wildcard"
    || action.chip === "free_hit";
  const paidTransfers = unlimitedTransfers
    ? 0
    : Math.max(0, action.transfersIn.length - state.freeTransfers);

  return {
    state: {
      squad: {
        active: squad,
        free_hit_stash: displacedByFreeHit(state, action.chip)
      },
      teamSheet: action.teamSheet,
      bankTenths,
      freeTransfers: bankedAfter(
        state.freeTransfers,
        action.chip,
        action.transfersIn.length
      ),
      hits: paidTransfers * HIT_POINTS,
      chipsUsed: chipsSpentAfter(state.chipsUsed, action.chip, gameweek),
      chipActive: action.chip
    }
  };
}
