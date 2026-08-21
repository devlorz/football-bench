/**
 * One Competition's source names as football-data.co.uk spells them.
 *
 * The keys are whatever names the Fixtures of that Competition arrive under —
 * FPL's for the Premier League, football-data.org's for every other — and the
 * values are the identity the stored results carry. Per Competition, and not
 * one flat table, for the reason the transfer windows and the Understat
 * aliases are: a map that cannot be asked about the wrong league does not need
 * anybody to check that it wasn't.
 */
export type TeamNames = Readonly<Record<string, string>>;

const PREMIER_LEAGUE: TeamNames = {
  Arsenal: "Arsenal",
  "Aston Villa": "Aston Villa",
  Bournemouth: "Bournemouth",
  Brentford: "Brentford",
  Brighton: "Brighton",
  Chelsea: "Chelsea",
  "Coventry City": "Coventry",
  "Crystal Palace": "Crystal Palace",
  Everton: "Everton",
  Fulham: "Fulham",
  "Hull City": "Hull",
  "Ipswich Town": "Ipswich",
  Leeds: "Leeds",
  Liverpool: "Liverpool",
  "Man City": "Man City",
  "Manchester United": "Man United",
  "Man Utd": "Man United",
  Newcastle: "Newcastle",
  "Nott'm Forest": "Nott'm Forest",
  Sunderland: "Sunderland",
  "Tottenham Hotspur": "Tottenham",
  Spurs: "Tottenham",
  "Wolverhampton Wanderers": "Wolves"
};

/**
 * La Liga's twenty, derived rather than transcribed: every key is a
 * `homeTeam.name` in the recorded `competitions/PD/matches?season=2026`
 * response and every value a `HomeTeam` football-data.co.uk stored for
 * 2025-26 — seventeen in `SP1` and the three promoted clubs in `SP2`
 * (Málaga, Deportivo La Coruña, Racing Santander). The two sets are each
 * exactly twenty with nothing left over on either side.
 *
 * What a human review is actually being asked to decide, since reading twenty
 * lines and saying yes is not a control: none of the twenty is the same string
 * on both sides, so every one is a judgement. Fourteen are the same club with
 * its legal form taken off — `FC Barcelona`→`Barcelona`, `Getafe CF`→`Getafe`.
 * Six are not, and these are the ones worth a second look:
 * `Athletic Club`→`Ath Bilbao`, `Club Atlético de Madrid`→`Ath Madrid`,
 * `RCD Espanyol de Barcelona`→`Espanol`, `Rayo Vallecano de Madrid`→
 * `Vallecano`, `Real Racing Club de Santander`→`Santander`, and
 * `RC Deportivo La Coruña`→`La Coruna`.
 *
 * `Real Sociedad de Fútbol`→`Sociedad` is the one with a near miss beside it:
 * `Sociedad B` is a separate club in the stored second division, and the match
 * is exact rather than by prefix, so the reserve side cannot answer for the
 * first team.
 */
const LA_LIGA: TeamNames = {
  "Athletic Club": "Ath Bilbao",
  "CA Osasuna": "Osasuna",
  "Club Atlético de Madrid": "Ath Madrid",
  "Deportivo Alavés": "Alaves",
  "Elche CF": "Elche",
  "FC Barcelona": "Barcelona",
  "Getafe CF": "Getafe",
  "Levante UD": "Levante",
  "Málaga CF": "Malaga",
  "RC Celta de Vigo": "Celta",
  "RC Deportivo La Coruña": "La Coruna",
  "RCD Espanyol de Barcelona": "Espanol",
  "Rayo Vallecano de Madrid": "Vallecano",
  "Real Betis Balompié": "Betis",
  "Real Madrid CF": "Real Madrid",
  "Real Racing Club de Santander": "Santander",
  "Real Sociedad de Fútbol": "Sociedad",
  "Sevilla FC": "Sevilla",
  "Valencia CF": "Valencia",
  "Villarreal CF": "Villarreal"
};

/**
 * Serie A's twenty, derived rather than transcribed: every key is a
 * `homeTeam.name` in the recorded `competitions/SA/matches?season=2026`
 * response and every value a `HomeTeam` football-data.co.uk stored for
 * 2025-26 — seventeen in `I1` and the three promoted clubs in `I2` (Monza,
 * Frosinone, Venezia). The two sets are each exactly twenty with nothing left
 * over on either side. Reviewed and approved 2026-08-21, before the backfill
 * it governs was read through.
 *
 * What the review was asked to decide: none of the twenty is the same string
 * on both sides, so every one is a judgement, and nineteen are the club with
 * its legal form taken off — `Juventus FC`→`Juventus`, `SSC Napoli`→`Napoli`.
 *
 * The twentieth is the only pair in this league that can be got wrong and
 * still read: `FC Internazionale Milano`→`Inter`, whose official name ends in
 * the city that is the *other* Milan club's stored identity, with
 * `AC Milan`→`Milan` beside it.
 */
const SERIE_A: TeamNames = {
  "AC Milan": "Milan",
  "AC Monza": "Monza",
  "ACF Fiorentina": "Fiorentina",
  "AS Roma": "Roma",
  "Atalanta BC": "Atalanta",
  "Bologna FC 1909": "Bologna",
  "Cagliari Calcio": "Cagliari",
  "Como 1907": "Como",
  "FC Internazionale Milano": "Inter",
  "Frosinone Calcio": "Frosinone",
  "Genoa CFC": "Genoa",
  "Juventus FC": "Juventus",
  "Parma Calcio 1913": "Parma",
  "SS Lazio": "Lazio",
  "SSC Napoli": "Napoli",
  "Torino FC": "Torino",
  "US Lecce": "Lecce",
  "US Sassuolo Calcio": "Sassuolo",
  "Udinese Calcio": "Udinese",
  "Venezia FC": "Venezia"
};

const BY_COMPETITION: Readonly<Record<string, TeamNames>> = {
  PL: PREMIER_LEAGUE,
  PD: LA_LIGA,
  SA: SERIE_A
};

/**
 * The names a Competition's Fixtures are read through, or undefined for one
 * whose clubs nobody has reviewed yet. Undefined is not an empty map: a caller
 * that receives it is holding a Competition whose Fixture names cannot be
 * matched against stored results at all, which is a thing to say rather than a
 * lookup that quietly answers every question with "no history".
 */
export function teamNamesOf(competition: string): TeamNames | undefined {
  return BY_COMPETITION[competition];
}

/**
 * Resolves a known Fixture name to football-data.co.uk's identity. Undefined
 * is deliberate: a new name must be reviewed, never silently treated as a club
 * with no stored history.
 */
export function resolveFootballDataTeamName(
  names: TeamNames | undefined,
  team: string
): string | undefined {
  return names?.[team];
}

/**
 * Normalizes a reviewed name while leaving an already-source-native or unknown
 * name unchanged for comparisons within stored result rows.
 */
export function footballDataTeamName(
  names: TeamNames | undefined,
  team: string
): string {
  return resolveFootballDataTeamName(names, team) ?? team;
}
