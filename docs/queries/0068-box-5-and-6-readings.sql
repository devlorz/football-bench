-- Ticket 0068 boxes 5 and 6: the readings migration 0041 is judged by, run once
-- against the rehearsal copy and again against production after `db:migrate`.
-- One file for both, because a rehearsal that is checked differently from the
-- real apply has not rehearsed the real apply. Read-only.
--
-- Every expected value is in the comment beside its column, with the value it
-- held before 0041 ran, so a reader can see at a glance which one moved. The
-- expected instants are read back rather than compared here, so run this with
-- `psql -c 'set timezone = "UTC"' -f …` or read the offsets: the deadlines are
-- the two values a wrong timezone would make look right.

-- 1. The record in one row. Every column has one right answer.
select
  -- 10: the whole of matchday 6, all Locked into Gameweek 6 (was 1, Real
  -- Sociedad-Celta alone).
  (select count(*) from fixtures
    where competition = 'PD' and season = '2026-27' and locked_in_gw = 6)
    as matchday_6_locked_into_6,
  -- 0: nothing left pointing at Gameweek 5 out of matchday 6 (was 9).
  (select count(*) from fixtures
    where competition = 'PD' and season = '2026-27'
      and gw = 6 and locked_in_gw = 5)
    as matchday_6_still_locked_into_5,
  -- 10: Gameweek 5 back to the ten matchday 5 actually is (was 19).
  (select count(*) from fixtures
    where competition = 'PD' and season = '2026-27'
      and coalesce(locked_in_gw, gw) = 5)
    as gameweek_5_fixtures,
  -- 10: Gameweek 6 holds its own ten again (was 1).
  (select count(*) from fixtures
    where competition = 'PD' and season = '2026-27'
      and coalesce(locked_in_gw, gw) = 6)
    as gameweek_6_fixtures,
  -- 2026-09-11 17:30Z: unchanged.
  (select deadline_at from gameweeks
    where competition = 'PD' and season = '2026-27' and gw = 5)
    as gameweek_5_deadline,
  -- 2026-09-15 15:30Z: moved (was 2026-09-03 17:30Z).
  (select deadline_at from gameweeks
    where competition = 'PD' and season = '2026-27' and gw = 6)
    as gameweek_6_deadline,
  -- 1: Real Sociedad-Celta's, the only context the 2026-09-15 run must not
  -- rebuild (was 10). Every track, not just `match`: PD has no `fpl` track, so
  -- an unfiltered count is the same number and a row on any other track is
  -- something this migration did not expect and should be seen.
  (select count(*) from contexts
    where competition = 'PD' and season = '2026-27' and gw = 6)
    as gameweek_6_contexts,
  -- 0: both run rows gone, so the scheduler stops skipping Gameweek 6 (was 2).
  (select count(*) from prediction_runs
    where competition = 'PD' and season = '2026-27' and gw = 6)
    as gameweek_6_runs,
  -- 9: matchday 6's Predictions, all Real Sociedad-Celta's, untouched. 0037
  -- withdrew the rest. Nine and not the eight ticket 0065 read on 2026-09-04:
  -- the ninth is an Exhibition Run (`exhibition-pd/gpt-6-astra`, pre-flighted
  -- 2026-09-10 09:22Z, after every deadline by construction, ADR-0032).
  -- Scoped to matchday 6 -- Gameweeks 1 to 4 hold PD Predictions of their own.
  (select count(*) from predictions p
    where p.competition = 'PD' and p.season = '2026-27'
      and p.fixture_id in (select fixture_id from fixtures
                            where competition = 'PD' and season = '2026-27'
                              and gw = 6))
    as matchday_6_predictions,
  -- 9: and every one of them on Real Sociedad-Celta, not merely nine in total.
  (select count(*) from predictions
    where competition = 'PD' and season = '2026-27' and fixture_id = 564682)
    as predictions_on_real_sociedad_celta,
  -- 151: the ledger 0041 deliberately leaves alone -- 0065's 150 plus the
  -- same Exhibition attempt as above. The 2026-09-15 run adds ~90 more on top
  -- of these; see 0041's comment.
  (select count(*) from attempts
    where competition = 'PD' and season = '2026-27'
      and gw = 6 and track = 'match')
    as gameweek_6_attempts;

-- 2. Both lifted triggers, restored. `O` is enabled-in-origin, which is what
--    they read before 0041 and must read after it. `D` would mean the migration
--    left a rule off.
select tgname, tgenabled
  from pg_trigger
 where (tgname, tgrelid) in (
   ('fixture_locked_gameweek_is_immutable', 'fixtures'::regclass),
   ('gameweek_deadline_is_immutable_once_committed', 'gameweeks'::regclass)
 )
 order by tgname;

-- 3. The ten by name, so the one that did not move is visibly the one that was
--    played. Real Sociedad-Celta carries the only result and the only
--    Predictions; the nine carry neither, and all ten read `locked_in_gw = 6`.
select f.fixture_id, f.home_team, f.away_team, f.kickoff_at, f.locked_in_gw,
       f.result is not null as settled,
       (select count(*) from predictions p
         where p.competition = f.competition and p.season = f.season
           and p.fixture_id = f.fixture_id) as predictions
  from fixtures f
 where f.competition = 'PD' and f.season = '2026-27' and f.gw = 6
 order by f.kickoff_at;

-- 4. `schema_migrations` head: `0041_la_liga_gameweek_6_takes_its_nine_back.sql`
--    with `0040_the_glm_shadow_leaves_before_it_is_asked.sql` beneath it.
select filename, applied_at
  from schema_migrations
 order by filename desc
 limit 3;
