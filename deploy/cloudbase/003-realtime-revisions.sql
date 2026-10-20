-- Run once on the existing CloudBase PostgreSQL test environment after
-- checking that its Realtime publication is named cloudbase_realtime.
-- Publish only the account revision signal, never image or document rows.
do $$
begin
  if not exists(select 1 from pg_namespace where nspname='realtime') or
     not exists(select 1 from pg_roles where rolname='cloudbase_realtime_admin') then
    raise exception 'CloudBase Realtime is not enabled in this environment';
  end if;
  if not exists(select 1 from pg_publication where pubname='cloudbase_realtime') then
    create publication cloudbase_realtime;
  end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='cloudbase_realtime' and schemaname='public' and tablename='shiye_revisions'
  ) then
    alter publication cloudbase_realtime add table public.shiye_revisions;
  end if;
end $$;

grant select on public.shiye_revisions to cloudbase_realtime_admin;
-- Existing own_revision RLS and authenticated SELECT grant still constrain
-- each browser to the revision row belonging to its logged-in account.
