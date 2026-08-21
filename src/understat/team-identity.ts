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
  // plausibly.
  //
  // 2026-27's three promoted clubs arrived exactly as designed: the feed
  // published its fixtures, and the 2026-08-18 fetch failed with three
  // `unknown Understat team name` issues rather than storing xG under names
  // nothing would join. Added below from `mmz4281/2627/SP1.csv` — note
  // `Dep. A Coruna`, which football-data.co.uk spelt `La Coruna` the last time
  // the club was in this division. The relegated three stay: the five-match
  // form window still reaches back into 2025-26.
  Alaves: "Alaves",
  "Athletic Club": "Ath Bilbao",
  "Atletico Madrid": "Ath Madrid",
  Barcelona: "Barcelona",
  "Celta Vigo": "Celta",
  "Deportivo La Coruna": "Dep. A Coruna",
  Elche: "Elche",
  Espanyol: "Espanol",
  Getafe: "Getafe",
  Girona: "Girona",
  Levante: "Levante",
  Malaga: "Malaga",
  Mallorca: "Mallorca",
  Osasuna: "Osasuna",
  "Racing Santander": "Santander",
  "Rayo Vallecano": "Vallecano",
  "Real Betis": "Betis",
  "Real Madrid": "Real Madrid",
  "Real Oviedo": "Oviedo",
  "Real Sociedad": "Sociedad",
  Sevilla: "Sevilla",
  Valencia: "Valencia",
  Villarreal: "Villarreal"
};

const SERIE_A_TEAM_NAMES: Readonly<Record<string, string>> = {
  // Serie A's 2025-26 twenty, read off the live feeds rather than transcribed:
  // every key is a title in `getLeagueData/Serie_A/2025` and every value a
  // `HomeTeam` in `mmz4281/2526/I1.csv`, and the two sets are each exactly
  // twenty with nothing left over on either side. Reviewed and approved
  // 2026-08-21. Eighteen are the same string on both sides and cannot be
  // wrong; the two that are not are the whole of what the review was asked to
  // decide.
  //
  // `AC Milan`→`Milan` is the one to look at twice, because the other Milan
  // club is in the same twenty: Understat calls it `Inter` and so does
  // football-data.co.uk, so the pair that would still read plausibly if it
  // were swapped is spelt apart on both sides.
  //
  // 2026-27's promoted three are deliberately absent: Understat lists no
  // 2026-27 Serie A match yet, and they arrive as `unknown Understat team
  // name` at the first pre-Season fetch, which is where that failure belongs.
  // The three relegated out of this twenty stay for the reason La Liga's do:
  // the five-match form window still reaches back into 2025-26, and every one
  // of those matches has an xG row keyed by these names.
  "AC Milan": "Milan",
  Atalanta: "Atalanta",
  Bologna: "Bologna",
  Cagliari: "Cagliari",
  Como: "Como",
  Cremonese: "Cremonese",
  Fiorentina: "Fiorentina",
  Genoa: "Genoa",
  Inter: "Inter",
  Juventus: "Juventus",
  Lazio: "Lazio",
  Lecce: "Lecce",
  Napoli: "Napoli",
  "Parma Calcio 1913": "Parma",
  Pisa: "Pisa",
  Roma: "Roma",
  Sassuolo: "Sassuolo",
  Torino: "Torino",
  Udinese: "Udinese",
  Verona: "Verona"
};

const LIGUE_1_TEAM_NAMES: Readonly<Record<string, string>> = {
  // Ligue 1's 2025-26 eighteen — eighteen, not twenty, and nothing here
  // assumes otherwise. Read off the live feeds rather than transcribed: every
  // key is a title in `getLeagueData/Ligue_1/2025` and every value a
  // `HomeTeam` in `mmz4281/2526/F1.csv`, and the two sets are each exactly
  // eighteen with nothing left over on either side. Reviewed and approved
  // 2026-08-21.
  //
  // Seventeen are the same string on both sides and cannot be wrong. The one
  // that is not is `Paris Saint Germain`→`Paris SG`, and it is the whole of
  // what the review was asked to decide on this half — because the other
  // Paris club is in the same eighteen and both sources call it `Paris FC`.
  // The two are spelt apart on each side, so a swap cannot be made by
  // agreeing with one source and misreading the other.
  //
  // 2026-27's promoted two are deliberately absent for the reason Serie A's
  // three are: Understat lists no 2026-27 Ligue 1 match yet, and they arrive
  // as `unknown Understat team name` at the first pre-Season fetch. The two
  // relegated out of this eighteen stay — the five-match form window still
  // reaches back into 2025-26.
  Angers: "Angers",
  Auxerre: "Auxerre",
  Brest: "Brest",
  "Le Havre": "Le Havre",
  Lens: "Lens",
  Lille: "Lille",
  Lorient: "Lorient",
  Lyon: "Lyon",
  Marseille: "Marseille",
  Metz: "Metz",
  Monaco: "Monaco",
  Nantes: "Nantes",
  Nice: "Nice",
  "Paris FC": "Paris FC",
  "Paris Saint Germain": "Paris SG",
  Rennes: "Rennes",
  Strasbourg: "Strasbourg",
  Toulouse: "Toulouse"
};

const BY_COMPETITION: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  PL: PREMIER_LEAGUE_TEAM_NAMES,
  PD: LA_LIGA_TEAM_NAMES,
  SA: SERIE_A_TEAM_NAMES,
  FL1: LIGUE_1_TEAM_NAMES
};

/**
 * One Competition's Understat names, for the read that has to see the whole
 * map rather than ask it about a name — the derivation test compares this key
 * set against the feed's titles, and a lookup cannot answer "and nothing
 * else". The football-data side already exposes its map for the same reason.
 */
export function understatTeamNamesOf(
  competition: string
): Readonly<Record<string, string>> | undefined {
  return BY_COMPETITION[competition];
}

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
