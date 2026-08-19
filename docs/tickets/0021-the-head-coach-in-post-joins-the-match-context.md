# Tickets: The Head Coach in post joins the match context

Five tracer-bullet slices that put a name to whoever picks each team, so that an Entrant's
read of a Fixture stops depending on how recent its training data is. Source:
[spec 0021](../specs/0021-the-head-coach-in-post-joins-the-match-context.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md), including the two entries ADR-0045 split apart — **Head
Coach** and **Head Coach Change**. Decisions:
[ADR-0045](../adr/0045-the-packet-names-who-picks-each-team-not-only-who-changed.md),
overturning one sentence of
[ADR-0044](../adr/0044-head-coach-changes-join-the-match-context-racing-the-freeze.md).

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

## 3 — A store for who is in post

**What to build:** The record can hold each club's Head Coach for a Gameweek, with the
instant the row was observed, and it refuses to outlive the Lock it was fetched for.

**Blocked by:** None — can start immediately; slices 4 and 5 need it.

- [ ] A per-Gameweek partition beside the Head Coach Change store, scoped by Competition,
      Season and Gameweek, carrying the club, the Head Coach and the instant observed —
      and nothing else. Not a column on the Change store and **not a third `direction`**:
      those rows are events with a direction, a manner and a date, and an incumbent has
      none of the three.
- [ ] The observed instant is the whole of the pre-Lock guarantee, because this source
      carries no dates. It is stored so the guarantee can be checked rather than inferred
      from the fetch's schedule.
- [ ] The migration is covered by the schema, migration and rehearsal suites the way
      migration 0032 is.
- [ ] The rehearsal reports every existing table came back whole, run against a copy of
      the record before anything touches production.

## 4 — The incumbents are read off the page already archived

**What to build:** The Gameweek's partition fills from the season article the Head Coach
Change fetch already downloads, so naming twenty coaches costs a parser and not a second
fetch — the fact that overturned ADR-0044's rejection.

**Blocked by:** 2, 3.

- [ ] Both articles' per-club tables are found and parsed: the Premier League's under
      "Personnel and kits", La Liga's under "Personnel and sponsorship", twenty clubs each,
      from the archived bytes rather than a live page.
- [ ] Only the club and the Head Coach are taken. The captain, the kit manufacturer and
      the sponsors are in the same rows and none of them is read.
- [ ] A table whose header moved refuses with the source named, exactly as the Change
      parser does — a reordered column must stop the parse rather than file a captain as a
      Head Coach.
- [ ] A club that does not resolve through the existing identity map stops the parse. The
      map was built against the Change tables and has only ever been asked about clubs
      that changed, so every club in both personnel tables is exercised.
- [ ] Rows land in the rendering Gameweek's partition, scoped by Competition so one
      league's fetch cannot empty another's.
- [ ] The source's word "Manager" is quoted only where the header is being matched;
      everything this slice names is Head Coach.

## 5 — One section, the incumbent and what changed

**What to build:** A Fixture's packet names both clubs' Head Coach, with that club's
Changes beneath the incumbent they explain, so an Entrant assembles one fact in one place
instead of two.

**Blocked by:** 4.

- [ ] Each club renders its Head Coach, then its Change lines where the Season has any, in
      the manner the Change section already uses.
- [ ] A club with no stored Head Coach renders an announced Gap, not a blank: every club
      has one, so a missing name is the record failing and the packet says so.
- [ ] A club with no Change carries no Change lines under its incumbent, because keeping a
      Head Coach is ordinary.
- [ ] A Head Coach row observed after the deadline the context is built for is not read,
      so a sacking on the morning of the match cannot reach a packet that predates the
      Lock.
- [ ] The section stays absent for a Competition and Season with no listed article.
- [ ] Slice 1's `none recorded` branch is gone or unreachable, because every club now has
      a Head Coach and no packet can reach a reader with a heading and nothing beneath it.
- [ ] Every sentence the section can say is a render test's expected line, over production
      data read by eye before the pins move.
- [ ] Both sha pins are re-taken from real renders carrying the section.

## Not in these slices

Captains, kit manufacturers and sponsors from the same table; Competitions with no listed
season article; the FPL track; backfilling incumbents into Gameweeks already rendered; and
any statement about a Head Coach beyond his name — tenure, record or style are digests and
ADR-0018 keeps them out.
