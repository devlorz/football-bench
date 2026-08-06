-- The live endpoint's full stat set joins the per-player Gameweek record, so
-- the FPL context's two performance windows and any later scoring breakdown
-- read from one audited table (ADR-0020). Typed columns rather than a JSONB
-- envelope: the set is frozen for the Season along with the Prompt Version,
-- and a malformed upstream value should fail at the boundary rather than
-- reach a context.
--
-- The archived `fpl_live` snapshot stays the source of truth. Every column
-- here is the source's own field under the source's own name, so a stored
-- stat traces back to the bytes it came from without a mapping table.

-- A narrow row cannot be widened by guessing. Filling the new columns with
-- zeros would put "played and did nothing" on record for a Gameweek in which
-- the player may have scored twice, and that reading would then flow into an
-- Entrant's context as fact. The bytes to re-derive from are archived, so the
-- back-fill is a runbook action -- but it has to happen first.
do $$
begin
  if exists (select 1 from fpl_player_points) then
    raise exception
      'fpl_player_points holds rows that predate the full stat set; '
      'back-fill them from the archived fpl_live snapshots '
      '(raw_snapshots.source = ''fpl_live:<season>:<gw>'') before applying '
      'this migration';
  end if;
end;
$$;

-- Not null and no default, deliberately: the guard above is what makes that
-- safe, and it is what keeps a missing stat impossible rather than merely
-- unlikely. Every one of these is a count the source always sends.
alter table fpl_player_points
  add column goals_scored integer not null check (goals_scored >= 0),
  add column assists      integer not null check (assists      >= 0),
  add column clean_sheets integer not null check (clean_sheets >= 0),
  add column bonus        integer not null check (bonus        >= 0),
  add column yellow_cards integer not null check (yellow_cards >= 0),
  add column red_cards    integer not null check (red_cards    >= 0),
  add column saves        integer not null check (saves        >= 0),
  -- FPL sends the expected-goals family as decimal strings with two places.
  -- Fixed-point at that precision, matching understat_match_xg (migration
  -- 0010): a float would make a stored stat disagree with the archived bytes
  -- in the last digit for no gain.
  add column expected_goals          numeric(5, 2) not null
    check (expected_goals          >= 0),
  add column expected_assists        numeric(5, 2) not null
    check (expected_assists        >= 0),
  add column expected_goals_conceded numeric(5, 2) not null
    check (expected_goals_conceded >= 0);
