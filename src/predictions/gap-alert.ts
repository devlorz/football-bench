import type { Client } from "pg";
import { MATCH_PROMPT_VERSION } from "./openrouter-entrant.js";

type Database = Pick<Client, "query">;

/**
 * Every cause an attempt row can record for a Prediction that never arrived.
 *
 * A tuple rather than a bare union, so a reporter can count a Gap under each
 * of them and store a breakdown whose columns are the causes that exist rather
 * than the ones a Gameweek happened to produce.
 */
export const GAP_CAUSES = [
  "schema",
  "probs_sum",
  "refusal",
  "provider",
  "timeout",
  "rate_limit",
  "deadline"
] as const;

export type GapCause = (typeof GAP_CAUSES)[number];

export interface PredictionGap {
  entrantId: string;
  entrantName: string;
  fixtureId: number;
  fixture: string;
  cause: GapCause;
}

export interface GapAlert {
  competition: string;
  season: string;
  gameweek: number;
  deadlineAt: Date;
  observedAt: Date;
  remainingMilliseconds: number;
  gaps: PredictionGap[];
}

function formatRemaining(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatLockStatus(alert: GapAlert): string {
  if (alert.observedAt.getTime() >= alert.deadlineAt.getTime()) {
    return `The Lock has passed (${alert.deadlineAt.toISOString()}).`;
  }
  return `${formatRemaining(alert.remainingMilliseconds)} remain before the Lock at `
    + `${alert.deadlineAt.toISOString()}.`;
}

const DETAILED_GAP_LIMIT = 20;

function formatGapDetails(gaps: PredictionGap[]): string[] {
  if (gaps.length <= DETAILED_GAP_LIMIT) {
    return gaps.map((gap) =>
      `- ${gap.entrantName}: Fixture ${gap.fixtureId}, ${gap.fixture} — `
      + gap.cause
    );
  }

  const byCause = new Map<GapCause, PredictionGap[]>();
  for (const gap of gaps) {
    const grouped = byCause.get(gap.cause) ?? [];
    grouped.push(gap);
    byCause.set(gap.cause, grouped);
  }

  const lines = [`${gaps.length} Gaps grouped by cause:`];
  for (const [cause, causeGaps] of byCause) {
    const entrants = new Map<string, string>();
    const fixtures = new Map<number, string>();
    for (const gap of causeGaps) {
      entrants.set(gap.entrantId, gap.entrantName);
      fixtures.set(gap.fixtureId, gap.fixture);
    }
    lines.push(
      `- ${cause}: ${causeGaps.length} Gaps`,
      `  Entrants (${entrants.size}): ${[...entrants.values()].join("; ")}`,
      `  Fixtures (${fixtures.size}): ${[...fixtures].map(
        ([fixtureId, fixture]) => `Fixture ${fixtureId}, ${fixture}`
      ).join("; ")}`
    );
  }
  return lines;
}

export function formatGapAlert(alert: GapAlert): string {
  return [
    // The Competition is named because a Gameweek number is not unique across
    // Competitions: two leagues share a Season and a numbering, so an alert
    // that named neither would page an operator about a Gameweek 1 without
    // saying whose.
    `Prediction Gaps remain for ${alert.competition} ${alert.season} `
    + `Gameweek ${alert.gameweek}.`,
    formatLockStatus(alert),
    ...formatGapDetails(alert.gaps)
  ].join("\n");
}

export function formatGapAlertAnnotation(alert: GapAlert): string {
  const escaped = formatGapAlert(alert)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  return `::warning title=Prediction Gaps remain::${escaped}`;
}

interface GapRow {
  entrant_id: string;
  entrant_name: string;
  fixture_id: number;
  home_team: string;
  away_team: string;
  cause: GapCause | null;
  deadline_at: Date;
}

export async function readGapAlert(
  database: Database,
  competition: string,
  season: string,
  gameweek: number,
  now: () => Date
): Promise<GapAlert | null> {
  const result = await database.query<GapRow>(
    `select
       m.id as entrant_id,
       m.name as entrant_name,
       f.fixture_id,
       f.home_team,
       f.away_team,
       latest_attempt.error_kind as cause,
       g.deadline_at
     from fixtures f
     join gameweeks g
       on g.competition = f.competition
      and g.season = f.season
      and g.gw = f.locked_in_gw
     cross join models m
     left join lateral (
       select a.error_kind
         from attempts a
        where a.model_id = m.id
          and a.competition = f.competition
          and a.season = f.season
          and a.gw = g.gw
          and a.track = 'match'
          and a.fixture_id = f.fixture_id
          and not a.ok
        order by a.attempted_at desc, a.id desc
        limit 1
     ) latest_attempt on true
     where f.competition = $1
       and f.season = $2
       and f.locked_in_gw = $3
       and m.role = 'entrant'
       and m.prompt_version = $4
       and not exists (
         select 1
           from predictions p
          where p.model_id = m.id
            and p.competition = f.competition
            and p.season = f.season
            and p.fixture_id = f.fixture_id
       )
     order by m.id, f.fixture_id`,
    // A Gap is a Fixture a Match Entrant produced no Prediction for, and an
    // FPL seat is not a Match Entrant. Selecting on the role alone reported
    // every FPL seat as a Gap on every Fixture, and one with no recorded cause
    // at that, because the attempt it looks for is a Match attempt it never
    // made.
    [competition, season, gameweek, MATCH_PROMPT_VERSION]
  );
  const first = result.rows[0];
  if (first === undefined) {
    return null;
  }
  const unexplained = result.rows.find((row) => row.cause === null);
  if (unexplained !== undefined) {
    throw new Error(
      `Gap for Entrant ${unexplained.entrant_id} and Fixture `
      + `${unexplained.fixture_id} has no recorded cause`
    );
  }
  const observedAt = now();

  return {
    competition,
    season,
    gameweek,
    deadlineAt: first.deadline_at,
    observedAt,
    remainingMilliseconds: Math.max(
      0,
      first.deadline_at.getTime() - observedAt.getTime()
    ),
    gaps: result.rows.map((row) => {
      if (row.cause === null) {
        throw new Error("Unreachable unexplained Gap");
      }
      return {
        entrantId: row.entrant_id,
        entrantName: row.entrant_name,
        fixtureId: row.fixture_id,
        fixture: `${row.home_team} v ${row.away_team}`,
        cause: row.cause
      };
    })
  };
}
