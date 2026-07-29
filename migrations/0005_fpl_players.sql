create table fpl_players (
  season                       text not null,
  fpl_id                       integer not null,
  team_name                    text not null,
  web_name                     text not null,
  position                     text not null,
  price_tenths                 integer not null check (price_tenths >= 0),
  status                       text not null,
  chance_of_playing_next_round integer
                               check (
                                 chance_of_playing_next_round between 0 and 100
                               ),
  news                         text not null,
  news_added                   timestamptz,
  primary key (season, fpl_id)
);

create index fpl_players_team_price
  on fpl_players (season, team_name, price_tenths desc, fpl_id);

alter table fpl_players enable row level security;
