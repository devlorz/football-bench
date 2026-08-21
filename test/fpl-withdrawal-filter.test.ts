import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The filter that cannot be forgotten (ADR-0047, ticket 0030).
 *
 * Six reads ask `models` for the FPL track's Entrants and every one of them has
 * to carry `withdrawn_at is null`, because a seat that left the track still
 * holds its row — the withdrawal is a date, not a deletion, so that the
 * attempts and contexts the decision was read from survive it. Spec 0023 chose
 * to inline the filter at each site rather than extract a shared read: they
 * differ in their columns, their joins and their parameter positions, and a
 * fragment of a `where` clause is not enough structure to be worth the
 * indirection. This test is the price of that choice, and its whole value is in
 * the read site nobody has written yet.
 *
 * **It fails closed, per query.** Every read of `models` that names a
 * `prompt_version` either filters on `withdrawn_at is null` or says in its own
 * SQL whose roster it reads, on a `-- roster:` line. A read that does neither
 * fails this suite by name, whatever shape it takes: nothing here asks what the
 * query looks like beyond the tables it names.
 *
 * Two earlier drafts failed open and are worth naming, because both looked
 * closed. The first recognised a read by whether `FPL_PROMPT_VERSION` appeared
 * within four hundred characters of the literal, which a common table
 * expression, an aliased constant or a long argument list walked straight past.
 * The second classified the survivors by file and count, which hands a file a
 * quota: swap one of `read-api.ts`'s four match reads for an unfiltered FPL
 * read and the arithmetic still balances, so the new read inherits a reason
 * nobody wrote for it. A marker in the query itself cannot be inherited.
 */

const REPOSITORY = new URL("..", import.meta.url).pathname;
const SOURCE_ROOT = join(REPOSITORY, "src");

/** One SQL literal in the source, with where to find it again. */
interface ModelsRead {
  file: string;
  line: number;
  sql: string;
  /** The text just after the literal, which is where the parameters are. */
  parameters: string;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") ? [path] : [];
  });
}

/** Every source file once, read once, for the scanners below to share. */
const SOURCES: readonly { file: string; text: string }[] =
  sourceFiles(SOURCE_ROOT).map((path) => ({
    file: relative(REPOSITORY, path),
    text: readFileSync(path, "utf8")
  }));

/**
 * Every template literal in the sources, with where it sits and what follows
 * it — which is where a query's parameters are written.
 *
 * `sql` is not necessarily SQL: this is a split on backticks, and each scanner
 * below says for itself which literals it means.
 */
const literals = (): ModelsRead[] => SOURCES.flatMap(({ file, text }) => {
  const segments = text.split("`");
  const found: ModelsRead[] = [];
  for (let segment = 1; segment < segments.length; segment += 2) {
    const sql = segments[segment] ?? "";
    const after = segments[segment + 1] ?? "";
    // To the end of the call rather than to a fixed number of characters. A
    // window is a lookahead with a length, and a parameter list longer than the
    // window is how the draft before this one let a stale marker through.
    const callEnds = after.indexOf(");");
    found.push({
      file,
      line: text.slice(0, text.indexOf(sql)).split("\n").length,
      sql,
      parameters: callEnds === -1 ? after : after.slice(0, callEnds + 2)
    });
  }
  return found;
});

/**
 * Every SQL literal in `src` that reads `models` and names a `prompt_version`,
 * which is the whole population this suite classifies.
 *
 * Writes are excluded by their opening verb, and they are the only thing that
 * is: the entry door's `update` names `withdrawn_at` rather than filtering on
 * it, and is the one statement that may. Reads are not required to open with
 * `select` — a common table expression opens with `with`, this codebase writes
 * them, and a read that opened with one used to be invisible here.
 */
function modelsReads(): ModelsRead[] {
  return literals().filter(({ sql }) => {
    const readsModels = /from\s+models|join\s+models/.test(sql);
    const isWrite = /^\s*(insert|update|delete)\b/i.test(sql);
    return readsModels && !isWrite && /prompt_version/.test(sql);
  });
}

/**
 * Queries that name `prompt_version` without naming `models`.
 *
 * `prompt_version` is a column of `models` and of nothing else, so a query that
 * filters on it reads that table however it spells the `from` clause. A literal
 * that mentions the column and not the table is reaching it through an
 * expression, and this suite reads queries rather than running them.
 *
 * Prose is excluded by requiring the literal to read like a query: the error
 * messages that quote a seat's Prompt Version back to an operator are not SQL.
 */
function modelsQueriesWithoutTheTable(): string[] {
  return literals()
    .filter(({ sql }) => /\b(select|with)\b/i.test(sql)
      && /\b(from|join|into|update)\b/i.test(sql))
    .filter(({ sql }) => /prompt_version/.test(sql))
    .filter(({ sql }) => !/\b(from|join|into|update)\s+models\b/i.test(sql))
    .map(({ file, sql }) =>
      `${file} — ${(sql.trim().split("\n")[0] ?? "").slice(0, 60)}`);
}

/**
 * The FPL track's roster reads, by file and how many each holds. Asserted as an
 * identity rather than a floor: a count alone lets one read stop being
 * recognised while the suite still passes, which is the failure this whole file
 * exists to prevent one layer down.
 */
const FPL_ROSTER_READS: Readonly<Record<string, number>> = {
  "src/cli/show-fpl-context.ts": 1,
  "src/dashboard/read-api.ts": 4,
  "src/fpl/start-fpl-track.ts": 1
};

/**
 * What an unfiltered read must carry, in its own SQL, to say whose roster it
 * reads: a `-- roster:` line and a sentence after it.
 *
 * The marker lives in the query rather than in a table here, and that is the
 * whole point. A table keyed by file and count gives a file a quota — swap one
 * of the match track's four reads in `read-api.ts` for an unfiltered FPL read
 * and the count still matches, so the new read inherits the old one's reason
 * without ever being looked at. A marker cannot be inherited: the new read
 * either carries one, which is a claim its author has to write down and a
 * reviewer can read, or it does not, and this suite names it.
 */
const ROSTER_MARKER = /--\s*roster:\s*\S[^\n]*/;

/**
 * The Gameweek run's read, told by its shape: it asks for a list of ids rather
 * than for the roster. It is the one read of this track that may go unfiltered.
 */
const readsByStartedRoster = ({ sql }: ModelsRead): boolean =>
  /id\s*=\s*any\(/.test(sql);

const carriesTheFilter = ({ sql }: ModelsRead): boolean =>
  /withdrawn_at\s+is\s+null/.test(sql);

const countByFile = (reads: ModelsRead[]): Record<string, number> => {
  const counted: Record<string, number> = {};
  for (const { file } of reads) {
    counted[file] = (counted[file] ?? 0) + 1;
  }
  return counted;
};

describe("the withdrawal filter on the FPL track's Entrant reads", () => {
  const reads = modelsReads();
  const filtered = reads.filter(carriesTheFilter);
  const exceptions = reads.filter(
    (read) => !carriesTheFilter(read) && readsByStartedRoster(read)
      && read.file.startsWith("src/fpl/")
  );

  test("holds the six reads it is written about, by name", () => {
    // An identity, not a floor. A read that stopped being recognised — moved
    // out of a template literal, renamed away from `models` — would leave a
    // count-based check passing over a filter nobody applies any more.
    expect(countByFile(filtered)).toEqual(FPL_ROSTER_READS);
  });

  test("every read of models says whose roster it reads", () => {
    const unexplained = reads
      .filter((read) => !carriesTheFilter(read))
      .filter((read) => !ROSTER_MARKER.test(read.sql))
      .map(({ file, line, sql }) =>
        `${file}:${line} — ${sql.trim().split("\n")[0]}`);

    // Fail closed, per query rather than per file. Every read of `models` that
    // names a Prompt Version is filtered or says in its own SQL whose roster it
    // reads instead.
    expect(
      unexplained,
      "A read of `models` naming a `prompt_version` neither filters on "
      + "`withdrawn_at is null` nor says whose roster it reads. If it reads "
      + "the FPL track's, add the filter — a seat that left still holds its "
      + "row (ADR-0047), so an unfiltered read puts three Base Models back on "
      + "a track they are not running. If it reads another track's, say so in "
      + "the query with a `-- roster:` line."
    ).toEqual([]);
  });

  test("keeps every models read inside a SQL literal, where it can be read",
    () => {
      // One shape could hide from the scan above: SQL assembled out of ordinary
      // strings, which no text search can classify. So the codebase does not
      // write one, and this says so rather than leaving it to habit.
      // Two fragments, because one is not enough: `"from " + "models where
      // prompt_version = $1"` splits the table name across strings and neither
      // half reads as a query. So both halves are refused — the table, and the
      // column that exists on no other table.
      const quotedModelReads: string[] = [];
      for (const { file, text } of SOURCES) {
        for (const [quoted] of text.matchAll(/(["'])(?:\\.|(?!\1).)*\1/g)) {
          // A module specifier is not a query. `preflight-base-models.js` ends
          // in the word this rule is about, and an import is the one place it
          // may.
          const isModulePath = /\.js["']$|\//.test(quoted);
          const namesTheTable = /\bmodels\b/.test(quoted) && !isModulePath;
          const namesTheColumn = /\bprompt_version\b/.test(quoted);
          if (namesTheTable || namesTheColumn) {
            quotedModelReads.push(`${file} — ${quoted.slice(0, 60)}`);
          }
        }
      }

      expect(
        quotedModelReads,
        "This names `models` or `prompt_version` in a quoted string rather "
        + "than a SQL literal. A query assembled from strings cannot be "
        + "classified by reading it, and reading it is how the withdrawal "
        + "filter is checked. Write the query as one template literal."
      ).toEqual([]);
    });

  test("names its table outright, so no query hides behind an expression",
    () => {
      // The other half of the same shape, and the one that closes an
      // interpolated table name: `from ${table}` reads `models` without saying
      // so, and would carry a Prompt Version past every check here. Only that
      // column tells a seat's track apart, so a query that names it names the
      // table it lives in.
      const hidden = modelsQueriesWithoutTheTable();

      expect(
        hidden,
        "This query names `prompt_version`, which lives only on `models`, "
        + "without naming `models`. Write the table into the query: a table "
        + "reached through an expression cannot be classified, and the "
        + "withdrawal filter is checked by reading the query."
      ).toEqual([]);
    });

  test("a query that sends this track's Prompt Version is filtered", () => {
    // The marker says whose roster a query reads; this asks the query. A match
    // read repointed at `FPL_PROMPT_VERSION` while keeping its old `-- roster:`
    // line would pass the marker check wearing a sentence written for the query
    // it used to be — a marker inherited by editing rather than by counting.
    //
    // Layered on the marker rather than replacing it. This one reads the
    // parameters beside the literal, which is a narrower thing to look at, and
    // it can only ever add a failure.
    const sendsFplVersion = reads
      .filter(({ parameters }) => /FPL_PROMPT_VERSION/.test(parameters))
      .filter((read) => !carriesTheFilter(read) && !exceptions.includes(read))
      .map(({ file, line }) => `${file}:${line}`);

    expect(
      sendsFplVersion,
      "This query is handed the FPL track's Prompt Version, so it reads this "
      + "track's roster whatever its `-- roster:` line says. Add "
      + "`and withdrawn_at is null`."
    ).toEqual([]);
  });

  test("names exactly one exception, and it says why inline", () => {
    expect(exceptions.map(({ file }) => file))
      .toEqual(["src/fpl/run-fpl-gameweek.ts"]);

    // Not merely unfiltered but explained: the read is safe because a withdrawn
    // seat never opened and so is not in the roster it reads by id. A second
    // read that copied the shape without the reason would be a filter dropped
    // by imitation.
    const [exception] = exceptions;
    const source = readFileSync(join(REPOSITORY, exception!.file), "utf8");
    const reason = source.slice(0, source.indexOf(exception!.sql));
    expect(reason).toMatch(/ADR-0047/);
    expect(reason).toMatch(/withdrawn_at/);
  });

  test("leaves the match track's reads unfiltered, and says so", () => {
    // The other half of the boundary. A seat is entered per track, so one Base
    // Model holds two rows and leaving one says nothing about the other; a
    // filter applied one table too widely would stop ten seats predicting
    // Fixtures. Each of those reads carries its own `-- roster:` line, and this
    // asserts there is a population for those lines to describe.
    const unfiltered = reads.filter(
      (read) => !carriesTheFilter(read) && !exceptions.includes(read)
    );

    expect(unfiltered.length).toBeGreaterThan(0);
    for (const read of unfiltered) {
      expect(ROSTER_MARKER.test(read.sql), `${read.file}:${read.line}`)
        .toBe(true);
    }
  });
});
