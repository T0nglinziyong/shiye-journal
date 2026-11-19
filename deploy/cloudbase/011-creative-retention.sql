begin;
create or replace function public.shiye_creative_cleanup_plan_v1(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare names jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500 then raise exception '清理批量无效'; end if;
  select coalesce(jsonb_agg(name),'[]'::jsonb) into names from (
    select o.name from storage.objects o join public.shiye_creative_jobs j
      on o.bucket_id='shiye-private' and starts_with(o.name,j.user_id||'/creative/'||j.id::text||'/')
    where j.status in ('completed','failed','cancelled') and j.updated_at<now()-interval '24 hours'
      and (o.name is distinct from j.result_path
        and o.name is distinct from j.progress->>'documentPath'
        and o.name is distinct from j.progress->>'previewPath'
        or exists(select 1 from public.shiye_records r where r.user_id=j.user_id and r.store='projects'
          and r.id=j.project_id and r.record->'creativeCompletedJobs'->>j.id::text is not null))
    order by j.updated_at,o.name limit p_limit
  ) candidates;
  return jsonb_build_object('names',names);
end $$;
revoke all on function public.shiye_creative_cleanup_plan_v1(integer) from public,anon,authenticated;
grant execute on function public.shiye_creative_cleanup_plan_v1(integer) to service_role;
commit;
