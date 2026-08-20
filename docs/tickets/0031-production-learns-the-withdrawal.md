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

- [ ] Production's migration record is diffed against the repository's before anything is
      trusted, and any drift found is reported rather than silently applied past.
- [ ] The migration is applied to production.
- [ ] The FPL entry door is run against production, so the withdrawal dates land where the
      reads look for them.
- [ ] The standing seats are confirmed to read back at the expected size, and the withdrawn
      seats are confirmed to still hold their attempts and their contexts.
- [ ] Everything that has a script uses it — the migration runner and the FPL entry door —
      and the connection string is set explicitly rather than inherited, because `.env`
      points at production. The migration-record diff has no script and is a direct read,
      as the pre-cron checklist itself performs it; that is the one session opened by hand
      and it writes nothing.

## Not in this ticket

**Opening the FPL track.** That is a paid run and a separate decision; this ticket only
makes the database ready for it.

**Backfilling anything.** The column arrives null everywhere and the door writes the only
non-null values there are.
