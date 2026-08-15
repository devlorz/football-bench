-- The match track grows a Competition dimension (ADR-0035). Until now the
-- schema was accidentally a one-league schema: La Liga's round 5 and Premier
-- League Gameweek 5 are the same `(season, gw)`, so a second league's rows
-- would not be new rows but silent overwrites -- `prediction_runs`' upsert
-- would replace one league's run record with the other's and report success.
--
-- One pass, as the ADR chose over expand-contract: the seven keyed tables --
-- `gameweeks`, `fixtures`, `contexts`, `predictions`, `attempts`,
-- `prediction_runs`, `scores` -- take `competition` into their keys, every
-- existing row is relabelled `PL` and nothing else about it changes, and
-- `fixtures.fpl_id` becomes `fixture_id` because from the next Competition on
-- the id is football-data.org's and the old name would be a lie.
--
-- The column carries `default 'PL'` and keeps it. Everything writing these
-- tables today is the Premier League path, and a default is what lets this
-- migration be a relabel with no behaviour change anywhere above it; the
-- Competition-aware write paths that follow pass it explicitly, and their
-- coexistence tests are what prove they do.

-- The vocabulary, in one place. Every column below is of this type, so a
-- Competition code is checked wherever it is written and not only where it is
-- listed -- a keyed table free to hold `EPL` would be a second league nobody
-- opened, discovered by a leaderboard that reads empty. A sixth Competition is
-- `alter domain` in the migration that opens it, which is the same edit the
-- check would have been and is made once instead of thirteen times.
create domain competition_code as text
  check (value in ('PL', 'PD', 'SA', 'BL1', 'FL1'));

create table competitions (
  competition competition_code not null,
  season      text not null,
  primary key (competition, season)
);

alter table competitions enable row level security;

-- A row is an active Competition for a Season -- presence is the fact, so
-- opening a league is an insert and closing one is a delete, with no flag to
-- disagree with the rows. The seasons are read from what the record already
-- holds rather than named here: this migration relabels a record, and a
-- database with no Gameweek in it has no Season for a Competition to be
-- active in. Deliberately no foreign key from the keyed tables to here --
-- listing a Competition is an operational act and the rows below predate it.
insert into competitions (competition, season)
select 'PL', season from gameweeks group by season;

alter table gameweeks
  add column competition competition_code not null default 'PL';
alter table fixtures
  add column competition competition_code not null default 'PL';
alter table contexts
  add column competition competition_code not null default 'PL';
alter table predictions
  add column competition competition_code not null default 'PL';
alter table attempts
  add column competition competition_code not null default 'PL';
alter table prediction_runs
  add column competition competition_code not null default 'PL';
alter table scores
  add column competition competition_code not null default 'PL';

-- The FPL track is untouched as a track (ADR-0035): it is the Premier League
-- by nature, not by accident, and gains no Competition of its own. These five
-- carry the column only because they point at `gameweeks`, whose key is
-- growing under them -- without it their foreign keys have no target and,
-- worse, the `select ... into` in each Gameweek-deadline trigger below would
-- silently pick one of several Competitions' rows.
alter table manager_states
  add column competition competition_code not null default 'PL';
alter table fpl_players
  add column competition competition_code not null default 'PL';
alter table fpl_player_points
  add column competition competition_code not null default 'PL';
alter table fpl_runs
  add column competition competition_code not null default 'PL';
alter table squad_changes
  add column competition competition_code not null default 'PL';

alter table fixtures rename column fpl_id to fixture_id;
alter table predictions rename column fpl_id to fixture_id;
alter table contexts rename column fpl_id to fixture_id;
alter table attempts rename column fpl_id to fixture_id;

-- Both primary keys are dropped with `cascade` and all twelve foreign keys
-- into them are written out again below. The alternative is naming twelve
-- auto-generated constraints, which is twelve chances to name one wrong.
--
-- What makes the cascade the safer of the two is that a key this file forgets
-- to restore is caught rather than silent: "rejects rows that refer to a
-- Gameweek that does not exist" in `test/schema.test.ts` offers every one of
-- the twelve an orphan row and requires it to be refused. That test is load
-- bearing for this decision, and a thirteenth foreign key added later has to
-- join it.
alter table fixtures drop constraint fixtures_pkey cascade;
alter table gameweeks drop constraint gameweeks_pkey cascade;

alter table gameweeks add primary key (competition, season, gw);

alter table fixtures add primary key (competition, season, fixture_id);
alter table fixtures
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);
alter table fixtures
  add foreign key (competition, season, locked_in_gw)
  references gameweeks (competition, season, gw);

alter table contexts
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);

alter table predictions drop constraint predictions_pkey;
alter table predictions
  add primary key (model_id, competition, season, fixture_id);
alter table predictions
  add foreign key (competition, season, fixture_id)
  references fixtures (competition, season, fixture_id);

alter table attempts
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);

alter table prediction_runs drop constraint prediction_runs_pkey;
alter table prediction_runs
  add primary key (competition, season, gw, trigger);
alter table prediction_runs
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);

alter table scores drop constraint scores_pkey;
alter table scores
  add primary key (model_id, competition, season, gw, track, metric);
alter table scores
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);

alter table manager_states
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);
alter table fpl_players
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);
alter table fpl_player_points
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);
alter table fpl_runs
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);
alter table squad_changes
  add foreign key (competition, season, gw)
  references gameweeks (competition, season, gw);

-- The `coalesce` form is migration 0013's and is kept for the same reason:
-- both tracks share one index and one `on conflict` target.
drop index contexts_identity;
create unique index contexts_identity
  on contexts (
    competition, season, gw, track,
    coalesce(fixture_id, -1), coalesce(model_id, '')
  );

alter table contexts drop constraint contexts_track_identity;
alter table contexts add constraint contexts_track_identity check (
  (track = 'match' and fixture_id is not null and model_id is null)
  or (track = 'fpl' and fixture_id is null and model_id is not null)
);

-- Both Lock triggers, against the new keys.
create or replace function require_locked_fixture_for_prediction()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from fixtures
     where competition = new.competition
       and season = new.season
       and fixture_id = new.fixture_id
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

-- The other one, restated rather than reasoned about. Its text does not
-- change: it reads no key, only `locked_in_gw` before and after, and the
-- `cascade` above took constraints and not triggers. Re-stating what is
-- already there is the point -- after a migration that drops both primary keys
-- of the table it fires on, "the Lock is still enforced" should be readable
-- off this file rather than deduced from what a cascade does not reach.
drop trigger fixture_locked_gameweek_is_immutable on fixtures;

create or replace function reject_locked_gameweek_change()
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

-- The four Gameweek-deadline triggers migrations 0007 and 0018 left behind
-- each look a Gameweek up by `(season, gw)`, which from here can name more
-- than one row. A `select ... into` over two rows takes one of them without
-- complaint, so these are not a rename but a correctness repair.
create or replace function require_pre_deadline_fpl_player_snapshot()
returns trigger
language plpgsql
as $$
declare
  deadline timestamptz;
begin
  select deadline_at
    into deadline
    from gameweeks
   where competition = new.competition
     and season = new.season
     and gw = new.gw;

  if deadline is null then
    raise exception 'an FPL player snapshot requires a Gameweek'
      using errcode = '23503';
  end if;

  if new.observed_at >= deadline then
    raise exception 'an FPL player snapshot must precede the Gameweek deadline'
      using
        errcode = '23514',
        constraint = 'fpl_player_snapshot_precedes_deadline';
  end if;
  return new;
end;
$$;

create or replace function preserve_fpl_player_snapshot_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from fpl_players p
     where p.competition = new.competition
       and p.season = new.season
       and p.gw = new.gw
       and p.observed_at >= new.deadline_at
  ) then
    raise exception
      'a Gameweek deadline must remain after its FPL player snapshot'
      using
        errcode = '23514',
        constraint = 'gameweek_deadline_preserves_fpl_snapshot_lock';
  end if;
  return new;
end;
$$;

create or replace function require_pre_deadline_squad_change()
returns trigger
language plpgsql
as $$
declare
  deadline timestamptz;
begin
  select deadline_at
    into deadline
    from gameweeks
   where competition = new.competition
     and season = new.season
     and gw = new.gw;

  if deadline is null then
    raise exception 'a Squad Change requires a Gameweek'
      using errcode = '23503';
  end if;

  if new.observed_at >= deadline then
    raise exception 'a Squad Change must be observed before the Gameweek deadline'
      using
        errcode = '23514',
        constraint = 'squad_change_precedes_deadline';
  end if;
  return new;
end;
$$;

create or replace function preserve_squad_change_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from squad_changes s
     where s.competition = new.competition
       and s.season = new.season
       and s.gw = new.gw
       and s.observed_at >= new.deadline_at
  ) then
    raise exception
      'a Gameweek deadline must remain after its Squad Changes'
      using
        errcode = '23514',
        constraint = 'gameweek_deadline_preserves_squad_change_lock';
  end if;
  return new;
end;
$$;
