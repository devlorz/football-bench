-- Who is in post at a club for one Gameweek, as English Wikipedia's season
-- article names them in its per-club personnel table (ADR-0045). A state,
-- where `head_coach_changes` holds events: a club with no Change kept its Head
-- Coach, which is ordinary, and a club with no row here is a Gap in the record,
-- which is not.
--
-- Its own table rather than a column on the Change store or a third
-- `direction` there: those rows carry a direction, a manner and a date, an
-- incumbent has none of the three, and folding them together would put a
-- direction filter on every read of both.
--
-- The same personnel table names the captain, the kit manufacturer and the
-- sponsors; none of them is this benchmark's business (ADR-0018).
--
-- `club` carries the Season roster's spelling, for 0032's reason and so that a
-- render reads both stores for one club without an alias hop.
--
-- `observed_at` is the whole of the pre-Lock guarantee, and that is weaker than
-- the Change store's on purpose: the source is the article's present tense and
-- states no date, so the claim drops from "this fact is dated before the Lock"
-- to "this row was stored before the Lock". It is stored so the weaker claim
-- can be checked rather than inferred from when the fetch is scheduled, and the
-- same two triggers 0018 and 0032 carry enforce it -- a row may not arrive
-- after its Gameweek's deadline, and a deadline may not be moved back over a
-- row that already arrived.
--
-- No primary key, for 0032's reason: the identity is a unique index so it reads
-- the same as the neighbouring table's, and nothing references this table.
create table head_coaches (
  competition text not null,
  season      text not null,
  gw          integer not null,
  club        text not null,
  head_coach  text not null,
  observed_at timestamptz not null,
  foreign key (competition, season, gw)
    references gameweeks (competition, season, gw)
);

-- One name per club per Gameweek, where the Change store deliberately allows a
-- club two rows: a club has a single Head Coach at a time, so a second name for
-- the same club is a parse that went wrong rather than a second fact. The
-- writer is a delete-then-insert over the whole partition with no `on
-- conflict`, so this catches the page rather than the rerun.
create unique index head_coaches_identity
  on head_coaches (competition, season, gw, club);

alter table head_coaches enable row level security;

create function require_pre_deadline_head_coach()
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
    raise exception 'a Head Coach requires a Gameweek'
      using errcode = '23503';
  end if;

  if new.observed_at >= deadline then
    raise exception
      'a Head Coach must be observed before the Gameweek deadline'
      using
        errcode = '23514',
        constraint = 'head_coach_precedes_deadline';
  end if;
  return new;
end;
$$;

create trigger head_coach_precedes_deadline
before insert or update on head_coaches
for each row execute function require_pre_deadline_head_coach();

create function preserve_head_coach_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from head_coaches h
     where h.competition = new.competition
       and h.season = new.season
       and h.gw = new.gw
       and h.observed_at >= new.deadline_at
  ) then
    raise exception
      'a Gameweek deadline must remain after its Head Coaches'
      using
        errcode = '23514',
        constraint = 'gameweek_deadline_preserves_head_coach_lock';
  end if;
  return new;
end;
$$;

create trigger gameweek_deadline_preserves_head_coach_lock
before update of deadline_at on gameweeks
for each row execute function preserve_head_coach_lock();
