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
 * **It fails closed.** Every read of `models` that names a `prompt_version` is
 * either filtered, the one recorded exception, or listed below as a read of
 * another track's roster with the reason it is one. A read that is none of
 * those fails this suite by name — whatever shape it takes, because nothing
 * here asks what the query looks like beyond the two tables it names. An
 * earlier draft asked instead whether `FPL_PROMPT_VERSION` appeared near the
 * literal, which let a common table expression, an aliased constant or a long
 * argument list walk straight past it.
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
 * The reads that ask `models` about somebody else's roster, each with why it
 * carries no withdrawal filter. Listed so that a read added anywhere in `src`
 * has to be classified rather than merely not noticed.
 */
const NOT_THIS_TRACKS_ROSTER: Readonly<Record<string, {
  reads: number;
  why: string;
}>> = {
  "src/dashboard/read-api.ts": {
    reads: 4,
    why: "The match track's pages. Every seat of that roster stands, and a "
      + "Base Model that left the FPL track did not leave this one."
  },
  "src/dry-run/load-archive.ts": {
    reads: 1,
    why: "Loads an archived roster of either track and filters it in the "
      + "caller, where the archive's own record of who was seated is the point."
  },
  "src/exhibition/load-exhibition.ts": {
    reads: 1,
    why: "One Exhibition Run's row, read by id. An Exhibition Run is not on a "
      + "Season Roster at all (ADR-0032) and has no roster to leave."
  },
  "src/predictions/gap-alert.ts": {
    reads: 1,
    why: "The match track's Gaps."
  },
  "src/predictions/predict-gameweek.ts": {
    reads: 2,
    why: "The match track's Prediction run."
  },
  "src/predictions/score-match-gameweek.ts": {
    reads: 1,
    why: "The match track's scorer."
  },
  "src/preflight/preflight-base-models.ts": {
    reads: 1,
    why: "Pre-flight probes the match track's seats, told from this track's by "
      + "Prompt Version, and takes a Competition and a Fixture to do it."
  },
  "src/season-roster.ts": {
    reads: 2,
    why: "The entry doors' guard, which must see a withdrawn seat: it refuses "
      + "a seat re-entered as a different Base Model, and a withdrawn row is "
      + "still a row that a Season path points at. Filtering it would let the "
      + "one seat nobody is watching be relabelled."
  }
};

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

  test("every read of models is classified, and unclassified is a failure",
    () => {
      const expected = countByFile([...filtered, ...exceptions]);
      for (const [file, { reads: count }] of Object.entries(
        NOT_THIS_TRACKS_ROSTER
      )) {
        expected[file] = (expected[file] ?? 0) + count;
      }

      // Fail closed: the population is every read of `models` naming a Prompt
      // Version, and each one is filtered, the exception, or recorded above as
      // another track's. A new read of any shape lands here as an unexplained
      // count and fails by file.
      expect(
        countByFile(reads),
        "A read of `models` naming a `prompt_version` is not accounted for. "
        + "If it reads the FPL track's roster, add `and withdrawn_at is null` "
        + "— a seat that left still holds its row (ADR-0047), so an unfiltered "
        + "read puts three Base Models back on a track they are not running. "
        + "If it reads another track's, record it in NOT_THIS_TRACKS_ROSTER "
        + "with the reason."
      ).toEqual(expected);
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
    // Fixtures. Every entry above carries its own reason, and this asserts
    // there is a population for them to describe.
    const unfiltered = reads.filter(
      (read) => !carriesTheFilter(read) && !exceptions.includes(read)
    );

    expect(unfiltered.length).toBe(
      Object.values(NOT_THIS_TRACKS_ROSTER)
        .reduce((total, { reads: count }) => total + count, 0)
    );
    for (const { why } of Object.values(NOT_THIS_TRACKS_ROSTER)) {
      expect(why.length).toBeGreaterThan(20);
    }
  });
});
