import type { Client } from "pg";
import { parseCsv } from "../csv.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";

type Database = Pick<Client, "query">;

/**
 * Every men's international since 1872, one CSV, committed roughly monthly
 * (ADR-0057). The only source this record has for what a national side did
 * last: football-data.co.uk has no international file and Understat no
 * national teams.
 */
export const RESULTS_URL =
  "https://raw.githubusercontent.com/martj42/international_results"
  + "/master/results.csv";

/**
 * What the registry names this source by, and the word the daily fetch
 * dispatches on. The repository path rather than "github": the bytes are one
 * person's dataset and not a property of the host serving them, and a second
 * dataset on the same host would be a different source.
 */
export const INTERNATIONAL_RESULTS_SOURCE = "martj42/international_results";

/**
 * The one name the archive files these bytes under. A constant and not a
 * function of the Season or the Competition, unlike every other source's:
 * there is one file, it is the same file for every Competition that reads it,
 * and an international year is not a Season (migration 0042). Two reads whose
 * bytes differ are two rows in `raw_snapshots` under this one name, which is
 * what makes a commit visible in the archive.
 */
export const RESULTS_SNAPSHOT = "martj42:international_results";

/**
 * Nothing before this is stored (ADR-0057): the packet asks what each side did
 * last, and five matches back from a Lock has never reached two years even for
 * the sides that play least. A fixed day rather than a window that slides with
 * the clock, so the same file read on two mornings stores the same rows and
 * the table only ever grows forward.
 */
export const STORED_FROM = "2024-06-01";

/**
 * The two sides the dataset spells differently from the record (ADR-0057); the
 * other fifty-two match character for character. A map and not a
 * normalisation rule, on the same terms as 365Scores' three: only a reviewed
 * pair can say that this source's "Turkey" is the record's "Türkiye".
 *
 * Nothing left over on either side is what `test/fetch-international-results`
 * checks against the archived file, and the fetch itself refuses a read in
 * which one of the fifty-four is reachable under no spelling at all -- which
 * is what a rename of one of these two looks like from here.
 */
const STORED_NAME_BY_DATASET_NAME: Readonly<Record<string, string>> = {
  "Czech Republic": "Czechia",
  Turkey: "Türkiye"
};

/**
 * The dataset's own word for each Competition that reads it, so that a Fixture
 * merged in from this record sits on a line spelled the way the dataset's own
 * rows are and the merged list reads as one list rather than two.
 *
 * Its own map and not `competitionName` from the prompt registry: what goes on
 * these lines is what this source calls the Competition, and the day the two
 * spellings differ the packet should say the source's. A Competition whose
 * registry entry names this source and which is not here is refused, on the
 * rule ADR-0054 states for every map like it.
 */
const DATASET_NAME_BY_COMPETITION: Readonly<Record<string, string>> = {
  UNL: "UEFA Nations League"
};

/** The record's spelling of a side the dataset names. */
export function storedSideName(datasetName: string): string {
  return STORED_NAME_BY_DATASET_NAME[datasetName] ?? datasetName;
}

/** What the dataset calls this Competition, or undefined where it has no row. */
export function datasetNameOf(competition: string): string | undefined {
  return DATASET_NAME_BY_COMPETITION[competition];
}

export interface InternationalResultsIssue {
  field: string;
  detail: string;
}

export class InternationalResultsValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: InternationalResultsIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "InternationalResultsValidationError";
  }
}

export class InternationalResultsHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "InternationalResultsHttpError";
  }
}

/**
 * One of the Competition's own sides that the dataset names under no spelling
 * this record knows.
 *
 * This is how a renamed side is caught at all. A row naming "Turkey" while the
 * map is missing its entry cannot be told from a row about somebody outside
 * the fifty-four -- both are simply a name the record does not hold -- so the
 * question is asked the other way round: every side the record stores has
 * played since `STORED_FROM`, so every one of them must be reachable in the
 * file. One that is not is a spelling that moved, and the alternative to
 * refusing is a packet in which that side's recent form is silently empty.
 */
export class UnmappedInternationalSideError extends Error {
  constructor(
    public readonly competition: string,
    public readonly team: string
  ) {
    super(
      `The international results dataset names no side resolving to ${team} `
      + `since ${STORED_FROM}, which Competition ${competition} stores; one `
      + "of the two spellings moved — either this dataset's or the schedule "
      + "source's, which is where the stored one comes from — so check both "
      + "before adding a row to the name map in "
      + "src/international-results/fetch-results.ts, rather than letting a "
      + "side's recent form read as empty"
    );
    this.name = "UnmappedInternationalSideError";
  }
}

export class UnknownInternationalCompetitionError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads the international results dataset, `
      + "which needs the dataset's own name for it in "
      + "src/international-results/fetch-results.ts"
    );
    this.name = "UnknownInternationalCompetitionError";
  }
}

/** One row of the file, in the record's spelling of the two sides. */
export interface InternationalResult {
  playedOn: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  /**
   * The file's own column and its own word, carried verbatim (migration 0042):
   * "FIFA World Cup", "Friendly", "UEFA Nations League". CONTEXT.md tells this
   * project to avoid the word, and keeping the source's own is what says this
   * is a string from a CSV and not a Competition code.
   */
  tournament: string;
  country: string;
  neutral: boolean;
}

export interface ParsedInternationalResults {
  /** Every row played on or after `STORED_FROM`, in the file's order. */
  results: InternationalResult[];
  /**
   * The date of the latest row in the whole file, whoever played it. Read over
   * every row and not over `results`: what this answers is how fresh the file
   * is, and its last row is usually a match between two sides no Competition
   * here stores -- 2026-08-26 Vietnam v Thailand in the recorded copy, five
   * weeks after the latest row naming a UEFA side.
   */
  latestRowOn: string;
}

const A_DATE = /^\d{4}-\d{2}-\d{2}$/;
const A_COUNT = /^\d+$/;

const COLUMNS = [
  "date",
  "home_team",
  "away_team",
  "home_score",
  "away_score",
  "tournament",
  "city",
  "country",
  "neutral"
] as const;

/**
 * The file as rows, from `STORED_FROM` forward and in the record's spelling.
 *
 * Every row's date is read even where the row is older than the window,
 * because the file's freshness is a fact about its last line and that line is
 * reached by reading all of them. A row that is malformed anywhere fails the
 * whole read, which costs this Competition its morning: the alternative is to
 * skip the row, and a source that changed shape would then be a side whose
 * recent form quietly lost a match.
 */
export function parseInternationalResults(
  source: string,
  body: string
): ParsedInternationalResults {
  const rows = parseCsv(body.replace(/^\uFEFF/, ""));
  const header = rows[0] ?? [];
  const indexes = new Map(header.map((column, index) => [column, index]));
  const missing = COLUMNS
    .filter((column) => !indexes.has(column))
    .map((column) => ({
      field: `header.${column}`,
      detail: "required column is missing"
    }));
  if (missing.length > 0) {
    throw new InternationalResultsValidationError(source, missing);
  }

  const issues: InternationalResultsIssue[] = [];
  const results: InternationalResult[] = [];
  let latestRowOn = "";
  for (const [offset, row] of rows.slice(1).entries()) {
    const rowNumber = offset + 2;
    const value = (column: string): string =>
      row[indexes.get(column) ?? -1] ?? "";
    const playedOn = value("date");
    if (!A_DATE.test(playedOn)) {
      issues.push({
        field: `row.${rowNumber}.date`,
        detail: `expected YYYY-MM-DD, received ${playedOn}`
      });
      continue;
    }
    if (playedOn > latestRowOn) {
      latestRowOn = playedOn;
    }
    if (playedOn < STORED_FROM) {
      continue;
    }
    const homeGoals = value("home_score");
    const awayGoals = value("away_score");
    const neutral = value("neutral");
    for (const [field, text, shape] of [
      ["home_score", homeGoals, A_COUNT],
      ["away_score", awayGoals, A_COUNT]
    ] as const) {
      if (!shape.test(text)) {
        issues.push({
          field: `row.${rowNumber}.${field}`,
          detail: `expected a non-negative whole number, received ${text}`
        });
      }
    }
    for (const field of ["home_team", "away_team", "tournament"] as const) {
      if (value(field).length === 0) {
        issues.push({
          field: `row.${rowNumber}.${field}`,
          detail: "is empty"
        });
      }
    }
    if (neutral !== "TRUE" && neutral !== "FALSE") {
      issues.push({
        field: `row.${rowNumber}.neutral`,
        detail: `expected TRUE or FALSE, received ${neutral}`
      });
    }
    results.push({
      playedOn,
      homeTeam: storedSideName(value("home_team")),
      awayTeam: storedSideName(value("away_team")),
      homeGoals: Number(homeGoals),
      awayGoals: Number(awayGoals),
      tournament: value("tournament"),
      country: value("country"),
      neutral: neutral === "TRUE"
    });
  }
  if (issues.length > 0) {
    throw new InternationalResultsValidationError(source, issues);
  }
  if (latestRowOn === "") {
    throw new InternationalResultsValidationError(source, [{
      field: "$",
      detail: "the file carries no row at all"
    }]);
  }
  return { results, latestRowOn };
}

export interface FetchInternationalResultsOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  /** The run's own clock, recorded as the instant this file was read. */
  now: () => Date;
}

/**
 * What each side of one Competition did last, from the GitHub dataset
 * (ADR-0057), and the date the file itself was last added to.
 *
 * One request a day whatever is outstanding, unlike the shots and xG of
 * ADR-0058: this is one file holding every international ever played, so there
 * is no per-Fixture read to skip and the whole window is rewritten on every
 * read. The rows are upserted rather than replaced, so a run that fails
 * part-way leaves what it wrote and the next morning writes it again.
 *
 * A Competition whose schedule has not been read yet asks for nothing: the
 * sides this filters by are the record's own, read off its Fixtures, and
 * before the schedule lands there are none to filter by.
 */
export async function fetchInternationalResults({
  database,
  competition,
  season,
  http,
  now
}: FetchInternationalResultsOptions): Promise<void> {
  if (datasetNameOf(competition) === undefined) {
    throw new UnknownInternationalCompetitionError(competition);
  }
  const { rows: fixtures } = await database.query<{
    home_team: string;
    away_team: string;
  }>(
    `select home_team, away_team from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );
  if (fixtures.length === 0) {
    return;
  }
  // The record's own sides, which is the only list of them there is: a side is
  // stored under the spelling its schedule source published (ADR-0057).
  const storedNames = new Set(fixtures
    .flatMap(({ home_team: home, away_team: away }) => [home, away]));

  const response = await http(RESULTS_URL, { method: "GET" });
  // Archived before validation, so a changed or unusable response is still
  // evidence a human can read.
  await storeRawSnapshots(
    database, [{ source: RESULTS_SNAPSHOT, body: response.body }]
  );
  if (response.status < 200 || response.status >= 300) {
    throw new InternationalResultsHttpError(
      RESULTS_SNAPSHOT, response.status, RESULTS_URL
    );
  }
  const { results, latestRowOn } =
    parseInternationalResults(RESULTS_SNAPSHOT, response.body);

  // A row is this Competition's business when either side is one of its own:
  // its sides play the rest of the world, and a World Cup knockout tie against
  // a side no UEFA Competition holds is exactly the match story 29 of spec
  // 0027 asks the packet to show.
  const mine = results.filter(({ homeTeam, awayTeam }) =>
    storedNames.has(homeTeam) || storedNames.has(awayTeam));
  const reached = new Set(mine
    .flatMap(({ homeTeam, awayTeam }) => [homeTeam, awayTeam]));
  // Asked before anything is written, so a spelling that has moved costs the
  // read rather than leaving the table half-rewritten under it.
  for (const stored of [...storedNames].sort()) {
    if (!reached.has(stored)) {
      throw new UnmappedInternationalSideError(competition, stored);
    }
  }

  // Keyed here the way the table is keyed (migration 0042), because a batch
  // upsert cannot touch one row twice: the file has carried a same-day
  // repeat of one pair once in its history, and the primary key already says
  // the record holds one of them.
  const byMatch = new Map(mine.map((result) =>
    [`${result.playedOn}|${result.homeTeam}|${result.awayTeam}`, result]));
  const toStore = [...byMatch.values()];
  await database.query(
    `insert into international_results (
       played_on, home_team, away_team, home_goals, away_goals,
       tournament, country, neutral
     )
     select * from unnest(
       $1::date[], $2::text[], $3::text[], $4::int[], $5::int[],
       $6::text[], $7::text[], $8::boolean[]
     )
     on conflict (played_on, home_team, away_team)
     do update set
       home_goals = excluded.home_goals,
       away_goals = excluded.away_goals,
       tournament = excluded.tournament,
       country    = excluded.country,
       neutral    = excluded.neutral`,
    [
      toStore.map(({ playedOn }) => playedOn),
      toStore.map(({ homeTeam }) => homeTeam),
      toStore.map(({ awayTeam }) => awayTeam),
      toStore.map(({ homeGoals }) => homeGoals),
      toStore.map(({ awayGoals }) => awayGoals),
      toStore.map(({ tournament }) => tournament),
      toStore.map(({ country }) => country),
      toStore.map(({ neutral }) => neutral)
    ]
  );
  // Written last, after the rows it describes: this row is what the
  // after-first-deadline guard reads to answer "is this record still reading
  // the file", so a read that failed half-way must not leave one behind.
  await database.query(
    `insert into international_results_source (source, latest_row_on, read_at)
     values ($1, $2, $3)
     on conflict (source)
     do update set
       latest_row_on = excluded.latest_row_on,
       read_at       = excluded.read_at`,
    [RESULTS_SNAPSHOT, latestRowOn, now()]
  );
}
