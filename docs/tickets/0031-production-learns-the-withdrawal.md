# Ticket: Production learns the withdrawal

**What to build:** production holds the same schema the code reads and the same withdrawal
dates the reads look for, before the first FPL run of the Season. Source:
[spec 0023](../specs/0023-seven-seats-open-the-fpl-track.md), story 19.

**Blocked by:** 0028 — the migration and the entry door are its output.

**Status:** operator — touches production.

This project has a recurring history of migrations that merged and were never applied, and
the failure mode here is quiet in exactly the wrong way: the reads would fail on a missing
column at the moment the track opens, next to a Lock, with no time to diagnose. The check
is cheap and it comes first.

- [x] Production's migration record is diffed against the repository's before anything is
      trusted, and any drift found is reported rather than silently applied past. `db:rehearse`
      did both at once: production stood at `0033`, one migration behind, and `0034` applied
      cleanly over a copy of the live record — 2,996 rows across ten tables, every one back
      whole. No drift.
- [x] The migration is applied to production. `Applied 1: 0034_a_seat_leaves_a_track_without_leaving_the_record.sql`
- [x] The FPL entry door is run against production, so the withdrawal dates land where the
      reads look for them. `roster:enter:fpl` seated all ten and stamped the three.
- [x] The standing seats are confirmed to read back at the expected size — **seven**, read
      through the same filtered query the Lock will use: `context:show:fpl` against production
      names `fpl/claude-opus-5`, `fpl/deepseek-v4-pro`, `fpl/gemini-3.1-pro-preview`,
      `fpl/gpt-5.6-sol-pro`, `fpl/grok-4.6`, `fpl/kimi-k3` and `fpl/muse-spark-1.2`, and none
      of the three that left. That absence is the dates having landed.
- [ ] The withdrawn seats are confirmed to still hold their attempts and their contexts.
      Needs a direct read of the two tables, which is the operator's to run.
- [x] Everything that has a script uses it — the migration runner and the FPL entry door —
      and the connection string is set explicitly rather than inherited, because `.env`
      points at production. The migration-record diff has no script and is a direct read,
      as the pre-cron checklist itself performs it; that is the one session opened by hand
      and it writes nothing.

## Not in this ticket

**Opening the FPL track.** That is a paid run and a separate decision; this ticket only
makes the database ready for it.

**Backfilling anything.** The column arrives null everywhere and the door writes the only
non-null values there are.
