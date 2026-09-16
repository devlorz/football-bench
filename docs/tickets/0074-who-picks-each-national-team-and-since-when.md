# Ticket: Who picks each national team, and since when

**What to build:** the `UNL` packet names each side's head coach and the date they
assumed the role, and shows a Head Coach Change when two daily snapshots of the source
disagree. The daily fetch archives Wikipedia's current-managers list each day and parses
its UEFA table. Source: [spec 0027](../specs/0027-the-nations-league-opens.md) stories
33–37. Decisions:
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md)
(the packet section), [ADR-0045](../adr/0045-the-packet-names-who-picks-each-team-not-only-who-changed.md).

**Blocked by:** 0071 — the fifty-four-entry trigram map is derived from the recorded
UEFA feed's `countryCode` against the stored names, and there is nothing to attach a
coach to until Fixtures carry those names.

**Status:** built, 2026-09-16

---

## What is already known

**The page.** `List of current national association football team managers`, raw
wikitext, one `==UEFA==` section holding a `wikitable sortable` of fifty-five rows:
`| {{fb|ALB}}`, then the manager cell (`{{flagicon|ITA}} [[Rolando Maran]]` with a
`data-sort-value`), then `{{dts|format=dmy|19 May 2026}}`, then references. Recorded on
2026-09-14 as `test/fixtures/wikipedia-current-national-team-head-coaches-2026-09-14-recorded.wikitext.gz`.
It is a *current* list: a change is an edit, not a row in a changes table, so a Change is
the difference between two archived snapshots and is visible only from the first
snapshot stored.

**This is a different parser and a different store from the Season-article one.** The
league builder reads a managerial-changes table per Season and a current-holders list;
this reads one holder per side with an assumption date. Reuse the existing
`head_coaches`/`head_coach_changes` tables if their shape fits a side with no Division;
otherwise one small table keyed by side and observed date. Do not extend the
Season-article parser with a fourth country shape — this is a fourth *page* shape, and
[the runbook](../runbooks/opening-a-competition.md) records what happened last time a
shape was guessed.

**Trigrams to stored names.** The table keys sides by FIFA trigram; UEFA's feed carries
`countryCode` on every side. Derive the fifty-four-entry map from the recorded feed
against the stored names and require both sets the same size with nothing left over;
the fifty-fifth UEFA member (not in this Season's Nations League) is expected to be the
one row left on the page's side. A trigram on the page that maps to none of the
fifty-four is refused by name.

**Vacancies.** A row whose manager cell names no person renders as vacant, never as the
previous holder.

**The section.** For each side: the coach and "since <date>"; below it, a Change when
the latest snapshot's holder differs from the previous snapshot's, dated by the day it
was first observed. Absent for a Competition whose registry names no head-coach source.

## Acceptance

- [x] The registry names the Wikipedia managers list as `UNL`'s head-coach source; the
      daily fetch reads and archives it for `UNL` alone (daily-fetch seam).
      *`headCoaches: "wikipedia-national-team-head-coaches"` — the record's word for the
      page and not the page's own word for itself. The article is titled `List of current
      national association football team managers` and that title is quoted verbatim in
      the module, on migration 0042's terms for the dataset's `tournament` column: a
      title is the source's name for itself and rewriting it into this project's
      vocabulary would make it a title that 404s. The registry string is one of this
      codebase's own names, so it says Head Coach.*
      *`headCoaches` is the fourth of the five registry fields to hold two sources under
      one name, and the last that could: a season article publishes a club competition's
      changes as dated events, the current list publishes who is in post today and no
      event at all, and no national side appears in one nor any club in the other.*
      *Archived before validation under one constant name,
      `wikipedia:national-team-head-coaches`, carrying neither Season nor Competition for
      the reason the internationals dataset's does not: there is one page and it is the
      same page for every Competition that reads it. Two mornings whose bytes differ are
      two rows under that one name, which is not merely evidence here — it is the
      mechanism a Change is found by.*
      *Collected into the run's errors rather than reported through `reported`, on the
      same terms as ticket 0072's 365Scores read: `headCoachChanges` is the season
      articles' outcome the fetch workflow has always consumed — a Gameweek's partition
      and a count of dated changes — and this page is not that outcome under another
      name. A `UNL` failure fails the run at the end and costs no other Competition its
      day.*
      *The daily-fetch seam pins it: `NATIONS_LEAGUE_URLS` is now UEFA's two pages, the
      dataset's file and this page, and "reads UEFA for the Nations League and leaves the
      leagues' sources alone" asserts the whole set rather than a filter over one host.*
      *The registry is asked in both directions at the loader too. `head_coaches` and
      `head_coach_changes` were read for every Competition and filtered by their
      `competition` column, which returns nothing for a cup — correct, and asymmetric
      with the read beside it. Both are now gated on the registry naming the season
      articles, so which of the two stores a Competition reads is one fact asked one way.
      That is the asymmetry ticket 0073 left between `historical_matches` and
      `international_results`, not repeated here.*
- [x] Over the recorded wikitext, the parser yields one holder and one assumption date
      for each of the fifty-four sides, and a vacancy renders as vacant (per-source seam,
      with a hand-edited vacancy case).
      *Fifty-**five** rows, not fifty-four: the parser reads every row of the section and
      the fetch decides which are this Competition's. A parser that filtered would have
      no way to tell a row it dropped on purpose from a trigram that had drifted.*
      *Three date templates, all on this one page and all in the `Assumed role` column:
      `{{dts|format=dmy|19 May 2026}}`, `{{DTS|17 February 2025}}` and `{{Date table
      sorting|6 August 2025}}`. `parseDate` in the shared `wikipedia/wikitext` module
      knew only the Italian transfer list's `{{dts|format=dmy|2026|2|12}}`, three numbers
      rather than a written date, so it was widened there rather than taught a second
      time here — one owner of what a Wikipedia date cell looks like, and a fix the older
      pages would have needed the day an editor wrote a date that way there.*
      *The row width is bounded and not pinned, which is this page's difference from the
      season articles: Denmark's row is three cells wide because nobody has cited it, and
      MediaWiki renders the missing `Refs` cell as empty. The bound is the three pinned
      columns — those are the ones a short row would silently shift — and the unpinned
      fourth is left alone. Found by the first run of the suite, not reasoned out.*
      *The vacancy case is hand-edited over England's row, because on 2026-09-14 every
      UEFA side had somebody in post. `''Vacant''` and an empty cell are read as the same
      fact and anything else in the column is a name; the pair is closed rather than
      "does not look like a name", so a cell this parser cannot recognise is a refusal
      and never a side quietly rendered as having none.*
- [x] The trigram map is derived from the recorded UEFA feed and reviewed; a page row
      outside it is refused by name.
      *Fifty-four entries, derived from `countryCode` against the stored
      `internationalName` in the two recorded feed pages, and the suite re-derives it and
      compares the whole object — a transcription is not what a reviewer is asked to
      check.*
      *Three refusals and not one, because this map can be checked in both directions and
      ticket 0073's could not. Its dataset lists every side there is, so a name it does
      not hold is indistinguishable from one of two hundred strangers; this page lists one
      confederation per section, so both lists are closed. A page row the map has never
      seen, one of the map's own trigrams the page has dropped, and a stored side the map
      cannot reach are three different edits and each is named. The first two are reported
      together in one refusal: they are usually one edit seen from two sides, and
      reporting half of it sends an operator back to the page twice.*
      *The fifty-fifth UEFA member is named rather than skipped.
      `outsideTheCompetition: ["RUS"]` — Russia is a member under suspension and enters no
      Nations League. Naming it is what makes a fifty-sixth trigram a refusal, and a
      trigram is far likelier to arrive here by a spelling drifting than by UEFA admitting
      a member.*
- [x] Two snapshots that disagree on a side yield one Head Coach Change dated by the
      later snapshot; two that agree yield none.
      *Derived at the render and stored nowhere. A second table would hold only what two
      rows of the first already say, and `national_team_head_coaches` is keyed by the side
      and the day precisely so that the difference can be taken.*
      *Every disagreement in the window renders and not only the latest, which is a
      deliberate widening of spec 0027's Implementation Decisions. That section says "a
      Change is the difference between the latest snapshot and the one before it", and
      read literally it loses changes story 35 asks for: snapshots of A, B, B show no
      difference between the last two, and the packet would say nothing had happened
      while the first Change sat one row further back. Taking every consecutive
      disagreement is the same single pass and drops nothing. A vacancy on either side of
      a Change is rendered as `vacant` in the same line, so the seat falling empty and
      the seat being filled are both events.*
      *Dated by the morning the new answer was first read and never by the day the seat
      changed hands, which this source never states. The `Assumed role` date on the line
      above says the second thing; saying it twice would claim this record saw it
      happen.*
      *Re-reading the page inside one morning rewrites that morning's snapshot, because
      the key is the side and the day. A rerun cannot manufacture a Change out of having
      read the same page twice, and the suite pins that.*
- [x] The `UNL` packet names each side's coach and date, and a Change when there is
      one; a league packet does not grow the section (context seam).
      *Chosen by the registry, exactly as the history section already is: a Competition
      whose `headCoaches` names the current list renders that section **instead of** the
      season article's. Two sections, one question, and no packet carries both.*
      *The section states its own window — "A change is visible from 22 Sep 2026, when
      this list was first read here; one before that is not." — read off the earliest
      stored snapshot rather than from a constant. It is story 35's honesty made
      explicit: this record has been reading the page since the day its fetch first ran,
      and silence about anything earlier is a bound rather than a claim that nothing
      happened.*
      *A side with nothing stored reads ADR-0045's own Gap sentence, imported from the
      leagues' section rather than written twice: the promise is the ADR's and one
      wording of it changing would have to change both. `formatDate` is shared for the
      same reason — the two sections answer one question for a reader moving down a
      packet, and a date that read `24 May 2026` in one and anything else in the other
      would say they came from different records.*
      *The seam is `test/competition-context-contamination.test.ts`, in both
      directions and at both levels. At the loader: a `UNL` packet reads the shared
      table whole and reads neither league Head Coach store, and a `PL` packet reads its
      own two and never the shared one — over rows planted in each that name the other's
      clubs. At the render: the league's packet grows the season article's section and
      none of this one's wording over a row naming Arsenal, and the dispatch itself is
      exercised by swapping **one field** of the entry — `headCoaches` alone, because
      swapping the whole entry moves the history dispatch too and would test them
      together while naming neither.*
      *No league packet grew: `test/openrouter-entrant.test.ts`'s five frozen shas are
      untouched, which is the assertion rather than a claim.*

## The decision this ticket was asked to make

**Whether `head_coaches` and `head_coach_changes` could be reused: no, and for two
reasons rather than one.** The ticket left it open — "reuse the existing tables if their
shape fits a side with no Division; otherwise one small table keyed by side and observed
date" — and the second reason is the one that settles it.

- **The column.** `head_coaches` holds a name and nothing else, because a season
  article's personnel table states no date; this page's whole second column is the date
  the role was assumed. There is nowhere in that table to put it.
- **The key.** `head_coaches` is keyed by Gameweek and rewritten whole on every read,
  which is right for a source that republishes the same Season's table each morning. This
  page is a *current* list, so a Change is the difference between two days of it — and a
  store that kept only the newest read could not answer what changed, because yesterday's
  answer would already have been deleted by today's.

`head_coach_changes` fails on the same second reason from the other end: its rows are
events the source publishes, carrying a manner and two independent dates. A Change here
has no manner, one date, and that date is about this record rather than about football.
Writing one into that table would have meant a `manner` null on a Departure, which
migration 0032 states is null *exactly* for an Arrival.

So migration `0045`: one table, `national_team_head_coaches`, keyed by the side and the
day the page was read. It carries no Competition and no Season, on migration 0042's
terms — the same row answers for every Competition a side plays in, and an international
year is not a Season. It carries `observed_at` beside `observed_on` because the two
answer different questions: the day is the key and what a Change is dated by, the instant
is the whole of its pre-Lock claim. It carries no trigger pair, unlike both tables above,
because those triggers reach a deadline through the row's own Gameweek and a row here has
none — so the Lock is held at the reader, and the builder says so where it holds it.

`head_coach` and `assumed_on` are null together or not at all, checked by the database.
A vacancy is stored rather than skipped, which is what tells it from a side the page does
not carry: the first is an ordinary fact about a national side and the second is a Gap.

The cost is the one a migration always has here: the pending pass is now `0042` to
`0045`, `npm run db:rehearse` must be re-run before an operator applies any of them
(`docs/runbooks/the-competition-migration.md` §2), and six places grew a row — the five
filename lists in two suites, plus `test/schema.test.ts`'s alphabetical table list and
its `truncate`.

## Found beside the work

**The runbook's own count was two tickets behind.** Its first paragraph said "There are
**ten** places" while §1 was headed "The twelve edits" and the paragraph above it said
ticket 0073 made it twelve. Tickets 0072 and 0073 each appended a row and neither carried
the number up to the top of the page. This diff makes both thirteen and says in the page
itself that the count had drifted — a page whose whole purpose is to count the change is
worth reading only while its own count is right.

**CONTEXT.md's two Head Coach entries were a club's, and one of them needed a decision
behind it.** "The person in post at a real club"; "Every club has one, so a club with no
Head Coach named is a Gap". Both were widened. But "a stated vacancy is a fact rather than
a Gap" is a *new rule* and neither ADR said it — ADR-0045 says the opposite about clubs
and meant it. A rule's home is an ADR, not a glossary line and not a migration comment, so
ADR-0045 now carries an amendment: a side's line is a name, a vacancy, or the Gap
sentence, the three mean different things, and a club keeps the rule as written because no
source this record reads publishes a club post as vacant. The two CONTEXT.md entries are
back to vocabulary and point at it.

**Spec 0027's own bullet still said "the latest snapshot and the one before it".** The
widening to every consecutive disagreement was argued in this ticket and the spec was left
describing the narrower thing, which makes the next reader's source of truth the wrong
document. The bullet now states the widening and why, and records that the two existing
tables were not reusable and on which two counts.

**The Wikimedia user-agent string was about to become a third copy.** It is Wikimedia's
policy and one fact about this project, not one fact per page. It first went out as an
export from `fetch-head-coach-changes.ts` — a sibling handing a constant to a sibling,
which is a middle nobody would have chosen on purpose and which left the squad-changes
copy standing as a second. It now lives once, in `src/wikipedia/wikitext.ts`, and all
three Wikipedia fetches import it. That module is about reading wikitext rather than
about HTTP, which its own comment says; the alternative was a fourth file holding two
lines.

**`"wikipedia-season-article"` was a literal on one arm of a switch whose other arm used a
constant.** `headCoaches` holds two sources now, so both arms are compared against
`HEAD_COACH_SEASON_ARTICLE_SOURCE` and `NATIONAL_TEAM_HEAD_COACHES_SOURCE` — a switch
spelled two ways is one a reader has to check twice. The registry's own entries stay
literals, which is data.

**The recorded fixture was named with the word the glossary forbids.** It is a name this
repo chose rather than a title quoted from the source, so it is now
`wikipedia-current-national-team-head-coaches-2026-09-14-recorded.wikitext.gz`. The page
title itself keeps Wikipedia's spelling, in the module and in the URL, for the reason
migration 0042 keeps the dataset's `tournament` column.

**`parseNationalTeamHeadCoaches` took a `source` that had one value.** There is one page,
so the parameter could only ever let a caller name bytes that were not read. Dropped; the
refusals name `HEAD_COACHES_SNAPSHOT` themselves.

**One guard in the widened `parseDate` could not be observed.** The unwrapping pattern
excluded `|` and `=` from what it would take out of a date template — and the anchored
written-date pattern one line below refuses exactly the same strings, so no input could
tell the two spellings apart. A mutation of it survived the first pass for that reason
rather than for a missing test. The character class is gone and the comment now says
which line is the gate. Twenty-three mutations, all twenty-three dead.

## What this ticket did not do

- **The pin.** `MATCH_PROMPTS` still has no `UNL` entry. Ticket 0075's single pin is now
  the first thing that freezes this section's wording along with the two rate lines, and
  it should be taken from a real render (`npm run context:show`, which reaches no Base
  Model) rather than from the suite's, which renders from literals and reads no database.
- **A `head_coach_changes` row for a national side.** The Change is derived at the render
  from two snapshots. If a later ticket needs a Change that outlives the snapshots it was
  derived from — a retention policy on `national_team_head_coaches`, say — that is when a
  second table earns itself, and not before.
- **Bounding the context read to a window.** The loader reads every snapshot before the
  Lock for every side, which is 54 rows a day and grows with the Season. It is small, and
  the two bounds that would shrink it — the Season's start, or the Competition's own
  sides — are respectively no bound at all today (the fetch began after the Season did)
  and a filter the per-Gameweek loader has no Fixture to apply.
- **The nested ternary in the daily fetch's schedule dispatch.** Still deferred to
  whichever ticket adds a third *schedule* source. This one adds a head-coach source.
- **Anything about the section a league renders.** `buildHeadCoachContext` is unchanged
  except for exporting two things it already had, and the league stores are read exactly
  as before for a Competition whose entry names them — what changed is that the read is
  now asked, rather than filtered by a column that happened to answer.
