create table historical_matches (
  season      text not null,
  division    text not null
              check (division in ('Premier League', 'Championship')),
  played_on   timestamptz not null,
  home_team   text not null,
  away_team   text not null,
  home_goals  integer not null check (home_goals >= 0),
  away_goals  integer not null check (away_goals >= 0),
  primary key (season, division, home_team, away_team)
);

alter table historical_matches enable row level security;
