/**
 * How English Wikipedia's transfer list identifies a club, keyed by the
 * Competition's own roster spelling.
 *
 * `article` is the club's article title, which is the only stable identity
 * either page carries: the text that displays is free-form and an editor may
 * write it as `Spurs`, `THFC` or `Tottenham London` without changing which
 * club moved anybody. `name` is the text a page does display today, and it is
 * load bearing on both pages for different reasons — on the English one it
 * catches a row that displays a club while linking elsewhere, and on the
 * Spanish one it is sometimes the only identity there is, because that page's
 * club headings are linked in the 2026 summer edition and bare text in every
 * winter edition before it.
 *
 * Only a Competition's own clubs matter. Every other club on either page — EFL,
 * Segunda, foreign — is a counterpart, stored as the row displays it and never
 * resolved, so these stay per-league tables instead of a world atlas.
 *
 * Keyed by Competition rather than flattened into one map, on the argument
 * ticket 6 reached for the Understat aliases: a flat map would resolve a club
 * correctly and resolve a club from the wrong country just as correctly, so a
 * window pointed at the wrong page would render as a league that stood still
 * rather than as a failure. Scoped, the same mistake resolves nothing.
 *
 * Undefined is deliberate and is escalated to a validation error naming the
 * spelling before anything is fetched: a promotion must surface as a failure
 * rather than as a club with no movement.
 */
export interface WikipediaClub {
  article: string;
  name: string;
}

/**
 * The Premier League's twenty, by the FPL roster spelling `fixtures` carries.
 */
const PREMIER_LEAGUE: Readonly<Record<string, WikipediaClub>> = {
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

/**
 * La Liga's twenty, keyed by football-data.org's club names — the spelling
 * `fixtures` carries for a Competition that reads its schedule from there
 * (ADR-0036), which is a different source and a different register from the
 * Premier League's FPL names above.
 *
 * Derived rather than transcribed, on 2026-08-15 and by the method ticket 6
 * settled on: every key is a `homeTeam.name` in
 * `competitions/PD/matches?season=2026` and every value the heading of a
 * section under `==La Liga==` on `List of Spanish football transfers summer
 * 2026`. Both sets are exactly twenty with nothing left over on either side,
 * which is what makes this a pairing rather than a guess. Ten of the twenty
 * are a straight match on the article title and cannot be wrong; the ten that
 * are not are the ones a human review is actually for, and none of them is
 * ambiguous against another — the three clubs carrying "Real" resolve to
 * Madrid, Sociedad and Racing Santander with no overlap.
 *
 * The three clubs promoted for 2026-27 — Deportivo, Racing Santander and
 * Málaga — are here because football-data.org already lists them; a club that
 * is not arrives as a validation error at the fetch, which is the failure this
 * table exists to make.
 */
const LA_LIGA: Readonly<Record<string, WikipediaClub>> = {
  "Athletic Club": { article: "Athletic Bilbao", name: "Athletic Bilbao" },
  "CA Osasuna": { article: "CA Osasuna", name: "Osasuna" },
  "Club Atlético de Madrid": {
    article: "Atlético Madrid",
    name: "Atlético Madrid"
  },
  "Deportivo Alavés": { article: "Deportivo Alavés", name: "Alavés" },
  "Elche CF": { article: "Elche CF", name: "Elche" },
  "FC Barcelona": { article: "FC Barcelona", name: "Barcelona" },
  "Getafe CF": { article: "Getafe CF", name: "Getafe" },
  "Levante UD": { article: "Levante UD", name: "Levante" },
  "Málaga CF": { article: "Málaga CF", name: "Málaga" },
  "RC Celta de Vigo": { article: "Celta Vigo", name: "Celta Vigo" },
  "RC Deportivo La Coruña": {
    article: "Deportivo A Coruña",
    name: "Deportivo A Coruña"
  },
  "RCD Espanyol de Barcelona": { article: "RCD Espanyol", name: "Espanyol" },
  "Rayo Vallecano de Madrid": {
    article: "Rayo Vallecano",
    name: "Rayo Vallecano"
  },
  "Real Betis Balompié": { article: "Real Betis", name: "Betis" },
  "Real Madrid CF": { article: "Real Madrid", name: "Real Madrid" },
  "Real Racing Club de Santander": {
    article: "Racing Santander",
    name: "Racing Santander"
  },
  "Real Sociedad de Fútbol": { article: "Real Sociedad", name: "Real Sociedad" },
  "Sevilla FC": { article: "Sevilla FC", name: "Sevilla" },
  "Valencia CF": { article: "Valencia CF", name: "Valencia" },
  "Villarreal CF": { article: "Villarreal CF", name: "Villarreal" }
};

/**
 * Serie A's twenty, keyed by football-data.org's club names, derived on
 * 2026-08-21 by the method ticket 6 settled on and ticket 7 repeated: every
 * key is a `homeTeam.name` in `competitions/SA/matches?season=2026` and every
 * value a club the Italian page's `Transfers` table links to. Both sides are
 * exactly twenty with nothing left over, which is what makes it a pairing
 * rather than a guess.
 *
 * Nineteen of the twenty match on the article title outright and cannot be
 * wrong. The twentieth is the only judgement call: football-data.org's `FC
 * Internazionale Milano` is English Wikipedia's `Inter Milan`, and no other
 * club on either side carries "Inter" or "Milano", so it cannot be confused
 * with `AC Milan`, which is present under its own name on both sides.
 *
 * The displayed names are the page's own for each article, and they are what a
 * counterpart column will show; on this page the article is what resolves a
 * club, because it links every one of them.
 */
const SERIE_A: Readonly<Record<string, WikipediaClub>> = {
  "AC Milan": { article: "AC Milan", name: "Milan" },
  "AC Monza": { article: "AC Monza", name: "Monza" },
  "ACF Fiorentina": { article: "ACF Fiorentina", name: "Fiorentina" },
  "AS Roma": { article: "AS Roma", name: "Roma" },
  "Atalanta BC": { article: "Atalanta BC", name: "Atalanta" },
  "Bologna FC 1909": { article: "Bologna FC 1909", name: "Bologna" },
  "Cagliari Calcio": { article: "Cagliari Calcio", name: "Cagliari" },
  "Como 1907": { article: "Como 1907", name: "Como" },
  "FC Internazionale Milano": { article: "Inter Milan", name: "Inter" },
  "Frosinone Calcio": { article: "Frosinone Calcio", name: "Frosinone" },
  "Genoa CFC": { article: "Genoa CFC", name: "Genoa" },
  "Juventus FC": { article: "Juventus FC", name: "Juventus" },
  "Parma Calcio 1913": { article: "Parma Calcio 1913", name: "Parma" },
  "SS Lazio": { article: "SS Lazio", name: "Lazio" },
  "SSC Napoli": { article: "SSC Napoli", name: "Napoli" },
  "Torino FC": { article: "Torino FC", name: "Torino" },
  "US Lecce": { article: "US Lecce", name: "Lecce" },
  "US Sassuolo Calcio": { article: "US Sassuolo Calcio", name: "Sassuolo" },
  "Udinese Calcio": { article: "Udinese Calcio", name: "Udinese" },
  "Venezia FC": { article: "Venezia FC", name: "Venezia" }
};

/**
 * Ligue 1's eighteen -- eighteen and not twenty, which is the first thing in
 * this file that is not a Competition's own spelling of the same twenty --
 * keyed by football-data.org's club names and derived on 2026-08-21 the same
 * way: every key is a `homeTeam.name` in `competitions/FL1/matches?season=2026`
 * and every `name` a section heading under `==Ligue 1==` on `List of French
 * football transfers summer 2026`. Both sides are exactly eighteen with
 * nothing left over.
 *
 * The `name` is what resolves a club here, because that page heads its
 * sections in bare text -- `===Lens===` -- exactly as every Spanish winter
 * edition does. The `article` is the title the page's own links use for the
 * club and is carried for the day a heading is linked; two of the eighteen
 * differ from football-data.org's spelling, `Racing Club de Lens` linking as
 * `RC Lens` and `Stade Rennais FC 1901` as `Stade Rennais FC`, and Paris
 * Saint-Germain is written both `Paris Saint-Germain FC` and `Paris
 * Saint-Germain F.C.` on the page, of which the first is the one it uses five
 * times out of six.
 *
 * The two Paris clubs are the only pair that could be confused and they are
 * not: `Paris FC` and `Paris Saint-Germain` head their own sections and share
 * no spelling.
 */
const LIGUE_1: Readonly<Record<string, WikipediaClub>> = {
  "AJ Auxerre": { article: "AJ Auxerre", name: "Auxerre" },
  "AS Monaco FC": { article: "AS Monaco FC", name: "Monaco" },
  "Angers SCO": { article: "Angers SCO", name: "Angers" },
  "ES Troyes AC": { article: "ES Troyes AC", name: "Troyes" },
  "FC Lorient": { article: "FC Lorient", name: "Lorient" },
  "Le Havre AC": { article: "Le Havre AC", name: "Le Havre" },
  "Le Mans FC": { article: "Le Mans FC", name: "Le Mans" },
  "Lille OSC": { article: "Lille OSC", name: "Lille" },
  "OGC Nice": { article: "OGC Nice", name: "Nice" },
  "Olympique Lyonnais": { article: "Olympique Lyonnais", name: "Lyon" },
  "Olympique de Marseille": {
    article: "Olympique de Marseille",
    name: "Marseille"
  },
  "Paris FC": { article: "Paris FC", name: "Paris FC" },
  "Paris Saint-Germain FC": {
    article: "Paris Saint-Germain FC",
    name: "Paris Saint-Germain"
  },
  "RC Strasbourg Alsace": {
    article: "RC Strasbourg Alsace",
    name: "Strasbourg"
  },
  "Racing Club de Lens": { article: "RC Lens", name: "Lens" },
  "Stade Brestois 29": { article: "Stade Brestois 29", name: "Brest" },
  "Stade Rennais FC 1901": { article: "Stade Rennais FC", name: "Rennes" },
  "Toulouse FC": { article: "Toulouse FC", name: "Toulouse" }
};

const WIKIPEDIA_CLUBS: Readonly<
  Record<string, Readonly<Record<string, WikipediaClub>>>
> = {
  PL: PREMIER_LEAGUE,
  PD: LA_LIGA,
  SA: SERIE_A,
  FL1: LIGUE_1
};

export function resolveWikipediaClub(
  competition: string,
  club: string
): WikipediaClub | undefined {
  return WIKIPEDIA_CLUBS[competition]?.[club];
}
