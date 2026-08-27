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
  // twenty with nothing left over on either side. Eighteen are the same
  // string on both sides and cannot be wrong; the two that are not are the
  // whole of what the review was asked to decide.
  //
  // `AC Milan`→`Milan` is the one to look at twice, because the other Milan
  // club is in the same twenty: Understat calls it `Inter` and so does
  // football-data.co.uk, so the pair that would still read plausibly if it
  // were swapped is spelt apart on both sides.
  //
  // Ticket 0041 added the three promoted for 2026-27 — `Frosinone`, `Monza`,
  // `Venezia` — the same way: keys read off Understat's live feed
  // (`getLeagueData/Serie_A/2026`, already the full season, committed as
  // `test/fixtures/understat-2026-27-Serie_A.json.gz`), values off
  // `mmz4281/2526/I2.csv` — the Serie B they were promoted out of, since
  // `I1.csv` for 2026-27 is not published yet (this ticket's out-of-scope
  // section). All three read the same on both sources, so there is no swap to
  // misread, and the 2026-08-22T06:00Z daily fetch's 114 `unknown Understat
  // team name` issues were exactly these three across thirty-eight Fixtures
  // each — the derivation test checks that count against the committed feed
  // directly rather than repeating it as a number.
  //
  // The three relegated out of this twenty stay for the reason La Liga's do:
  // the five-match form window still reaches back into 2025-26, and every one
  // of those matches has an xG row keyed by these names.
  //
  // Reviewed and approved 2026-08-21 (the original twenty) and 2026-08-22
  // (the three promoted).
  "AC Milan": "Milan",
  Atalanta: "Atalanta",
  Bologna: "Bologna",
  Cagliari: "Cagliari",
  Como: "Como",
  Cremonese: "Cremonese",
  Fiorentina: "Fiorentina",
  Frosinone: "Frosinone",
  Genoa: "Genoa",
  Inter: "Inter",
  Juventus: "Juventus",
  Lazio: "Lazio",
  Lecce: "Lecce",
  Monza: "Monza",
  Napoli: "Napoli",
  "Parma Calcio 1913": "Parma",
  Pisa: "Pisa",
  Roma: "Roma",
  Sassuolo: "Sassuolo",
  Torino: "Torino",
  Udinese: "Udinese",
  Venezia: "Venezia",
  Verona: "Verona"
};

const LIGUE_1_TEAM_NAMES: Readonly<Record<string, string>> = {
  // Ligue 1's 2025-26 eighteen — eighteen, not twenty, and nothing here
  // assumes otherwise. Read off the live feeds rather than transcribed: every
  // key is a title in `getLeagueData/Ligue_1/2025` and every value a
  // `HomeTeam` in `mmz4281/2526/F1.csv`, and the two sets are each exactly
  // eighteen with nothing left over on either side.
  //
  // Seventeen are the same string on both sides and cannot be wrong. The one
  // that is not is `Paris Saint Germain`→`Paris SG`, and it is the whole of
  // what the review was asked to decide on this half — because the other
  // Paris club is in the same eighteen and both sources call it `Paris FC`.
  // The two are spelt apart on each side, so a swap cannot be made by
  // agreeing with one source and misreading the other.
  //
  // Ticket 0041 added the two promoted for 2026-27 — `Le Mans` and `Troyes`
  // — ahead of the failure rather than after it, but **not** derived the way
  // Serie A's three were: Understat's `getLeagueData/Ligue_1/2026` had one
  // match played and neither club named as of 2026-08-22, committed as
  // `test/fixtures/understat-2026-27-Ligue_1.json.gz`. Both keys are instead
  // transcribed from `mmz4281/2526/F2.csv` — the Ligue 2 both were promoted
  // out of, since `F1.csv` for 2026-27 is not published yet (this ticket's
  // out-of-scope section). `Troyes` is corroborated by Understat's own
  // spelling the last time it played Ligue 1 (`getLeagueData/Ligue_1/2021`,
  // checked live 2026-08-22); `Le Mans` has no Understat Ligue 1 history to
  // check against and is recorded as an unverified judgement call, not a
  // derived one — confirm it against the live feed once Understat actually
  // names the club.
  //
  // The two relegated out of this eighteen stay — the five-match form window
  // still reaches back into 2025-26.
  //
  // Reviewed and approved 2026-08-21 (the original eighteen) and 2026-08-22
  // (the two promoted, `Le Mans` accepted as a deferred judgement call).
  Angers: "Angers",
  Auxerre: "Auxerre",
  Brest: "Brest",
  "Le Havre": "Le Havre",
  "Le Mans": "Le Mans",
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
  Toulouse: "Toulouse",
  Troyes: "Troyes"
};

const BUNDESLIGA_TEAM_NAMES: Readonly<Record<string, string>> = {
  // The Bundesliga's 2025-26 eighteen, read off the live feeds rather than
  // transcribed: every key is a title in `getLeagueData/Bundesliga/2025` and
  // every value a `HomeTeam` in `mmz4281/2526/D1.csv`, and the two sets are
  // each exactly eighteen with nothing left over on either side.
  //
  // Seven are the same string on both sides and cannot be wrong: Augsburg,
  // Bayern Munich, Freiburg, Hoffenheim, Union Berlin, Werder Bremen,
  // Wolfsburg. The other eleven differ, and two pairs of those eleven share
  // a source-side stem a wrong mapping would still read as plausible:
  // `Bayer Leverkusen`/`Bayern Munich` (`Leverkusen`↔`Bayern Munich`, the
  // same German mix-up the football-data.org map has) and
  // `Borussia Dortmund`/`Borussia M.Gladbach` (`Dortmund`↔`M'gladbach`).
  // `FC Cologne`→`FC Koln` is the other pair a substring derivation could
  // not answer on its own.
  //
  // Reviewed and approved 2026-08-27, before the backfill it governs ran.
  Augsburg: "Augsburg",
  "Bayer Leverkusen": "Leverkusen",
  "Bayern Munich": "Bayern Munich",
  "Borussia Dortmund": "Dortmund",
  "Borussia M.Gladbach": "M'gladbach",
  "Eintracht Frankfurt": "Ein Frankfurt",
  "FC Cologne": "FC Koln",
  "FC Heidenheim": "Heidenheim",
  Freiburg: "Freiburg",
  "Hamburger SV": "Hamburg",
  Hoffenheim: "Hoffenheim",
  "Mainz 05": "Mainz",
  "RasenBallsport Leipzig": "RB Leipzig",
  "St. Pauli": "St Pauli",
  "Union Berlin": "Union Berlin",
  "VfB Stuttgart": "Stuttgart",
  "Werder Bremen": "Werder Bremen",
  Wolfsburg: "Wolfsburg"
};

const BY_COMPETITION: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  PL: PREMIER_LEAGUE_TEAM_NAMES,
  PD: LA_LIGA_TEAM_NAMES,
  SA: SERIE_A_TEAM_NAMES,
  FL1: LIGUE_1_TEAM_NAMES,
  BL1: BUNDESLIGA_TEAM_NAMES
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
