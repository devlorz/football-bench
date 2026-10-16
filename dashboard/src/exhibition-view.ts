/**
 * The labels an Exhibition Run (ADR-0032, ADR-0052) and a Guest Seat
 * (ADR-0064) carry across the dashboard.
 */
export {
  EXHIBITION_LABEL_PREFIX,
  EXHIBITION_RUN_LABEL,
  exhibitionLabel
} from "../../src/exhibition/recall-caveat.js";

/**
 * A Guest Seat's label on a ranked row, before the Gameweek of its first Lock
 * (ADR-0064, spec 0029): "Guest · from GW 7". Here and not beside the recall
 * caveat, which a Guest does not carry.
 */
export const GUEST_LABEL = "Guest";
export const GUEST_LABEL_PREFIX = `${GUEST_LABEL} · from GW `;

/**
 * A Guest's label on `/overall`, which spans several Competitions and so names
 * them instead of one Competition's first Gameweek: "Guest · PL, PD".
 */
export const guestOverallLabel = (competitions: readonly string[]): string =>
  `${GUEST_LABEL} · ${competitions.join(", ")}`;

