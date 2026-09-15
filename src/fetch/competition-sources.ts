/**
 * Where one Competition's schedule, history, shots and xG, Squad Changes and
 * head coaches come from (ADR-0057). Which sources a Competition has is data
 * the daily fetch reads, not a flag and not a test on its code: each loop
 * walks the Competitions whose entry names its source, so a Competition that
 * never claimed a source never fails for lacking one.
 *
 * The entries here describe exactly what those Competitions read today and
 * change nothing about their days. `UNL` names UEFA for its schedule from
 * ticket 0071 and 365Scores for its shots and xG from ticket 0072, each the
 * ticket that built that fetch, the GitHub dataset for its history from ticket
 * 0073, and `null` for the one whose fetch ticket 0074 builds. A `null` is not
 * a placeholder: it says this Competition has no such source, the daily fetch
 * does not walk it, and the packet states the absence — which is the truth
 * about `UNL`'s head coaches until its ticket lands. Naming a source before
 * its fetch exists would be the lie, because the fetch would believe it.
 *
 * A listed Competition with no entry fails the run by name (ADR-0054: a
 * missing map fails loudly, a wrong one fails nothing).
 */
export interface CompetitionSources {
  /**
   * What `schedule` does and does not decide, because half of it is easy to
   * misread. The daily fetch dispatches football-data.org on this field, so a
   * Competition that names it is read there and one that does not is not —
   * that half is live, and `PL`'s `"fpl"` is exactly what keeps the Premier
   * League out of that loop (ADR-0036), where the code used to be a literal.
   *
   * The other half is not: `fetchFplDaily` runs for the Season and not for a
   * listed Competition, because the FPL API answers the FPL track as well as
   * the Premier League's schedule and that track is the Premier League by
   * nature rather than by listing (ADR-0035). So naming `"fpl"` does not cause
   * the FPL fetch and dropping it would not stop it. A Competition reads the
   * sources its entry names; the FPL API is read whether or not one does.
   */
  readonly schedule: "fpl" | "football-data.org" | "uefa";
  /**
   * Where "what each side did last" comes from, and the table the
   * after-first-deadline guard asks. The two names are two sources and not two
   * spellings of one: a league's results are rows of `historical_matches`
   * under a Division, and a cup's are rows of `international_results` under
   * none (migration 0042).
   */
  readonly history:
    | "football-data.co.uk"
    | "martj42/international_results"
    | null;
  readonly stats: "understat" | "365scores" | null;
  readonly squadChanges: "wikipedia-transfers" | null;
  readonly headCoaches: "wikipedia-season-article" | null;
}

/**
 * The four sources every domestic league in this record reads — "league" in
 * its literal sense here and not as a word for what a Competition is
 * (CONTEXT.md), because what these four have in common is that they hold
 * clubs. Shared rather than repeated five times because it is one fact about a
 * domestic league and not five coincidences; a Competition that reads a
 * different set spells its own out.
 */
const THE_DOMESTIC_FOUR = {
  history: "football-data.co.uk",
  stats: "understat",
  squadChanges: "wikipedia-transfers",
  headCoaches: "wikipedia-season-article"
} as const;

const BY_COMPETITION: Readonly<Record<string, CompetitionSources>> = {
  // The Premier League alone keeps the FPL API for its schedule (ADR-0036),
  // which is the one filter the daily fetch used to spell as a `PL` literal.
  PL: { schedule: "fpl", ...THE_DOMESTIC_FOUR },
  PD: { schedule: "football-data.org", ...THE_DOMESTIC_FOUR },
  SA: { schedule: "football-data.org", ...THE_DOMESTIC_FOUR },
  BL1: { schedule: "football-data.org", ...THE_DOMESTIC_FOUR },
  FL1: { schedule: "football-data.org", ...THE_DOMESTIC_FOUR },
  // The first Competition that is not a league, and the first that shares
  // none of the domestic four: no club plays in it, so none of the four
  // sources that hold clubs can answer for it (ADR-0057). Its own three —
  // 365Scores for shots and xG, a dataset for recent internationals, a
  // Wikipedia list for the head coaches — arrive with tickets 0072 to 0074
  // and replace a `null` each.
  //
  // `stats` and `history` are the first two of them and read nothing a league
  // reads: Understat has no international competition at all (ADR-0058) and
  // football-data.co.uk no international file (ADR-0057), so each of those two
  // unions holds two sources and not two spellings of one. A cup keeps
  // `squadChanges` null for good — a national team has no transfer window —
  // and the one remaining null is ticket 0074.
  UNL: {
    schedule: "uefa",
    history: "martj42/international_results",
    stats: "365scores",
    squadChanges: null,
    headCoaches: null
  }
};

/** Every Competition this registry names sources for. */
export const COMPETITIONS_WITH_SOURCES: readonly string[] =
  Object.keys(BY_COMPETITION);

export class UnknownCompetitionSourcesError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} has no source registry entry; `
      + "add one to src/fetch/competition-sources.ts before listing it"
    );
    this.name = "UnknownCompetitionSourcesError";
  }
}

export function sourcesOf(
  competition: string
): CompetitionSources | undefined {
  return BY_COMPETITION[competition];
}
