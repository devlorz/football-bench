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
 * Structural rather than behavioural on purpose. A behavioural test proves the
 * reads that exist; this one fails on the read that arrives next Season written
 * by somebody who never opened ADR-0047, which is the failure the inlining
 * makes possible.
 */

const SOURCE_ROOT = new URL("../src", import.meta.url).pathname;

/**
 * One SQL literal in the source, with what the test needs to judge it: whether
 * it reads `models` for this track's Entrants at all, and whether it carries
 * the filter.
 */
interface EntrantRead {
  file: string;
  line: number;
  sql: string;
  /** The text that follows the literal, which is where the parameters are. */
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

/**
 * Every read of `models` whose Prompt Version is the FPL track's.
 *
 * A read is this track's when the literal asks `models` for a `prompt_version`
 * and the call passes `FPL_PROMPT_VERSION` — which is how the match track's
 * reads, which take a Competition's version, stay out of this test's way
 * (ADR-0038). Writes are excluded by requiring the literal to open with
 * `select`: the entry door's `update` names the column rather than filtering on
 * it, and is the one place that may.
 */
function fplEntrantReads(): EntrantRead[] {
  const reads: EntrantRead[] = [];
  for (const path of sourceFiles(SOURCE_ROOT)) {
    const text = readFileSync(path, "utf8");
    const parts = text.split("`");
    for (let at = 1; at < parts.length; at += 2) {
      const sql = parts[at] ?? "";
      const parameters = (parts[at + 1] ?? "").slice(0, 400);
      const readsModels = /from\s+models|join\s+models/.test(sql);
      const opensWithSelect = /^\s*(select|--)/i.test(sql);
      if (!readsModels || !opensWithSelect) {
        continue;
      }
      if (!/prompt_version/.test(sql)) {
        continue;
      }
      if (!/FPL_PROMPT_VERSION/.test(parameters)) {
        continue;
      }
      reads.push({
        file: relative(new URL("..", import.meta.url).pathname, path),
        line: text.slice(0, text.indexOf(sql)).split("\n").length,
        sql,
        parameters
      });
    }
  }
  return reads;
}

/**
 * The Gameweek run's read, told by its shape: it asks for a list of ids rather
 * than for the roster. It is the one read that may go unfiltered.
 */
const readsByStartedRoster = ({ sql }: EntrantRead): boolean =>
  /id\s*=\s*any\(/.test(sql);

const carriesTheFilter = ({ sql }: EntrantRead): boolean =>
  /withdrawn_at\s+is\s+null/.test(sql);

describe("the withdrawal filter on the FPL track's Entrant reads", () => {
  const reads = fplEntrantReads();

  test("finds the reads at all, so a passing suite means something", () => {
    // The scan's own guard. A refactor that moved every query out of a template
    // literal would leave this test finding nothing and reporting success,
    // which is the one way a structural check lies.
    expect(reads.length).toBeGreaterThanOrEqual(6);
  });

  test("every read of this track's roster carries it", () => {
    const missing = reads
      .filter((read) => !readsByStartedRoster(read))
      .filter((read) => !carriesTheFilter(read))
      .map(({ file, line, sql }) =>
        `${file}:${line} — ${sql.trim().split("\n")[0]}`);

    // The message is the point: a read added without the filter is named, with
    // the line to add, rather than reported as a count that moved.
    expect(
      missing,
      "These reads ask models for the FPL track's Entrants without "
      + "`and withdrawn_at is null`. A seat that left the track still holds "
      + "its row (ADR-0047), so an unfiltered read puts three Base Models "
      + "back on a track they are not running. Add the filter, or — if this "
      + "read takes its ids from the started roster, as the Gameweek run "
      + "does — say so inline and name ADR-0047."
    ).toEqual([]);
  });

  test("names exactly one exception, and it says why inline", () => {
    const exceptions = reads.filter(readsByStartedRoster);

    expect(exceptions.map(({ file }) => file))
      .toEqual(["src/fpl/run-fpl-gameweek.ts"]);

    // Not just unfiltered but explained: the read is safe because a withdrawn
    // seat never opened and so is not in the roster it reads by id. A second
    // read that adopted the shape without the reason would be a filter dropped
    // by imitation.
    const [exception] = exceptions;
    const source = readFileSync(
      new URL(`../${exception!.file}`, import.meta.url).pathname, "utf8"
    );
    const reason = source.slice(0, source.indexOf(exception!.sql));
    expect(reason).toMatch(/ADR-0047/);
    expect(reason).toMatch(/withdrawn_at/);
  });

  test("says nothing about the match track's reads", () => {
    // Every seat of the match track stands; nothing there filters on a
    // withdrawal, and this test must not start asking it to. A seat is entered
    // per track, so one Base Model holds two rows and leaving one says nothing
    // about the other.
    const matchReads = sourceFiles(SOURCE_ROOT)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .split("`")
      .filter((sql, at) => at % 2 === 1)
      .filter((sql) => /from\s+models|join\s+models/.test(sql))
      .filter((sql) => /prompt_version/.test(sql));

    expect(matchReads.some((sql) => !/withdrawn_at/.test(sql))).toBe(true);
    expect(reads.length).toBeLessThan(matchReads.length);
  });
});
