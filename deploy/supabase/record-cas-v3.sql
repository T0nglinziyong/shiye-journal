-- Sync protocol 3: the account revision is a read cursor, while writes compare
-- only the keys they touch. Apply before switching the web client to v3.
-- This migration never rewrites an existing user record.
alter table public.shiye_revisions
  add column if not exists account_epoch uuid not null default gen_random_uuid();
create table if not exists public.shiye_commit_receipts_v3 (
  user_id uuid not null references public.shiye_accounts(user_id) on delete cascade,
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
  who uuid := auth.uid();
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
