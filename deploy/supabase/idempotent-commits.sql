-- Apply before deploying clients that call shiye_commit_v2. This is additive;
-- existing records and the original shiye_commit RPC remain untouched.
create table if not exists public.shiye_commits (
  user_id uuid not null references public.shiye_accounts(user_id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  revision bigint not null,
  committed_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.shiye_commits enable row level security;
create policy own_commits on public.shiye_commits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert on public.shiye_commits to authenticated;
revoke all on public.shiye_commits from anon;

create or replace function public.shiye_commit_v2(
  operations jsonb, expected_revision bigint, operation_id uuid
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  who uuid := auth.uid();
  previous public.shiye_commits%rowtype;
  current_revision bigint;
  fingerprint text := md5(operations::text);
begin
  if who is null then raise exception '请先登录'; end if;
  if operation_id is null then raise exception '提交编号不能为空'; end if;
  -- Serialize retries with ordinary writes on the same account. A response
  -- lost after COMMIT can now be retried without replaying the operations.
  select revision into current_revision from public.shiye_revisions
    where user_id = who for update;
  if not found then raise exception '账号未获测试权限'; end if;
  select * into previous from public.shiye_commits
    where user_id = who and shiye_commits.operation_id = shiye_commit_v2.operation_id;
  if found then
    if previous.payload_hash <> fingerprint then raise exception '提交编号对应的内容不一致'; end if;
    return previous.revision;
  end if;
  current_revision := public.shiye_commit(operations, expected_revision);
  insert into public.shiye_commits(user_id, operation_id, payload_hash, revision)
    values(who, operation_id, fingerprint, current_revision);
  return current_revision;
end;
$$;
revoke all on function public.shiye_commit_v2(jsonb,bigint,uuid) from public, anon;
grant execute on function public.shiye_commit_v2(jsonb,bigint,uuid) to authenticated;
