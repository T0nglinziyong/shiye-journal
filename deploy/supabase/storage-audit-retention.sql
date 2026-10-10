-- Developer-only Shiye storage observability and bounded retention.
-- No user content, tombstones, or COS objects are deleted by this migration.
-- Supabase PostgreSQL 15+, and existing shiye_accounts.is_admin are required.
create or replace function public.shiye_storage_admin_stats()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  stores jsonb;
  app_bytes bigint;
  database_bytes bigint;
  commit_rows bigint;
  commit_bytes bigint;
  eligible bigint;
  recent_changes bigint;
  changes_bytes bigint;
  watermarks bigint;
  watermark_bytes bigint;
  tombstones bigint;
  trash_rows bigint;
begin
  if actor is null or not exists (
    select 1 from public.shiye_accounts
    where user_id = actor and is_admin is true
  ) then raise exception '仅开发者管理员可查看存储统计' using errcode='42501'; end if;

  select coalesce(jsonb_object_agg(store, jsonb_build_object(
    'count', row_count, 'payloadBytes', bytes
  )), '{}'::jsonb) into stores
  from (
    select store, count(*)::bigint row_count,
      coalesce(sum(pg_column_size(record)),0)::bigint bytes
    from public.shiye_records group by store
  ) grouped;

  select count(*) into tombstones from public.shiye_records
    where store='meta' and id like 'tombstone:%';
  select count(*) into trash_rows from public.shiye_records
    where store='trash';
  select count(*), coalesce(sum(pg_column_size(c)),0),
    count(*) filter (where committed_at < now()-interval '90 days')
    into commit_rows,commit_bytes,eligible
    from public.shiye_commits c;
  select count(*),coalesce(sum(pg_column_size(c)),0)
    into recent_changes,changes_bytes from public.shiye_changes c;
  select count(*),coalesce(sum(pg_column_size(c)),0)
    into watermarks,watermark_bytes from public.shiye_key_versions c;

  select
    pg_total_relation_size('public.shiye_accounts'::regclass) +
    pg_total_relation_size('public.shiye_revisions'::regclass) +
    pg_total_relation_size('public.shiye_records'::regclass) +
    pg_total_relation_size('public.shiye_changes'::regclass) +
    pg_total_relation_size('public.shiye_commits'::regclass) +
    pg_total_relation_size('public.shiye_key_versions'::regclass) +
    pg_total_relation_size('public.shiye_key_watermark_start'::regclass),
    pg_database_size(current_database())
    into app_bytes,database_bytes;

  return jsonb_build_object(
    'measuredAt',now(),
    'appTablesBytes',app_bytes,
    'databaseBytes',database_bytes,
    'stores',stores,
    'tombstones',tombstones,
    'recentlyDeleted',trash_rows,
    'commits',jsonb_build_object('count',commit_rows,'estimatedRowBytes',commit_bytes,
      'eligibleAfter90Days',eligible,'minimumRetentionDays',90),
    'changes',jsonb_build_object('count',recent_changes,'estimatedRowBytes',changes_bytes),
    'watermarks',jsonb_build_object('count',watermarks,'estimatedRowBytes',watermark_bytes),
    'notes','统计包含表索引；数据库总量包含 Supabase 内部对象。payloadBytes 不包含索引和行开销。COS 独立统计。'
  );
end;
$$;
revoke all on function public.shiye_storage_admin_stats() from public,anon,authenticated;
grant execute on function public.shiye_storage_admin_stats() to authenticated;

-- Manual, administrator-confirmed cleanup. Only old acknowledged idempotency
-- receipts are pruned. Every commit already advanced the monotonic revision,
-- so stale replays cannot CAS at the old expected_revision. Preserve permanent
-- deletion markers and per-key conflict watermarks.
create or replace function public.shiye_storage_prune_commits(
  retention_days integer default 90,
  batch_limit integer default 5000
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  deleted_count integer := 0;
begin
  if actor is null or not exists (
    select 1 from public.shiye_accounts
    where user_id=actor and is_admin is true
  ) then raise exception '仅开发者管理员可清理同步收据' using errcode='42501'; end if;
  if retention_days < 90 or retention_days > 3650
      or batch_limit < 1 or batch_limit > 5000 then
    raise exception '无效的安全清理范围';
  end if;
  with old_rows as (
    select c.user_id,c.operation_id
    from public.shiye_commits c
    join public.shiye_revisions v on v.user_id=c.user_id
    where c.committed_at < now() - make_interval(days => retention_days)
      and c.revision < v.revision
    order by c.committed_at
    limit batch_limit
    for update of c skip locked
  ), gone as (
    delete from public.shiye_commits c using old_rows x
    where c.user_id=x.user_id and c.operation_id=x.operation_id
    returning c.operation_id
  ) select count(*) into deleted_count from gone;
  return deleted_count;
end;
$$;
revoke all on function public.shiye_storage_prune_commits(integer,integer) from public,anon,authenticated;
grant execute on function public.shiye_storage_prune_commits(integer,integer) to authenticated;
