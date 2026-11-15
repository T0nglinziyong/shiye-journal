-- Reversible additive migration. Apply only after a verified database backup.
create table if not exists public.shiye_compute_jobs (
  id uuid primary key,
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('material-recognition','material-segmentation')),
  model text not null check (model in ('sam2-tiny','sam2-small','sam2-large')),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters)='object'),
  input_path text not null,
  result_path text,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_until timestamptz,
  worker_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index if not exists shiye_compute_jobs_pending on public.shiye_compute_jobs(status,lease_until,created_at)
  where status in ('queued','running');
alter table public.shiye_compute_jobs enable row level security;
drop policy if exists shiye_compute_jobs_owner_read on public.shiye_compute_jobs;
create policy shiye_compute_jobs_owner_read on public.shiye_compute_jobs for select to authenticated
  using (user_id=(select auth.uid()));
revoke all on public.shiye_compute_jobs from public,anon,authenticated;
grant select on public.shiye_compute_jobs to authenticated;

create or replace function public.shiye_enqueue_compute_job_v1(
  p_id uuid,p_request_id uuid,p_kind text,p_model text,p_parameters jsonb,p_input_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text := auth.uid(); row public.shiye_compute_jobs%rowtype;
begin
  if who is null or not exists(select 1 from public.shiye_accounts where user_id=who) then
    raise exception '请先登录拾页账号' using errcode='28000';
  end if;
  if p_kind not in ('material-recognition','material-segmentation') or
     p_model not in ('sam2-tiny','sam2-small','sam2-large') or
     jsonb_typeof(p_parameters)<>'object' or pg_catalog.length(p_parameters::text)>2048 or
     p_input_path<>who||'/compute/'||p_id::text||'/input.png' then
    raise exception '识别任务参数无效' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='shiye-private' and name=p_input_path) then
    raise exception '识别输入尚未上传' using errcode='22023';
  end if;
  insert into public.shiye_compute_jobs(id,user_id,request_id,kind,model,parameters,input_path)
    values(p_id,who,p_request_id,p_kind,p_model,p_parameters,p_input_path)
    on conflict (user_id,request_id) do nothing;
  select * into row from public.shiye_compute_jobs where user_id=who and request_id=p_request_id;
  if row.id<>p_id or row.kind<>p_kind or row.model<>p_model or row.parameters<>p_parameters or row.input_path<>p_input_path then
    raise exception '任务幂等编号已用于不同输入' using errcode='22023';
  end if;
  return pg_catalog.jsonb_build_object('id',row.id,'status',row.status);
end $$;
revoke all on function public.shiye_enqueue_compute_job_v1(uuid,uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.shiye_enqueue_compute_job_v1(uuid,uuid,text,text,jsonb,text) to authenticated;

create or replace function public.shiye_claim_compute_job_v1(p_worker_id text,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_compute_jobs%rowtype; failed_ids jsonb;
begin
  if p_worker_id<>'shiye-compute-01' then raise exception '计算服务器编号无效' using errcode='22023'; end if;
  with expired as (
    update public.shiye_compute_jobs set status='failed',lease_until=null,
      error_code='WORKER_LEASE_EXPIRED',updated_at=pg_catalog.now()
      where status='running' and attempts>=3 and lease_until<pg_catalog.now()
      returning id
  ) select coalesce(pg_catalog.jsonb_agg(id),'[]'::jsonb) into failed_ids from expired;
  select * into row from public.shiye_compute_jobs
    where (p_id is null or id=p_id) and
      ((status='queued' and (lease_until is null or lease_until<pg_catalog.now())) or
       (status='running' and lease_until<pg_catalog.now())) and attempts<3
    order by created_at for update skip locked limit 1;
  if not found then return pg_catalog.jsonb_build_object('failed_ids',failed_ids); end if;
  update public.shiye_compute_jobs set status='running',attempts=attempts+1,
    worker_id=p_worker_id,lease_until=pg_catalog.now()+interval '15 minutes',updated_at=pg_catalog.now()
    where id=row.id returning * into row;
  return pg_catalog.jsonb_build_object('id',row.id,'user_id',row.user_id,'kind',row.kind,
    'model',row.model,'parameters',row.parameters,'input_path',row.input_path,'attempts',row.attempts,
    'failed_ids',failed_ids);
end $$;
revoke all on function public.shiye_claim_compute_job_v1(text,uuid) from public,anon,authenticated;
grant execute on function public.shiye_claim_compute_job_v1(text,uuid) to service_role;

create or replace function public.shiye_finish_compute_job_v1(
  p_id uuid,p_worker_id text,p_attempt integer,p_result_path text default null,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.shiye_compute_jobs%rowtype;
begin
  select * into row from public.shiye_compute_jobs where id=p_id for update;
  if not found then raise exception '任务不存在' using errcode='22023'; end if;
  if row.status='completed' and row.result_path=p_result_path then
    return pg_catalog.jsonb_build_object('id',row.id,'status',row.status,'user_id',row.user_id);
  end if;
  if row.status<>'running' or row.worker_id<>p_worker_id or row.attempts<>p_attempt then
    raise exception '任务租约已过期或被其他服务器领取' using errcode='22023';
  end if;
  if p_result_path is not null then
    if p_result_path<>row.user_id||'/compute/'||row.id::text||'/result.json' or
       not exists(select 1 from storage.objects where bucket_id='shiye-private' and name=p_result_path) then
      raise exception '识别结果尚未上传' using errcode='22023';
    end if;
    update public.shiye_compute_jobs set status='completed',result_path=p_result_path,error_code=null,
      lease_until=null,updated_at=pg_catalog.now() where id=p_id;
  else
    update public.shiye_compute_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,
      error_code=pg_catalog.left(coalesce(p_error_code,'COMPUTE_FAILED'),80),
      lease_until=case when attempts>=3 then null else pg_catalog.now()+
        pg_catalog.make_interval(secs=>case when attempts=1 then 30 else 90 end) end,
      updated_at=pg_catalog.now() where id=p_id;
  end if;
  select * into row from public.shiye_compute_jobs where id=p_id;
  return pg_catalog.jsonb_build_object('id',row.id,'status',row.status,'user_id',row.user_id);
end $$;
revoke all on function public.shiye_finish_compute_job_v1(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.shiye_finish_compute_job_v1(uuid,text,integer,text,text) to service_role;
