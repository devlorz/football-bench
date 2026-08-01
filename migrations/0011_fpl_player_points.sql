-- Per-player Gameweek points, written only for a Gameweek FPL reports
-- `data_checked`. Absence of rows for a Gameweek is the record that its points
-- have not settled; it is what keeps an unchecked Gameweek distinguishable
-- from one in which every selected player scored zero.
--
-- `minutes` is the appearance evidence the substitution rules need: a starter
-- who did not play is one with a stored row and zero minutes, not one with a
-- missing row.
--
-- Deliberately no foreign key to fpl_players: that table holds the pre-Lock
-- price snapshot, and a Gameweek whose snapshot window was missed must still
-- be scoreable. The Gameweek foreign key is the one that matters.
--
-- Deliberately not immutable: FPL may correct a checked Gameweek, and the
-- stored row must follow the source.
create table fpl_player_points (
  season       text not null,
  gw           integer not null,
  fpl_id       integer not null,
  minutes      integer not null check (minutes >= 0),
  total_points integer not null,
  primary key (season, gw, fpl_id),
  foreign key (season, gw) references gameweeks (season, gw)
);

alter table fpl_player_points enable row level security;
