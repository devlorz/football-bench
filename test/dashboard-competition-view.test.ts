import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  COMPETITION_ROUTES, NESTED_COMPETITION_ROUTES,
  NESTED_COMPETITION_SEGMENT_ROUTES, pageHref
} from "../dashboard/src/competition-view.js";
import { entrantOf, entrantSlug } from "../dashboard/src/entrant-link.js";
import { SEASON_ROSTER } from "../src/season-roster.js";

/**
 * The Match track's pages, one per Competition, with no DOM and no database.
 *
 * It is here for the reason `fpl-view.ts`'s functions are: the route list
 * renders perfectly while being wrong. A Competition missing from it is a page
 * the build never emits — no error, no broken link, just a URL that answers
 * nothing — which is the quietest failure this change can have.
 */
describe("the Match track's Competition routes", () => {
  test("emits a page for every Competition with a frozen Prompt Version", () => {
    // Written out rather than derived from the same list the module reads: a
    // route set that recomputed the answer the way the module does could not
    // disagree with it, and disagreeing is the whole job. `SA`, `BL1` and `FL1`
    // are in the schema's `competition_code` domain and are deliberately
    // absent — the site advertises a league once its Prompt Version is frozen
    // and not before (ADR-0039).
    expect(COMPETITION_ROUTES).toEqual([
      {
        params: { competition: undefined },
        props: { competition: "PL", path: "/", api: "/api/pl" }
      },
      {
        params: { competition: "pl" },
        props: { competition: "PL", path: "/pl", api: "/api/pl" }
      },
      {
        params: { competition: "pd" },
        props: { competition: "PD", path: "/pd", api: "/api/pd" }
      }
    ]);
  });

  test("keeps the single-league front door on the Premier League", () => {
    // `/` until ticket 6 of spec 0017 turns it into a 302, which is the only
    // step that breaks a URL working today. Until then it serves what it
    // serves: the Premier League, which is the Competition `/` lands on and
    // not a claim that the Premier League is the site (ADR-0039).
    //
    // The one route whose path is not its Competition's, and the reason `path`
    // is stated rather than derived from the segment.
    const [root] = COMPETITION_ROUTES;

    expect(root?.params).toEqual({ competition: undefined });
    expect(root?.props).toEqual({
      competition: "PL", path: "/", api: "/api/pl"
    });
  });

  test("writes every URL in the one lower-case spelling the API serves", () => {
    // One URL per resource, in the case the read API accepts and no other: a
    // page that asked for `/api/PD/leaderboard` would be served a 404, and a
    // second spelling that was served would split the edge cache spec 0017
    // states it moves no lifetime of.
    for (const { params, props } of COMPETITION_ROUTES) {
      const segment = props.competition.toLowerCase();

      expect(props.api).toBe(`/api/${segment}`);
      // The front door's is `undefined` and every other route's is the
      // Competition's own spelling; the list above pins which is which.
      expect([{ competition: undefined }, { competition: segment }])
        .toContainEqual(params);
      expect(props.path).toMatch(/^\/[a-z]*$/);
    }
  });
});

/**
 * Where a Competition's copy of a page lives. It is tested here for the reason
 * the route list is: a href renders perfectly while being wrong, and a nav link
 * that leaves La Liga for the Premier League's Fixtures says nothing about
 * having crossed a league.
 */
describe("the link to a page of a Competition", () => {
  test("hangs the page off the Competition's own path", () => {
    expect(pageHref("/pd", "fixtures")).toBe("/pd/fixtures");
    expect(pageHref("/pd", "entrants")).toBe("/pd/entrants");
  });

  test("is the Competition's own path for the leaderboard", () => {
    // The leaderboard is the Competition, not a page under it, which is what
    // lets `/` and `/pl` both serve one while ticket 6 is outstanding.
    expect(pageHref("/pd", "leaderboard")).toBe("/pd");
    expect(pageHref("/", "leaderboard")).toBe("/");
  });

  test("writes the single-league front door's pages without a double slash",
    () => {
      // `/` is the one route whose path is not its Competition's, and
      // `//fixtures` is a URL the build does not emit and the platform does not
      // serve.
      expect(pageHref("/", "fixtures")).toBe("/fixtures");
      expect(pageHref("/", "entrants")).toBe("/entrants");
    });

  test("spells the front door's segment as a page beneath it needs it", () => {
    // The empty string, because `undefined` fails the build here with
    // `NoMatchingStaticPathFound` on `/fixtures` while the leaderboard's
    // top-level route needs exactly that `undefined`. The build fails outright
    // on the wrong one, so this test says which is which rather than proving
    // anything the build would let past; the props are the same props either
    // way.
    expect(NESTED_COMPETITION_ROUTES.map(({ params }) => params)).toEqual([
      { competition: "" }, { competition: "pl" }, { competition: "pd" }
    ]);
    expect(NESTED_COMPETITION_ROUTES.map(({ props }) => props))
      .toEqual(COMPETITION_ROUTES.map(({ props }) => props));
  });

  test("names the second page's segment for the same Competition", () => {
    // A second rest parameter because Astro serves the empty segment to one
    // page per parameter: two pages under `[...competition]/` build one front
    // door and fail the other. The name is the difference and the only one —
    // the segments and the props are the first list's.
    expect(NESTED_COMPETITION_SEGMENT_ROUTES.map(({ params }) => params))
      .toEqual([
        { competitionSegment: "" },
        { competitionSegment: "pl" },
        { competitionSegment: "pd" }
      ]);
    expect(NESTED_COMPETITION_SEGMENT_ROUTES.map(({ props }) => props))
      .toEqual(NESTED_COMPETITION_ROUTES.map(({ props }) => props));
  });

  test("gives every built route its own copy of both pages under it", () => {
    // Written out rather than derived: a list that recomputed the href the way
    // the function does could not disagree with it, and disagreeing is the job.
    // Every one of these six is a file the build emits, which is what the two
    // route lists above are for.
    expect(COMPETITION_ROUTES.map(({ props }) => pageHref(props.path, "fixtures")))
      .toEqual(["/fixtures", "/pl/fixtures", "/pd/fixtures"]);
    expect(COMPETITION_ROUTES.map(({ props }) => pageHref(props.path, "entrants")))
      .toEqual(["/entrants", "/pl/entrants", "/pd/entrants"]);
  });
});

/**
 * Which Entrant a link names, and which seat that resolves to in the league the
 * link was edited into.
 *
 * Here for the reason the hrefs are: the page renders whatever this returns.
 * A wrong answer is a reader looking at another Base Model's figures under
 * their own link, with the page saying nothing about the substitution — the
 * quietest failure the Entrant record can have.
 */
describe("the Entrant a link names", () => {
  /** One Base Model, seated in both leagues. */
  const PREMIER_LEAGUE = ["match/claude-opus-5", "match/gpt-5"];
  const LA_LIGA = ["match-pd/claude-opus-5", "match-pd/gpt-5"];

  test("is the seat's slug, which carries no Competition", () => {
    // A seat id is the Prompt Version's leading segment and the Base Model:
    // `match/` in the Premier League and `match-pd/` in La Liga
    // (`seatPrefixOf`). Only the second half is the Entrant.
    expect(entrantSlug("match/claude-opus-5")).toBe("claude-opus-5");
    expect(entrantSlug("match-pd/claude-opus-5")).toBe("claude-opus-5");
  });

  test("survives the crossing from one Competition to the other", () => {
    // The point of the slug: editing a link's `/pd/` to `/pl/` lands on the
    // same Base Model's record rather than on a page selecting nothing.
    expect(entrantOf("claude-opus-5", LA_LIGA)).toBe("match-pd/claude-opus-5");
    expect(entrantOf("claude-opus-5", PREMIER_LEAGUE))
      .toBe("match/claude-opus-5");
  });

  test("selects nothing where the Competition has no such seat", () => {
    // An Exhibition Run that ran in one league only, or a hand-typed URL. The
    // assertion that matters is the second: the first seat renders perfectly
    // and is a different Base Model than the link named.
    expect(entrantOf("mistral-large-3", LA_LIGA)).toBeNull();
    expect(entrantOf("mistral-large-3", LA_LIGA)).not.toBe(LA_LIGA[0]);
  });

  test("opens on the first seat when the link names no Entrant", () => {
    // No slug is a reader who asked for nobody in particular, which is not the
    // same as asking for somebody who is not here.
    expect(entrantOf(null, LA_LIGA)).toBe("match-pd/claude-opus-5");
    expect(entrantOf(null, [])).toBeNull();

    // `/pd/entrants?entrant=` is that reader too, and it is the spelling the
    // page actually hands over: `searchParams.get` answers a parameter with
    // nothing after it with the empty string and not with null. Read as a slug
    // it matches no seat, and a page that had asked for no Entrant would be
    // told none of its Entrants is the one it named.
    expect(entrantOf("", LA_LIGA)).toBe("match-pd/claude-opus-5");
    expect(new URL("https://b.example/pd/entrants?entrant=")
      .searchParams.get("entrant")).toBe("");
  });

  test("reaches nothing a browser should not be sent", () => {
    // The Entrant record's script is bundled rather than inline, so every
    // module it reaches is bytes every reader downloads. Reaching
    // `competition-view.ts` for these two functions pulls
    // `MATCH_PROMPT_COMPETITIONS` in, and `openrouter-entrant.ts` and the whole
    // of `zod` behind it: 55KB in `dist/_astro/` carrying both frozen Prompt
    // Versions and their shas, for six lines of string handling. It measured
    // 4.9KB once the two functions moved here.
    //
    // Both halves are asserted, because either alone lets it back: a module
    // that imports nothing is no use if the page imports the other one. Over
    // the source and not the bundle — the cost is the import, and a test that
    // needed a build to notice would notice a deploy too late.
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), "utf8");

    expect(read("../dashboard/src/entrant-link.ts")).not.toMatch(/^\s*import\b/m);

    const script = read(
      "../dashboard/src/pages/[...competitionSegment]/entrants.astro"
    ).split("<script>")[1] ?? "";
    // Every import the bundler follows, which is every one that is not a type:
    // the whole list, so a module added later is as visible as a module swapped.
    const followed = [
      ...script.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)
    ].map(([, from]) => from);

    expect(followed).toEqual(["../../chart-domain.js", "../../entrant-link.js"]);
  });

  test("tells the Season Roster's seats apart by slug alone", () => {
    // The whole scheme rests on this: two seats sharing a slug would make one
    // of them unreachable by link in every league at once.
    const slugs = SEASON_ROSTER.map(({ id }) => entrantSlug(id));

    expect(new Set(slugs).size).toBe(SEASON_ROSTER.length);
    expect(slugs).not.toContain("");
  });
});
