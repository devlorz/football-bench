import { describe, expect, test } from "vitest";
import {
  COMPETITION_ROUTES, NESTED_COMPETITION_ROUTES, pageHref
} from "../dashboard/src/competition-view.js";

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

    expect(root?.params.competition).toBeUndefined();
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
      expect(params.competition ?? segment).toBe(segment);
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
    expect(NESTED_COMPETITION_ROUTES.map(({ params }) => params.competition))
      .toEqual(["", "pl", "pd"]);
    expect(NESTED_COMPETITION_ROUTES.map(({ props }) => props))
      .toEqual(COMPETITION_ROUTES.map(({ props }) => props));
  });

  test("gives every built route its own Fixtures page", () => {
    // Written out rather than derived: a list that recomputed the href the way
    // the function does could not disagree with it, and disagreeing is the job.
    expect(COMPETITION_ROUTES.map(({ props }) => pageHref(props.path, "fixtures")))
      .toEqual(["/fixtures", "/pl/fixtures", "/pd/fixtures"]);
  });
});
