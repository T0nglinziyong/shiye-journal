-- CloudBase PG fresh-account schema. No Supabase data is copied.
-- CloudBase auth.users.id is bigint in this environment; JWT sub and auth.uid()
-- are text, so all Shiye owner keys use text.
create table public.shiye_accounts (
  user_id text primary key,
  username text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shiye_accounts enable row level security;
create policy own_account on public.shiye_accounts for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_accounts from public, anon, authenticated;
grant select on public.shiye_accounts to authenticated;

create table public.shiye_revisions (
  user_id text primary key references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null default 0,
  account_epoch uuid not null default gen_random_uuid()
);
alter table public.shiye_revisions enable row level security;
create policy own_revision on public.shiye_revisions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_revisions from public, anon, authenticated;
grant select on public.shiye_revisions to authenticated;

create table public.shiye_records (
  user_id text not null default auth.uid() references public.shiye_accounts(user_id) on delete cascade,
  store text not null check (store in ('assets','blobs','series','projects','meta','trash')),
  id text not null check (length(id) between 1 and 500),
  record jsonb not null check (jsonb_typeof(record)='object' and record->>'id'=id),
  primary key(user_id,store,id)
);
alter table public.shiye_records enable row level security;
create policy own_records on public.shiye_records for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_records from public, anon, authenticated;
grant select on public.shiye_records to authenticated;

create table public.shiye_changes (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null,
  keys jsonb not null check (jsonb_typeof(keys)='array'),
  primary key(user_id,revision)
);
alter table public.shiye_changes enable row level security;
create policy own_changes on public.shiye_changes for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_changes from public, anon, authenticated;
grant select on public.shiye_changes to authenticated;

create table public.shiye_commits (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  revision bigint not null,
  committed_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.shiye_commits enable row level security;
create policy own_commits on public.shiye_commits for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_commits from public, anon, authenticated;
grant select on public.shiye_commits to authenticated;

insert into public.shiye_accounts(user_id,username,is_admin)
  select sub,'lzy',true from auth.users where username='lzy';
insert into public.shiye_revisions(user_id,revision)
  select user_id,0 from public.shiye_accounts where username='lzy';


-- Apply to the existing Supabase project before enabling deletion protection in
-- the test client. Compatible with shiye_commit_v2 and its idempotency table.
-- Intentionally never expires logical tombstones with seven-day trash entries.
create or replace function public.shiye_commit(operations jsonb,expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  who text := auth.uid();
  current_revision bigint;
  op jsonb;
  row_id text;
  s text;
  action text;
  marker_id text;
  changed jsonb := '[]'::jsonb;
  full_restore boolean;
  legacy_retention jsonb := '[]'::jsonb;
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
  -- A legacy trash card can be the only remaining copy of an image still used
  -- by a work. Capture the server's original card before the loop deletes it.
  -- Only that exact card may become a hidden asset; its tombstone stays put.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', card.record->'item'->>'id', 'item', card.record->'item',
    'date', card.record->>'date')), '[]'::jsonb)
    into legacy_retention
  from jsonb_array_elements(operations) removal
  join public.shiye_records card on card.user_id=who and card.store='trash'
    and card.id=removal->>'id' and card.record->>'kind'='asset'
  where removal->>'store'='trash' and removal->>'action'='delete';
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
          and not (
            s='assets' and op->'item'->>'isProjectInternal'='true'
            and exists(
              select 1 from jsonb_array_elements(legacy_retention) original
              where original->>'id'=row_id
                and op->'item'->>'hiddenFromLibraryAt'=original->>'date'
                and (((op->'item') - 'isProjectInternal'::text) - 'hiddenFromLibraryAt'::text)
                  = (((original->'item') - 'isProjectInternal'::text) - 'hiddenFromLibraryAt'::text)
            )
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




-- Durable per-key revision watermarks for cloud conflict detection.
-- Additive: never modifies user assets, projects, or COS objects.
create table if not exists public.shiye_key_versions (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  store text not null,
  id text not null,
  revision bigint not null,
  primary key(user_id,store,id)
);
alter table public.shiye_key_versions enable row level security;
drop policy if exists shiye_key_versions_select_own on public.shiye_key_versions;
create policy shiye_key_versions_select_own on public.shiye_key_versions
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.shiye_key_versions from public,anon,authenticated;
grant select on public.shiye_key_versions to authenticated;

create table if not exists public.shiye_key_watermark_start (
  user_id text primary key references public.shiye_accounts(user_id) on delete cascade,
  start_revision bigint not null
);
alter table public.shiye_key_watermark_start enable row level security;
drop policy if exists shiye_key_watermark_start_select_own on public.shiye_key_watermark_start;
create policy shiye_key_watermark_start_select_own on public.shiye_key_watermark_start
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.shiye_key_watermark_start from public,anon,authenticated;
grant select on public.shiye_key_watermark_start to authenticated;

-- The earliest retained log provides the provable boundary. Older revisions
-- cannot be inferred as safe from a partial log or sparse watermark table.
insert into public.shiye_key_watermark_start(user_id,start_revision)
select r.user_id,coalesce(min(c.revision)-1,r.revision)
from public.shiye_revisions r
left join public.shiye_changes c on c.user_id=r.user_id
group by r.user_id,r.revision
on conflict(user_id) do nothing;

insert into public.shiye_key_versions(user_id,store,id,revision)
select c.user_id, item->>'store',
  case when item->>'action'='clear' then '*' else item->>'id' end,
  max(c.revision)
from public.shiye_changes c
cross join lateral jsonb_array_elements(c.keys) item
where item->>'store' is not null and (item->>'action'='clear' or item->>'id' is not null)
group by c.user_id,item->>'store',case when item->>'action'='clear' then '*' else item->>'id' end
on conflict(user_id,store,id) do update
  set revision=greatest(public.shiye_key_versions.revision,excluded.revision);

create schema if not exists shiye_internal;
revoke all on schema shiye_internal from public,anon,authenticated;
create or replace function shiye_internal.record_key_revisions()
returns trigger language plpgsql security definer set search_path='' as $$
declare key jsonb; key_id text;
begin
  for key in select value from jsonb_array_elements(new.keys) loop
    key_id:=case when key->>'action'='clear' then '*' else key->>'id' end;
    if key->>'store' is null or key_id is null then
      raise exception '无效的云端变更记录';
    end if;
    insert into public.shiye_key_versions(user_id,store,id,revision)
    values(new.user_id,key->>'store',key_id,new.revision)
    on conflict(user_id,store,id) do update
      set revision=greatest(public.shiye_key_versions.revision,excluded.revision);
  end loop;
  return new;
end;
$$;
revoke all on function shiye_internal.record_key_revisions() from public,anon,authenticated;
drop trigger if exists shiye_capture_key_revisions on public.shiye_changes;
create trigger shiye_capture_key_revisions
  after insert on public.shiye_changes
  for each row execute function shiye_internal.record_key_revisions();


-- Sync protocol 3: the account revision is a read cursor, while writes compare
-- only the keys they touch. Apply before switching the web client to v3.
-- This migration never rewrites an existing user record.
alter table public.shiye_revisions
  add column if not exists account_epoch uuid not null default gen_random_uuid();
create table if not exists public.shiye_commit_receipts_v3 (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  committed_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.shiye_commit_receipts_v3 enable row level security;
drop policy if exists shiye_v3_receipts_select_own on public.shiye_commit_receipts_v3;
create policy shiye_v3_receipts_select_own on public.shiye_commit_receipts_v3
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.shiye_commit_receipts_v3 from public, anon, authenticated;
grant select on public.shiye_commit_receipts_v3 to authenticated;

-- The existing 90-day pruning job only addresses shiye_commits. This separate
-- table keeps v3's compact receipts while still allowing account deletion to
-- cascade normally.
create schema if not exists shiye_internal;
revoke all on schema shiye_internal from public, anon, authenticated;
create or replace function shiye_internal.init_key_watermark()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shiye_key_watermark_start(user_id,start_revision)
    values(new.user_id,0) on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function shiye_internal.init_key_watermark() from public, anon, authenticated;
drop trigger if exists shiye_init_key_watermark on public.shiye_revisions;
create trigger shiye_init_key_watermark after insert on public.shiye_revisions
  for each row execute function shiye_internal.init_key_watermark();

-- Existing reset endpoints submit six store clears in one transaction. Rotate
-- the epoch in that same transaction, including for a still-open old tab.
create or replace function shiye_internal.rotate_epoch_on_reset()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(distinct value->>'store') from jsonb_array_elements(new.keys) value
      where value->>'action' = 'clear'
        and value->>'store' in ('assets','blobs','series','projects','meta','trash')) = 6 then
    update public.shiye_revisions set account_epoch = gen_random_uuid()
      where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function shiye_internal.rotate_epoch_on_reset() from public, anon, authenticated;
drop trigger if exists shiye_rotate_epoch_on_reset on public.shiye_changes;
create trigger shiye_rotate_epoch_on_reset after insert on public.shiye_changes
  for each row execute function shiye_internal.rotate_epoch_on_reset();

create or replace function public.shiye_commit_v3(
  operations jsonb, base_revision bigint, operation_id uuid,
  expected_epoch uuid, sync_protocol_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who text := auth.uid();
  current_revision bigint;
  current_epoch uuid;
  previous public.shiye_commit_receipts_v3%rowtype;
  fingerprint text := md5(operations::text);
  op jsonb;
  s text;
  row_id text;
  last_key_revision bigint;
  first_provable bigint;
  committed_revision bigint;
  committed_epoch uuid;
  answer jsonb;
begin
  if who is null then raise exception using errcode = '28000', message = '请先登录'; end if;
  if sync_protocol_version <> 3 then
    raise exception using errcode = 'P0001', message = '同步协议版本不匹配，请更新应用';
  end if;
  if operation_id is null or expected_epoch is null or
     base_revision is null or base_revision < 0 then
    raise exception using errcode = 'P0001', message = '同步提交缺少身份或基线';
  end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 20000
     or jsonb_array_length(operations) = 0 then
    raise exception using errcode = 'P0001', message = '无效同步事务';
  end if;
  -- The short account lock only allocates the change cursor and makes the
  -- receipt check atomic. It is not a business conflict test.
  select revision, account_epoch into current_revision, current_epoch
    from public.shiye_revisions where user_id = who for update;
  if not found then raise exception using errcode = 'P0001', message = '账号未获测试权限'; end if;
  if current_epoch <> expected_epoch then
    raise exception using errcode = 'P0001', message = '账号资料已重新开始；旧草稿需单独恢复';
  end if;
  select * into previous from public.shiye_commit_receipts_v3
    where user_id = who and shiye_commit_receipts_v3.operation_id = shiye_commit_v3.operation_id;
  if found then
    if previous.payload_hash <> fingerprint then
      raise exception using errcode = 'P0001', message = '提交编号对应的内容不一致';
    end if;
    return previous.result;
  end if;
  if exists(select 1 from public.shiye_commits
    where user_id = who and shiye_commits.operation_id = shiye_commit_v3.operation_id) then
    raise exception using errcode = 'P0001', message = '旧同步任务编号需先核对收据';
  end if;
  if base_revision > current_revision then
    raise exception using errcode = 'P0001', message = '同步基线超出云端版本';
  end if;
  select start_revision into first_provable from public.shiye_key_watermark_start
    where user_id = who;
  if first_provable is null or base_revision < first_provable then
    raise exception using errcode = 'P0001', message = '同步基线过旧，需核对原件';
  end if;
  for op in select value from jsonb_array_elements(operations) loop
    s := op->>'store';
    if s not in ('assets','blobs','series','projects','meta','trash') or s is null then
      raise exception using errcode = 'P0001', message = '无效数据表';
    end if;
    if op->>'action' = 'clear' then
      -- Clear is intentionally account-wide and must see the current head.
      if base_revision <> current_revision then
        raise exception using errcode = 'PT409', message = '清空期间云端资料已变化';
      end if;
      continue;
    elsif op->>'action' = 'put' then
      row_id := op->'item'->>'id';
    elsif op->>'action' = 'delete' then
      row_id := op->>'id';
    else
      raise exception using errcode = 'P0001', message = '无效同步操作';
    end if;
    if row_id is null or length(row_id) < 1 or length(row_id) > 500 then
      raise exception using errcode = 'P0001', message = '记录 ID 无效';
    end if;
    select greatest(
      coalesce((select revision from public.shiye_key_versions
        where user_id = who and store = s and id = row_id),0),
      coalesce((select revision from public.shiye_key_versions
        where user_id = who and store = s and id = '*'),0))
      into last_key_revision;
    if last_key_revision > base_revision then
      raise exception using errcode = 'PT409', message = '此记录已由另一设备修改';
    end if;
  end loop;
  -- Retain the current tombstone, owner-path and change-log rules in one
  -- transaction. The account revision passed here is the locked server head.
  committed_revision := public.shiye_commit(operations,current_revision);
  select account_epoch into committed_epoch from public.shiye_revisions where user_id = who;
  answer := jsonb_build_object('status','applied','revision',committed_revision,
    'accountEpoch',committed_epoch,'syncProtocolVersion',3);
  insert into public.shiye_commit_receipts_v3
    (user_id,operation_id,payload_hash,result)
    values (who,operation_id,fingerprint,answer);
  return answer;
end;
$$;
revoke all on function public.shiye_commit_v3(jsonb,bigint,uuid,uuid,integer)
  from public, anon;
grant execute on function public.shiye_commit_v3(jsonb,bigint,uuid,uuid,integer)
  to authenticated;


-- Parallel v3 entry point for clients with a bounded retry loop.
-- The data contract remains v3; the old entry point stays available until
-- its removal is separately approved after all test clients are refreshed.
create or replace function public.shiye_commit_v3_guarded(
  operations jsonb, base_revision bigint, operation_id uuid,
  expected_epoch uuid, sync_protocol_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who text := auth.uid();
  current_revision bigint;
  current_epoch uuid;
  previous public.shiye_commit_receipts_v3%rowtype;
  fingerprint text := md5(operations::text);
  op jsonb;
  s text;
  row_id text;
  last_key_revision bigint;
  first_provable bigint;
  committed_revision bigint;
  committed_epoch uuid;
  answer jsonb;
begin
  if who is null then raise exception using errcode = '28000', message = '请先登录'; end if;
  if sync_protocol_version <> 3 then
    raise exception using errcode = 'P0001', message = '同步协议版本不匹配，请更新应用';
  end if;
  if operation_id is null or expected_epoch is null or
     base_revision is null or base_revision < 0 then
    raise exception using errcode = 'P0001', message = '同步提交缺少身份或基线';
  end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 20000
     or jsonb_array_length(operations) = 0 then
    raise exception using errcode = 'P0001', message = '无效同步事务';
  end if;
  -- The short account lock only allocates the change cursor and makes the
  -- receipt check atomic. It is not a business conflict test.
  select revision, account_epoch into current_revision, current_epoch
    from public.shiye_revisions where user_id = who for update;
  if not found then raise exception using errcode = 'P0001', message = '账号未获测试权限'; end if;
  if current_epoch <> expected_epoch then
    raise exception using errcode = 'P0001', message = '账号资料已重新开始；旧草稿需单独恢复';
  end if;
  select * into previous from public.shiye_commit_receipts_v3
    where user_id = who and shiye_commit_receipts_v3.operation_id = shiye_commit_v3_guarded.operation_id;
  if found then
    if previous.payload_hash <> fingerprint then
      raise exception using errcode = 'P0001', message = '提交编号对应的内容不一致';
    end if;
    return previous.result;
  end if;
  if exists(select 1 from public.shiye_commits
    where user_id = who and shiye_commits.operation_id = shiye_commit_v3_guarded.operation_id) then
    raise exception using errcode = 'P0001', message = '旧同步任务编号需先核对收据';
  end if;
  if base_revision > current_revision then
    raise exception using errcode = 'P0001', message = '同步基线超出云端版本';
  end if;
  select start_revision into first_provable from public.shiye_key_watermark_start
    where user_id = who;
  if first_provable is null or base_revision < first_provable then
    raise exception using errcode = 'P0001', message = '同步基线过旧，需核对原件';
  end if;
  for op in select value from jsonb_array_elements(operations) loop
    s := op->>'store';
    if s not in ('assets','blobs','series','projects','meta','trash') or s is null then
      raise exception using errcode = 'P0001', message = '无效数据表';
    end if;
    if op->>'action' = 'clear' then
      -- Clear is intentionally account-wide and must see the current head.
      if base_revision <> current_revision then
        raise exception using errcode = 'PT409', message = '清空期间云端资料已变化';
      end if;
      continue;
    elsif op->>'action' = 'put' then
      row_id := op->'item'->>'id';
    elsif op->>'action' = 'delete' then
      row_id := op->>'id';
    else
      raise exception using errcode = 'P0001', message = '无效同步操作';
    end if;
    if row_id is null or length(row_id) < 1 or length(row_id) > 500 then
      raise exception using errcode = 'P0001', message = '记录 ID 无效';
    end if;
    select greatest(
      coalesce((select revision from public.shiye_key_versions
        where user_id = who and store = s and id = row_id),0),
      coalesce((select revision from public.shiye_key_versions
        where user_id = who and store = s and id = '*'),0))
      into last_key_revision;
    if last_key_revision > base_revision then
      raise exception using errcode = 'PT409', message = '此记录已由另一设备修改';
    end if;
  end loop;
  -- Retain the current tombstone, owner-path and change-log rules in one
  -- transaction. The account revision passed here is the locked server head.
  committed_revision := public.shiye_commit(operations,current_revision);
  select account_epoch into committed_epoch from public.shiye_revisions where user_id = who;
  answer := jsonb_build_object('status','applied','revision',committed_revision,
    'accountEpoch',committed_epoch,'syncProtocolVersion',3);
  insert into public.shiye_commit_receipts_v3
    (user_id,operation_id,payload_hash,result)
    values (who,operation_id,fingerprint,answer);
  return answer;
end;
$$;
revoke all on function public.shiye_commit_v3_guarded(jsonb,bigint,uuid,uuid,integer)
  from public, anon;
grant execute on function public.shiye_commit_v3_guarded(jsonb,bigint,uuid,uuid,integer)
  to authenticated;
