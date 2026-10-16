\set ON_ERROR_STOP on
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.shiye_accounts(user_id uuid primary key);
create table public.shiye_revisions(user_id uuid primary key references public.shiye_accounts,
  revision bigint not null default 0);
create table public.shiye_records(user_id uuid not null,store text not null,id text not null,
  record jsonb not null,primary key(user_id,store,id));
create table public.shiye_commits(user_id uuid not null references public.shiye_accounts,
  operation_id uuid not null,payload_hash text not null,revision bigint not null,
  committed_at timestamptz not null default now(),primary key(user_id,operation_id));
create table public.shiye_changes(user_id uuid not null,revision bigint not null,keys jsonb not null);
create function public.shiye_commit(operations jsonb,expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare who uuid:=auth.uid(); rev bigint; op jsonb; s text; row_id text; changed jsonb:='[]'::jsonb;
begin
  select revision into rev from public.shiye_revisions where user_id=who for update;
  if rev<>expected_revision then raise exception 'stale account revision'; end if;
  for op in select value from jsonb_array_elements(operations) loop
    s:=op->>'store';
    row_id:=coalesce(op->'item'->>'id',op->>'id');
    if op->>'action'='put' then
      insert into public.shiye_records(user_id,store,id,record) values(who,s,row_id,op->'item')
      on conflict(user_id,store,id) do update set record=excluded.record;
    elsif op->>'action'='delete' then
      delete from public.shiye_records where user_id=who and store=s and id=row_id;
    elsif op->>'action'='clear' then
      delete from public.shiye_records where user_id=who and store=s;
    end if;
    changed:=changed||jsonb_build_array(jsonb_build_object('store',s,'action',op->>'action','id',row_id));
  end loop;
  update public.shiye_revisions set revision=revision+1 where user_id=who returning revision into rev;
  insert into public.shiye_changes values(who,rev,changed);
  return rev;
end;
$$;
create function public.shiye_commit_v2(operations jsonb,expected_revision bigint,operation_id uuid)
returns bigint language sql as $$
  select public.shiye_commit(operations,expected_revision)
$$;
\i deploy/supabase/key-version-watermarks.sql
\i deploy/supabase/record-cas-v3.sql
