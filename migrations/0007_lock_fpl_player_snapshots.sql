alter table fpl_players add column observed_at timestamptz;

-- The exact HTTP completion time for rows deployed by migration 0006 was not
-- stored. The migration time is an honest conservative upper bound: the rows
-- demonstrably existed by this instant. Refuse the migration if even that
-- upper bound does not precede their deadline.
update fpl_players
   set observed_at = clock_timestamp();

do $$
begin
  if exists (
    select 1
      from fpl_players p
      join gameweeks g
        on g.season = p.season
       and g.gw = p.gw
     where p.observed_at is null
        or p.observed_at >= g.deadline_at
  ) then
    raise exception
      'cannot prove existing FPL player rows preceded their Gameweek deadline';
  end if;
end;
$$;

alter table fpl_players alter column observed_at set not null;

create function require_pre_deadline_fpl_player_snapshot()
returns trigger
language plpgsql
as $$
declare
  deadline timestamptz;
begin
  select deadline_at
    into deadline
    from gameweeks
   where season = new.season
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

create trigger fpl_player_snapshot_precedes_deadline
before insert or update on fpl_players
for each row execute function require_pre_deadline_fpl_player_snapshot();

create function preserve_fpl_player_snapshot_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from fpl_players p
     where p.season = new.season
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

create trigger gameweek_deadline_preserves_fpl_snapshot_lock
before update of deadline_at on gameweeks
for each row execute function preserve_fpl_player_snapshot_lock();
