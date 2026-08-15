-- A Squad Change whose source states no date, and the identity that survives
-- one (ticket 7 of spec 0016).
--
-- English Wikipedia's two transfer lists are not one format. The English page
-- is two wikitables whose first column is the date every move is filed under;
-- the Spanish page is one section per club holding `{{fs player}}` lines that
-- carry a name, a nationality, a position and a free-text `other=` -- and no
-- date and no fee anywhere on the page. `dated_on not null` is therefore a
-- requirement only the English source can meet.
--
-- Null rather than a stand-in. `window.since` would fit the column and would
-- be this pipeline asserting a date nobody published, which is the same move
-- `feeAmount` already refuses one column over: absence of a number is a
-- statement, never a value (ADR-0018). Nothing is lost from the packet by it
-- -- `changeText` renders the player, the counterpart, the fee and the loan
-- marker and has never rendered the date, and the section's heading dates
-- itself from the window rather than from any row -- so `dated_on` works in
-- exactly two places: the third key of the display ordering, and this
-- identity.
--
-- `nulls not distinct`, without which this index would enforce nothing at all
-- for the league that needs it. Postgres holds two nulls apart by default, so
-- every Spanish row -- all of which are null here -- would be unique against
-- every other by that column alone. The one job left to this constraint is
-- narrow and worth keeping: the writer is a delete-then-insert over the whole
-- `(competition, season, gw)` partition with no `on conflict` anywhere, so
-- what it catches is a page that lists the same move twice, and it would have
-- gone on catching that for the Premier League while silently declining to for
-- La Liga.
--
-- `competition` joins the identity here rather than sitting outside it as it
-- does in 0024. The difference is that this key is the writer's partition:
-- `historical_matches` is keyed by a date and two clubs that cannot collide
-- across leagues, while two Competitions genuinely share `gw` 1 through 38,
-- and the Gameweek foreign key does not separate them -- a Spanish row landing
-- with `competition = 'PL'` points at a real Premier League Gameweek and is
-- accepted.
-- **This table has no primary key from here on, deliberately.** A primary key's
-- columns are not-null by definition, so a nullable `dated_on` and a primary
-- key holding it cannot both exist; the unique index below is the identity
-- instead, and it is the stronger of the two anyway because it can say `nulls
-- not distinct` and a primary key has nothing to say about nulls at all.
-- Nothing references `squad_changes`, so no foreign key loses a target.
--
-- The other way out was `contexts`': a surrogate `id` as the primary key with
-- the natural key held by a unique index beside it. Rejected here because that
-- table earns its surrogate — every context row is pointed at by an attempt —
-- and this one has nobody to point at it, so the column would exist only to
-- let the word "primary" stay in the schema.
--
-- The key comes off first: Postgres refuses to drop a not-null a primary key
-- is still standing on.
alter table squad_changes drop constraint squad_changes_pkey;

alter table squad_changes alter column dated_on drop not null;

create unique index squad_changes_identity
  on squad_changes (
    competition, season, gw, club, direction,
    player, counterpart_club, dated_on
  )
  nulls not distinct;

-- The same reasoning 0024 applied to the two history tables, arriving here one
-- ticket later because this is where the second Competition's writer lands.
-- 0022 added the column with a default so the rows already stored could be
-- relabelled; from here `fetchSquadChanges` names its Competition explicitly,
-- so the default has no honest caller left and only one dishonest one -- a
-- writer that says nothing about which league it fetched, whose rows land
-- under the Premier League with no collision, no check and a packet that reads
-- perfectly.
alter table squad_changes alter column competition drop default;
