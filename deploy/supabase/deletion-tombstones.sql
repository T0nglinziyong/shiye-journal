-- Apply to the existing Supabase project before enabling deletion protection in
-- the test client. Compatible with shiye_commit_v2 and its idempotency table.
-- Intentionally never expires logical tombstones with seven-day trash entries.
create or replace function public.shiye_commit(operations jsonb,expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  who uuid := auth.uid();
  current_revision bigint;
  op jsonb;
  row_id text;
  s text;
  action text;
  marker_id text;
  changed jsonb := '[]'::jsonb;
  full_restore boolean;
  prior record;
begin
  if who is null then raise exception '请先登录'; end if;
  select revision into current_revision from public.shiye_revisions where user_id=who for update;
  if not found then raise exception '账号未获测试权限'; end if;
  if current_revision<>expected_revision then raise exception '另一设备已更新资料，请刷新后再编辑，未覆盖任何数据'; end if;
  if jsonb_typeof(operations)<>'array' or jsonb_array_length(operations)>20000 then raise exception '无效事务'; end if;
  -- Clearing all logical stores AND meta belongs to an explicitly confirmed
  -- full-backup restore. Ordinary deletion cannot silently erase tombstones.
  full_restore := (
    select count(distinct item->>'store')=4
    from jsonb_array_elements(operations) item
    where item->>'action'='clear'
      and item->>'store' in ('assets','projects','series','meta')
  );
  for op in select value from jsonb_array_elements(operations) loop
    s:=op->>'store'; action:=op->>'action';
    if s is null or s not in ('assets','blobs','series','projects','meta','trash') then raise exception '无效数据表'; end if;
    if action='put' then
      row_id:=op->'item'->>'id';
      if row_id is null or length(row_id)<1 then raise exception '写入对象缺少 ID'; end if;
      if s='blobs' and (op->'item'->>'storagePath' is null or split_part(op->'item'->>'storagePath','/',1)<>who::text or op->'item' ? 'data') then raise exception '无效私有图片路径'; end if;
      if s in ('assets','projects','series') and not full_restore then
        marker_id:='tombstone:'||s||':'||row_id;
        if exists(select 1 from public.shiye_records where user_id=who and store='meta' and id=marker_id)
          and not exists(
            select 1 from jsonb_array_elements(operations) restoration
            where restoration->>'store'='meta' and restoration->>'action'='delete'
              and restoration->>'id'=marker_id
          )
          then raise exception '此对象已被删除，必须主动恢复，禁止旧设备或初始化程序重新创建：%',row_id;
        end if;
      end if;
      insert into public.shiye_records(user_id,store,id,record)
      values(who,s,row_id,op->'item')
      on conflict(user_id,store,id) do update set record=excluded.record;
    elsif action='delete' then
      row_id:=op->>'id';
      if row_id is null then raise exception '删除对象缺少 ID'; end if;
      -- A bare metadata deletion is not a restore: the paired logical record
      -- must be present in this exact atomic transaction.
      if s='meta' and left(row_id,10)='tombstone:' and not full_restore
        and not exists(
          select 1 from jsonb_array_elements(operations) restoration
          where restoration->>'action'='put'
            and ('tombstone:' || (restoration->>'store') || ':' || (restoration->'item'->>'id')) = row_id
            and restoration->>'store' in ('assets','projects','series')
        ) then raise exception '禁止单独清除删除保护记录'; end if;
      if s in ('assets','projects','series') then
        marker_id:='tombstone:'||s||':'||row_id;
        insert into public.shiye_records(user_id,store,id,record)
        values(who,'meta',marker_id,jsonb_build_object(
          'id',marker_id,'store',s,'targetID',row_id,'kind','tombstone','deletedAt',now()))
        on conflict(user_id,store,id) do nothing;
        changed:=changed||jsonb_build_array(jsonb_build_object('store','meta','action','put','id',marker_id));
      end if;
      delete from public.shiye_records where user_id=who and store=s and id=row_id;
    elsif action='clear' then
      if s='meta' and not full_restore then raise exception '普通同步不能清空删除保护记录'; end if;
      if s in ('assets','projects','series') and not full_restore then
        for prior in select id from public.shiye_records where user_id=who and store=s loop
          marker_id:='tombstone:'||s||':'||prior.id;
          insert into public.shiye_records(user_id,store,id,record)
          values(who,'meta',marker_id,jsonb_build_object(
            'id',marker_id,'store',s,'targetID',prior.id,'kind','tombstone','deletedAt',now()))
          on conflict(user_id,store,id) do nothing;
          changed:=changed||jsonb_build_array(jsonb_build_object('store','meta','action','put','id',marker_id));
        end loop;
      end if;
      delete from public.shiye_records where user_id=who and store=s;
    else
      raise exception '无效操作';
    end if;
    changed:=changed||jsonb_build_array(jsonb_build_object(
      'store',s,'action',action,'id',case when action='put' then op->'item'->>'id' else op->>'id' end));
  end loop;
  update public.shiye_revisions set revision=revision+1 where user_id=who returning revision into current_revision;
  insert into public.shiye_changes(user_id,revision,keys) values(who,current_revision,changed);
  delete from public.shiye_changes where user_id=who and revision<current_revision-250;
  return current_revision;
end;
$$;
revoke all on function public.shiye_commit(jsonb,bigint) from public,anon;
grant execute on function public.shiye_commit(jsonb,bigint) to authenticated;
