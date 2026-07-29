import type { Client } from "pg";

type Database = Pick<Client, "query">;

export type GapCause =
  | "schema"
  | "probs_sum"
  | "refusal"
  | "provider"
  | "timeout"
  | "rate_limit"
  | "deadline";

export interface PredictionGap {
  entrantId: string;
  entrantName: string;
  fixtureId: number;
  fixture: string;
  cause: GapCause;
}

export interface GapAlert {
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

export function formatGapAlert(alert: GapAlert): string {
  return [
    `Prediction Gaps remain for ${alert.season} Gameweek ${alert.gameweek}.`,
    `${formatRemaining(alert.remainingMilliseconds)} remain before the Lock at `
      + `${alert.deadlineAt.toISOString()}.`,
    ...alert.gaps.map((gap) =>
      `- ${gap.entrantName}: Fixture ${gap.fixtureId}, ${gap.fixture} — `
      + gap.cause
    )
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
  fpl_id: number;
  home_team: string;
  away_team: string;
  cause: GapCause | null;
  deadline_at: Date;
}

export async function readGapAlert(
  database: Database,
  season: string,
  gameweek: number,
  now: () => Date
): Promise<GapAlert | null> {
  const result = await database.query<GapRow>(
    `select
       m.id as entrant_id,
       m.name as entrant_name,
       f.fpl_id,
       f.home_team,
       f.away_team,
       latest_attempt.error_kind as cause,
       g.deadline_at
     from fixtures f
     join gameweeks g
       on g.season = f.season
      and g.gw = f.locked_in_gw
     cross join models m
     left join lateral (
       select a.error_kind
         from attempts a
        where a.model_id = m.id
          and a.season = f.season
          and a.gw = g.gw
          and a.track = 'match'
          and a.fpl_id = f.fpl_id
          and not a.ok
        order by a.attempted_at desc, a.id desc
        limit 1
     ) latest_attempt on true
     where f.season = $1
       and f.locked_in_gw = $2
       and m.role = 'entrant'
       and not exists (
         select 1
           from predictions p
          where p.model_id = m.id
            and p.season = f.season
            and p.fpl_id = f.fpl_id
       )
     order by m.id, f.fpl_id`,
    [season, gameweek]
  );
  const first = result.rows[0];
  if (first === undefined) {
    return null;
  }
  const unexplained = result.rows.find((row) => row.cause === null);
  if (unexplained !== undefined) {
    throw new Error(
      `Gap for Entrant ${unexplained.entrant_id} and Fixture `
      + `${unexplained.fpl_id} has no recorded cause`
    );
  }
  const observedAt = now();

  return {
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
        fixtureId: row.fpl_id,
        fixture: `${row.home_team} v ${row.away_team}`,
        cause: row.cause
      };
    })
  };
}
