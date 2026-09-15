-- When the `martj42/international_results` dataset was last updated, as the
-- file itself says: the date of the latest row in it, whoever played that
-- match (ADR-0057). One row per source that answers that question, upserted on
-- every daily fetch, and today that is one row.
--
-- Not derivable from `international_results`, which is why it is a table and
-- not a `max(played_on)`. That table holds only what the fifty-four did from
-- 2024-06-01 forward, and the file's last row is usually somebody else's: in
-- the recording made on 2026-09-14 the latest row is Vietnam 2-2 Thailand on
-- 2026-08-26 while the latest row naming one of the fifty-four is 2026-07-19,
-- five weeks earlier. A packet printing the second as "dataset last updated"
-- would report a monthly source as staler than it is, and story 30 of spec
-- 0027 is that an Entrant can tell a stale source from a side that did not
-- play.
--
-- Not the snapshot's name either, though `raw_snapshots` is where the bytes
-- go: the body is archived before it is validated, deliberately and everywhere
-- in this project, so nothing parsed out of it can reach the name it is
-- archived under.
--
-- `source` is the name the archive files those bytes under, so the row and the
-- snapshot it was read from are the same word apart. It is the key because a
-- row has to be keyed by something and that is the one fact identifying it,
-- not because a second dataset is expected: ADR-0057 names one.
--
-- `latest_row_on` is a date and not a timestamp, because the file's rows carry
-- days. `read_at` is the instant of the run that read it, and is the other
-- half: the first says how fresh the file is and belongs in what the Entrant
-- reads, the second says whether this record is still reading it and is what
-- the after-first-deadline guard asks. `raw_snapshots.last_seen_at` is close
-- but not the same question -- it moves when bytes are archived, including the
-- bytes of a response that then failed validation.
create table international_results_source (
  source        text primary key,
  latest_row_on date not null,
  read_at       timestamptz not null
);

alter table international_results_source enable row level security;
