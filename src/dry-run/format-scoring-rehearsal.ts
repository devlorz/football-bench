import { type ScoringRehearsalResult } from "./rehearse-scoring.js";

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
  { report, dryRun, observedAt, shortfalls }: ScoringRehearsalResult
): string {
  const lines = [
    `${RULE}\nFabricated results\n${RULE}`,
    "Each Entrant's archived answer is replayed on every Fixture asked, its "
    + "fixture_id rewritten to that Fixture's; every other field is as "
    + "recorded."
  ];
  for (const { fixtureId, home, away } of report.settled) {
    lines.push(`Fixture ${fixtureId}: ${home}-${away}`);
  }
  if (observedAt.getTime() > dryRun.deadline.getTime()) {
    lines.push(
      `The packets were built from bytes observed ${observedAt.toISOString()}, `
      + `after the Gameweek's Lock at ${dryRun.deadline.toISOString()}: they `
      + "prove the path, not what an Entrant would have seen. A result played "
      + "on the Lock's own day passes the context's date bound, the Fixture's "
      + "own among them, and the Head Coach state rows, where present, carry "
      + "what was known at that later instant."
    );
  }
  lines.push(
    `${report.settled.length} of ${report.scheduled.length} Fixtures settled, `
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
