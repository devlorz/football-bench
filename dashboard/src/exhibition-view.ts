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

/**
 * An Exhibition Run's part of a combined row (ticket 0119), spelled once as the
 * Guest's is: "Exhibition GW 1–6".
 */
export const EXHIBITION_LABEL = "Exhibition";
export const GUEST_LABEL_PREFIX = `${GUEST_LABEL} · from GW `;

/**
 * A Guest's label on `/overall`, which spans several Competitions and so names
 * them instead of one Competition's first Gameweek: "Guest · PL, PD".
 */
export const guestOverallLabel = (competitions: readonly string[]): string =>
  `${GUEST_LABEL} · ${competitions.join(", ")}`;


/**
 * A combined row's label, naming its parts (ticket 0119): "Exhibition GW 1–6 ·
 * Guest from GW 7". With no replayed answer in range it is the Guest's label.
 */
export const partsLabel = (parts: {
  exhibition: { firstGw: number; lastGw: number } | null;
  guest: { fromGw: number };
}): string => {
  if (parts.exhibition === null) return GUEST_LABEL_PREFIX + parts.guest.fromGw;
  const { firstGw, lastGw } = parts.exhibition;
  const range = firstGw === lastGw ? `${firstGw}` : `${firstGw}–${lastGw}`;
  return `${EXHIBITION_LABEL} GW ${range} · ${GUEST_LABEL} from GW ${parts.guest.fromGw}`;
};

/**
 * The same on `/overall`, which names each part's Competitions instead of
 * Gameweeks: "Exhibition · PL, SA · Guest · PL, SA, PD".
 */
export const combinedOverallLabel = (
  exhibition: readonly string[], guest: readonly string[]
): string => `${EXHIBITION_LABEL} · ${exhibition.join(", ")} · ${guestOverallLabel(guest)}`;
