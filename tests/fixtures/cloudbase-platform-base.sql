-- TEST FIXTURE ONLY, not a CloudBase production migration.
\set ON_ERROR_STOP on
do $$begin
 if to_regclass('public.shiye_accounts') is not null or to_regnamespace('auth') is not null then
   raise exception 'Tests require a fresh disposable database; existing data will NOT be replaced';
 end if;
 if not exists(select from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
end$$;
create schema auth;
create function auth.uid() returns text language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
$$;
grant usage on schema auth to anon,authenticated;
create table public.shiye_accounts(user_id text primary key,username text unique,is_admin boolean default false);
create table public.shiye_revisions(user_id text primary key references public.shiye_accounts(user_id) on delete cascade,
 revision bigint not null default 0,account_epoch uuid not null default gen_random_uuid());
create table public.shiye_records(user_id text not null references public.shiye_accounts(user_id) on delete cascade,
 store text not null check(store in ('assets','blobs','series','projects','meta','trash')),
 id text not null,record jsonb not null,primary key(user_id,store,id));
alter table public.shiye_accounts enable row level security;
alter table public.shiye_revisions enable row level security;
alter table public.shiye_records enable row level security;
create policy own_account on public.shiye_accounts for select to authenticated using(user_id=(select auth.uid()));
create policy own_revision on public.shiye_revisions for select to authenticated using(user_id=(select auth.uid()));
create policy own_records on public.shiye_records for select to authenticated using(user_id=(select auth.uid()));
grant select on public.shiye_accounts,public.shiye_revisions,public.shiye_records to authenticated;
