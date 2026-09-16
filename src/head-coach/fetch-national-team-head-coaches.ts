import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  cellText,
  parseDate,
  WIKIMEDIA_REQUEST_HEADERS
} from "../wikipedia/wikitext.js";
// The HTTP failure and the validation failure are named for the *kind* of
// source and not for the season articles: both pipelines are a Competition's
// head-coach source, and an operator reading either message is reading about a
// Head Coach. The two refusals below are this module's own because their
// guidance is this page's — which map to re-derive, and against what.
import { HeadCoachSourceHttpError } from "./fetch-head-coach-changes.js";
import {
  colspanOf,
  sectionTable,
  tableLines,
  HeadCoachSourceValidationError,
  type HeadCoachSourceIssue
} from "./parse-head-coach-changes.js";

type Database = Pick<Client, "query">;

/**
 * English Wikipedia's list of who is in post at every national side today, and
 * the date each of them assumed the role (ADR-0045, ADR-0057). The one source
 * this record has for a cup's Head Coaches: a season article's Managerial
 * changes table is a club competition's table, and no national side appears in
 * one.
 *
 * The article's own title carries the word this project does not use for the
 * person in post (CONTEXT.md), and is quoted here exactly as Wikipedia writes
 * it, on the same terms migration 0042 keeps the dataset's `tournament`
 * column: a title is the source's name for itself, and rewriting it into this
 * record's vocabulary would make it a title that 404s.
 */
export const PAGE =
  "List of current national association football team managers";

export const PAGE_URL =
  "https://en.wikipedia.org/w/index.php?title="
  + "List_of_current_national_association_football_team_managers&action=raw";

/**
 * What the registry names this source by, and the word the daily fetch
 * dispatches on. Written in the record's vocabulary and not the page's, unlike
 * the title above: this string is one of this codebase's own names for a
 * thing, where the title is a URL.
 */
export const NATIONAL_TEAM_HEAD_COACHES_SOURCE =
  "wikipedia-national-team-head-coaches";

/**
 * The one name the archive files these bytes under. A constant and not a
 * function of the Season or the Competition, for the reason the internationals
 * dataset's is: there is one page, it is the same page for every Competition
 * that reads it, and it states no Season at all -- it is a list of who is in
 * post today. Two mornings whose bytes differ are two rows in `raw_snapshots`
 * under this one name, which is what makes an edit visible in the archive and
 * is the whole mechanism a Head Coach Change is found by.
 */
export const HEAD_COACHES_SNAPSHOT = "wikipedia:national-team-head-coaches";

/**
 * The page's columns, quoted from the source. Only the three that are read are
 * pinned, and the fourth -- `Refs` -- is left alone: a citation column that
 * moves is not a name filed against the wrong side, which is the one failure
 * pinning exists to prevent here. `Manager` is the page's word for the column
 * and is quoted for the same reason the title above is.
 */
const SOURCE_COLUMNS = ["Team", "Manager", "Assumed role"];

const TEAM = 0;
const HEAD_COACH = 1;
const ASSUMED = 2;

/**
 * `{{fb|ALB}}` — how the table keys every row, by FIFA trigram. Upper case
 * only, because that is what every row of the page writes and a lower-case
 * trigram would be a shape worth looking at rather than one worth quietly
 * normalising.
 */
const TRIGRAM_CELL = /^\{\{fb\|([A-Z]{3})\}\}$/;

/**
 * A post the page states as empty. Both spellings are the same fact -- the row
 * exists and names nobody -- and anything else in the column is a person's
 * name. Read as a closed pair rather than as "does not look like a name",
 * because a cell this parser cannot recognise is a shape change worth a
 * refusal and not a side quietly rendered as having no Head Coach (ADR-0045).
 */
const VACANT = /^vacant$/i;

/**
 * One Competition's slice of the page: the confederation section its sides are
 * listed under, and its own sides by the trigram that section keys them with.
 *
 * Keyed by Competition because both facts are the Competition's and not this
 * page's. A second cup would read a different section of the same article --
 * the page carries one per confederation -- and would bring its own sides with
 * it; a Competition whose registry entry names this source and which has no
 * entry here is refused, on the rule ADR-0054 states for every map like it.
 */
export interface NationalTeamSection {
  /** The article's own section heading. */
  heading: string;
  /**
   * Every side this Competition stores, by the trigram the page's rows carry,
   * in the spelling the schedule source published and `fixtures` holds
   * (ADR-0057). Derived from the recorded UEFA feed's `countryCode` against
   * the stored names and reviewed, which is what
   * `test/fetch-national-team-head-coaches` holds it to: nothing left over on
   * either side.
   *
   * A map and not a rule that lowercases a trigram into a name. Only a
   * reviewed pair can say that this page's `IRL` is the record's "Republic of
   * Ireland" and its `TUR` the record's "Türkiye", and a side given another
   * side's Head Coach is the one failure this whole module is arranged
   * against.
   */
  storedNameByTrigram: Readonly<Record<string, string>>;
  /**
   * The rows of this section that are not this Competition's, by trigram.
   *
   * Named rather than skipped. The section lists the confederation's members
   * and the Competition holds the ones playing this Season, so the difference
   * is a fact with a reason -- Russia is a UEFA member under suspension and
   * enters no Nations League -- and naming it is what makes a *new* trigram on
   * the page a refusal rather than a row silently dropped. A side is far more
   * likely to arrive here by a spelling drifting than by UEFA admitting a
   * fifty-sixth member, and the first of those must never pass quietly.
   */
  outsideTheCompetition: readonly string[];
}

const BY_COMPETITION: Readonly<Record<string, NationalTeamSection>> = {
  UNL: {
    heading: "UEFA",
    storedNameByTrigram: {
      ALB: "Albania",
      AND: "Andorra",
      ARM: "Armenia",
      AUT: "Austria",
      AZE: "Azerbaijan",
      BEL: "Belgium",
      BIH: "Bosnia and Herzegovina",
      BLR: "Belarus",
      BUL: "Bulgaria",
      CRO: "Croatia",
      CYP: "Cyprus",
      CZE: "Czechia",
      DEN: "Denmark",
      ENG: "England",
      ESP: "Spain",
      EST: "Estonia",
      FIN: "Finland",
      FRA: "France",
      FRO: "Faroe Islands",
      GEO: "Georgia",
      GER: "Germany",
      GIB: "Gibraltar",
      GRE: "Greece",
      HUN: "Hungary",
      IRL: "Republic of Ireland",
      ISL: "Iceland",
      ISR: "Israel",
      ITA: "Italy",
      KAZ: "Kazakhstan",
      KOS: "Kosovo",
      LIE: "Liechtenstein",
      LTU: "Lithuania",
      LUX: "Luxembourg",
      LVA: "Latvia",
      MDA: "Moldova",
      MKD: "North Macedonia",
      MLT: "Malta",
      MNE: "Montenegro",
      NED: "Netherlands",
      NIR: "Northern Ireland",
      NOR: "Norway",
      POL: "Poland",
      POR: "Portugal",
      ROU: "Romania",
      SCO: "Scotland",
      SMR: "San Marino",
      SRB: "Serbia",
      SUI: "Switzerland",
      SVK: "Slovakia",
      SVN: "Slovenia",
      SWE: "Sweden",
      TUR: "Türkiye",
      UKR: "Ukraine",
      WAL: "Wales"
    },
    // UEFA has fifty-five members and this Season's Nations League fifty-four.
    outsideTheCompetition: ["RUS"]
  }
};

/** This Competition's slice of the page, or undefined where it has none. */
export function nationalTeamSectionOf(
  competition: string
): NationalTeamSection | undefined {
  return BY_COMPETITION[competition];
}

export class UnknownNationalTeamCompetitionError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads the current national team head `
      + "coaches list, which needs its confederation's section and its own "
      + "sides by trigram in "
      + "src/head-coach/fetch-national-team-head-coaches.ts"
    );
    this.name = "UnknownNationalTeamCompetitionError";
  }
}

/**
 * One of the Competition's own stored sides that the trigram map reaches under
 * no spelling.
 *
 * The map's names and the record's names come from the same UEFA feed, so this
 * fires when that feed's spelling of a side has moved since the map was
 * derived -- and the alternative to refusing is that side's Head Coach line
 * reading as a Gap for as long as nobody looks.
 */
export class UnmappedNationalSideError extends Error {
  constructor(
    public readonly competition: string,
    public readonly team: string
  ) {
    super(
      `The trigram map reaches no side spelled ${team}, which Competition `
      + `${competition} stores; the schedule source's spelling has moved `
      + "since the map was derived from it, so re-derive the map in "
      + "src/head-coach/fetch-national-team-head-coaches.ts against the "
      + "recorded feed rather than letting that side's Head Coach read as a Gap"
    );
    this.name = "UnmappedNationalSideError";
  }
}

/**
 * One row of the page's section, before its trigram is resolved to a side.
 *
 * Named apart from the stored row of the same fact in
 * `src/context/build-national-team-head-coach-context.ts`: that one is keyed
 * by the side this record spells and carries the morning it was read, and
 * neither is true of a row still on the page.
 */
export interface HeadCoachOnThePage {
  /** The FIFA trigram the row is keyed by. */
  trigram: string;
  /** The person in post, or null where the page states the post vacant. */
  headCoach: string | null;
  /** `YYYY-MM-DD`, and null exactly where `headCoach` is. */
  assumedOn: string | null;
}

/**
 * One confederation's section of the page, as rows keyed by trigram.
 *
 * Every row of the section is read, including the ones no Competition here
 * holds: which rows are this Competition's is the caller's question, and a
 * parser that filtered would have no way to tell a row it dropped on purpose
 * from a trigram that has drifted.
 *
 * A row that is malformed anywhere fails the whole read. There is no skipping
 * one: this table is one row per side, and a row quietly dropped is a side
 * whose Head Coach the packet stops naming with no sign that it ever did.
 */
export function parseNationalTeamHeadCoaches(
  heading: string,
  wikitext: string
): HeadCoachOnThePage[] {
  const issues: HeadCoachSourceIssue[] = [];
  const rows: HeadCoachOnThePage[] = [];
  // Every refusal here names `HEAD_COACHES_SNAPSHOT` rather than taking a
  // source to name: there is one page, so a parameter for it would have one
  // value and would only let a caller say something untrue about which bytes
  // were read.
  const { wikitable } = sectionTable(
    HEAD_COACHES_SNAPSHOT, [heading], wikitext
  );
  const { headerRows, rows: lines } = tableLines(wikitable);

  // The first header row alone, which is the one that describes the table's
  // shape, and only as far as the columns that are read -- `Refs` after them
  // is deliberately unpinned.
  const labels = (headerRows[0] ?? []).map(cellText);
  const width = (headerRows[0] ?? [])
    .reduce((columns, cell) => columns + colspanOf(cell), 0);
  if (
    labels.slice(0, SOURCE_COLUMNS.length).join("|") !== SOURCE_COLUMNS.join("|")
  ) {
    throw new HeadCoachSourceValidationError(HEAD_COACHES_SNAPSHOT, [{
      field: heading,
      detail:
        `expected the columns ${SOURCE_COLUMNS.join(", ")}, `
        + `received ${labels.join(", ")}`
    }]);
  }

  for (const [index, cells] of lines.entries()) {
    // Every column that is read, and no more than the header states. Not the
    // header's width exactly, unlike the season articles' tables: this page
    // simply leaves the trailing `Refs` cell off a row nobody has cited --
    // Denmark's is three cells wide in the recording -- and MediaWiki renders
    // that as an empty last column. The bound is the pinned columns because
    // those are the ones a short row would silently shift; a row missing only
    // its citation is the page as it is written.
    if (cells.length < SOURCE_COLUMNS.length || cells.length > width) {
      issues.push({
        field: `${heading}.${index}`,
        detail: `a row reads as ${cells.length} cells of ${width} columns`
      });
      continue;
    }
    const trigram = TRIGRAM_CELL.exec(cellText(cells[TEAM] as string))?.[1];
    if (trigram === undefined) {
      issues.push({
        field: `${heading}.${index}.team`,
        detail: `expected {{fb|XXX}}, received ${cellText(cells[TEAM] as string)}`
      });
      continue;
    }
    const named = cellText(cells[HEAD_COACH] as string);
    // A vacancy states no date to read, and is the one row that carries
    // neither half of the pair (migration 0045).
    if (named === "" || VACANT.test(named)) {
      rows.push({ trigram, headCoach: null, assumedOn: null });
      continue;
    }
    const assumedOn = parseDate(cellText(cells[ASSUMED] as string));
    if (assumedOn === undefined) {
      issues.push({
        field: `${heading}.${index}.assumedOn`,
        detail: `${trigram} names ${named} and no readable date, received `
          + cellText(cells[ASSUMED] as string)
      });
      continue;
    }
    rows.push({ trigram, headCoach: named, assumedOn });
  }

  if (issues.length > 0) {
    throw new HeadCoachSourceValidationError(HEAD_COACHES_SNAPSHOT, issues);
  }
  return rows;
}

export interface FetchNationalTeamHeadCoachesOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  /** The run's own clock, recorded as the instant this page was read. */
  now: () => Date;
}

/**
 * Who picks each of one Competition's sides, from the page that lists them
 * (ADR-0045), stored as one snapshot per side per day.
 *
 * One request a day whatever is outstanding, like the internationals dataset
 * and unlike the per-Fixture shots of ADR-0058: this is one page holding every
 * national side there is, so there is nothing to ask for a second time. The
 * rows are upserted on the side and the day, so a run repeated within a
 * morning rewrites its own snapshot rather than inventing a Change out of
 * having read the same page twice.
 *
 * Three refusals, each catching a different way the two sides of this map can
 * part company: a stored side the map cannot reach, a mapped side the page has
 * dropped, and a page row the map has never heard of. All three are asked
 * before anything is written, so a page that moved costs this Competition its
 * morning rather than leaving the table half-rewritten under it.
 */
export async function fetchNationalTeamHeadCoaches({
  database,
  competition,
  season,
  http,
  now
}: FetchNationalTeamHeadCoachesOptions): Promise<void> {
  const section = nationalTeamSectionOf(competition);
  if (section === undefined) {
    throw new UnknownNationalTeamCompetitionError(competition);
  }
  const { rows: fixtures } = await database.query<{
    home_team: string;
    away_team: string;
  }>(
    `select home_team, away_team from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );

  const response = await http(PAGE_URL, {
    method: "GET",
    headers: WIKIMEDIA_REQUEST_HEADERS
  });
  // Archived before validation, so a changed or unusable response is still
  // evidence a human can read -- and, here, so that tomorrow has something to
  // compare against even on a morning the parse refused.
  await storeRawSnapshots(
    database, [{ source: HEAD_COACHES_SNAPSHOT, body: response.body }]
  );
  if (response.status < 200 || response.status >= 300) {
    throw new HeadCoachSourceHttpError(
      HEAD_COACHES_SNAPSHOT, response.status, PAGE_URL
    );
  }
  const page = parseNationalTeamHeadCoaches(section.heading, response.body);

  const outside = new Set(section.outsideTheCompetition);
  const unknown = page
    .filter(({ trigram }) =>
      section.storedNameByTrigram[trigram] === undefined
      && !outside.has(trigram))
    .map(({ trigram }) => trigram);
  const onThePage = new Set(page.map(({ trigram }) => trigram));
  const dropped = Object.keys(section.storedNameByTrigram)
    .filter((trigram) => !onThePage.has(trigram));
  if (unknown.length > 0 || dropped.length > 0) {
    throw new HeadCoachSourceValidationError(HEAD_COACHES_SNAPSHOT, [
      ...unknown.map((trigram) => ({
        field: `${section.heading}.${trigram}`,
        detail: "is a row this Competition's trigram map has never seen"
      })),
      ...dropped.map((trigram) => ({
        field: `${section.heading}.${trigram}`,
        detail: `${section.storedNameByTrigram[trigram] as string} is stored `
          + "by this Competition and the page carries no row for it"
      }))
    ]);
  }
  // The record's own sides, read off its Fixtures, against the names the map
  // resolves to. Before the schedule lands there are none and this asks
  // nothing.
  const mapped = new Set(Object.values(section.storedNameByTrigram));
  const stored = [...new Set(fixtures
    .flatMap(({ home_team: home, away_team: away }) => [home, away]))].sort();
  for (const team of stored) {
    if (!mapped.has(team)) {
      throw new UnmappedNationalSideError(competition, team);
    }
  }

  const observedAt = now();
  const observedOn = observedAt.toISOString().slice(0, 10);
  const mine = page.filter(({ trigram }) =>
    section.storedNameByTrigram[trigram] !== undefined);
  await database.query(
    `insert into national_team_head_coaches (
       team, observed_on, observed_at, head_coach, assumed_on
     )
     select * from unnest(
       $1::text[], $2::date[], $3::timestamptz[], $4::text[], $5::date[]
     )
     on conflict (team, observed_on)
     do update set
       observed_at = excluded.observed_at,
       head_coach  = excluded.head_coach,
       assumed_on  = excluded.assumed_on`,
    [
      mine.map(({ trigram }) => section.storedNameByTrigram[trigram] as string),
      mine.map(() => observedOn),
      mine.map(() => observedAt),
      mine.map(({ headCoach }) => headCoach),
      mine.map(({ assumedOn }) => assumedOn)
    ]
  );
}
