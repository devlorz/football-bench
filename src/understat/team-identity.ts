/**
 * Understat's spelling of a club to football-data.co.uk's, the identity every
 * stored result already uses. Covers the Premier League rosters of both
 * Seasons the benchmark fetches xG for: 2025-26, ingested once so the
 * five-match form window can cross the season boundary, and 2026-27; and
 * La Liga's 2025-26 twenty, added with ticket 6's backfill.
 *
 * Keyed by Competition, and that is the point rather than filing. The names
 * are globally unique, so one flat map resolves every club correctly — and
 * resolves a club from the *wrong league* just as correctly, which is what
 * makes the split load bearing. Understat's league is a slug this codebase
 * chooses (`UNDERSTAT_LEAGUES`), so a single wrong character there fetches
 * another league's feed under this Competition's name. Every club resolves,
 * nothing complains, and the writer's `on conflict (season,
 * understat_match_id)` — a key `competition` is deliberately outside
 * (migration 0024) — collides with the other league's stored rows and sets
 * `competition = excluded.competition` on all of them. Not extra rows: the
 * other Competition's whole Season of xG, relabelled away.
 *
 * Scoped, the same mistake resolves nothing and raises `unknown Understat team
 * name` on the first match. This is the structural check the football-data
 * reader already has in its per-file `Div` test — the one that caught
 * football-data.co.uk redirecting a Spanish request to Portugal — and there is
 * no reason for the second source to go without it. **Found by review.**
 *
 * Undefined is deliberate and is escalated to a validation error at the
 * boundary: a rename on Understat's side must surface as a failure, never as a
 * silently xG-less team.
 */
const PREMIER_LEAGUE_TEAM_NAMES: Readonly<Record<string, string>> = {
  Arsenal: "Arsenal",
  "Aston Villa": "Aston Villa",
  Bournemouth: "Bournemouth",
  Brentford: "Brentford",
  Brighton: "Brighton",
  Burnley: "Burnley",
  Chelsea: "Chelsea",
  Coventry: "Coventry",
  "Crystal Palace": "Crystal Palace",
  Everton: "Everton",
  Fulham: "Fulham",
  Hull: "Hull",
  Ipswich: "Ipswich",
  Leeds: "Leeds",
  Liverpool: "Liverpool",
  "Manchester City": "Man City",
  "Manchester United": "Man United",
  "Newcastle United": "Newcastle",
  "Nottingham Forest": "Nott'm Forest",
  Sunderland: "Sunderland",
  Tottenham: "Tottenham",
  "West Ham": "West Ham",
  "Wolverhampton Wanderers": "Wolves"
};

const LA_LIGA_TEAM_NAMES: Readonly<Record<string, string>> = {
  // La Liga, read off the live 2025-26 feeds rather than transcribed: every
  // key is a title in `getLeagueData/La_liga/2025` and every value a `HomeTeam`
  // in `mmz4281/2526/SP1.csv`, and the two sets are each exactly twenty with
  // nothing left over on either side. Reviewed and approved 2026-08-15; the
  // eight entries whose two sides differ are where a review can find anything,
  // and `Ath Bilbao` against `Ath Madrid` is the one swap that would still read
  // plausibly. The 2026-27 feed lists no match yet, so
  // that Season's three promoted clubs are deliberately absent: they arrive as
  // `unknown Understat team name` at the first pre-Season fetch, which is the
  // pre-cron checklist's step and the failure this map is designed to make.
  Alaves: "Alaves",
  "Athletic Club": "Ath Bilbao",
  "Atletico Madrid": "Ath Madrid",
  Barcelona: "Barcelona",
  "Celta Vigo": "Celta",
  Elche: "Elche",
  Espanyol: "Espanol",
  Getafe: "Getafe",
  Girona: "Girona",
  Levante: "Levante",
  Mallorca: "Mallorca",
  Osasuna: "Osasuna",
  "Rayo Vallecano": "Vallecano",
  "Real Betis": "Betis",
  "Real Madrid": "Real Madrid",
  "Real Oviedo": "Oviedo",
  "Real Sociedad": "Sociedad",
  Sevilla: "Sevilla",
  Valencia: "Valencia",
  Villarreal: "Villarreal"
};

const BY_COMPETITION: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  PL: PREMIER_LEAGUE_TEAM_NAMES,
  PD: LA_LIGA_TEAM_NAMES
};

/**
 * Undefined for a club this Competition does not field, and for a Competition
 * with no curated map at all — both are the same answer to the caller, which
 * escalates it, and neither may fall back to another league's names.
 */
export function resolveUnderstatTeamName(
  competition: string,
  team: string
): string | undefined {
  return BY_COMPETITION[competition]?.[team];
}
