# Ticket: The record says where each Edition begins

**What to build:** a migration adds the Editions table — one row per (Competition,
Season, Edition, first Gameweek) — and seeds it with every Competition's Edition 1 at
Gameweek 1, the Nations League included; a read helper answers, for a Competition and a
Gameweek, which Edition that Gameweek belongs to and when that Edition's first Lock was,
reading the Lock off `gameweeks.deadline_at` rather than storing it twice. After this
ticket every Competition is in Edition 1 and nothing observable changes. Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md), *What
the record holds*. Decisions it must not bend: the `competitions` table's own discipline
from the competition-dimension migration (presence is the fact, no flag to disagree with
the rows), and the trigger that makes `gameweeks.deadline_at` immutable once a Fixture
locks into its Gameweek — which is exactly why it can be the Edition's first Lock.

**Blocked by:** None — can start immediately.

**Status:** drafted, 2026-09-22

---

## What is already known

**A row for Edition 1, not an absence.** The switcher and every read that asks "which
Edition" read the table; a missing row is a Competition the migration missed, not an
implicit first Edition. The seed inserts Edition 1 for the six Competitions the domain
lists, whether or not each is Active — `UNL` gets its row now so that opening the cup
(ticket 0076) does not have to remember to.

**The first Lock is derived.** Edition N's first Lock is `deadline_at` of its first
Gameweek in `gameweeks`. A Gameweek not fetched yet has no row, and the helper says so
rather than inventing a date; the predict path never needs an Edition whose first
Gameweek has not landed, because a Gameweek is predicted only after it is fetched.

**Which Edition a Gameweek is in** is the row with the greatest first Gameweek at or
below it. Edition 1's first Gameweek is 1, so every Gameweek is in some Edition.

**A new migration is five test-list edits.** The migration filename lists live in two
suites (the migrations suite and the migration rehearsal); a targeted run does not find
the rehearsal. Run both by name.

**Nothing else moves here.** No read site starts filtering by Edition (ticket 0084), no
seat is withdrawn (ticket 0083), no page changes. The dashboard's build must produce the
same bytes before and after.

## Acceptance

- [ ] Migration creates the Editions table keyed by (Competition, Season, Edition) with
      a first Gameweek per row, and inserts Edition 1 at Gameweek 1 for `PL`, `PD`, `SA`,
      `BL1`, `FL1` and `UNL` for `2026-27`. Row-level security is enabled as on
      `competitions`.
- [ ] The migrations suite and the migration rehearsal both list the file and both pass;
      the rehearsal proves the migration applies over a copy of the production schema.
- [ ] A helper returns, for (Competition, Season, Gameweek), the Edition number and the
      first Gameweek; a second returns the Edition's first Lock from `gameweeks`, and says
      "not fetched yet" for a first Gameweek with no row. Tests cover a Competition with
      one Edition, one with two, and the unfetched case.
- [ ] A test holds that every Competition the domain lists has an Edition 1 row after the
      migration, so a seventh Competition cannot be added to the domain without one.
- [ ] No read-api response, no page and no CLI output differs from before this ticket.
