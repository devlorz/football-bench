alter table fpl_players add column gw integer;

-- Migration 0005 was deployed immediately before this correction. Existing
-- player rows can be assigned only when their Season has one fetched Gameweek;
-- anything ambiguous must stop for operator review rather than guess.
do $$
begin
  if exists (
    select p.season
      from fpl_players p
      left join gameweeks g on g.season = p.season
     group by p.season
    having count(distinct g.gw) <> 1
  ) then
    raise exception
      'cannot infer a Gameweek for existing FPL player rows';
  end if;
end;
$$;

update fpl_players p
   set gw = (
     select min(g.gw)
       from gameweeks g
      where g.season = p.season
   );

alter table fpl_players alter column gw set not null;
alter table fpl_players drop constraint fpl_players_pkey;
alter table fpl_players
  add primary key (season, gw, fpl_id);
alter table fpl_players
  add foreign key (season, gw) references gameweeks (season, gw);

drop index fpl_players_team_price;
create index fpl_players_team_price
  on fpl_players (season, gw, team_name, price_tenths desc, fpl_id);
