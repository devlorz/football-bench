# Ticket: The API answers for one Edition

**What to build:** every match-track read the dashboard is served from takes an Edition
and answers within it — leaderboard, Fixtures, Entrant record, retired Gameweek — bounding
its per-Gameweek reads to the Edition's range and its seats to the Edition's members,
with the Edition defaulting to the one now playing so that every route that exists today
returns exactly what it returns today. Earlier Editions are reachable under a route
prefix, and every body says which Edition it is. The cumulative figures a body carries
(season-to-date points, the Anchor, the Paired Differences) are **read as the scorer
wrote them** — ticket 0097 is what makes those Edition-bounded; this ticket reads the
right row and bounds everything that is counted at read time. No page changes in this
ticket; the JSON does. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the dashboard shows* (as amended 2026-10-08) and *What the record holds*. Decisions it
must not bend:
[ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md) (the
Anchor and every Paired Difference are within one Edition — written so by 0097, never
recomputed here),
[ADR-0051](../adr/0051-a-combined-ranking-sums-the-leagues-and-publishes-what-that-costs.md)
(the Combined Ranking sums an Edition set; the Nations League joins none — enforced where
the sum is made, which is the page, ticket 0085),
[ADR-0042](../adr/0042-the-match-track-restarts-under-amended-prompt-versions.md) (the
retired Gameweek stays a separate block inside Edition 1, not a third Edition).

**Blocked by:** 0082 (the Editions table and its helpers), 0083 (the membership
predicate the seat CTE reuses), 0096 (its `created_at` half — a new seat excluded from
Edition 1 is that predicate, not a second one here), 0097 (the cumulative rows this
ticket reads at `throughGw` must already be Edition-bounded, or boxes 2 and 3 cannot
pass).

**Status:** drafted, 2026-09-22; redrafted 2026-10-08 after reading the scorer — the
first draft assumed a read-side bound could deliver Edition 2's totals, and it cannot.
Done 2026-10-08, with migration 0049 (`dashboard_read` reads `editions`): **apply 0049
to production before the Worker deploys**, or every Match route fails on a table its
role cannot read.

---

## What is already known

**Where the first draft was wrong, and why.** The leaderboard reads the stored
`*_season_to_date` row at `gw = throughGw`; the scorer accumulates that row from
Gameweek 1. ADR-0042's retired cut works on the read side only because La Liga's v1 and
v2 seats are different rows. An Edition keeps the continuing seat's row, so the stored
total at an Edition 2 Gameweek contains Edition 1 inside it and no read-side bound can
remove it. The bound moved to the scorer (0097); this ticket reads.

**Membership is one predicate, already written.** A seat is on Edition N when
`isAskedAtLock("m", <Edition N's first Lock>)` holds — ticket 0083's helper, with the
`created_at` half ticket 0096 adds. That Lock is its first *ranked* Gameweek's (`rankedFrom`),
which differs only where the Edition holds a retired Gameweek (ADR-0061 amended
2026-10-08, from this ticket's review). The seat CTE calls it for `role = 'entrant'` rows
and does not restate it. Exhibition rows are not filtered by it (ADR-0061: an
Exhibition Run crosses the boundary as a playing seat does), but the derivation of an
Exhibition row's "ran after Gameweek N" label is bounded to the Edition's Gameweeks, so
the label never names a Gameweek of another Edition.

**Range at read time, for what is counted at read time.** `scoredThrough`, the
settled-Fixture count, the Gap count, the Fixtures page's Gameweek list and its default
Gameweek are bounded to Gameweeks from the Edition's first Gameweek up to the next
Edition's first Gameweek exclusive (open-ended for the current one). `rankedFrom` — today
"retired Gameweek plus one" — becomes the greater of that and the Edition's first
Gameweek, so La Liga's retired block stays inside its Edition 1. One function in the
Editions module answers `{ edition, firstGameweek, lastGameweek | null, firstLock }` for
a Competition and an optional Edition number: omitted means the latest, an unknown
number is the 404 below.

**The current Edition is the default and the old URLs keep it.** `/api/pl/leaderboard`
means the Edition now playing; `/api/edition-1/pl/leaderboard` means Edition 1 once a
second exists. The router strips the prefix and hands the four handlers an Edition
scope; nothing else about the handlers' shape changes. Before Edition 2 opens the two
are the same body, and a test proves the prefixed and unprefixed routes return
byte-identical JSON on a one-Edition record.

**A body says which Edition it is.** Each response carries the Edition number, its first
Gameweek and, for a closed Edition, its last, so the page (ticket 0085) can label it from
data and the frozen sentence needs no numbers of its own. The Combined Ranking is summed
on the page from these bodies, so "a mixed set is refused" is the page's check (0085)
over the `edition` field this ticket adds — there is no Combined Ranking route to refuse
it here.

**What ticket 0097 left for this one (2026-10-08).** Outside a Competition's first
Edition, every cumulative row the scorer writes carries `detail.editionQualification`
(`editionScopeQualification` in the scorer), the sentence that says the
"season_to_date" figure counts from the Edition's first Gameweek. Nothing reads it yet.
A body that serves an Edition 2 figure carries that sentence beside it (ADR-0012), so
the page (0085) can show it.

**What ticket 0083 left for this one (2026-10-07).** The scorer writes a withdrawn seat's
cumulative rows at every Gameweek after its stamp (its `byEntrant` loop reads
Predictions, not the roster) while its `gap_rate` rows stop at the stamp. The seat CTE's
predicate is what keeps those frozen totals off the page: a seat withdrawn at Edition
2's first Lock is not a member of Edition 2 and is not read.

## Acceptance

- [x] On today's production-shaped record (one Edition everywhere) every existing route
      returns the same JSON as before this ticket plus the `edition` field box 6 adds;
      a snapshot test holds it.
- [x] On a fixture record with a league in Edition 2 from Gameweek 6, scored by 0097's
      scorer: the unprefixed leaderboard ranks over Edition 2's members and its totals
      are the Gameweek 6-onward rows; the Edition 1 route ranks Gameweeks 1–5 over
      Edition 1's members, a withdrawn seat included and a seat entered after Edition
      1's last Lock excluded; no count or list in either body reads a Gameweek of the
      other.
- [x] No body carries the Anchor or a Paired Difference (nothing under `src/dashboard/`
      reads `rps_paired_difference_*`), so there is nothing to recompute and no test;
      the body that first carries one reads 0097's row for its Gameweek.
- [x] The Fixtures route's Gameweek list and default Gameweek stay within the Edition.
- [x] The retired-Gameweek route answers under Edition 1 and 404s under Edition 2.
- [x] Every leaderboard body carries `edition`, its first Gameweek and, when closed, its
      last; an Exhibition row's "ran after" label never names a Gameweek outside the
      body's Edition.
- [x] An unknown Edition number is a 404 with the Edition named; nothing falls back to
      "current".

## Evidence, 2026-10-08

- **Seams.** `readEditionScope` in `src/editions.ts` returns `{ number, firstGameweek,
  lastGameweek }`, or null for an unknown Edition, and throws for a Season with no
  Edition at all. The router strips `edition-N` and reads the scope once per Match route
  (`scoped` in `handleDashboardRequest`). An unknown Edition is a 404 that names it:
  "The record holds no PL Edition 2 for Season 2026-27".
- **Range.** `rankedFrom` is `max(retired + 1, firstGameweek)`. `scoredThrough`, the
  settled-Fixture count and the next-Lock read are bounded above by `lastGameweek`. The
  Fixtures route's default Gameweek and Gameweek list are bounded to `[firstGameweek,
  lastGameweek]`, from the first Gameweek rather than `rankedFrom`, because that page has
  always offered the retired Gameweek.
- **Membership is measured at the Lock of `rankedFrom`, not of `firstGameweek`**, and
  ADR-0061 is amended to say so (second review). The first review found this against
  production (`models.created_at` against GW1 and GW2 Locks,
  2026-10-08):
  - La Liga's ten v2 seats were entered at 08-20 05:06, after PD GW1's Lock (08-15 17:00)
    and before GW2's (08-20 17:30).
  - Measured at GW1, the whole La Liga page would have been empty.
  - Every other league's seats predate its GW1 Lock.
  - An unfetched Gameweek is read as `infinity`, so the roster as it stands now: unstamped
    seats are in, stamped seats are out.
- **Exhibition label.** The "ran after" lateral is bounded to the Edition's Gameweeks, so
  an Exhibition Run that replayed only before Edition 2 is not on Edition 2.
- **Open for 0085.** The literal reading understates on a closed Edition. A run that
  replayed after GW7 reads "ran after Gameweek 5" in Edition 1's body. ADR-0032 calls the
  label a ceiling on what the run could know, so 0085 or an ADR-0061 note should decide
  whether a closed Edition drops it or qualifies it.
- **`editionQualification`** is spread onto the leaderboard and entrants bodies from the
  roster's stored Match Points rows when one carries it, so Edition 1 bodies keep their
  bytes.
- **`/retired`.** It is served only when the retired Gameweek is inside the scope. The
  unprefixed route 404s once La Liga opens Edition 2, and the page moving to
  `/api/edition-1/pd/retired` is 0085's.
- **`test/dashboard-edition-api.test.ts`** (10 tests, read as `dashboard_read`):
  - **Box 1:** 30 routes over the seeded Season, compared with
    `test/fixtures/dashboard-match-bodies-before-0084.json.gz`, which was captured at
    `09bf5bb` twice with identical bytes. The second review re-captured it from a
    detached worktree of `09bf5bb` and `cmp` matched the committed file. Each route's body less `edition` is
    byte-identical, and `/api/edition-1/...` serves the same bytes.
  - **Edition 2 from GW6, scored by 0097's scorer:**
    - Totals equal the stored GW7 and GW5 rows.
    - Edition 1 has `w` (withdrawn at GW6's Lock).
    - Edition 1 excludes `n` (entered during Edition 1) and `m` (entered after its last
      Lock).
    - Entrant series are `[6, 7]` and `[1..5]`.
    - The Fixtures route falls back inside its Edition.
    - `/retired` answers under Edition 1 only.
    - The unfetched-first-Gameweek case is covered.
    - La Liga's production timeline is replayed.
- **Mutation checks.** Each of the following was mutated one at a time and turned a test
  red: migration 0049's policy, the five SQL bounds, the retired-range check, membership,
  the `infinity` default, `rankedFrom`, the Lock of `rankedFrom` (back to
  `firstGameweek`) and the entrants qualification. Bytes were restored with `cp` and
  checked with `cmp` each time.
- **Box 3's wording** was changed in `df0cca2`, by this ticket, after the user agreed
  that no body carries the Anchor or a Paired Difference.
- **Second review, 2026-10-08:**
  - `edition-N` takes at most nine digits, so a longer number is the ordinary 404 and not
    a Postgres `int` overflow (a 500). The old regex fails the test.
  - The body field is `EditionScope` itself; the copy helper is deleted.
- **Changed tests.** `dashboard-read-api` (unopened body) and `dashboard-retired-gameweek`
  (key list) gain `edition`. `dashboard-overall-view`'s hand-built body gains it too. The
  migration lists (5) and `schema.test.ts`'s grant list gain 0049 and `editions`.
- **Checks.** `tsc --noEmit` and `astro check`: no errors. 29 targeted files (dashboard,
  editions, migrations, schema, `fpl-*`): 527 passed, 6 skipped, 0 failed.
