-- Additive migration; back up and test in an isolated database before deployment.
begin;
create table if not exists public.shiye_creative_jobs (
  id uuid primary key,
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  request_id uuid not null,
  project_id text not null check (length(project_id) between 1 and 128),
  input_path text not null,
  input_hash text not null check (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_token uuid,
  lease_until timestamptz,
  checkpoint_seq integer not null default 0 check (checkpoint_seq between 0 and 512),
  revision bigint not null default 1,
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress)='object' and length(progress::text)<=4096),
  result_path text,
  error_code text,
  created_at timestamptz not null default now(),
  deadline_at timestamptz not null default now()+interval '10 minutes',
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index if not exists shiye_creative_jobs_active on public.shiye_creative_jobs(created_at)
  where status in ('queued','running');
alter table public.shiye_creative_jobs enable row level security;
drop policy if exists shiye_creative_jobs_owner_read on public.shiye_creative_jobs;
create policy shiye_creative_jobs_owner_read on public.shiye_creative_jobs for select to authenticated
  using (user_id=(select auth.uid()));
revoke all on public.shiye_creative_jobs from public,anon,authenticated;
grant select on public.shiye_creative_jobs to authenticated;
grant all on public.shiye_creative_jobs to service_role;

create table if not exists public.shiye_creative_checkpoints (
  job_id uuid not null references public.shiye_creative_jobs(id) on delete cascade,
  seq integer not null check(seq between 1 and 512),
  object_path text not null,
  object_hash text not null check(object_hash ~ '^sha256:[a-f0-9]{64}$'),
  primary key(job_id,seq)
);
alter table public.shiye_creative_checkpoints enable row level security;
revoke all on public.shiye_creative_checkpoints from public,anon,authenticated;
grant all on public.shiye_creative_checkpoints to service_role;

create or replace function public.shiye_enqueue_creative_job_v1(
  p_id uuid,p_request_id uuid,p_project_id text,p_input_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text:=auth.uid(); row public.shiye_creative_jobs%rowtype; input text;
begin
  if who is null or not exists(select 1 from public.shiye_accounts where user_id=who) then
    raise exception '请先登录拾页账号' using errcode='28000';
  end if;
  if p_id is null or p_request_id is null or p_project_id is null or length(p_project_id) not between 1 and 128
    or p_input_hash is null or p_input_hash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception '创作任务参数无效' using errcode='22023';
  end if;
  input:=who||'/creative/'||p_id::text||'/input.json';
  if not exists(select 1 from storage.objects where bucket_id='shiye-private' and name=input) then
    raise exception '创作输入尚未上传' using errcode='22023';
  end if;
  insert into public.shiye_creative_jobs(id,user_id,request_id,project_id,input_path,input_hash)
    values(p_id,who,p_request_id,p_project_id,input,p_input_hash) on conflict(user_id,request_id) do nothing;
  select * into row from public.shiye_creative_jobs where user_id=who and request_id=p_request_id;
  if row.id<>p_id or row.project_id<>p_project_id or row.input_hash<>p_input_hash then
    raise exception '创作请求编号已用于其他输入' using errcode='22023';
  end if;
  return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision,'deadlineAt',row.deadline_at);
end $$;
revoke all on function public.shiye_enqueue_creative_job_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.shiye_enqueue_creative_job_v1(uuid,uuid,text,text) to authenticated;

create or replace function public.shiye_cancel_creative_job_v1(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_creative_jobs%rowtype;
begin
  select * into row from public.shiye_creative_jobs where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception '创作任务不存在' using errcode='22023'; end if;
  if row.status in ('queued','running') then
    update public.shiye_creative_jobs set status='cancelled',lease_token=null,lease_until=null,
      revision=revision+1,updated_at=now() where id=p_id returning * into row;
  end if;
  return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision);
end $$;
revoke all on function public.shiye_cancel_creative_job_v1(uuid) from public,anon;
grant execute on function public.shiye_cancel_creative_job_v1(uuid) to authenticated;

create or replace function public.shiye_claim_creative_job_v1(p_id uuid,p_worker_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_creative_jobs%rowtype;
begin
  if p_worker_id is distinct from 'shiye-compute-01' then raise exception '计算服务器编号无效' using errcode='22023'; end if;
  select * into row from public.shiye_creative_jobs where id=p_id for update skip locked;
  if not found then return '{}'::jsonb; end if;
  if row.status not in ('queued','running') then return jsonb_build_object('id',row.id,'status',row.status); end if;
  if row.deadline_at<=now() or row.attempts>=3 and row.lease_until<=now() then
    update public.shiye_creative_jobs set status='failed',error_code='CREATIVE_DEADLINE',lease_token=null,lease_until=null,
      revision=revision+1,updated_at=now() where id=p_id returning * into row;
    return jsonb_build_object('id',row.id,'status',row.status);
  end if;
  if row.status='running' and row.lease_until>now() then return '{}'::jsonb; end if;
  update public.shiye_creative_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
    lease_until=least(deadline_at,now()+interval '150 seconds'),revision=revision+1,updated_at=now()
    where id=p_id returning * into row;
  return to_jsonb(row);
end $$;
revoke all on function public.shiye_claim_creative_job_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.shiye_claim_creative_job_v1(uuid,text) to service_role;

create or replace function public.shiye_append_creative_checkpoint_v1(
  p_id uuid,p_lease uuid,p_seq integer,p_path text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_creative_jobs%rowtype; entry public.shiye_creative_checkpoints%rowtype;
begin
  select * into row from public.shiye_creative_jobs where id=p_id for update;
  if not found or row.status<>'running' or row.lease_token is distinct from p_lease or p_lease is null
    or row.lease_until<=now() or row.deadline_at<=now() then
    raise exception '创作租约已失效或任务已取消' using errcode='55000';
  end if;
  if p_seq is null or p_seq not between 1 and 512 or p_hash is null or p_hash !~ '^sha256:[a-f0-9]{64}$'
    or p_path is distinct from row.user_id||'/creative/'||p_id::text||'/checkpoints/'||substr(p_hash,8)||'.json.gz' then
    raise exception '检查点路径无效' using errcode='22023';
  end if;
  select * into entry from public.shiye_creative_checkpoints where job_id=p_id and seq=p_seq;
  if found then
    if entry.object_hash<>p_hash or entry.object_path<>p_path then raise exception '检查点编号冲突' using errcode='22023'; end if;
    return jsonb_build_object('seq',p_seq);
  end if;
  if p_seq<>row.checkpoint_seq+1 or not exists(select 1 from storage.objects where bucket_id='shiye-private' and name=p_path) then
    raise exception '检查点尚未上传或顺序不连续' using errcode='22023';
  end if;
  insert into public.shiye_creative_checkpoints values(p_id,p_seq,p_path,p_hash);
  update public.shiye_creative_jobs set checkpoint_seq=p_seq,
    lease_until=least(deadline_at,now()+interval '150 seconds'),updated_at=now() where id=p_id;
  return jsonb_build_object('seq',p_seq);
end $$;
revoke all on function public.shiye_append_creative_checkpoint_v1(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.shiye_append_creative_checkpoint_v1(uuid,uuid,integer,text,text) to service_role;

create or replace function public.shiye_update_creative_job_v1(
  p_id uuid,p_lease uuid,p_progress jsonb default null,p_result_path text default null,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_creative_jobs%rowtype;
begin
  select * into row from public.shiye_creative_jobs where id=p_id for update;
  if not found then raise exception '创作任务不存在' using errcode='22023'; end if;
  if row.status='completed' and row.lease_token=p_lease and row.result_path=p_result_path then
    return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision);
  end if;
  if row.status<>'running' or row.lease_token is distinct from p_lease or p_lease is null or row.lease_until<=now() then
    raise exception '创作租约已失效或任务已取消' using errcode='55000';
  end if;
  if row.deadline_at<=now() then
    update public.shiye_creative_jobs set status='failed',error_code='CREATIVE_DEADLINE',lease_until=null,
      revision=revision+1,updated_at=now() where id=p_id returning * into row;
    return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision);
  end if;
  if p_progress is not null and (jsonb_typeof(p_progress)<>'object' or length(p_progress::text)>4096) then
    raise exception '创作进度格式无效' using errcode='22023';
  end if;
  if p_result_path is not null and (p_result_path !~ ('^'||row.user_id||'/creative/'||p_id::text||'/results/[a-f0-9]{64}\.json$')
    or not exists(select 1 from storage.objects where bucket_id='shiye-private' and name=p_result_path)) then
    raise exception '创作结果尚未上传' using errcode='22023';
  end if;
  if p_result_path is not null and p_error_code is not null then raise exception '完成状态冲突' using errcode='22023'; end if;
  update public.shiye_creative_jobs set
    status=case when p_result_path is not null then 'completed' when p_error_code is not null then 'failed' else status end,
    result_path=coalesce(p_result_path,result_path),error_code=left(p_error_code,80),
    progress=coalesce(p_progress,progress),revision=revision+case when p_progress is not null or p_result_path is not null or p_error_code is not null then 1 else 0 end,
    lease_until=case when p_result_path is not null or p_error_code is not null then null else least(deadline_at,now()+interval '150 seconds') end,
    updated_at=now() where id=p_id returning * into row;
  return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision);
end $$;
revoke all on function public.shiye_update_creative_job_v1(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.shiye_update_creative_job_v1(uuid,uuid,jsonb,text,text) to service_role;

create or replace function public.shiye_release_creative_job_v1(p_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_creative_jobs%rowtype;
begin
  select * into row from public.shiye_creative_jobs where id=p_id for update;
  if not found or row.status<>'running' or p_lease is null or row.lease_token is distinct from p_lease or row.lease_until<=now() then
    raise exception '创作租约已失效或任务已取消' using errcode='55000';
  end if;
  update public.shiye_creative_jobs set status=case when attempts<3 and deadline_at>now()+interval '30 seconds' then 'queued' else 'failed' end,
    error_code='CREATIVE_INTERRUPTED',lease_token=null,lease_until=null,revision=revision+1,updated_at=now()
    where id=p_id returning * into row;
  return jsonb_build_object('id',row.id,'status',row.status,'revision',row.revision);
end $$;
revoke all on function public.shiye_release_creative_job_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shiye_release_creative_job_v1(uuid,uuid) to service_role;
commit;
