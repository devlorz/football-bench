# Ticket: `match-unl/2026-27-v1` is frozen and says what a cup does not have

**What to build:** `UNL` has a frozen Prompt Version, `match-unl/2026-27-v1`, whose
rendering is the shared template with the Competition named "UEFA Nations League", the
two cup sections (recent internationals, who picks each team) present, and the league
table, Squad Changes and availability each a stated absence; its sha is pinned on first
read, before any Nations League row is stored. The dashboard's `/unl` routes exist from
the moment the version lands. Source:
[spec 0027](../specs/0027-the-nations-league-opens.md) stories 7–9, 38–40, 42.
Decisions:
[ADR-0038](../adr/0038-one-prompt-template-one-prompt-version-per-competition.md),
[ADR-0037](../adr/0037-a-new-competition-plays-the-v2-context-minus-availability.md),
[ADR-0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md),
[ADR-0057](../adr/0057-the-nations-league-opens-as-the-first-cup-on-sources-nobody-documents.md).

**Blocked by:** 0072, 0073, 0074 — the pin hashes the render, and the render changes each
time a section arrives; pinning after the last section lands means pinning once, which
is the runbook's own advice about edit 6.

**Status:** built, 2026-09-16

---

## What is already known

**The pin is read, never predicted.** Every league's pin was read off the suite's render
after its sections were in place; La Liga's moved twice for builder changes and every
later league's moved once for the transfer-window gate. Here the gate is the registry:
a Competition whose entry names a history source renders the recent-internationals
section, one naming a head-coach source renders the coach section, and neither league
packet grows either. Read the sha after 0072–0074 have landed and pin it; if it moves
before the first Lock for a reason ADR-0026 allows, record why.

**What differs from `PL`'s render, by design and nowhere else**: the name; the
recent-internationals section replacing the historical-results section; the coach
section from the managers list rather than the Season article; and three sections a
league's packet carries that this one does not — **two stated in words**, "no league
table for this Competition" (or the existing wording for a Competition with no
divisions, if it already reads honestly for a cup) and "no Squad Change data" replaced by
an absence stating that a national team has no transfer window, and **one silent**,
availability, absent as it is for every non-`PL` Competition. This paragraph said "three
stated absences" as drafted, and building it found the third cannot be stated without
either singling the cup out or adding a line to four frozen renders: ADR-0057's
amendment records which two carry words and why the third is right to be wordless. The
competition-name agreement test extends to `UNL`; the `PL`/`PD` pins do not move.

**`MATCH_PROMPT_COMPETITIONS` grows `UNL`**, so `competitionRoutes()` gives the dashboard
`/unl` and `/api/unl/*` with no dashboard edit (ADR-0039); the seven test sites that used
`BL1` as "a code the schema admits and nothing has opened" were resolved by ticket 0060
and are not this ticket's problem.

## Acceptance

- [x] `MATCH_PROMPTS.UNL` is `match-unl/2026-27-v1` with `competitionName` "UEFA Nations
      League", and the render test pins its sha.
      *`90d0c3f01c459670b9f47143a61c9c4d65214ccdc47fe755787b06ca3bffc616`, read from this
      suite's render on 2026-09-16 with every gate already open — the UEFA schedule
      (0071), the 365Scores shots and xG (0072), the dataset's internationals (0073) and
      the head coaches list (0074). One reading and one pin, which is what being blocked
      by all four bought.*
      *The reading is the suite's render and could not be a real packet: `context:show`
      renders no `UNL` packet until there is a `UNL` Gameweek, and there is none until
      the operator's `competitions` insert — ticket 0076, and the first step that spends
      money. So the render was printed whole and read line by line instead, which is the
      part that matters; the number was always the suite's. What it says is in "The
      decision this ticket was asked to make" below.*
      *The shared fixture in `test/openrouter-entrant.test.ts` grew the cup's four
      stores, because a pin over empty sections would hash the absences and none of the
      lines: two dataset internationals (one at a neutral venue), three of this Season's
      Fixtures (a full sheet, no sheet at all, and one after the Lock), and four head
      coach snapshots (a Change, a vacancy, and one read after the Lock). Every league
      pin below is unchanged over those rows, which is the assertion that no league's
      registry entry reaches any of them.*
- [x] The `UNL` render differs from `PL`'s only in the name, the two cup sections and
      the three absent sections — two of them stated in words, availability silent
      (render seam); the `PL` and `PD` pins are unchanged.
      *Two claims and two tests. The template around the sections is the "differing by
      exactly the Competition name" test, which iterates `MATCH_PROMPT_COMPETITIONS` and
      so now asks it of the cup as well. The sections themselves are a new test listing
      four league headings and four cup ones, each asserted in **both** directions: a
      one-directional list stays green when a section renders for both Competitions,
      which is the failure the three registry dispatches exist to prevent.*
      *`PL`, `PD`, `SA`, `FL1` and `BL1` are unmoved — five pins, not two.*
      ***Two** stated absences and not three, which is this box's own wording corrected
      rather than ticked over — a box that claims what the render does not do is the
      first line a reader believes. **Found by review.** The league table and the
      Squad Changes are stated in words; availability is absent and silent,
      exactly as it is in La Liga's, Serie A's, Ligue 1's and the Bundesliga's
      packets. Stating it here alone would make the cup the one Competition
      apologising for a feed four leagues also lack, and stating it in all five
      would add a line to four frozen renders, which ADR-0026 forbids. Spec
      0027's story 39 and ADR-0057's packet section both say three; ADR-0057
      now carries the amendment that says which two, and why the third is
      right to be silent. No code changed for this — the render was already
      what the five Competitions do.*
- [x] A Gameweek 1 `UNL` packet reads "no result has been played yet this Season" for
      the Season's results, as every league's Gameweek 1 does.
      *The league's sentence and not a cup's own wording: it is the same state, and a
      reader comparing two Competitions' first Gameweeks should not have to notice they
      said it differently.*
      *Where there are results it is a coverage statement — `2 matches played, through
      2026-08-19.` — which is what the league table's heading is (ADR-0021). The
      Fixtures themselves are not listed again under it: they are on the two sides' form
      lines already (ticket 0073), and a cup's Season is a hundred and fifty-six Fixtures
      where a packet is one Fixture's.*
- [x] The contamination test proves a `PL` packet reads no `UNL` row and a `UNL` packet
      no `PL` row.
      *The two `expect(...).toThrow("Competition UNL has no frozen Prompt Version")`
      sites ticket 0073 and 0074 left as placeholders are now real renders, which is what
      those tickets said they were waiting for. Each asserts the positive half its league
      half could not: the cup's own form line over the shared table's rows, its own side's
      Head Coach, and the absence of the league row filed under its code.*
- [x] `/unl` and `/api/unl/*` answer on the dashboard with an unopened Competition's
      empty state.
      *No dashboard edit (ADR-0039): `competitionRoutes()` reads
      `MATCH_PROMPT_COMPETITIONS`, so `/unl`, `/unl/fixtures`, `/unl/entrants` and the
      three API paths arrive with the registry entry. The route enumeration, the page
      list and the switcher's crossings each gained their `UNL` rows.*
      *The "served but not open" case in `test/dashboard-read-api.test.ts` moved from
      `bl1` to `unl`. `bl1` held it from ticket 0058 until 0060 gave it a `competitions`
      row; the case belongs to whichever Competition is genuinely frozen-and-unopened,
      and naming one that has since been opened everywhere but in a fixture is how a test
      stops meaning what its name says. The Fixtures and Entrants endpoints gained a
      matching 200 beside their 404s, so those 404s say "unserved" rather than "this
      endpoint answers nothing".*
- [x] The pinned sha and the date it was read are recorded in the prompt registry's
      comment, the way every Competition's are.
      *With the two things this entry has and no other does: which gates were open when
      it was read, and that `squadChanges` is the one gate that will never open — a
      national side has no transfer window, so this render's absence is the freeze's
      final state rather than a pin waiting for a source.*

## The decision this ticket was asked to make

Ticket 0073 left exactly one thing open and named it: the head-to-head section, which
replacing the league's history section took away. Build it, or state its absence, and
doing neither was the one option it refused.

**Built.** `international_results` holds the answer — two national sides have usually
met — so a stated absence over a table that can answer would be an absence that is not
true. The cost is three lines over a list the builder already has: the merged
dataset-and-record matches, filtered to the pair, newest first, capped at the same five
the form lines carry. Score-only, on the league section's own rule: an outcome letter is
relative to a side and performance signals belong on the form lines, where recent
performance is what the section is for. `matchLine` gained the optional `team` the league
builder's has had all along, and renders the tail only where a side is named.

**Two further decisions the boxes did not spell out.**

The Squad Changes absence is dispatched on the registry and not on the transfer-window
table. `squadChangeWindow` also answers `undefined` for a cup — no window is written down
for one — and the section would have been absent either way. But that is the same answer
a league between two windows gives, and a reader cannot tell "this Competition has no
window" from "this Gameweek is outside one" from an `undefined`. It is ticket 0074's rule
about the two Head Coach stores, applied to the third pair: which of the two a
Competition gets is one fact, written in one place. The runbook's "Edit 0 moves it too,
for a cup" paragraph now says three places rather than two.

The league-table absence and the Season's results line live **inside** the
recent-internationals section, where the league puts its table and its coverage
statement, rather than in a section of their own. The section is what replaced the
league's history section; the absence of a table is a fact about that replacement, and
a packet that stated it somewhere else would make a reader assemble one thought from two
places.

**What the render says, read whole.** The cup's packet opens with the Fixture line and
"Predict this UEFA Nations League Fixture."; then the internationals section — the
league-table absence, the Season's results, ADR-0043's base rates over non-neutral
internationals, each side's xG rates and five most recent matches, the head-to-head, and
the dataset's date; then the Squad Changes absence; then the Head Coach section with its
window sentence, each side's holder and any Change. No availability section, as for every
non-`PL` Competition (ADR-0037). The instruction block closing it is the shared
template's, byte-identical to the Premier League's.

## Found beside the work

- **Two frozen sentences are constants now, and the second was a rule applied one way.**
  "No prior meeting in stored data." was extracted at its second caller, which is this
  project's own rule: the sentence is the same fact in two Competitions' packets, and a
  change made in one place would have them wording one absence two ways. "no result has
  been played yet this Season." was then declared as a *local* constant in the cup's
  builder while two literals of it stood in `build-historical-context.ts` and
  `build-fpl-track-context.ts` — the same rule, not applied, to the one sentence this
  ticket argues hardest must be identical everywhere ("the same sentence and not a cup's
  own wording"). **Found by review, as a hard violation, and it was one.** `NO_RESULT_YET`
  is now exported from `build-historical-context.ts` beside `NO_PRIOR_MEETING` and used
  by all three sections, each keeping its own prefix. No bytes moved: the five league pins,
  the FPL track's own checksums and every packet test are unchanged, which is what says
  this was an extraction and not an edit.
- **Two tests in the render seam were counting leagues and calling it counting
  Competitions.** "Names a Competition the same way its divisions do" asserted that every
  Competition with a frozen Prompt Version has curated divisions, and a cup has none by
  nature — a national side plays in no Division and migration 0042 keeps its results out
  of `historical_matches` altogether. The count is still exact rather than weakened to
  non-zero: it is now the number of Competitions whose registry names football-data.co.uk
  for their history, which is the same claim about the leagues that the bare length made,
  and one a cup cannot soften. "Lists a Season article for every Competition" became
  "for every league, and none for a cup", asserted in both directions — a title listed
  for a national side would be a page that 404s, which is the failure that test's en dash
  exists to prevent, arrived at from the other end.
- **The section's heading now covers more than it names, and that is decided rather than
  deferred.** "Recent internationals as of …" heads a block that also states the missing
  table, the Season's coverage, the base rates and the head-to-head. Kept, and kept
  knowingly: this is a decision that had to be taken *before* the freeze, because a
  heading is rendered text and renaming it after the pin is taken moves the sha — and
  after the first Lock it cannot be taken at all (ADR-0026). The reasons are that the
  block is the cup's history section under another name, its body is mostly what the
  heading says, and the league's own heading is generic for exactly the same reason. The
  alternative — a generic "Cup context as of …" — buys a line and a half of accuracy and
  costs ticket 0073's wording, its tests and the name every document uses for this
  section. **Raised by review; the answer is the one above, and it is final for this
  Prompt Version.**
- **Nineteen mutations, all nineteen died — but the first fifteen over-claimed and the
  review caught it.** The round-one set covered each new assertion, both branches of the
  Season's results line, both directions of the head-to-head filter, its ordering, its
  absence sentence, the optional-`team` match line, and all three ways the Squad Changes
  dispatch can be wrong (never fires, always fires, falls back to the window). This
  ticket claimed the head-to-head **cap** among them and it was not there: no test seeded
  more than two meetings, the pin's fixture seeds two, and the "no sixth" test at the top
  of the file is the *form lines*' cap. Deleting `.slice(0, RECENT)` would have been
  caught by the pin alone — which is the one thing this ticket said had not happened.
  **Found by review.** A six-meeting case now closes it, alternating ends so the
  both-directions filter is walked six times, and round two killed four more mutants: the
  cap removed, the cap widened to six, the shared Season sentence reworded, and the FPL
  track dropping it. Every mutation is now killed by at least one test that names the
  behaviour it broke.

## What this ticket did not do

- **No migration.** Nothing here writes a row. The four pending on production — `0042`,
  `0043`, `0044`, `0045` — are still pending, and `npm run db:rehearse` still has to be
  re-run before an operator applies any of them
  (`docs/runbooks/the-competition-migration.md` §2).
- **The `competitions` insert and `roster:enter`.** Ticket 0076's, and the first step
  that spends money. `UNL` is served by the dashboard and has no row, which is the state
  every league passed through between its freeze and its activation.
- **A real production render.** Impossible before that insert: `context:show` needs a
  `UNL` Gameweek and there is none, and migrations `0042`–`0045` are not applied there
  either, so `international_results` and `national_team_head_coaches` do not yet exist in
  production. The pin's reading is the suite's render, printed and read whole. The first
  live packet will hash differently from this pin and must — different sides, different
  results — exactly as the Premier League's `f61c8fb4` does against `4e3d03b3`.
  **The consequence is worth stating plainly:** every wording this render freezes — the
  base-rates line over real dataset rows, the xG rates over real sheets, the head-to-head
  over real meetings — meets real data for the first time *after* ticket 0076's insert,
  with ADR-0026 as the only net, and that net closes at the first Lock. The render was
  read line by line over deliberately shaped fixtures precisely because that is the only
  reading available before the money is spent. **Raised by review.**
- **A second 200 case for an opened Competition.** Not needed and checked rather than
  assumed: `PD` carries a `competitions` row in `test/dashboard-read-api.test.ts` and
  asserts 200 with its own rows, so the three states are each covered — opened answers
  200 with content (`pd`), served-but-unopened answers 200 empty (`unl`), unserved
  answers 404 (`xx`). `bl1` is now named only in comments there, and it is named as
  history rather than as a claim. **Checked after review.**
- **Renaming the section heading**, and **listing the Season's Fixtures a second time**:
  both argued above rather than done.
- **The nested ternary in the daily fetch's schedule dispatch.** Still waiting for a
  third *schedule* source. This ticket added no source at all.
- **The full suite.** Fifty-one suites — every file this ticket touched, every one that
  reads the prompt registry, the source registry or the context builder, and, after the
  shared Season sentence was extracted, every one that renders an FPL-track packet — were
  run green, 793 tests across the two sets, and `tsc` is clean. A whole-suite gate run is
  still the user's call.
