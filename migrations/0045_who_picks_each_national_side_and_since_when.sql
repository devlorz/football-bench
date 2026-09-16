-- Who is in post at a national side on one day, as English Wikipedia's list of
-- current national team head coaches names them, with the date the page says
-- the role was assumed (ADR-0045, ADR-0057).
--
-- Its own table rather than a partition of `head_coaches`, for two reasons and
-- not one. The first is the column: that store holds a name and nothing else,
-- because a season article's personnel table states no date, and this page's
-- whole second column is the date the role was assumed -- there is nowhere in
-- `head_coaches` to put it. The second is the key. `head_coaches` is keyed by
-- Gameweek and rewritten whole on every read, which is right for a source that
-- republishes the same Season's table each morning; this page is a *current*
-- list, so a Head Coach Change is the difference between two days of it
-- (ADR-0045's promise met by a source that publishes no events at all). A
-- store that kept only the newest read could not answer what changed, because
-- yesterday's answer would already have been deleted by today's.
--
-- Keyed by the side and the day, so a rerun on the same morning overwrites
-- rather than manufacturing a Change out of reading the same page twice. Two
-- days that agree are two rows and no Change, which is the ordinary case and
-- says so.
--
-- No Competition and no Season, on migration 0042's terms: this page is a list
-- of the world's national sides, the same row answers for every Competition
-- that reads it, and an international year is not a Season. The Competition
-- gate is the registry's -- a Competition whose entry does not name this
-- source never opens this table (ADR-0057).
--
-- `head_coach` null is a post the page states as vacant, which is the one
-- state a club's Head Coach is never allowed (ADR-0045: a club with none named
-- is a Gap). A national side between Head Coaches is an ordinary fact the page
-- publishes, and rendering the previous holder would be the lie. A side the
-- page does not carry at all has no row here, which is the Gap, and the two
-- are told apart exactly because a vacancy is stored rather than skipped.
--
-- `assumed_on` is null with it and never apart from it: a vacant post assumed
-- nothing, and a named Head Coach with no readable date is a page whose shape
-- moved, refused at the parser rather than stored as a name nobody can place
-- in time.
--
-- `observed_at` beside `observed_on` is what the render bounds by, and the
-- pair is not one fact twice: the day is the key, because the page is read
-- once a morning and a Change is dated by a day; the instant is the whole of
-- this store's pre-Lock claim, which is the weaker "this row was stored before
-- the Lock" that 0033 already settled for a source writing in the present
-- tense.
--
-- No trigger pair, unlike `head_coaches` and unlike `head_coach_changes`.
-- Those triggers read the row's own Gameweek to find a deadline, and a row
-- here has no Gameweek to read -- the same reason `international_results`
-- carries none. The bound is the reader's, in
-- `src/context/build-national-team-head-coach-context.ts`, and is stated
-- there.
create table national_team_head_coaches (
  team        text not null,
  observed_on date not null,
  observed_at timestamptz not null,
  head_coach  text,
  assumed_on  date,
  primary key (team, observed_on),
  constraint national_team_head_coach_dates_a_named_coach
    check ((head_coach is null) = (assumed_on is null))
);

alter table national_team_head_coaches enable row level security;
