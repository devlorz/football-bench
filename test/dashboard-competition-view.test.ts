import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  competitionRoutes, pageHref
} from "../dashboard/src/competition-view.js";
import { entrantOf, entrantSlug } from "../dashboard/src/entrant-link.js";
import { SEASON_ROSTER, seatSlug } from "../src/season-roster.js";

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
    // disagree with it, and disagreeing is the whole job. The site advertises
    // a league once its Prompt Version is frozen and not before (ADR-0039),
    // which is why Serie A, Ligue 1 and the Bundesliga all appear here from
    // their freeze and before any of the three is listed in `competitions`.
    expect(competitionRoutes()).toEqual([
      {
        params: { competition: "pl" },
        props: {
          competition: "PL", competitionName: "Premier League",
          path: "/pl", api: "/api/pl",
          // Null, and a test rather than an assumption: the Premier League
          // never used a version it has retired, so its page carries no frozen
          // block at all. A label here would put one on it, and the block
          // claims a Gameweek was played under a question nobody asked.
          retiredLabel: null
        }
      },
      {
        params: { competition: "pd" },
        props: {
          competition: "PD", competitionName: "La Liga",
          path: "/pd", api: "/api/pd",
          // The heading ADR-0042 froze, byte for byte. It names the retired
          // version, which is what the block's read filters by, and the two
          // may not drift: a label naming one version over figures read by
          // another is the one lie this block can tell.
          retiredLabel:
            "Gameweek 1 — played under match-pd/2026-27-v1, before the restart"
        }
      },
      {
        params: { competition: "sa" },
        props: {
          competition: "SA", competitionName: "Serie A",
          path: "/sa", api: "/api/sa",
          retiredLabel: null
        }
      },
      {
        params: { competition: "fl1" },
        props: {
          competition: "FL1", competitionName: "Ligue 1",
          path: "/fl1", api: "/api/fl1",
          retiredLabel: null
        }
      },
      {
        params: { competition: "bl1" },
        props: {
          competition: "BL1", competitionName: "Bundesliga",
          path: "/bl1", api: "/api/bl1",
          retiredLabel: null
        }
      }
    ]);
  });

  test("writes every URL in the one lower-case spelling the API serves", () => {
    // One URL per resource, in the case the read API accepts and no other: a
    // page that asked for `/api/PD/leaderboard` would be served a 404, and a
    // second spelling that was served would split the edge cache spec 0017
    // states it moves no lifetime of.
    for (const { params, props } of competitionRoutes()) {
      const segment = props.competition.toLowerCase();

      expect(props.api).toBe(`/api/${segment}`);
      expect(params).toEqual({ competition: segment });
      expect(props.path).toBe(`/${segment}`);
    }
  });

  test("hands every caller its own params", () => {
    // Not a style point. Astro claims the `params` objects a `getStaticPaths`
    // returns, and two pages returning the same objects build one page and fail
    // the other with `NoMatchingStaticPathFound` on a path the surviving page
    // had just emitted — which is why this is a function and not the constant
    // it was through tickets 1 to 5. The build says so and so does this: three
    // pages and the chrome call it, and the copy each gets is its own.
    const [first] = competitionRoutes();
    const [again] = competitionRoutes();

    expect(first?.params).toEqual(again?.params);
    expect(first?.params).not.toBe(again?.params);
  });
});

/**
 * What is at the three URLs the single-league site served, now that no page is.
 *
 * The file is configuration the build copies and nothing type-checks, and a
 * rule that is wrong is a reader landing on nothing at the URL every link made
 * before this expansion points at. The targets are derived from the same
 * function the pages' own links are built from, so a path that moves moves
 * here too.
 */
describe("the single-league URLs", () => {
  const redirects = readFileSync(
    new URL("../dashboard/public/_redirects", import.meta.url), "utf8"
  );
  const rules = redirects.split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));

  test("send each of them to the Premier League's copy of the same page", () => {
    // The page a reader asked for, in the league `/` was: crossing to the
    // Premier League's Fixtures from a link to `/fixtures` is the page they
    // named, and a redirect that landed all three on `/pl` would answer a
    // Fixtures link with a leaderboard.
    //
    // These three lines and no fourth, which is the rest of what the ticket
    // claims in one assertion: each is a `302` and not the `301` that would be
    // cached past the point where a hub page at `/` could still be introduced
    // (ADR-0039), and the FPL track is untouched because nothing here names it.
    // That `/fpl` still answers is the build's to say, not this file's.
    expect(rules).toEqual([
      ["/", pageHref("/pl", "leaderboard"), "302"],
      ["/fixtures", pageHref("/pl", "fixtures"), "302"],
      ["/entrants", pageHref("/pl", "entrants"), "302"]
    ]);
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
    // The leaderboard is the Competition and not a page under it.
    expect(pageHref("/pd", "leaderboard")).toBe("/pd");
  });

  test("points the Overall link at its one fixed path, whichever Competition's page it is on", () => {
    // Not a page under any Competition's path (spec 0025): every league's copy
    // of the nav links at the same one page, so the path argument is ignored.
    expect(pageHref("/pd", "overall")).toBe("/overall");
    expect(pageHref("/pl", "overall")).toBe("/overall");
  });

  test("gives every built route its own copy of both pages under it", () => {
    // Written out rather than derived: a list that recomputed the href the way
    // the function does could not disagree with it, and disagreeing is the job.
    // Every one of these ten is a file the build emits, from the one
    // function both pages under the segment now call.
    expect(competitionRoutes().map(({ props }) => pageHref(props.path, "fixtures")))
      .toEqual([
        "/pl/fixtures", "/pd/fixtures", "/sa/fixtures", "/fl1/fixtures",
        "/bl1/fixtures"
      ]);
    expect(competitionRoutes().map(({ props }) => pageHref(props.path, "entrants")))
      .toEqual([
        "/pl/entrants", "/pd/entrants", "/sa/entrants", "/fl1/entrants",
        "/bl1/entrants"
      ]);
  });
});

/**
 * The header's crossing from one Competition to another, which is the same
 * function as the nav's applied to another league's path.
 *
 * Tested here for the reason every other href in this file is: it renders
 * perfectly while being wrong. A switcher that sends a reader from La Liga's
 * Fixtures to the Premier League's leaderboard has crossed two things at once
 * and said nothing about either.
 */
describe("the Competition switcher", () => {
  // The chrome's list, derived the way `Page.astro` derives it: every served
  // Competition, under the name and at the path the route already carries. The
  // names and paths themselves are pinned by the route list above — what is
  // left to get wrong is where an entry sends a reader.
  const SWITCHER = competitionRoutes().map(({ props }) => props);

  test("holds the reader's page across every crossing", () => {
    // Every combination of the page a reader is on and the league they cross
    // to, written out. Fifteen files, all emitted by the route list above.
    const crossings = Object.fromEntries(
      (["leaderboard", "fixtures", "entrants"] as const).map((page) => [
        page, SWITCHER.map(({ path }) => pageHref(path, page))
      ])
    );

    expect(crossings).toEqual({
      leaderboard: ["/pl", "/pd", "/sa", "/fl1", "/bl1"],
      fixtures: [
        "/pl/fixtures", "/pd/fixtures", "/sa/fixtures", "/fl1/fixtures",
        "/bl1/fixtures"
      ],
      entrants: [
        "/pl/entrants", "/pd/entrants", "/sa/entrants", "/fl1/entrants",
        "/bl1/entrants"
      ]
    });
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
/**
 * `seatSlug` and `entrantSlug` are one function written twice, and this is what
 * stands in place of merging them. The merge would move `entrant-link.ts` into
 * `src/`, where the rule that it imports nothing a browser cannot have loses
 * the only thing enforcing it — the absence of any server module near enough to
 * import. So the duplication stays, and the divergence it invites fails here.
 *
 * The one file in the repository that already reaches across the boundary, so
 * the twins cost no new import to compare. Assert on both together rather than
 * on each separately: an assertion per function passes while they disagree,
 * which is the only failure this test exists for.
 */
describe("the seat slug, read from both sides of the dashboard boundary", () => {
  test("gives one answer to every id shape a seat is written in", () => {
    // Not correctness — `the Entrant a link names` covers that. This is
    // sameness: whatever the answer is, both twins give it. The third is the
    // shape slice 4 was for, a restart's seat under a version segment
    // (ADR-0042), and the one an edit to a single copy would break first.
    for (const id of [
      "match/claude-opus-5",
      "match-pd/claude-opus-5",
      "match-pd/2026-27-v2/claude-opus-5",
      "claude-opus-5"
    ]) {
      expect([id, seatSlug(id)]).toEqual([id, entrantSlug(id)]);
    }
  });

  test("agrees on every seat the Season Roster actually holds", () => {
    // The written ids above are a guess at what the roster looks like; these
    // are what it is. A Base Model added with a slug neither twin was tried on
    // arrives here on its own.
    expect(SEASON_ROSTER.map(({ id }) => seatSlug(id)))
      .toEqual(SEASON_ROSTER.map(({ id }) => entrantSlug(id)));
  });
});

describe("the Entrant a link names", () => {
  /** One Base Model, seated in both leagues. */
  const PREMIER_LEAGUE = ["match/claude-opus-5", "match/gpt-5"];
  const LA_LIGA = ["match-pd/claude-opus-5", "match-pd/gpt-5"];
  /**
   * La Liga's seats as the restart leaves them: a Competition whose plain ids
   * belong to a retired version seats the standing roster under the Prompt
   * Version's own segment (ADR-0042, `enterSeasonRoster`). Three segments, not
   * two, and this is the shape a reader's link is answered from from Gameweek
   * 2 on.
   */
  const LA_LIGA_RESTARTED = [
    "match-pd/2026-27-v2/claude-opus-5", "match-pd/2026-27-v2/gpt-5"
  ];

  test("is the seat's slug, which carries no Competition", () => {
    // A seat id is the Prompt Version's leading segment and the Base Model:
    // `match/` in the Premier League and `match-pd/` in La Liga
    // (`seatPrefixOf`). Only the last segment is the Entrant -- a restart puts
    // the version between the two and the Base Model is still the whole
    // answer, which is what the prefix having no fixed length means.
    expect(entrantSlug("match/claude-opus-5")).toBe("claude-opus-5");
    expect(entrantSlug("match-pd/claude-opus-5")).toBe("claude-opus-5");
    expect(entrantSlug("match-pd/2026-27-v2/claude-opus-5"))
      .toBe("claude-opus-5");
  });

  test("survives the crossing from one Competition to the other", () => {
    // The point of the slug: editing a link's `/pd/` to `/pl/` lands on the
    // same Base Model's record rather than on a page selecting nothing.
    expect(entrantOf("claude-opus-5", LA_LIGA)).toBe("match-pd/claude-opus-5");
    expect(entrantOf("claude-opus-5", PREMIER_LEAGUE))
      .toBe("match/claude-opus-5");

    // And across the restart, which is the crossing a reader makes from
    // Gameweek 2 on: the link they copied out of the Premier League carries
    // the same slug, and La Liga's seats have grown a segment since.
    expect(entrantOf("claude-opus-5", LA_LIGA_RESTARTED))
      .toBe("match-pd/2026-27-v2/claude-opus-5");
    expect(entrantOf("gpt-5", LA_LIGA_RESTARTED))
      .toBe("match-pd/2026-27-v2/gpt-5");
    expect(entrantOf("mistral-large-3", LA_LIGA_RESTARTED)).toBeNull();
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
    // The same of the DOM helpers, for the same reason: they are what every
    // page of both sections builds its markup with, so anything they gained an
    // import of would be bytes on every page at once.
    expect(read("../dashboard/src/dom.ts")).not.toMatch(/^\s*import\b/m);
    // And the Exhibition recall caveat module, which exhibition-view.ts
    // re-exports into the bundled script: keeping it free of imports ensures
    // no heavy dependencies (like zod) leak into the bundle through this path.
    expect(read("../src/exhibition/recall-caveat.ts")).not.toMatch(/^\s*import\b/m);

    const script = read(
      "../dashboard/src/pages/[competition]/entrants.astro"
    ).split("<script>")[1] ?? "";
    // Every import the bundler follows, which is every one that is not a type:
    // the whole list, so a module added later is as visible as a module swapped.
    const followed = [
      ...script.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)
    ].map(([, from]) => from);

    expect(followed).toEqual([
      "../../chart-domain.js",
      "../../dom.js",
      "../../entrant-link.js",
      "../../exhibition-view.js"
    ]);
  });

  test("tells the Season Roster's seats apart by slug alone", () => {
    // The whole scheme rests on this: two seats sharing a slug would make one
    // of them unreachable by link in every league at once.
    const slugs = SEASON_ROSTER.map(({ id }) => entrantSlug(id));

    expect(new Set(slugs).size).toBe(SEASON_ROSTER.length);
    expect(slugs).not.toContain("");
  });
});
