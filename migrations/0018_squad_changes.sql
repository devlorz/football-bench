-- A club's Signings and Departures for one transfer window, as English
-- Wikipedia's per-window transfer list states them (ADR-0031). A row is one
-- club's side of one move: a transfer between two Premier League clubs is a
-- Signing row for the buyer and a Departure row for the seller, because the
-- context renders one block per club and never a shared ledger.
--
-- `club` carries the Season roster's spelling, the identity `fixtures` and
-- `fpl_players` already use, so a context can select its two clubs without an
-- alias hop. `counterpart_club` is deliberately the page's own spelling and is
-- not resolved: most counterparts are EFL or foreign clubs no alias table
-- covers, and inventing a canonical name for them would be this pipeline
-- asserting something its single source never said.
--
-- `fee` is null exactly when the page states none, which is every loan; the
-- loans table carries no fee column at all.
--
-- Gameweek-partitioned with an observation timestamp under the same two
-- triggers `fpl_players` earned in migrations 0006 and 0007: what an Entrant
-- was handed must be provably pre-Lock, and that is a database guarantee
-- rather than an application promise.
create table squad_changes (
  season           text not null,
  gw               integer not null,
  club             text not null,
  direction        text not null check (direction in ('in', 'out')),
  player           text not null,
  counterpart_club text not null,
  fee              text,
  loan             boolean not null,
  dated_on         date not null,
  observed_at      timestamptz not null,
  primary key (season, gw, club, direction, player, counterpart_club, dated_on),
  foreign key (season, gw) references gameweeks (season, gw)
);

alter table squad_changes enable row level security;

create function require_pre_deadline_squad_change()
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

create trigger squad_change_precedes_deadline
before insert or update on squad_changes
for each row execute function require_pre_deadline_squad_change();

create function preserve_squad_change_lock()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
      from squad_changes s
     where s.season = new.season
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

create trigger gameweek_deadline_preserves_squad_change_lock
before update of deadline_at on gameweeks
for each row execute function preserve_squad_change_lock();
