-- A club's Head Coach changes for one Season, as English Wikipedia's season
-- article states them (ADR-0044). Head Coach, never manager: on the FPL track
-- a Manager is the Entrant's persona and `manager_states` is what it carries
-- between Gameweeks, so the real club's bench needed a word of its own and
-- this table, its section and its source string all say the same one.
--
-- A row is one side of one change, on the same terms `squad_changes` files one
-- move under both clubs: a Departure carries who left and the manner the page
-- states, an Arrival carries who came, and each is dated by its own column --
-- the day the seat fell vacant and the day it was filled. Two rows rather than
-- one because those two dates are independent, and a Gameweek whose deadline
-- falls between them is a club that is genuinely between Head Coaches. One row
-- holding both would force the render to publish an appointment the Entrant
-- could not yet have known about, or to drop a vacancy it certainly could.
--
-- `manner` is null exactly for an Arrival, which states none.
--
-- `dated_on` is not null, unlike the Squad Change column 0027 opened: both
-- articles' tables carry a date of vacancy and a date of appointment in every
-- row, and a row missing either is refused at the parser as a shape change
-- rather than stored as an event nobody can place in time. It is also the
-- column the render bounds by the deadline, which a null could not answer.
--
-- `club` carries the Season roster's spelling `fixtures` uses -- FPL's for the
-- Premier League, football-data.org's for La Liga -- so a context selects its
-- two clubs without an alias hop.
--
-- Gameweek-partitioned with an observation timestamp, and the same two
-- triggers `squad_changes` carries from 0018: what an Entrant was handed must
-- be provably pre-Lock, and that is a database guarantee rather than an
-- application promise. The pair is both halves of one sentence -- a row may
-- not arrive after its Gameweek's deadline, and a deadline may not be moved
-- back over a row that already arrived.
--
-- No primary key, for 0027's reason turned around: the identity below is a
-- unique index so that it reads the same as the neighbouring table's, and
-- nothing references this table, so no foreign key loses a target.
create table head_coach_changes (
  competition text not null,
  season      text not null,
  gw          integer not null,
  club        text not null,
  direction   text not null check (direction in ('in', 'out')),
  head_coach  text not null,
  manner      text,
  dated_on    date not null,
  observed_at timestamptz not null,
  foreign key (competition, season, gw)
    references gameweeks (competition, season, gw)
);

-- The writer is a delete-then-insert over the whole partition with no
-- `on conflict` anywhere, so what this catches is a page listing the same
-- change twice. A club that changes Head Coach twice in a Season states two
-- different dates and is two rows, which is the point of the date being in the
-- key.
create unique index head_coach_changes_identity
  on head_coach_changes (
    competition, season, gw, club, direction, head_coach, dated_on
  );

alter table head_coach_changes enable row level security;

create function require_pre_deadline_head_coach_change()
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
    raise exception 'a Head Coach change requires a Gameweek'
      using errcode = '23503';
  end if;

  if new.observed_at >= deadline then
    raise exception
      'a Head Coach change must be observed before the Gameweek deadline'
      using
        errcode = '23514',
        constraint = 'head_coach_change_precedes_deadline';
  end if;
  return new;
end;
$$;

create trigger head_coach_change_precedes_deadline
before insert or update on head_coach_changes
for each row execute function require_pre_deadline_head_coach_change();

create function preserve_head_coach_change_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from head_coach_changes h
     where h.competition = new.competition
       and h.season = new.season
       and h.gw = new.gw
       and h.observed_at >= new.deadline_at
  ) then
    raise exception
      'a Gameweek deadline must remain after its Head Coach changes'
      using
        errcode = '23514',
        constraint = 'gameweek_deadline_preserves_head_coach_change_lock';
  end if;
  return new;
end;
$$;

create trigger gameweek_deadline_preserves_head_coach_change_lock
before update of deadline_at on gameweeks
for each row execute function preserve_head_coach_change_lock();
