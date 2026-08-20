# Tickets: The Head Coach in post joins the match context

Five tracer-bullet slices that put a name to whoever picks each team, so that an Entrant's
read of a Fixture stops depending on how recent its training data is. Source:
[spec 0021](../../specs/0021-the-head-coach-in-post-joins-the-match-context.md). Vocabulary:
[CONTEXT.md](../../../CONTEXT.md), including the two entries ADR-0045 split apart — **Head
Coach** and **Head Coach Change**. Decisions:
[ADR-0045](../../adr/0045-the-packet-names-who-picks-each-team-not-only-who-changed.md),
overturning one sentence of
[ADR-0044](../../adr/0044-head-coach-changes-join-the-match-context-racing-the-freeze.md).

Bound to a Lock rather than a date. Slice 1 is the only one that can land under any
freeze, because it changes a sentence rather than the packet's shape; slices 2 to 5 move
both sha pins and therefore belong to whichever version boundary they reach — the
restarted versions if they arrive before the earliest restarted Lock, the next boundary
otherwise, both Competitions together either way (ADR-0038).

Slice 1 is first and alone because it is the fallback the ADR names: it fixes today's bare
heading whether or not anything below it ever lands, and it is worth having on its own.
Slice 2 is the prefactor and sits ahead of everything, because it is the one edit that can
disturb a shipped pipeline — Squad Changes reads the same wikitext module — and an edit
like that belongs where a failure has nothing stacked on top of it. Slices 3, 4 and 5 are
the ordinary store-fetch-render spine, in that order, because each proves the one before
it against real bytes.

---

## 1 — The bare heading says what it means

**What to build:** A reader of a packet where neither club changed Head Coach sees a
finished sentence rather than a heading with nothing under it. The words describe the
record, not football, so they stay true whether nobody changed or nothing was fetched.

**Blocked by:** None — can start immediately, and nothing waits on it.

**Moot, and never landed — recorded 2026-08-20.** Slice 5 landed first and dissolved the
branch this slice would have added: every club now renders a Head Coach line, so no packet
reaches a reader with a heading and nothing under it, and there is nowhere left to put
`none recorded`. The boxes below are left unticked rather than ticked or deleted — they
describe a fallback the ADR named for the case where slice 5 did not land in time, and it
did.

- [ ] Where the partition holds no Head Coach Change for either club, the section reads
      `none recorded` — the phrase the Squad Changes section already uses for a direction
      with nothing in it — rather than a heading followed by a blank line.
- [ ] The wording is not a claim about football. **"Neither club has changed Head Coach
      this Season" must not be used**: it is false whenever a fetch has not landed, as it
      silently was in production on 2026-08-19 between migration 0032 and the first fetch
      that filled the table.
- [ ] A club with no Change while the other club has one still costs no line, unchanged.
- [ ] The section stays absent for a Competition and Season with no listed article,
      unchanged.
- [ ] A render test holds the new line whole, so the sentence cannot drift into a
      substring match.
- [ ] It is recorded — in this ticket — that both sha pins move with this, and that the
      pins are re-taken from real renders rather than from a test's.

## 2 — The shared wikitext reader learns one more wrapper

**What to build:** The reader that both Wikipedia pipelines use strips `{{nobreak}}`, which
La Liga wraps its personnel cells in and the Premier League does not. Squad Changes,
which reads the same module, is proven unmoved by the widening.

**Blocked by:** None — can start immediately, in parallel with 1.

- [x] `{{nobreak}}` is stripped wherever the reader strips the wrappers it already knows,
      including where it wraps one of the flag templates it already handles — the
      direction La Liga writes, `{{nobreak|{{flagicon|ESP}} …}}`. Flags come off first
      because `[^}]*` dies on the inner brace.
- [x] The widening is pinned by assertions of its own beside the shapes already pinned —
      the discipline the first extraction's review established, after that widening
      shipped pinned by nothing and survived on luck.
- [x] An edge where the wrapper must **not** eat text is pinned too, in the manner of the
      existing `Sacked|and rehired` case: text that merely looks like a wrapper survives
      whole.
- [x] Both Squad Changes suites pass unchanged, run and reported rather than assumed:
      `fetch-squad-changes` and `build-squad-changes-context`, 36 tests, all passing on
      2026-08-20 with `--exclude '**/.claude/**'`.
- [x] The Head Coach Change suites pass unchanged: `fetch-head-coach-changes`,
      `build-head-coach-changes-context` and `wikitext`, 44 tests, same run and the
      same exclude. A first count of 134 included copies under `.claude/worktrees`
      that the root config globs in; 36 and 44 are this branch's own.

Known and deliberately not reached here, because slice 4 is what brings a real table to
test them against: the redirects `{{nobr}}` and `{{nowrap}}` name the same template —
La Liga writes one and four of them, the Premier League nineteen, none of the Premier
League's inside "Personnel and kits" — and a `{{nobreak}}` wrapping any template the
replaces above it do not remove, `{{sortname}}` today, mispairs its braces and leaves raw
wikitext in a name. Every one of the 97 wrapped cells in either article is a flag.

Slice 4 read both personnel tables and needed none of them: neither `{{nobr}}`,
`{{nowrap}}` nor `{{sortname}}` appears inside either table, so the reader is still
unwidened and these stay deferred with no slice yet asking for them.

## 3 — A store for who is in post

**What to build:** The record can hold each club's Head Coach for a Gameweek, with the
instant the row was observed, and it refuses to outlive the Lock it was fetched for.

**Blocked by:** None — can start immediately; slices 4 and 5 need it.

- [x] A per-Gameweek partition beside the Head Coach Change store, scoped by Competition,
      Season and Gameweek, carrying the club, the Head Coach and the instant observed —
      and nothing else. Not a column on the Change store and **not a third `direction`**:
      those rows are events with a direction, a manner and a date, and an incumbent has
      none of the three. Migration `0033_the_head_coach_in_post.sql`, table
      `head_coaches`, one row per club per Gameweek where the Change store deliberately
      allows a club two.
- [x] The observed instant is the whole of the pre-Lock guarantee, because this source
      carries no dates. It is stored so the guarantee can be checked rather than inferred
      from the fetch's schedule — by the same two triggers 0018 and 0032 carry, named
      `head_coach_precedes_deadline` and `gameweek_deadline_preserves_head_coach_lock`.
- [x] The migration is covered by the schema, migration and rehearsal suites the way
      migration 0032 is: 36 tests in `schema`, 9 in `migrations` and 4 in
      `rehearse-migration`, all passing on 2026-08-20 with `--exclude '**/.claude/**'`.
- [x] The rehearsal reports every table it compares came back whole — the ten
      `COMPARED_TABLES` names, not the whole record — run against a copy of the record
      before anything touches production: 76 Gameweeks, 760 Fixtures, 593 Squad Changes
      and 30 Head Coach Changes, every one back whole, on 2026-08-20.
      `head_coach_changes` was outside that list until this slice — the list is now
      guarded against a table younger than the copy, so a store can be named by the pass
      that creates it rather than a pass later, and a misspelt name raises there instead
      of being skipped into a green run that compared nothing.

## 4 — The incumbents are read off the page already archived

**What to build:** The Gameweek's partition fills from the season article the Head Coach
Change fetch already downloads, so naming twenty coaches costs a parser and not a second
fetch — the fact that overturned ADR-0044's rejection.

**Blocked by:** 2, 3.

- [x] Both articles' per-club tables are found and parsed: the Premier League's under
      "Personnel and kits", La Liga's under "Personnel and sponsorship", twenty clubs each,
      from the archived bytes rather than a live page. Both headings are quoted whole and
      tried in order, since neither wording is more correct and a refusal has to name a
      heading that is on the page; the table finder the Change parser already had is now
      `sectionTable`, which takes the headings it is looking for and returns the one it
      found, so every refusal below is filed under the article's own word.
- [x] Only the club and the Head Coach are taken. The captain, the kit manufacturer and
      the sponsors are in the same rows and none of them is read — asserted as the two
      keys a parsed row has, so a third cannot be added without the test saying so.
- [x] A table whose header moved refuses with the source named, exactly as the Change
      parser does — a reordered column must stop the parse rather than file a captain as a
      Head Coach. Only the leading `Team` and `Manager` are pinned, because the two
      articles part company after them and name their sponsor columns differently; a row
      that is not the header's width is refused separately, so an inserted column is a
      refusal rather than a shifted read. Neither article spans a cell in this table, which
      is why the Change parser's `rowspan` carrying is not reused here; a cell that starts
      spanning leaves the row below it short, and a test pins that as a refusal rather than
      a row read one column out of step.
- [x] A club that does not resolve stops the parse. Both suites assert the twenty
      resolved clubs against the Competition's whole roster, and La Liga's Team cells
      carry no link at all — `{{nobreak|Alavés}}` resolves by displayed name alone. All
      forty clubs resolve against the identity map as it already stood, with nothing added
      to it, although that map was built against the Change tables and had only ever been
      asked about clubs that changed.
- [x] The gate on a club is the **Season's roster**, not the identity map, and that is a
      widening of what the shipped half needs: `pinned` is built from the Fixtures already
      stored, the personnel table names all twenty clubs where the changes table names
      only the ten that changed, and both parsers run before the transaction opens. So a
      Competition whose Fixtures are still arriving now fails whole — the Changes that
      would have been stored are not — where before this slice it stored them. Refusing is
      this ticket's rule and stands; a test pins the fetch failing whole and naming the
      club, so the mode is recorded rather than discovered in an incident. A full schedule
      gives every club a home Fixture, which is why it has not been seen.
- [x] Rows land in the rendering Gameweek's partition, scoped by Competition so one
      league's fetch cannot empty another's, written in the same transaction as the
      Changes and by the same delete-then-insert over the partition. Both halves of that
      are proved at the seam and not only in the parser: a re-fetch of the same Gameweek
      replaces the twenty rows it already stored — mutation-checked, the suite goes red
      with the `delete` taken out — and a personnel table whose header moved is refused
      with the source named, leaving the Gameweek already stored whole.
- [x] The source's word "Manager" is quoted only where the header is being matched;
      everything this slice names is Head Coach, the column index included — a review of
      the first draft caught a `MANAGER` constant that is now `HEAD_COACH`.
- [x] The suites pass, run and reported rather than assumed, on 2026-08-20 with
      `--exclude '**/.claude/**'`, counted per file so the total can be checked back:
      `parse-head-coaches` 9 and `fetch-head-coach-changes` 22, with `wikitext` 18,
      `daily-fetch` 9, `fetch-squad-changes` 25, `build-squad-changes-context` 11 and
      `build-head-coach-changes-context` 9 unmoved beside them — 7 files, 103 tests, all
      passing.

## 5 — One section, the incumbent and what changed

**What to build:** A Fixture's packet names both clubs' Head Coach, with that club's
Changes beneath the incumbent they explain, so an Entrant assembles one fact in one place
instead of two.

**Blocked by:** 4.

- [x] Each club renders its Head Coach, then its Change lines where the Season has any, in
      the manner the Change section already uses. The section is one and its heading says
      so: `Head Coach and changes this Season:`, with each club's block reading its name,
      `Head Coach: <name>`, then the `In` and `Out` lines the Change section already
      wrote. The module is `build-head-coach-context.ts` now — the old
      `build-head-coach-changes-context.ts` named only half of what it renders.
- [x] A club with no stored Head Coach renders an announced Gap, not a blank:
      `Head Coach: unavailable; no Head Coach is readable for this Gameweek.` The sentence
      states what the render could reach rather than what the record holds, and that is
      the whole of the correction below: three states end at this line — no fetch landed,
      a fetch landed short, and a row landed but was observed after the deadline — and
      only the first two are "nothing is stored". It never says the club has no Head
      Coach, which would be a claim about football of the kind ADR-0045 struck out of this
      section's other empty state.
- [x] A club with no Change carries no Change lines under its incumbent, because keeping a
      Head Coach is ordinary.
- [x] A Head Coach row observed after the deadline the context is built for is not read,
      so a sacking on the morning of the match cannot reach a packet that predates the
      Lock. Held at the read as well as at the write, and the write is already covered
      both ways round — migration 0033's `head_coach_precedes_deadline` refuses the row
      and `gameweek_deadline_preserves_head_coach_lock` refuses the deadline being moved
      back over one. So this filter is the same rule held twice and not a hole in the
      triggers; it lives here because the deadline lives here, beside the bound this
      section already puts on the Changes.
- [x] The section stays absent for a Competition and Season with no listed article.
- [x] Slice 1's `none recorded` branch is gone or unreachable: both clubs always render a
      Head Coach line, a name or the Gap, so the heading can no longer be the whole
      section. Slice 1 never landed and is now moot — see its own boxes.
- [x] Every sentence the section can say is a render test's expected line, whole rather
      than by substring: the name, the Gap, the Gap standing in for a row observed after
      the deadline, and a club that kept its Head Coach. Every one is a whole-render
      `toBe`, the Gap cases included, so a stray line under a club cannot survive the way
      it would under a `toContain`. `predict-gameweek` holds the
      packet where nothing is stored and both clubs announce the Gap; `preflight` holds
      the packet where both are named and one has Changes.
- [x] Both sha pins stand against a real render carrying the section, read on
      2026-08-20 with migration 0033 applied to production and a fetch landed. **The box
      asked for something that cannot happen, and the measurement is what showed it.**
      A pin is the suite's render by construction: the checksum tests hash
      `buildMatchContext` over the suite's own Fixture and Competition data, so a number
      lifted from a production packet — other clubs, other results — fails them on the
      next run. Measured through the same code path `predictGameweek` hashes with: the
      Premier League's live packet is `f61c8fb4` against the pinned `4e3d03b3`, La Liga's
      `94deaa1c` against `44df40bd`, and no builder change can bring either pair
      together. What a real render is for is reading, which is how both of `PD`'s earlier
      sha moves were found — an empty history section, a league table reading
      `unavailable` — each fix moving the builder, the builder moving the suite's render,
      the render moving the pin. So the numbers did not move here and should not have:
      both Competitions rendered with every club naming its Head Coach and no packet
      carrying the unavailable line, and that reading is what the pins now stand on.
      Ticket 0020's box 6 closed on the same act and carries the same note.

### What slice 5 landed — recorded 2026-08-20

**The rename was the honest half of the diff.** `buildHeadCoachChangesContext` renders the
incumbent first now, so it is `buildHeadCoachContext` in
`src/context/build-head-coach-context.ts`, with `test/build-head-coach-context.test.ts`
beside it. Slices 2 and 4 above name the old path in their run records; those records read
true when they were written and are left as they were.

**Both clubs always render, and that is what dissolves the empty heading.** `clubSection`
no longer returns nothing for a club with no Change — it returns the club's name and its
Head Coach line unconditionally, and the Change lines only where there are Changes. There
is no branch left in which the section is its heading alone.

**The observed bound is a filter at the read, not a `where` in the query.** It sits beside
the Changes' `dated_on` bound in the same builder, where a reader comparing the two
guarantees can see both: one is about when the fact was dated, the other about when the row
arrived, and ADR-0045 is explicit that the second is the weaker claim.

**Test counts, per file, on 2026-08-20 with `--exclude '**/.claude/**'`:**
`build-head-coach-context` 9, `openrouter-entrant` 6, `preflight-base-models` 15,
`predict-gameweek` 28, `competition-context-contamination` 3, with `fetch-squad-changes`
25 and `build-squad-changes-context` 11 unmoved beside them — 7 files, 97 tests, all
passing. `tsc --noEmit` clean.

**The window this landed in.** Before the freeze, which is the condition this ticket binds
slices 2 to 5 to rather than a date: the Premier League's first restarted Lock is
2026-08-21T17:30Z and this landed on 2026-08-20, so it is part of the restarted versions
and both Competitions take it together (ADR-0038). What is still outside the window is the
real-render re-pin above, which cannot happen until production has migration 0033.

**The review found two comments claiming what the code and the schema do not.** The Gap
sentence said "none is stored" over a case the suite itself seeds as stored-but-unreadable,
and the filter's comment named a hole in the triggers that migration 0033 does not have.
Both are corrected, in the boxes above and in the code, and both were caught before the sha
moved for the last time. This is the fourth time in this module family that a comment has
asserted a behaviour its subject does not have; the pattern is a comment written from the
change's intent rather than read back off what shipped.

**A third hash moved with the two pins.** `predict-gameweek` asserts the stored context's
own sha beside the body it stores; adding lines to every packet moves it, and it is
`e078ec32` now. It is not a frozen pin — it is the hash of the body the same test spells
out — but it is a value that has to be re-taken by hand when the packet changes. It is
`d04dd751`.

## Not in these slices

Captains, kit manufacturers and sponsors from the same table; Competitions with no listed
season article; the FPL track; backfilling incumbents into Gameweeks already rendered; and
any statement about a Head Coach beyond his name — tenure, record or style are digests and
ADR-0018 keeps them out.
