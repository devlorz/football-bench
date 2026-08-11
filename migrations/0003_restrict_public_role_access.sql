-- These tables are written only by scheduled jobs and read only through a
-- server-side API. Nothing client-side ever touches them, so the two roles
-- reachable with the publishable anon key must hold nothing here.
--
-- Supabase's default privileges grant anon and authenticated full access to
-- every new table in public, and PostgREST exposes that schema. Left alone,
-- anyone holding the anon key -- which is designed to ship inside frontend
-- code -- could insert fabricated Predictions against a Locked Fixture, or
-- empty the attempt ledger. PostgREST issues CRUD and declared RPC rather than
-- arbitrary SQL, so TRUNCATE is not on that surface -- and it does not need to
-- be, because attempts and scores carry no immutability trigger and ordinary
-- DELETE erases them a row at a time.
--
-- Row Level Security alone does not close this. These tables carried no RLS at
-- all until the block below, so policy had nothing to say about any of it. And
-- privilege-level operations answer to the grant rather than to a policy --
-- TRUNCATE among them, which bypasses the immutability triggers on predictions
-- and manager_states wholesale, for any holder of the role that reaches
-- Postgres over plain SQL rather than through PostgREST. Revoking the grant is
-- the load-bearing fix; RLS is defence in depth if a grant is ever restored,
-- for instance through the Supabase dashboard.
--
-- A later migration that adds a table should enable RLS on it in the same file.
-- If the dashboard reads that table, the same file also needs its grant and its
-- select policy for dashboard_read (ADR-0027): under RLS a grant without a
-- policy reads zero rows and reports no error.

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = client_role) then
      continue;
    end if;

    execute format(
      'revoke all on all tables in schema public from %I', client_role);
    execute format(
      'revoke all on all sequences in schema public from %I', client_role);
    execute format(
      'revoke all on all functions in schema public from %I', client_role);
    execute format(
      'revoke usage on schema public from %I', client_role);

    execute format(
      'alter default privileges in schema public revoke all on tables from %I',
      client_role);
    execute format(
      'alter default privileges in schema public revoke all on sequences from %I',
      client_role);
    execute format(
      'alter default privileges in schema public revoke all on functions from %I',
      client_role);
  end loop;
end;
$$;

do $$
declare
  target regclass;
begin
  for target in
    select c.oid::regclass
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table %s enable row level security', target);
  end loop;
end;
$$;
