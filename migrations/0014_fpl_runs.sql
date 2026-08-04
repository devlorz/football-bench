-- Records completion of the deadline-relative FPL action run, as
-- `prediction_runs` does for the Match track's two. The scheduler polls
-- because GitHub Actions cron cannot be expressed relative to a deadline
-- stored in Postgres; this ledger makes polling and retries safe.
--
-- A separate table and a separate scheduler, though both tracks lock at the
-- same instant (ADR-0006). One ledger would make one run serve both, and the
-- FPL prompt is several times the Match prompt's size: an FPL Gameweek that
-- ran long or failed would hold up Predictions that were ready to write. The
-- Lock they share is the deadline, not the run.
--
-- No `trigger` column, where `prediction_runs` has one. The Match track's fill
-- is a second scheduled run because Predictions are insert-only and a Gap can
-- only be closed by asking again; an FPL run already skips every Entrant that
-- holds the Gameweek, so re-running *is* the fill. What reaches it is the
-- retry this ledger already describes: `completed_at` stays null, and the next
-- poll picks the Gameweek up with `attempt_count` raised.

create table fpl_runs (
  season        text not null,
  gw            integer not null,
  scheduled_for timestamptz not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  attempt_count integer not null default 1,
  last_error    text,
  primary key (season, gw),
  foreign key (season, gw) references gameweeks(season, gw)
);

alter table fpl_runs enable row level security;
