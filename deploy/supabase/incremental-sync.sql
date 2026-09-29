-- Additive migration: existing records, images and revisions are unchanged.
-- Only changed keys, never private record content, are logged for cache deltas.
create table public.shiye_changes (
  user_id uuid not null references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null,
  keys jsonb not null check (jsonb_typeof(keys)='array'),
  primary key(user_id,revision)
);
alter table public.shiye_changes enable row level security;
create policy own_changes on public.shiye_changes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select,insert,delete on public.shiye_changes to authenticated;
revoke all on public.shiye_changes from public,anon;

create or replace function public.shiye_commit(operations jsonb,expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare who uuid := auth.uid(); current_revision bigint; op jsonb; s text; changed jsonb := '[]'::jsonb;
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
    changed := changed || jsonb_build_array(jsonb_build_object('store',s,'action',op->>'action','id',case when op->>'action'='put' then op->'item'->>'id' else op->>'id' end));
  end loop;
  update public.shiye_revisions set revision=revision+1 where user_id=who returning revision into current_revision;
  insert into public.shiye_changes(user_id,revision,keys) values(who,current_revision,changed);
  delete from public.shiye_changes where user_id=who and revision<current_revision-250;
  return current_revision;
end;
$$;
revoke all on function public.shiye_commit(jsonb,bigint) from public,anon;
grant execute on function public.shiye_commit(jsonb,bigint) to authenticated;
