# Ticket: The Nations League activates

**What to build:** the operator inserts the `UNL` row for `2026-27`, ten seats are
entered under `match-unl/2026-27-v1`, and the next daily fetch lands the schedule, Locks
the first Gameweek whose derived deadline has not passed, and adopts any Gameweek it
missed as Locked history. Before that: the three name maps reviewed by a person, the
runbook grown a cup column, ADR-0051's "league" corrected, and the pre-cron checklist
grown the cup's own advance check. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 47–49, 51–52. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md) (no
target Gameweek; no hand-set Lock),
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md).

**Blocked by:** 0075 — nothing activates before its Prompt Version is frozen; and
through it, every earlier ticket. That blocker is gone: `match-unl/2026-27-v1` is frozen
at `90d0c3f0…` as of `694f4ed`.

**Status:** ready-for-operator. Every box this ticket could take without spending is
built; boxes 1 (the person's half), 2 and 6 wait on the operator, in that order.

---

## What is already known

**The insert is the operator's act and is never taken by the implementing agent.** It is
the first step that spends money on the next scheduled run (ADR-0049, ADR-0054). This
ticket prepares everything up to it, hands the operator the command and the checklist,
and records which Gameweek the Competition actually opened at once they have run it.

**Order.** Four migrations applied to production → three maps reviewed (the reviews are
diffs against the recorded sources, not transcriptions) → the pre-cron checklist's own
advance check for the four new sources → `competitions` insert → `roster:enter` under
`match-unl/2026-27-v1` → `npm run fetch` by hand →
`COMPETITION=UNL GAMEWEEK=1 npm run dry-run`.

**The order this ticket was drafted with was wrong in two places, and both are corrected
above.** See *Two corrections to this ticket's own wording* below.

**Clocks.** Gameweek 1's deadline is 2026-09-24T14:30Z, Gameweek 2's 2026-09-27T11:30Z,
Gameweek 3's 2026-10-01T14:30Z. A Gameweek the insert misses is let go; its Fixtures
arrive as Locked history through the mid-Season adoption path and are not predicted.
Missing Gameweeks 1 and 2 costs fifty-two Fixtures, about $16, and nothing else. No
Lock is set by hand.

**The runbook.** [Opening a Competition](../runbooks/opening-a-competition.md) lists
**thirteen** edits, not eight. A league makes 0 to 8; `UNL` makes 0, 1, 2, 9, 10, 11 and
12 — seven. The page grew a second column rather than a second section.

**`/overall`.** The Combined Ranking sums every Active and scored Competition with no
edit — the page's fetch list is `MATCH_PROMPT_COMPETITIONS`, which has held `UNL` since
0075 — so `/api/unl/leaderboard` joins the sum the moment the Competition is scored, and
`/unl` joins the switcher. ADR-0051's prose, the page's own published sentences and the
comments that counted four leaderboard bodies all become wrong on that day, and are
corrected here.

## Two corrections to this ticket's own wording

Recorded rather than silently fixed, because both were load-bearing.

**"Migration 0070 applied to production" is four migrations, not one.** `0070` is a
*ticket* number; its migration is `migrations/0042_the_nations_league_joins_the_domain_with_its_two_tables.sql`,
and three more have landed behind it since this ticket was drafted — `0043` (the dataset's
read date), `0044` (La Liga Gameweek 6's Lock) and `0045` (who picks each national side).
All four were still unapplied on production as of `694f4ed`. The step quotes file numbers
now, because a ticket number in a migration step is a step that cannot be checked.

**The dry run cannot come before the insert.** This ticket listed it as a gate on the
insert. It is not one and cannot be: the dry run replays production's *archived bytes*,
the daily fetch walks the `competitions` table, so a Competition with no row has no
snapshots and every source misses. Run on 2026-09-17 against an archive of 66 snapshots:

```
Archive: 66 snapshots, 82 Entrants, observed 2026-09-17T06:53:02.429Z
AggregateError: Daily fetch failed for multiple sources
  ArchiveReplayMissError: No archived snapshot for source uefa:2026-27:UNL:0
    (https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&limit=100&offset=0)
  ArchiveReplayMissError: No archived snapshot for source wikipedia:national-team-head-coaches
    (https://en.wikipedia.org/w/index.php?title=List_of_current_national_association_football_team_managers&action=raw)
```

Two misses and not four because the schedule is read first: with no Fixture stored,
`fetchInternationalResults` returns before it fetches and `fetchScores365Stats` has no
match to ask about, so those two would miss on the *next* run.

`prepare-archived-gameweek.ts` already names this circularity in its own docstring — "a
Competition's snapshots only exist once it is activated, and its activation is supposed to
wait on a green rehearsal". Ticket 0060 resolved it by running the insert first and
hand-running `npm run fetch` to populate the archive before rehearsing, and that is what
this ticket now does. The rehearsal is a check on the *packet*, worth running the moment
there are bytes; it was never a gate the insert could wait behind. The pre-cron checklist
§5 carries this as a standing note so the eighth Competition does not rediscover it.

## Acceptance

- [x] The three name maps (365Scores, dataset, trigrams) are derived from the recorded
      sources by tests and reviewed by a person; the review is recorded in this ticket.
      **The tests' half is green**, 2026-09-17: `test/fetch-365scores-stats.test.ts`,
      `test/fetch-international-results.test.ts` and
      `test/fetch-national-team-head-coaches.test.ts` — 53 tests, all passing. Each
      derives its map from archived bytes rather than asserting a transcription, and each
      asks the direction its source allows (the runbook's edits 10, 11 and 12). The
      material a person reads is below. **Reviewed and passed by Lee Lorz, 2026-09-22**,
      against the three tables in *The review material for box 1* — the three 365Scores
      pairs, the two dataset pairs, the eight trigram pairs that are not the trigram
      spelled out, and `RUS` as a refusal — with the same three suites re-run that day
      (53 passing) to show the tables still describe the maps as committed.
- [ ] `COMPETITION=UNL GAMEWEEK=1 npm run dry-run` is green over the recorded feeds and
      reaches no Base Model. **`GAMEWEEK` is not optional**: `readFetchJobConfig` requires
      it and `.env` does not set it, so the box's original wording — the command without
      it — dies on `GAMEWEEK is required` before the archive is read. The handover's step
      4 is the runnable form and this box now quotes the same line. **Red, and correctly so** — the archive holds no `UNL` bytes until the
      insert and the hand-run fetch. See *Two corrections* above. Re-run at step 4 of the
      handover.
- [x] The pre-cron checklist's advance check names the four `UNL` sources. Done, and the
      box's premise corrected in doing it: the existing advance check is
      football-data.co.uk's ten-file loop and `UNL` adds **no** file to it, so ten stays
      ten and `FOOTBALL_DATA_SEASON` does not cover the cup at all. §4 grew a section of
      its own — one `curl` per source, each the URL that source's own fetch builds — and
      states plainly that it is a weaker check than the ten-file loop, because none of
      the four carries a field like `Div` that a redirect to the wrong resource would
      fail. Run 2026-09-17, all four answering — `uefa 200 1097660`,
      `365scores 200 21568`, `dataset 200 3729861`, `coaches 200 108819`.
- [x] The runbook says which edits a cup makes and which it does not. Done as the
      **second column**, `Needed when edit 0 names`, keyed to the registry field rather
      than to the words "cup" and "league" — a Competition counts its own edits off its
      own entry. `always` for edits 0, 1 and 2; the registry field and value for the other
      ten. The four "only for a Competition whose edit 0 names …" clauses that had
      accumulated in the *What* column are deleted, the column having taken over saying
      it. The values are the pairings `test/competition-sources.test.ts` already enforces,
      read off that test rather than inferred.
- [x] ADR-0051's prose and the "four/five leagues" code comments say Competition where
      they meant it. Done, and **widened** — see *What this box turned out to be* below.
- [ ] The operator has the insert and `roster:enter` commands; once run, this ticket
      records the date, the Gameweek `UNL` opened at, and which Gameweeks were adopted
      as history. **Commands below.** The recording waits on the run.
- [x] Nothing in this ticket inserts the `competitions` row or reaches a Base Model. Held:
      the only commands run were three test files, one `tsc`, and one dry run that failed
      on a missing snapshot before reaching any Entrant.

## What box 5 turned out to be

The box named two things — ADR-0051's prose, and the code comments that count leagues —
and the build found a third that matters more than either: **the sentences `/overall`
actually publishes.**

`CONTEXT.md`'s **Competition** entry ends `_Avoid_: league (in identifiers, and as the
word for what a Competition is)`. By that rule the page was in breach in eight places a
reader can see — `Every league, added up`, the `Leagues covered` tile, the empty state's
two sentences, and the frozen qualification's `across every league covered here`, `a
league with more settled Fixtures weighs more`, `The leagues also run under their own
Prompt Versions` and the Exhibition clause's `in fewer leagues`. None of those is a
comment; all of them become false claims about the figure on the day `UNL` is first
scored, which is the day this ticket brings on.

So the box was taken as written *and* the published text with it:

- `dashboard/src/overall-caveat.ts` — the preface's three clauses and the Exhibition
  clause. Each keeps its claim; only the noun moves. `test/dashboard-overall-view.test.ts`
  moves with it (`"fewer leagues"` → `"fewer Competitions"`, three assertions).
- `dashboard/src/pages/overall.astro` — heading, hero sentence, stat tile, empty state,
  and four comments.
- `dashboard/src/overall-view.ts` — eleven docstring and comment sites, including the two
  that counted: "from the four leaderboard bodies a page fetched" and "computed in a
  browser from four rows". There are six.
- `src/exhibition/recall-caveat.ts` — the `EXHIBITION_RUN_LABEL` docstring's "all covered
  leagues". `EXHIBITION_CAVEAT` itself says nothing about leagues and is untouched.
- `CONTEXT.md` — the **Combined Ranking** entry's own body used the avoided word.
- `docs/adr/0051-…md` — an amendment, on the form ADR-0038 and ADR-0057 took under 0075.

The amendment records one decision rather than only the vocabulary: **the qualification
does not grow a fourth clause for a cup.** A cup's packet renders sections a league's does
not (ADR-0038's amendment), so an Entrant compared across a league and a cup is confounded
by more than wording — but the Prompt Version is exactly what those differing sections are
pinned by, so the existing "they run under their own Prompt Versions" already names that
confound at its source. ADR-0052 fixed the clause count at three, or four with an
Exhibition Run present, and this does not move it.

Nothing in the record changed: no scorer row, no stored `detail`, no Prompt Version. The
six frozen shas are untouched — none of these files is reachable from the prompt render,
and `test/openrouter-entrant.test.ts` is green.

## The review material for box 1

Three maps. What a person is checking is not that the code agrees with itself — the tests
do that, both directions where both are available — but that each *pair* is the right pair.
A name missing from a map fails loudly; a name mapped wrongly fails nothing, ever.

**365Scores → the record** (edit 10, three of fifty-four; the other fifty-one match
character for character). Checked in the direction 365Scores allows: every name in the
listing must resolve onto a stored side, and a stranger is caught on sight.

| 365Scores lists | the record stores | why it is not a rule |
|---|---|---|
| `Ireland` | `Republic of Ireland` | the record also holds `Northern Ireland`; no prefix rule can choose |
| `Turkiye` | `Türkiye` | the diacritic is the record's, from UEFA's own feed |
| `Bosnia & Herzegovina` | `Bosnia and Herzegovina` | ampersand versus the word |

**The dataset → the record** (edit 11, two). Checked in the opposite direction, and it has
to be: the file lists every men's international ever played, so a name the map does not
hold is indistinguishable from one of the two hundred sides this record has no section
for. Every side the record stores must therefore be reachable in the file.

| the dataset names | the record stores |
|---|---|
| `Czech Republic` | `Czechia` |
| `Turkey` | `Türkiye` |

**Trigram → the record** (edit 12, fifty-four, plus one named absence). Checked in *both*
directions, because both lists are closed: the map is asserted equal to the recorded UEFA
feed's own `countryCode` → `internationalName` pairs, sorted, with nothing left over on
either side. The three a reviewer should look at hardest are the three that are not the
trigram lowercased:

| trigram | the record stores | note |
|---|---|---|
| `IRL` | `Republic of Ireland` | not `Ireland` |
| `NIR` | `Northern Ireland` | the side `IRL` is not |
| `TUR` | `Türkiye` | not `Turkey` |
| `MKD` | `North Macedonia` | |
| `KOS` | `Kosovo` | |
| `BIH` | `Bosnia and Herzegovina` | |
| `CZE` | `Czechia` | not `Czech Republic` |
| `FRO` | `Faroe Islands` | |

The other forty-six are the trigram's obvious side. The one row of the UEFA section that
is **not** this Competition's is named rather than skipped: `RUS` — a UEFA member under
suspension, entering no Nations League — so a fifty-sixth trigram on the page is a refusal
rather than a row quietly dropped.

## The handover

Every command below is the operator's. Step 1 is the first that spends money on the next
scheduled run. `DATABASE_URL` must be the session pooler on port 5432, and `SEASON` must
be `2026-27`.

```bash
set -a; . ./.env; set +a

# 0. The four pending migrations. Rehearse first; the runbook is
#    docs/runbooks/the-competition-migration.md §2.
#      0042 the Nations League joins the domain with its two tables
#      0043 the dataset says when it was last updated
#      0044 La Liga Gameweek 6 holds its Lock open to the last kickoff
#      0045 who picks each national side and since when
npm run --silent db:rehearse
npm run --silent db:migrate

# 1. The insert. THE FIRST STEP THAT SPENDS.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "insert into competitions (competition, season)
      values ('UNL', '$SEASON') on conflict do nothing"
psql "$DATABASE_URL" -c "select competition, season from competitions order by competition"

# 2. Ten seats under match-unl/2026-27-v1. After the insert, never before.
npm run --silent roster:enter

# 3. Populate the archive and confirm the four sources answer. Reaches no
#    Base Model. This is the command fetch.yml itself runs.
npm run --silent fetch

# 4. The rehearsal, now that there are bytes.
COMPETITION=UNL GAMEWEEK=1 npm run --silent dry-run
```

What to read back, once run — the shape ticket 0060 recorded and the three figures this
ticket's last box needs:

```sql
-- Six Competitions listed. Expect BL1, FL1, PD, PL, SA, UNL.
select competition from competitions where season = '2026-27' order by competition;

-- Ten seats under the frozen cup version, and no other. Expect one row: 10.
select prompt_version, count(*)::int as seats
  from models where prompt_version = 'match-unl/2026-27-v1'
 group by prompt_version;

-- Which Gameweek UNL opened at, and which were adopted as history.
select gw, deadline_at from gameweeks
 where competition = 'UNL' and season = '2026-27' order by gw limit 4;

-- The league phase landed. Expect 156.
select count(*)::int as n from fixtures where competition = 'UNL';

-- What the hand-run fetch captured, and where it stopped.
select source, length(body) as len, first_seen_at from raw_snapshots
 where source like 'uefa:2026-27:UNL%'
    or source like '365scores:2026-27:UNL%'
    or source in ('wikipedia:national-team-head-coaches',
                  'martj42:international_results')
 order by source;
```

Gameweek 1's deadline is **2026-09-24T14:30Z**. A run after it opens at Gameweek 2, and
Gameweek 1's Fixtures arrive as Locked history. That is the ADR-0054 reading and needs no
decision on the day.

## The review round, folded in

Twelve findings, 2026-09-18. No hard violation. Every one is fixed in this tree except the
two marked accepted.

**Standards (seven).**

1. **`test/dashboard-overall-view.test.ts` still said "league" in nine places** — test
   names and comments — in a file this diff had already opened to change three assertions.
   The heaviest of the seven, and rightly: a file touched under a vocabulary rule that still
   breaks the rule is the rule applied to half a file. All nine now say Competition; three
   test names were rewrapped to stay inside the margin, and one lost article
   (`the Entrant of the same Base Model`) was caught re-reading the rewrap.
2. **The checklist hard-coded "five as this is written".** Not moved to six — *stopped
   counting*. It had been "four" and then "five" and was stale both times, which is ticket
   0061's own "say five, or stop counting" arriving a third time. It now reads "one per row
   in `competitions`" and says why the number is not written out.
3. **A line number in a runbook.** `fetch-results.ts:341` is right today and rots on the
   next edit; both it and `fetchScores365Stats` are named by function now. The same citation
   in this ticket was fixed with it — one rule, one diff, both sites.
4. **ADR-0051's amendment sat 150 lines below the prose it corrects.** A reader meets
   "adds up four leaderboards by hand" first. It now carries a banner at the head, the form
   ADR-0036 and ADR-0049 use for exactly this, pointing down at the detail.
5. **`CONTEXT.md`'s Leaderboard entry counted in the avoided word** two entries above a
   **Combined Ranking** this diff had just corrected. Fixed; see *Found beside the work*.
6. **`overall-view.ts` had one 104-character line** in a block wrapped at 80 — the rewrap
   stopped one line short. Rewrapped. No line in this diff now exceeds the margin; the six
   that do are all pre-existing and untouched.
7. **`/overall`'s hero and `COMBINED_RANKING_PREFACE` were held in step by hand.** Recorded
   as an observation and deliberately **not** extracted; the reasoning is in *Found beside
   the work*.

**Spec (five).**

1. **Spec 0027 still carried the order this ticket had just declared wrong** — and the
   eighth Competition reads the spec before the checklist. The worst of the five for that
   reason. The spec now has a banner and its activation bullet is corrected in place, with
   the mechanism named: a dry run does list the Competition temporarily, but it fetches
   through the archive-replay fetcher, so it can replay only what production has stored.
2. **Box 2 quoted a command that cannot run.** `COMPETITION=UNL npm run dry-run` dies on
   `GAMEWEEK is required` before the archive is read — `readFetchJobConfig` requires it and
   `.env` does not set it. The `Archive: 66 snapshots` output quoted above came from the
   form with `GAMEWEEK=1`. Both citations now match the handover's step 4, which was already
   right. This mattered more than its size: it is a line an operator copies.
3. **The test file and the checklist**, as items 1 and 2 of Standards.
4. **ADR-0051's amendment takes a decision story 51 did not ask for** — that the
   qualification grows no fourth clause for a cup. **Accepted**: it is recorded in the open
   rather than slipped in, and a vocabulary edit that left the clause count unstated would
   have been the quieter mistake.
5. **"There are six now and will be seven" was a guess.** Nothing in the repo names a
   seventh Competition. Removed; it reads "There are six."

## Found beside the work

- **`CONTEXT.md`'s Leaderboard entry quoted ADR-0035's benchmark question and then counted
  in the same word.** The quote — "which Base Model forecasts this league best" — is
  ADR-0035's own wording from before the first cup and stays a quote. The count beside it
  was the glossary speaking in its own voice, two entries above **Combined Ranking**, which
  this ticket had just made say Competition; a glossary with two adjacent entries using
  different words for one thing is worse than either word. The count now says Competition
  and a clause says which half is the quote. Amending ADR-0035 itself is still somebody
  else's ticket.
- **`src/dashboard/read-api.ts` and `dashboard/src/competition-view.ts` each carry a
  comment using "leagues" for Competitions** (`read-api.ts:36` and `:2681`,
  `competition-view.ts:75`). All three are about ADR-0039's per-path routing rather than
  the combined ranking. Left, and named here so the next sweep starts with a list.
- **`/overall`'s hero sentence and `COMBINED_RANKING_PREFACE` were kept in step by hand
  this round, and should stay two texts.** They overlap and are not the same sentence:

  > hero — "Match Points and Bet Points summed raw across every Competition that is Active
  > and has scored, ranked the same way each Competition's own leaderboard already ranks
  > them."
  >
  > preface — "This total is a raw sum of season-to-date Match Points and Bet Points across
  > every Competition covered here, not an average or a rate: …"

  The hero says what the page shows; the preface is the qualification ADR-0051 froze and
  says what the total is *not*. They have never been byte-identical, so the frozen-text
  rule does not reach the hero — and ADR-0051 put the qualification in a module of its own
  precisely so that one sentence would have one owner. Importing it into the hero would put
  page copy inside an ADR-frozen constant. Recorded rather than extracted: a forced
  simultaneous edit is the trigger for dedup only when the two sites carry the *same* text,
  and this round's edit was one vocabulary rule applied to two different sentences.
- **`dashboard/dist/` holds a built copy of the old strings.** It is a build output; the
  next build replaces it. Nothing in this ticket edits it.

## What this ticket did not do

- **It did not insert the `competitions` row, apply a migration, or run anything that
  reaches a Base Model.** All three are the operator's.
- **It did not make the dry run green.** It cannot until step 3 has run; it diagnosed why,
  corrected the order, and wrote the diagnosis where the next Competition will find it.
- **It did not run the full suite.** Six suites were run against the touched files (114
  tests) plus the three map suites (53), and `tsc` is clean. The suite has not been run
  whole since before ticket 0070.
- **It added no migration** and needed none.
