import {
  REPAIRS_METRIC,
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC,
  ROLL_OVER_RATE_METRIC,
  VIOLATION_PROFILE_METRIC
} from "../fpl/demonstration-record.js";
import type {
  RehearsedEntrant,
  RehearsedGameweek
} from "./rehearsal-report.js";
import type { FplRehearsalResult } from "./run-fpl-rehearsal.js";

const RULE = "=".repeat(72);

/**
 * How a Gameweek's typed breakdown reads: the kinds that actually happened,
 * not the closed set with six zeroes in it.
 *
 * The counts live under `kinds`, which is where `score-fpl-gameweek.ts` writes
 * them. Reading the top level instead finds one object-valued property, filters
 * it out for not being a number, and prints nothing at all — a profile that
 * silently disappears rather than one that is visibly wrong.
 */
function violationDetail(detail: unknown): string {
  const kinds = (detail as { kinds?: unknown } | null)?.kinds;
  if (kinds === null || typeof kinds !== "object" || kinds === undefined) {
    return "";
  }
  const broken = Object.entries(kinds as Record<string, unknown>)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([kind, count]) => `${kind}=${String(count)}`);
  return broken.length === 0 ? "" : ` (${broken.join(", ")})`;
}

function measure(entrant: RehearsedEntrant, metric: string): string {
  const values = entrant.metrics
    .filter((row) => row.metric === metric)
    .map((row) => `GW${row.gameweek} ${row.value}${
      metric === VIOLATION_PROFILE_METRIC ? violationDetail(row.detail) : ""
    }`);
  return values.length === 0 ? "none" : values.join("  ");
}

/** Money as the game states it, so £0.6m is not read as six of something. */
function millions(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

/**
 * One Gameweek's Manager State in full: the Squad it owns, the eleven it
 * played, and every number the next Gameweek is computed from.
 *
 * Printed rather than summarised because the path is what an operator is here
 * to read. Two seats can hold the same Gameweeks, take the same Repairs and
 * score the same points while owning entirely different Squads, and the
 * Gameweek numbers alone would not say so.
 */
function gameweek(played: RehearsedGameweek): string {
  const { state } = played;
  const sheet = state.teamSheet;
  const owned = state.squad.active
    .map(({ fplId, purchasePriceTenths }) =>
      `${fplId}@${millions(purchasePriceTenths)}`)
    .join(" ");
  // The permanent Squad a Free Hit displaced, if one is stashed. Without it
  // the Gameweek after a Free Hit cannot be audited from the output at all:
  // the Squad that comes back is only checkable against the Squad that was put
  // away, and that is the one place the two differ.
  const stash = state.squad.free_hit_stash;
  // Both halves, always, and named. A Chip's half is what makes the first set
  // expire unspent at Gameweek 19, so merging them would hide a Chip spent in
  // the wrong one — and omitting an empty half would leave a reader unable to
  // tell a half with nothing in it from a half that was never written.
  const spent = ([
    ["first", state.chipsUsed.firstHalf],
    ["second", state.chipsUsed.secondHalf]
  ] as const)
    .map(([half, chips]) =>
      `${half} half ${chips.length === 0 ? "none" : chips.join(", ")}`)
    .join("; ");
  return `    GW${played.gameweek}${played.rolledOver ? " (Rolled Over)" : ""}\n`
    + `      Squad:      ${owned}\n`
    + `      Starters:   ${sheet?.starters.join(" ") ?? "none"}\n`
    + `      Bench:      ${sheet?.bench.join(" ") ?? "none"}\n`
    + `      Armband:    ${sheet === null
      ? "none"
      : `captain ${sheet.captain}, vice ${sheet.viceCaptain}`}\n`
    + `      Bank:       ${millions(state.bankTenths)}`
    + `   Free Transfers: ${state.freeTransfers}`
    + `   Hits: ${state.hits}\n`
    + `      Chip:       ${state.chipActive ?? "none"}`
    + `   Spent so far: ${spent}`
    + `   Repairs used: ${played.attemptsUsed}\n`
    + `      Free Hit stash: ${stash === null ? "none" : "\n"
      + `        Squad:    ${stash.squad
        .map(({ fplId, purchasePriceTenths }) =>
          `${fplId}@${millions(purchasePriceTenths)}`)
        .join(" ")}\n`
      + `        Starters: ${stash.team_sheet.starters.join(" ")}\n`
      + `        Bench:    ${stash.team_sheet.bench.join(" ")}\n`
      + `        Armband:  captain ${stash.team_sheet.captain}, `
      + `vice ${stash.team_sheet.viceCaptain}\n`
      + `        Bank:     ${millions(stash.bank)}`}`;
}

function seat(entrant: RehearsedEntrant): string {
  const rolled = entrant.path.filter(({ rolledOver }) => rolledOver).length;
  const repairs = entrant.path.reduce(
    (total, { attemptsUsed }) => total + attemptsUsed,
    0
  );
  const chips = entrant.path.at(-1)?.state.chipsUsed;
  const spent = [...chips?.firstHalf ?? [], ...chips?.secondHalf ?? []];
  return `\n${entrant.entrantId}\n`
    + `  Points:     ${measure(entrant, FPL_POINTS_METRIC)}\n`
    + `  Cumulative: ${measure(entrant, FPL_POINTS_SEASON_TO_DATE_METRIC)}\n`
    + `  Repairs:    ${repairs}  ${measure(entrant, REPAIRS_METRIC)}\n`
    + `  Roll Overs: ${rolled}  ${measure(entrant, ROLL_OVER_RATE_METRIC)}\n`
    + `  Chips:      ${spent.length === 0 ? "none" : spent.join(", ")}\n`
    + `  Violations: ${measure(entrant, VIOLATION_PROFILE_METRIC)}\n`
    + `  Manager State path:\n`
    + entrant.path.map(gameweek).join("\n");
}

/**
 * The whole rehearsal as an operator reads it.
 *
 * Kept out of the command, which should decide what to run and what to exit
 * with and nothing else. Every measure the demonstration record is made of
 * appears here — the violation profile included, because a Roll Over flag says
 * only that a Gameweek gave up while the profile says what the Entrant kept
 * getting wrong.
 */
export function formatFplRehearsalResult(result: FplRehearsalResult): string {
  const { report, expected, observed, shortfalls } = result;
  const counts = ([
    ["Entrants", "entrants"],
    ["Gameweeks", "gameweeks"],
    ["Metric rows", "metricRows"]
  ] as const).map(([label, key]) =>
    `${`${label}:`.padEnd(13)}${observed[key]} (expected ${expected[key]})`);

  return [
    ...report.entrants.map(seat),
    `\n${RULE}\n${counts.join("\n")}\n${RULE}\n${report.qualification}`,
    ...shortfalls.length === 0 ? [] : [
      `\nThe rehearsal did not complete:\n`
      + shortfalls.map((line) => `  - ${line}`).join("\n")
    ]
  ].join("\n");
}
