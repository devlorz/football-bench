/**
 * Which Entrant a link names, and which seat that resolves to in the league
 * the link was opened in.
 *
 * Its own module, and one that imports nothing, because it is the only part of
 * the Match track's view logic that runs in a browser: the Entrant record's
 * script is bundled rather than inline, so everything it reaches is shipped to
 * every reader. Sitting in `competition-view.ts` it reached
 * `MATCH_PROMPT_COMPETITIONS`, and through it `openrouter-entrant.ts` and the
 * whole of `zod` — fifty kilobytes of server-side tooling, with both frozen
 * Prompt Versions and their shas, for six lines of string handling. Nothing
 * here may gain an import that does not also belong in a browser.
 */

/**
 * The part of a seat id that is not its Competition's prefix, which is what
 * `?entrant=` carries.
 *
 * A seat id is `<prefix>/<slug>` where the prefix is the Prompt Version's
 * leading segment — `match` for the Premier League and `match-pd` for La Liga
 * (`seatPrefixOf`) — so the slug is the Base Model, spelled the same in every
 * league. Writing the whole id would put the Competition in the query string
 * as well as in the path, and editing a link's `/pd/` to `/pl/` would then land
 * on a page with no seat by that name.
 *
 * An id with no prefix at all is its own slug, which is the same answer read
 * the same way: everything after a prefix that is not there is all of it.
 *
 * `seatSlug` in `src/season-roster.ts` is this function, character for
 * character, and reads the same slug off the same ids. They stand apart
 * because merging them runs a dependency backwards: every import in this
 * repository points from `dashboard/` into `src/`, and the roster importing
 * out of `dashboard/` would be the first the other way. The merge is a move of
 * this module into `src/` — which it is free to make, importing nothing — and
 * that is a decision of its own, not one spec 0017 makes.
 */
export const entrantSlug = (id: string): string =>
  id.slice(id.indexOf("/") + 1);

/**
 * The seat a link names, resolved against the seats this Competition returned.
 *
 * Pure and tested because it renders perfectly while being wrong: every branch
 * below produces a page, and only one of them produces the page the reader's
 * link asked for.
 *
 * Three answers, and the third is the one worth the function. No slug is a
 * reader who asked for no Entrant in particular, and the first seat is as good
 * an opening view as any — `?entrant=` with nothing after it is that reader
 * too, which is why the test is emptiness and not `null`: a query string says
 * "no Entrant named" in more than one spelling, and the difference is not one
 * a reader made. A slug that resolves is that seat. A slug that resolves
 * against nothing — an Exhibition Run that ran in one league only, or a
 * hand-typed URL — is `null` and selects nothing: falling back to the first
 * seat there would show a reader a different Base Model than their link named,
 * under their link, with nothing on the page saying so.
 */
export const entrantOf = (
  slug: string | null,
  ids: readonly string[]
): string | null =>
  !slug
    ? ids[0] ?? null
    : ids.find((id) => entrantSlug(id) === slug) ?? null;
