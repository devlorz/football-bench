-- A repair, and the first migration in this record that exists because
-- production disagreed with a migration already marked applied.
--
-- `international_results_source` is created by one migration and one only,
-- `0043_the_dataset_says_when_it_was_last_updated.sql`, whose `create table`
-- names three columns: `source`, `latest_row_on` and `read_at`. That file has
-- a single commit and has never been edited. Production nevertheless holds the
-- table without `read_at`, and said so on 2026-09-22 by failing the first
-- daily fetch that reached it:
--
--   column "read_at" of relation "international_results_source" does not exist
--
-- The fetch reached it that day and not before because the source is dispatched
-- by the registry: `fetchInternationalResults` runs only for a Competition
-- whose `history` entry names the dataset, and until `UNL` was listed in
-- `competitions` that morning, no Competition did. So the table had been
-- wrong since 0043 was applied and nothing had asked it a question.
--
-- How a table gets two of its three columns while `schema_migrations` records
-- the file as applied: that table records a *filename*, not the bytes behind
-- it, so a migration applied from a working tree mid-edit is indistinguishable
-- afterwards from the committed one. This migration does not prove that is
-- what happened -- nothing in the record can, which is the point -- and it does
-- not guess at anything else being wrong. It repairs the one column production
-- named and leaves every other difference to be found the same way: by a
-- reader asking the table a question.
--
-- `if not exists` so that a database built from these files in order -- every
-- test database, every rehearsal, every throwaway copy, all of which got the
-- column from 0043 -- passes through this file unchanged. The default exists
-- only to satisfy `not null` if the table somehow holds rows, and is dropped
-- immediately, because 0043 declares no default and a column that kept one
-- would quietly stamp `now()` on a row that failed to say when it was read.
alter table international_results_source
  add column if not exists read_at timestamptz not null default now();

alter table international_results_source
  alter column read_at drop default;
