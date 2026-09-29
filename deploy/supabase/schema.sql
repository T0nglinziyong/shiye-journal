-- Existing records are not modified. Apply once to the selected test project.
create table public.shiye_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);
alter table public.shiye_accounts enable row level security;
create policy own_account on public.shiye_accounts for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.shiye_accounts to authenticated;
revoke all on public.shiye_accounts from anon;

create table public.shiye_revisions (
  user_id uuid primary key references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null default 0
);
alter table public.shiye_revisions enable row level security;
create policy own_revision on public.shiye_revisions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select,update on public.shiye_revisions to authenticated;
revoke all on public.shiye_revisions from anon;

create table public.shiye_records (
  user_id uuid not null default auth.uid() references public.shiye_accounts(user_id) on delete cascade,
  store text not null check (store in ('assets','blobs','series','projects','meta','trash')),
  id text not null check (length(id) between 1 and 500),
  record jsonb not null check (jsonb_typeof(record)='object' and record->>'id'=id),
  primary key(user_id,store,id)
);
alter table public.shiye_records enable row level security;
create policy own_records on public.shiye_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select,insert,update,delete on public.shiye_records to authenticated;
revoke all on public.shiye_records from anon;

create function public.shiye_commit(operations jsonb,expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare who uuid := auth.uid(); current_revision bigint; op jsonb; s text;
begin
  if who is null then raise exception '请先登录'; end if;
  select revision into current_revision from public.shiye_revisions where user_id=who for update;
  if not found then raise exception '账号未获测试权限'; end if;
  if current_revision<>expected_revision then raise exception '另一设备已更新资料，请刷新后再编辑，未覆盖任何数据'; end if;
  if jsonb_typeof(operations)<>'array' or jsonb_array_length(operations)>20000 then raise exception '无效事务'; end if;
  for op in select value from jsonb_array_elements(operations) loop
    s := op->>'store';
    if s is null or s not in ('assets','blobs','series','projects','meta','trash') then raise exception '无效数据表'; end if;
    if op->>'action'='put' then
      if s='blobs' and (op->'item'->>'storagePath' is null or split_part(op->'item'->>'storagePath','/',1)<>who::text or op->'item' ? 'data') then raise exception '无效私有图片路径'; end if;
      insert into public.shiye_records(user_id,store,id,record) values(who,s,op->'item'->>'id',op->'item')
      on conflict(user_id,store,id) do update set record=excluded.record;
    elsif op->>'action'='delete' then
      delete from public.shiye_records where user_id=who and store=s and id=op->>'id';
    elsif op->>'action'='clear' then
      delete from public.shiye_records where user_id=who and store=s;
    else raise exception '无效操作'; end if;
  end loop;
  update public.shiye_revisions set revision=revision+1 where user_id=who returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.shiye_commit(jsonb,bigint) from public,anon;
grant execute on function public.shiye_commit(jsonb,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('shiye-private','shiye-private',false,52428800);
create policy shiye_private_read on storage.objects for select to authenticated
 using(bucket_id='shiye-private' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.shiye_accounts where user_id=(select auth.uid())));
create policy shiye_private_insert on storage.objects for insert to authenticated
 with check(bucket_id='shiye-private' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.shiye_accounts where user_id=(select auth.uid())));
-- Immutable content hashes: no overwrite/delete policy. Referenced files survive
-- failed transactions and restore; explicit orphan cleanup is a separate task.
