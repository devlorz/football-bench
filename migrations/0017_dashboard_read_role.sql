-- The dashboard's Worker reaches Postgres directly rather than through an API
-- in front of it (ADR-0027), so the one internet-facing edge authenticates as a
-- role that can only select. `dashboard_read` is the privilege half of that: a
-- nologin role holding the grants, which an operator grants a login role
-- membership in outside migrations. The login role and its password are
-- deliberately not here -- rotating a credential must be a secret change and
-- not a schema change, and a schema that names the role names it in every
-- checkout of the repository.
--
-- Six tables, which are the ones the three endpoints read. A seventh is not
-- added here in advance: a later migration that adds a table the dashboard
-- reads carries its grant and its policy in the same file, alongside the
-- `enable row level security` migration 0003 already requires.

-- A role is a cluster object and the test harness resets only the `public`
-- schema, so this role outlives every reset while the grants and policies below
-- go with the tables and are rebuilt from nothing. Postgres has no
-- `create role if not exists`, so the guard is the same shape migration 0003
-- uses to skip `anon` and `authenticated` when they are absent -- without it
-- the second `resetSchema` of a run fails on a role that is already there.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dashboard_read') then
    create role dashboard_read nologin;
  end if;
end;
$$;

grant usage on schema public to dashboard_read;

-- The grant and the policy are one thing and are written as one. Migration 0003
-- enabled Row Level Security on every table in `public`, and under RLS a grant
-- without a policy selects zero rows and reports no error -- which reaches a
-- reader as an empty leaderboard rather than as a failure, and reaches whoever
-- wrote the query as nothing at all.
do $$
declare
  target text;
begin
  foreach target in array array[
    'models', 'gameweeks', 'fixtures', 'contexts', 'predictions', 'scores'
  ] loop
    execute format('grant select on %I to dashboard_read', target);
    execute format(
      'create policy dashboard_read_select on %I '
      || 'for select to dashboard_read using (true)',
      target);
  end loop;
end;
$$;
