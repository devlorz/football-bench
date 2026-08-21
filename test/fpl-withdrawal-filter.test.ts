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
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") ? [path] : [];
  });
}

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
  const reads: ModelsRead[] = [];
  for (const path of sourceFiles(SOURCE_ROOT)) {
    const text = readFileSync(path, "utf8");
    const segments = text.split("`");
    for (let segment = 1; segment < segments.length; segment += 2) {
      const sql = segments[segment] ?? "";
      const readsModels = /from\s+models|join\s+models/.test(sql);
      const isWrite = /^\s*(insert|update|delete)\b/i.test(sql);
      if (!readsModels || isWrite || !/prompt_version/.test(sql)) {
        continue;
      }
      reads.push({
        file: relative(REPOSITORY, path),
        line: text.slice(0, text.indexOf(sql)).split("\n").length,
        sql
      });
    }
  }
  return reads;
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
      // The one shape that could hide from the scan above: SQL assembled at run
      // time out of ordinary strings, which no text search can classify. So the
      // codebase does not write one. Every `models` read is a template literal,
      // and a read concatenated out of quoted fragments fails here rather than
      // slipping past unclassified.
      const assembled: string[] = [];
      for (const path of sourceFiles(SOURCE_ROOT)) {
        const text = readFileSync(path, "utf8");
        for (const [quoted] of text.matchAll(/(["'])(?:\\.|(?!\1).)*\1/g)) {
          if (/\b(from|join)\s+models\b/.test(quoted)) {
            assembled.push(`${relative(REPOSITORY, path)} — ${quoted.slice(0, 60)}`);
          }
        }
      }

      expect(
        assembled,
        "This reads `models` from a quoted string rather than a SQL literal, "
        + "so the withdrawal check cannot classify it. Write the query as a "
        + "template literal."
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
