import { type ScoringRehearsalResult } from "./rehearse-scoring.js";
import { REHEARSED_RESULTS } from "./rehearsed-results.js";

const RULE = "=".repeat(72);

/**
 * The whole rehearsal as an operator reads it: what was fabricated, what every
 * Entrant and Reference Line scored with the evidence under it, and whether
 * the run produced the record it promised.
 *
 * Separate from the command so the output can be read in a test. A total
 * nobody can inspect is a total nobody can disagree with, and the per-Fixture
 * detail is the only thing that turns a surprising number into a checkable
 * one — so it is printed rather than summarised away.
 */
export function formatScoringRehearsal(
  season: string,
  gameweek: number,
  { report, dryRun, shortfalls }: ScoringRehearsalResult
): string {
  const lines = [`${RULE}\nFabricated results\n${RULE}`];
  for (const [fplId, [home, away]] of REHEARSED_RESULTS) {
    lines.push(`Fixture ${fplId}: ${home}-${away}`);
  }
  lines.push(
    `${report.settled} of ${REHEARSED_RESULTS.size} Fixtures settled, `
    + `${dryRun.contexts.length} contexts, `
    + `${dryRun.phases.at(-1)?.predictions ?? 0} Predictions`
  );

  for (const id of [...new Set(report.metrics.map((row) => row.entrantId))]) {
    lines.push(`\n${RULE}\n${id}\n${RULE}`);
    for (const row of report.metrics.filter((m) => m.entrantId === id)) {
      lines.push(
        `gw ${row.gw} ${row.metric} = ${row.value} (n=${row.n ?? "—"})\n`
        + `  ${JSON.stringify(row.detail)}`
      );
    }
  }

  lines.push(
    `\n${RULE}\n`
    + `Season ${season} Gameweek ${gameweek}\n`
    + `Entrants:    ${report.entrants.length}\n`
    + `Score rows:  ${report.metrics.length}\n`
    + (shortfalls.length === 0
      ? "The rehearsal produced the whole scoring record."
      : "The rehearsal fell short:\n"
        + shortfalls.map((shortfall) => `  ${shortfall}`).join("\n"))
  );
  return lines.join("\n");
}
