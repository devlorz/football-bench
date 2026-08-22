# Ticket: `/overall` publishes the combined ranking

**What to build:** The page. A reader opens `/overall` and sees every Base Model ranked by its
Match Points and Bet Points added up across every league that is scored, under the sort toggle
they know from a league's leaderboard, with the Fixture count broken down league by league and
the qualification underneath. It is reachable from the nav on every Match track page. Source:
[spec 0025](../specs/0025-the-combined-ranking.md).

**Blocked by:** Ticket 0043 — the page holds no arithmetic of its own, so there is nothing to
render until the rule exists.

**Status:** ready-for-agent

---

## What is already known

**The sum happens in the browser, over four fetches of endpoints that already exist.** No
endpoint is added and `read-api.ts` is not opened. This is what keeps "no call ever holds two
Competitions' rows at once" true in both the scorer and the read API while the page publishes a
figure that spans four leagues (ADR-0051).

**Three states, exactly one at a time**, matching the shape the per-league leaderboard already
uses:

| State | When | What the reader gets |
| --- | --- | --- |
| Nothing covered | no league is both Active and scored | a sentence saying the table fills once a league is scored — not the failure line, because nothing failed |
| Ranking | at least one league covered | the table, the evidence line, the qualification |
| Failure | any fetch failed or answered something unreadable | the existing failure line and no table |

**The failure state is the one to get right first.** A page that quietly drops a league because
one response errored publishes a ranking over a set it cannot name, which is the exact failure
the covered-set rule exists to prevent. It fails closed, the way the leaderboard fails closed on
a missing qualification. It is also the most reachable state on day one, which is a reason to
build it before the happy path rather than after.

**Everything that is not a number is in the built HTML** — headings, column headers, both
explanations, the footnotes (ADR-0028). Only the figures wait on the fetch.

**The evidence line carries the breakdown and not only the total:**
`n = 47 fixtures · PL 24 · PD 9 · SA 8 · FL1 6 · ranks, does not prove`. Under a raw sum the
imbalance between leagues is the thing driving the ranking, and a single total is exactly the
presentation that hides it.

**No new CSS.** The table reuses `.lbbody`, `.lbrow`, `.seg` and `.qualifications` unchanged.

**The small render helpers are copied, not extracted.** `div`, `bar`, `valueCell` and the
sort-from-URL reading live inline in the per-league page's script and this page needs the same
few lines. Two pages wanting similar code is not yet a reason to open a shared module: the case
for extracting is a forced simultaneous edit, and there is not one. Copy them, and leave the
extraction to the day something has to change in both at once.

**The page is not in the Competition switcher.** The switcher's answers are Competitions and
this is not one; an entry there would make the combined table read as a fifth league. It is a
fourth nav link, built by the existing href helper so no page holds a second spelling of where
it lives.

**`/`, `/fixtures` and `/entrants` keep their three `302`s.** The hub page ADR-0039 left open
stays open, and nothing in the redirects file changes.

## Acceptance

- [ ] `/overall` is built as a static page and answers on the deployed site. Built locally
      (`astro build` emits `dist/overall.html`); "on the deployed site" needs an actual deploy to
      prove and stays open until then.
- [x] It ranks every Season Roster seat by the sum of its figures over the covered leagues, in both
      columns, and the totals reconcile by hand with the four leaderboards.
- [x] The sort toggle works as the leaderboard's does, writes the choice to the URL with
      `replaceState`, and survives a reload.
- [x] The evidence line shows the total and the per-league breakdown and ends in "ranks, does not
      prove".
- [x] The qualification from ticket 0043 is rendered under the table and cannot be reached without
      it.
- [x] A league that is Active with nothing scored is absent from the breakdown and from every total,
      and the page still publishes over the leagues that are scored.
- [x] A failed or unreadable response from any one league leaves the page showing its failure line
      and no table — verified by making one endpoint fail, not by reasoning about it.
- [x] A Season with nothing scored anywhere shows the fills-later sentence and not the failure line.
- [x] No Exhibition Run and no Reference Line appears in the table.
- [x] The page's structure is visible before the figures arrive.
- [x] A fourth nav link reaches it from all three Match track pages, and the Competition switcher is
      unchanged.
- [x] `overrides.css` gains no rule, the redirects file is unchanged, and `read-api.ts`, the scorer,
      the scheduler and the schema are untouched.
