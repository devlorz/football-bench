-- The migration runner wraps each file in its own transaction.

create table models (
  id             text primary key,
  name           text not null,
  base_model     text not null,
  provider       text not null,
  quantization   text,
  prompt_version text not null,
  role           text not null check (role in ('entrant', 'reference')),
  config         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create table gameweeks (
  season       text not null,
  gw           integer not null,
  deadline_at  timestamptz not null,
  primary key (season, gw)
);

create table fixtures (
  season       text not null,
  fpl_id       integer not null,
  gw           integer not null,
  locked_in_gw integer,
  home_team    text not null,
  away_team    text not null,
  kickoff_at   timestamptz not null,
  result       jsonb,
  deferred     boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (season, fpl_id),
  foreign key (season, gw) references gameweeks(season, gw),
  foreign key (season, locked_in_gw) references gameweeks(season, gw)
);

create table contexts (
  id         bigint generated always as identity primary key,
  season     text not null,
  gw         integer not null,
  track      text not null check (track in ('match', 'fpl')),
  fpl_id     integer,
  hash       text not null,
  body       text not null,
  built_at   timestamptz not null default now(),
  constraint contexts_track_identity check (
    (track = 'match' and fpl_id is not null)
    or (track = 'fpl' and fpl_id is null)
  ),
  foreign key (season, gw) references gameweeks(season, gw)
);

create unique index contexts_identity
  on contexts (season, gw, track, coalesce(fpl_id, -1));

create table predictions (
  model_id      text not null references models(id),
  season        text not null,
  fpl_id        integer not null,
  probs         jsonb not null,
  pred_home     integer not null,
  pred_away     integer not null,
  context_id    bigint not null references contexts(id),
  rationale     text,
  attempts_used integer not null,
  predicted_at  timestamptz not null default now(),
  primary key (model_id, season, fpl_id),
  foreign key (season, fpl_id) references fixtures(season, fpl_id)
);

create table manager_states (
  model_id       text not null references models(id),
  season         text not null,
  gw             integer not null,
  squad          jsonb not null,
  team_sheet     jsonb not null,
  bank           integer not null,
  free_transfers integer not null,
  chips_used     jsonb not null,
  chip_active    text,
  rolled_over    boolean not null default false,
  attempts_used  integer not null,
  predicted_at   timestamptz not null,
  primary key (model_id, season, gw),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table attempts (
  id                bigint generated always as identity primary key,
  model_id          text not null references models(id),
  season            text not null,
  gw                integer not null,
  track             text not null check (track in ('match', 'fpl')),
  fpl_id            integer,
  attempt_no        integer not null,
  ok                boolean not null,
  error_kind        text,
  error_detail      text,
  resolved_provider text,
  resolved_model    text,
  latency_ms        integer,
  tokens_in         integer,
  tokens_out        integer,
  raw_response      text,
  trigger           text not null check (trigger in ('main', 'fill', 'manual')),
  attempted_at      timestamptz not null default now(),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table scores (
  model_id   text not null references models(id),
  season     text not null,
  gw         integer not null,
  track      text not null check (track in ('match', 'fpl')),
  metric     text not null,
  value      numeric not null,
  n          integer,
  detail     jsonb,
  scored_at  timestamptz not null default now(),
  primary key (model_id, season, gw, track, metric),
  foreign key (season, gw) references gameweeks(season, gw)
);

create table raw_snapshots (
  id         bigint generated always as identity primary key,
  source     text not null,
  sha256     text not null,
  body       text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source, sha256)
);

create function reject_immutable_row_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger predictions_are_immutable
before update or delete on predictions
for each row execute function reject_immutable_row_change();

create function require_locked_fixture_for_prediction()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from fixtures
     where season = new.season
       and fpl_id = new.fpl_id
       and locked_in_gw is null
  ) then
    raise exception 'a Prediction requires a locked Fixture'
      using
        errcode = '23514',
        constraint = 'prediction_requires_locked_fixture';
  end if;
  return new;
end;
$$;

create trigger prediction_requires_locked_fixture
before insert on predictions
for each row execute function require_locked_fixture_for_prediction();

create trigger manager_states_are_immutable
before update or delete on manager_states
for each row execute function reject_immutable_row_change();

create function reject_locked_gameweek_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a Fixture''s locked Gameweek is immutable'
    using errcode = '55000';
end;
$$;

create trigger fixture_locked_gameweek_is_immutable
before update of locked_in_gw on fixtures
for each row
when (
  old.locked_in_gw is not null
  and new.locked_in_gw is distinct from old.locked_in_gw
)
execute function reject_locked_gameweek_change();
