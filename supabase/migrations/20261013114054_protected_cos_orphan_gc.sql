-- Called only by the scheduled service-role worker after it has copied an
-- original COS object to private quarantine and waited through the grace
-- period. The row lock serializes this check with shiye_commit / _v2.
create table if not exists public.shiye_cos_gc_leases (
  user_id uuid primary key references public.shiye_accounts(user_id) on delete cascade,
  lease_id uuid not null,
  expires_at timestamptz not null
);
alter table public.shiye_cos_gc_leases enable row level security;
revoke all on public.shiye_cos_gc_leases from public, anon, authenticated;

create or replace function public.shiye_gc_claim(
  p_user uuid, p_lease uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_lease is null then return false; end if;
  insert into public.shiye_cos_gc_leases(user_id,lease_id,expires_at)
    values(p_user,p_lease,now()+interval '2 minutes')
    on conflict(user_id) do update set
      lease_id=excluded.lease_id,expires_at=excluded.expires_at
    where public.shiye_cos_gc_leases.expires_at < now();
  return found;
end;
$$;
revoke all on function public.shiye_gc_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shiye_gc_claim(uuid,uuid) to service_role;

create or replace function public.shiye_gc_release(
  p_user uuid, p_lease uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shiye_cos_gc_leases
    where user_id=p_user and lease_id=p_lease;
end;
$$;
revoke all on function public.shiye_gc_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shiye_gc_release(uuid,uuid) to service_role;

-- Expiry runs even when no browser is open. It only removes the recoverable
-- trash card; hidden assets, blobs and COS bytes remain until proven unused.
create or replace function public.shiye_gc_prune_trash(
  p_user uuid, p_trash_id text, p_expected_revision bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  item jsonb;
  deleted_at text;
begin
  if p_user is null or p_trash_id is null or length(p_trash_id)<1
    or length(p_trash_id)>500 then raise exception '无效的最近删除范围'; end if;
  select revision into current_revision from public.shiye_revisions
    where user_id=p_user for update;
  if not found or current_revision<>p_expected_revision then
    raise exception '云端版本已变化，最近删除清理已取消';
  end if;
  select record into item from public.shiye_records
    where user_id=p_user and store='trash' and id=p_trash_id;
  if not found then return current_revision; end if;
  deleted_at:=item->>'date';
  if item->>'kind' not in ('asset','project') or
    deleted_at is null or
    deleted_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or
    deleted_at::timestamptz > now()-interval '30 days' then
    raise exception '最近删除尚未到期或日期无效';
  end if;
  delete from public.shiye_records
    where user_id=p_user and store='trash' and id=p_trash_id;
  update public.shiye_revisions set revision=revision+1
    where user_id=p_user returning revision into current_revision;
  insert into public.shiye_changes(user_id,revision,keys)
    values(p_user,current_revision,jsonb_build_array(jsonb_build_object(
      'store','trash','action','delete','id',p_trash_id)));
  delete from public.shiye_changes
    where user_id=p_user and revision<current_revision-250;
  return current_revision;
end;
$$;
revoke all on function public.shiye_gc_prune_trash(uuid,text,bigint)
  from public,anon,authenticated;
grant execute on function public.shiye_gc_prune_trash(uuid,text,bigint)
  to service_role;

create or replace function public.shiye_gc_prune_blob(
  p_user uuid, p_blob_id text, p_expected_revision bigint
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  source_record jsonb;
  source_path text;
  changed jsonb;
begin
  if p_user is null or p_blob_id is null or length(p_blob_id) < 1
    or length(p_blob_id) > 500 then
    raise exception '无效的图片清理范围';
  end if;
  select revision into current_revision from public.shiye_revisions
    where user_id = p_user for update;
  if not found or current_revision <> p_expected_revision then
    raise exception '云端版本已变化，图片清理已取消';
  end if;
  select record into source_record from public.shiye_records
    where user_id = p_user and store = 'blobs' and id = p_blob_id;
  if not found then return current_revision; end if;
  source_path := source_record->>'storagePath';
  if source_record->>'storageProvider' is distinct from 'cos'
    or source_path is null or left(source_path,length(p_user::text)+1) <> p_user::text||'/'
    or source_path !~ '^[0-9a-f-]+/(reset-[0-9a-f-]+/)?[0-9a-f]{64}$' then
    raise exception '图片不是可回收的当前账号 COS 原图';
  end if;
  -- An asset, trash card, work, archive reference or meta record can protect
  -- the blob. Substring matching intentionally errs on the side of retention.
  if exists (
    select 1 from public.shiye_records r
      where r.user_id = p_user and r.store <> 'blobs'
        and (strpos(r.record::text,p_blob_id) > 0
          or strpos(r.record::text,source_path) > 0)
  ) then raise exception '云端记录仍引用该图片，未删除'; end if;
  delete from public.shiye_records
    where user_id = p_user and store = 'blobs' and id = p_blob_id;
  update public.shiye_revisions set revision = revision + 1
    where user_id = p_user returning revision into current_revision;
  changed := jsonb_build_array(jsonb_build_object(
    'store','blobs','action','delete','id',p_blob_id));
  insert into public.shiye_changes(user_id,revision,keys)
    values(p_user,current_revision,changed);
  delete from public.shiye_changes
    where user_id = p_user and revision < current_revision - 250;
  return current_revision;
end;
$$;

revoke all on function public.shiye_gc_prune_blob(uuid,text,bigint)
  from public, anon, authenticated;
grant execute on function public.shiye_gc_prune_blob(uuid,text,bigint)
  to service_role;
