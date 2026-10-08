# Ticket: The seed accepts the rows a migration wrote

**What to build:** `seed-season` runs again on a freshly migrated empty database. Since
migration 0048 (ticket 0082) a migrated empty database is no longer empty: `editions`
holds six Edition 1 rows the migration itself wrote, and the seed's empty-database check
refuses it — two tests in the seed's suite have been red since 2026-10-06 with "The seed
needs an empty database, and this one already holds editions". The check learns the
difference between a record and migration bookkeeping, the seed's own Season gets its
Edition 1 rows, and both tests are green again without weakening the refusal the check
exists for. Source: ticket 0083's evidence ("Both fail identically on HEAD `09a8c61` in a
clean worktree, from migration 0048's seeded rows, not this change"). Decisions it must
not bend: the seed's own contract — it never empties anything on the way past, and it
checks every table rather than the ones it writes, so a table some other job reads
cannot hold stale rows unnoticed; ADR-0061 *What the record holds* (an Edition 1 row is
a fact, never an absence).

**Blocked by:** None — can start immediately.

**Status:** drafted, 2026-10-08

---

## What is already known

**What changed is the meaning of "empty", not the check.** The check already excludes
`schema_migrations` on the stated ground that it is "the one table a migrated empty
database is meant to have rows in". That ground now covers a second table, and the
honest rule is the ground, not the name: rows a migration wrote on an empty database are
bookkeeping, and a database holding only those is empty for the seed's purpose. The
check says so in its comment and excludes `editions` by that rule — and says why a
by-hand list is still acceptable here: it is the list of tables migrations seed, which
is reviewed every time a migration lands (ticket 0082's acceptance named its rows),
not the list of tables the seed writes, which the comment rightly refuses to maintain.

**The seed's Season needs its own Edition 1 rows, or it has none.** Migration 0048 seeds
`2026-27` only, and its prose says "whatever opens the next one inserts its Edition 1
rows with it — until then `readEdition` refuses that Season". The seed opens a Season;
if that Season is `2026-27` the rows are already there and the seed must not write them
twice; if it is another label the seed writes them, one per Competition it seeds, so
that the design mock is in Edition 1 the way production is. Which case applies is read
off the seed's Season constant, and the test holds the right one.

**The refusal keeps its teeth.** A database holding a row in any table a migration did
not seed — a Fixture, a seat, a `historical_matches` row — is still refused by name.
The test that proves it is the one already there ("refuses a database that already
holds a Season"); it goes green again and is not loosened.

**`--reset` is untouched.** Dropping and rebuilding `public` re-runs every migration,
so the rebuilt database holds exactly the bookkeeping rows and nothing else; the check
passes it as it should.

## Acceptance

- [ ] On a database that holds only what migrations `0001`–`0048` wrote, the
      empty-database check passes; on one that additionally holds any row in any other
      table, it refuses by name as before. A test covers both.
- [ ] The check's exclusion is stated as a rule in its comment — rows a migration wrote
      on an empty database are bookkeeping — and the excluded names are the tables
      migrations seed, with the migration that seeds each one named beside it.
- [ ] After the seed runs, the seeded Season has an Edition 1 row at Gameweek 1 for every
      Competition the seed opens; if the seed's Season is `2026-27` the migration's rows
      are reused and not duplicated. A test holds whichever case applies.
- [ ] The seed's suite is green in full, including the two tests red since 2026-10-06.
- [ ] `--reset` still rebuilds and passes the check; no table other than `editions` is
      newly excluded.
