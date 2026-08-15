-- What 0022 would be if it added the Competition and changed a value on the
-- way past. It stands in for the whole migration in one test — enough of the
-- shape for the rehearsal's check to reach every table, and one rewritten
-- number for it to find.
alter table gameweeks add column competition text not null default 'PL';
alter table fixtures add column competition text not null default 'PL';
alter table contexts add column competition text not null default 'PL';
alter table predictions add column competition text not null default 'PL';
alter table attempts add column competition text not null default 'PL';
alter table prediction_runs add column competition text not null default 'PL';
alter table scores add column competition text not null default 'PL';

alter table fixtures rename column fpl_id to fixture_id;
alter table predictions rename column fpl_id to fixture_id;
alter table contexts rename column fpl_id to fixture_id;
alter table attempts rename column fpl_id to fixture_id;

update scores set value = value + 1;
