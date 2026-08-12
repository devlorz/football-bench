/**
 * How English Wikipedia's transfer list identifies a Premier League club.
 *
 * `article` is the club's article title, which is what a transfer row actually
 * links to and the only stable identity the page carries: the text a row
 * displays is free-form and an editor may write it as `Spurs`, `THFC` or
 * `Tottenham London` without changing which club moved anybody. `name` is the
 * text the page does display today, kept only so that a row displaying a club
 * while linking somewhere else can be caught and named rather than dropped.
 *
 * Only the twenty matter. Every other club on the page — EFL, foreign — is a
 * counterpart, stored as the row displays it and never resolved, so this table
 * stays a twenty-row mapping instead of a world atlas.
 *
 * Undefined is deliberate and is escalated to a validation error naming the
 * spelling before anything is fetched: a promotion must surface as a failure
 * rather than as a club with no movement.
 */
export interface WikipediaClub {
  article: string;
  name: string;
}

const WIKIPEDIA_CLUBS: Readonly<Record<string, WikipediaClub>> = {
  Arsenal: { article: "Arsenal F.C.", name: "Arsenal" },
  "Aston Villa": { article: "Aston Villa F.C.", name: "Aston Villa" },
  Bournemouth: { article: "AFC Bournemouth", name: "Bournemouth" },
  Brentford: { article: "Brentford F.C.", name: "Brentford" },
  Brighton: {
    article: "Brighton & Hove Albion F.C.",
    name: "Brighton & Hove Albion"
  },
  Chelsea: { article: "Chelsea F.C.", name: "Chelsea" },
  "Coventry City": { article: "Coventry City F.C.", name: "Coventry City" },
  "Crystal Palace": { article: "Crystal Palace F.C.", name: "Crystal Palace" },
  Everton: { article: "Everton F.C.", name: "Everton" },
  Fulham: { article: "Fulham F.C.", name: "Fulham" },
  "Hull City": { article: "Hull City A.F.C.", name: "Hull City" },
  "Ipswich Town": { article: "Ipswich Town F.C.", name: "Ipswich Town" },
  Leeds: { article: "Leeds United F.C.", name: "Leeds United" },
  Liverpool: { article: "Liverpool F.C.", name: "Liverpool" },
  "Man City": { article: "Manchester City F.C.", name: "Manchester City" },
  "Man Utd": { article: "Manchester United F.C.", name: "Manchester United" },
  Newcastle: { article: "Newcastle United F.C.", name: "Newcastle United" },
  "Nott'm Forest": {
    article: "Nottingham Forest F.C.",
    name: "Nottingham Forest"
  },
  Spurs: { article: "Tottenham Hotspur F.C.", name: "Tottenham Hotspur" },
  Sunderland: { article: "Sunderland A.F.C.", name: "Sunderland" }
};

export function resolveWikipediaClub(club: string): WikipediaClub | undefined {
  return WIKIPEDIA_CLUBS[club];
}
