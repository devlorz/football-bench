-- Records completion of the two deadline-relative Prediction runs. The
-- scheduler polls because GitHub Actions cron cannot be expressed relative to
-- a deadline stored in Postgres; this ledger makes polling and retries safe.

create table prediction_runs (
  season        text not null,
  gw            integer not null,
  trigger       text not null check (trigger in ('main', 'fill')),
  scheduled_for timestamptz not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  attempt_count integer not null default 1,
  last_error    text,
  primary key (season, gw, trigger),
  foreign key (season, gw) references gameweeks(season, gw)
);

alter table prediction_runs enable row level security;
