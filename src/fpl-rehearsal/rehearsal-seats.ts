import type {
  Chip,
  ViolationKind
} from "../fpl/apply-gameweek-action.js";
import {
  BENCHED_CAPTAIN,
  REBUILT_STAND_PAT,
  SELL_INTO_A_RISE,
  STAND_PAT,
  THREE_AT_THE_BACK,
  withChip
} from "./rehearsal-script.js";

/**
 * The scenario a rehearsal plays and what each seat should come to.
 *
 * Apart from the runner because these are two things that change for different
 * reasons: the Gameweeks and the Squad move when the rehearsal is made to cover
 * something new, and the orchestration moves when the production path it drives
 * changes. Apart from the verifier for the same reason, and so that the
 * verifier can be tested against a fabricated report rather than only through a
 * whole rehearsal.
 */

/** The Gameweek the track opens at, and the two it then plays. */
export const OPENING_GAMEWEEK = 1;
export const PLAYED_GAMEWEEKS = [2, 3];
/** The Gameweek whose fetch discovers that all three before it have checked. */
export const SETTLING_GAMEWEEK = 4;

/** Six hours before the Lock: comfortably inside it, as a real run would be. */
export const ACTS_BEFORE_LOCK_MS = 6 * 3_600_000;

/** Every Gameweek the rehearsal plays, in order. */
export const REHEARSED_GAMEWEEKS = [OPENING_GAMEWEEK, ...PLAYED_GAMEWEEKS];

/**
 * What one seat should hold at one Gameweek, hand-computed.
 *
 * One object per Gameweek rather than eight lists read at the same index.
 * Nothing can check that eight separate lists stay the same length or stay in
 * the same order, and a rehearsal whose expectations had quietly slid by one
 * Gameweek would still be nine seats of plausible numbers. The Gameweek is
 * named in the row rather than implied by its position, so the verifier can
 * say so rather than assume it.
 */
export interface SeatGameweekExpectation {
  gameweek: number;
  points: number;
  violations: number;
  /** Which rules were broken this Gameweek, and how often. */
  violationKinds: Readonly<Partial<Record<ViolationKind, number>>>;
  repairs: number;
  rolledOver: boolean;
  bank: number;
  freeTransfers: number;
  hits: number;
  /** The Chip in play this Gameweek. */
  chipActive: Chip | null;
  /** The Chip sets as this Gameweek left them. */
  chipsUsed: {
    firstHalf: readonly Chip[];
    secondHalf: readonly Chip[];
  };
}

export interface RehearsalSeat {
  suffix: string;
  gw2: (attempt: number) => string;
  gw3: string;
  expect: readonly SeatGameweekExpectation[];
}

/**
 * A Gameweek in which nothing unusual happened, and the few things that did.
 *
 * The defaults are what an untroubled Gameweek looks like — no rule broken, no
 * Repair, no Hit and no Chip — so each seat below states only what makes it
 * different from the others, which is the part worth reading.
 */
function played(
  gameweek: number,
  points: number,
  bank: number,
  freeTransfers: number,
  over: Partial<SeatGameweekExpectation> = {}
): SeatGameweekExpectation {
  return {
    gameweek,
    points,
    bank,
    freeTransfers,
    violations: 0,
    violationKinds: {},
    repairs: 0,
    rolledOver: false,
    hits: 0,
    chipActive: null,
    chipsUsed: { firstHalf: [], secondHalf: [] },
    ...over
  };
}

/** The Chip sets after one Chip has been spent in the first half. */
function spent(chip: Chip): SeatGameweekExpectation["chipsUsed"] {
  return { firstHalf: [chip], secondHalf: [] };
}

/**
 * The nine seats, and what each one does. One Base Model per seat is what makes
 * the ranking a demonstration of one Season path each (ADR-0003), and the
 * script gives each of them a different thing to prove: inaction, a paid
 * Transfer, each of the four Chips, a Repair that succeeds, one that does not,
 * and a Team Sheet whose substitutions are hard.
 *
 * Every seat scores 69 in Gameweek 1, because every seat opens with the same
 * Squad; and every seat still playing the permanent Squad scores 72 in Gameweek
 * 3, where Saliba and Haaland are left out, two substitutes come on for 20
 * between them and the vice-captain is promoted.
 */
export const SEATS = [
  {
    suffix: "idle",
    gw2: () => STAND_PAT,
    gw3: STAND_PAT,
    // Nothing is ever spent, so the bank stands still and a Free Transfer
    // accrues each Gameweek.
    expect: [
      played(1, 69, 15, 1),
      played(2, 69, 15, 2),
      played(3, 72, 15, 3)
    ]
  },
  {
    suffix: "trader",
    gw2: () => SELL_INTO_A_RISE,
    gw3: REBUILT_STAND_PAT,
    // Two Transfers against one banked Free Transfer: the second costs four
    // points, and Watkins comes back at Selling Price rather than at his
    // listing, which is what leaves £0.6m rather than £0.5m or £0.8m. Isak and
    // Mheuka never appear in the fabricated matchday squads, so the rebuilt
    // Squad is a Forward short that it cannot replace in Gameweek 3.
    expect: [
      played(1, 69, 15, 1),
      played(2, 66, 6, 1, { hits: 4 }),
      played(3, 64, 6, 2)
    ]
  },
  {
    suffix: "wildcard",
    gw2: () => withChip(SELL_INTO_A_RISE, "wildcard"),
    // A Wildcard's rebuild is permanent, so the Gameweek after it is played on
    // the new Squad — and lands on the trader's 64 rather than the idle seat's
    // 72, which is what tells a permanent rebuild from a borrowed one.
    gw3: REBUILT_STAND_PAT,
    // The same two Transfers, forgiven: no Hit, and the banked Free Transfer is
    // left exactly as the Chip found it rather than spent or topped up.
    expect: [
      played(1, 69, 15, 1),
      played(2, 70, 6, 1, {
        chipActive: "wildcard",
        chipsUsed: spent("wildcard")
      }),
      played(3, 64, 6, 2, { chipsUsed: spent("wildcard") })
    ]
  },
  {
    suffix: "free-hit",
    gw2: () => withChip(SELL_INTO_A_RISE, "free_hit"),
    // A Free Hit's is borrowed, so the Gameweek after it gives the permanent
    // Squad back — the same Team Sheet the idle seat never left.
    gw3: STAND_PAT,
    // Gameweek 2 scores the borrowed Squad's 70 and Gameweek 3 the permanent
    // Squad's 72, and the bank returns to £1.5m. A Free Hit that failed to
    // revert would leave both at the wildcard seat's numbers.
    expect: [
      played(1, 69, 15, 1),
      played(2, 70, 6, 1, {
        chipActive: "free_hit",
        chipsUsed: spent("free_hit")
      }),
      played(3, 72, 15, 2, { chipsUsed: spent("free_hit") })
    ]
  },
  {
    suffix: "bench-boost",
    gw2: () => withChip(STAND_PAT, "bench_boost"),
    gw3: STAND_PAT,
    // The four on the bench are worth 42, so the Chip's Gameweek is 69 + 42.
    expect: [
      played(1, 69, 15, 1),
      played(2, 111, 15, 2, {
        chipActive: "bench_boost",
        chipsUsed: spent("bench_boost")
      }),
      played(3, 72, 15, 3, { chipsUsed: spent("bench_boost") })
    ]
  },
  {
    suffix: "triple-captain",
    gw2: () => withChip(STAND_PAT, "triple_captain"),
    gw3: STAND_PAT,
    // The eleven are worth 57 and Haaland's 12 counts three times: 81.
    expect: [
      played(1, 69, 15, 1),
      played(2, 81, 15, 2, {
        chipActive: "triple_captain",
        chipsUsed: spent("triple_captain")
      }),
      played(3, 72, 15, 3, { chipsUsed: spent("triple_captain") })
    ]
  },
  {
    suffix: "repaired",
    // Breaks one rule, is told which, and comes back with a legal action.
    gw2: (attempt: number) => attempt === 0 ? BENCHED_CAPTAIN : STAND_PAT,
    gw3: STAND_PAT,
    // One Repair spent and one rule broken, and the Gameweek it repaired into
    // scores exactly what the seat that never erred scored.
    expect: [
      played(1, 69, 15, 1),
      played(2, 69, 15, 2, {
        violations: 1,
        violationKinds: { captain: 1 },
        repairs: 1
      }),
      played(3, 72, 15, 3)
    ]
  },
  {
    suffix: "rolled-over",
    // Never comes back, through all three Repairs: the Gameweek Rolls Over onto
    // the Team Sheet already standing.
    gw2: () => BENCHED_CAPTAIN,
    gw3: STAND_PAT,
    // Four rules broken and the Gameweek still scores 69, because a Roll Over
    // stands on the Team Sheet already there — never a Gap and never a zero.
    expect: [
      played(1, 69, 15, 1),
      played(2, 69, 15, 2, {
        violations: 4,
        violationKinds: { captain: 4 },
        repairs: 3,
        rolledOver: true
      }),
      played(3, 72, 15, 3)
    ]
  },
  {
    suffix: "three-at-the-back",
    gw2: () => THREE_AT_THE_BACK,
    gw3: THREE_AT_THE_BACK,
    // Three Defenders start and a Forward is first off the bench, which is the
    // shape the substitution ordering rule is hard in.
    //
    // It is not hard *here*, and saying so is the point: Saliba and Haaland are
    // both out at Gameweek 3 and three eligible outfielders are on the bench,
    // so two of them come on whichever absentee each is paired with, and the
    // total is 75 either way. The formation constraint moves the pairing and
    // not the score. `test/rehearse-fpl-track.test.ts` is where it is actually
    // proved, against a Gameweek with one absentee, where Furo cannot come on
    // for Saliba without leaving two Defenders and Thomas is taken from behind
    // him — 78 rather than 88.
    //
    // Gameweek 2 is 52 + 2 + 12 with nobody absent; Gameweek 3 is 52 with
    // Saliba and Haaland blank, 14 from the two substitutes, and Palmer's 9
    // again in the absent captain's place: 75.
    expect: [
      played(1, 69, 15, 1),
      played(2, 78, 15, 2),
      played(3, 75, 15, 3)
    ]
  }
] as const satisfies readonly RehearsalSeat[];
