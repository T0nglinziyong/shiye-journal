insert into storage.objects values('shiye-private','10000000001/creative/11111111-1111-4111-8111-111111111111/input.json');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000001',false);
select public.shiye_enqueue_creative_job_v1('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','project-one','sha256:'||repeat('a',64));
select public.shiye_enqueue_creative_job_v1('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','project-one','sha256:'||repeat('a',64));
do $$begin
  if (select count(*) from public.shiye_creative_jobs)<>1 then raise exception 'duplicate enqueue'; end if;
  begin
    perform public.shiye_enqueue_creative_job_v1('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','changed','sha256:'||repeat('a',64));
    raise exception 'changed input accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.shiye_claim_creative_job_v1('11111111-1111-4111-8111-111111111111','shiye-compute-01');
    raise exception 'user can claim';
  exception when insufficient_privilege then null; end;
  begin perform * from public.shiye_creative_checkpoints;raise exception 'user can read private execution journal';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000002',false);
do $$begin
  if exists(select 1 from public.shiye_creative_jobs) then raise exception 'cross-account read'; end if;
  begin perform public.shiye_cancel_creative_job_v1('11111111-1111-4111-8111-111111111111');raise exception 'cross-account cancel';
  exception when sqlstate '22023' then null; end;
end $$;
set role service_role;
select set_config('test.oldlease',public.shiye_claim_creative_job_v1('11111111-1111-4111-8111-111111111111','shiye-compute-01')->>'lease_token',false);
do $$begin
  if public.shiye_claim_creative_job_v1('11111111-1111-4111-8111-111111111111','shiye-compute-01')<>'{}'::jsonb then raise exception 'duplicate claim'; end if;
end $$;
reset role;
insert into public.shiye_creative_jobs(id,user_id,request_id,project_id,input_path,input_hash)
values('44444444-4444-4444-8444-444444444444','10000000001','44444444-4444-4444-8444-444444444444','retry','unused','sha256:'||repeat('a',64));
set role service_role;
select set_config('test.retrylease',public.shiye_claim_creative_job_v1('44444444-4444-4444-8444-444444444444','shiye-compute-01')->>'lease_token',false);
do $$begin
  if (public.shiye_release_creative_job_v1('44444444-4444-4444-8444-444444444444',current_setting('test.retrylease')::uuid)->>'status')<>'queued' then raise exception 'transient failure not retried'; end if;
  begin perform public.shiye_update_creative_job_v1('44444444-4444-4444-8444-444444444444',current_setting('test.retrylease')::uuid,'{}');raise exception 'released writer accepted';
  exception when sqlstate '55000' then null; end;
end $$;
select set_config('test.retrylease',public.shiye_claim_creative_job_v1('44444444-4444-4444-8444-444444444444','shiye-compute-01')->>'lease_token',false);
select public.shiye_release_creative_job_v1('44444444-4444-4444-8444-444444444444',current_setting('test.retrylease')::uuid);
select set_config('test.retrylease',public.shiye_claim_creative_job_v1('44444444-4444-4444-8444-444444444444','shiye-compute-01')->>'lease_token',false);
do $$begin
  if (public.shiye_release_creative_job_v1('44444444-4444-4444-8444-444444444444',current_setting('test.retrylease')::uuid)->>'status')<>'failed' then raise exception 'unbounded retries'; end if;
end $$;
reset role;
insert into storage.objects values('shiye-private','10000000001/creative/11111111-1111-4111-8111-111111111111/checkpoints/'||repeat('b',64)||'.json.gz');
set role service_role;
select public.shiye_append_creative_checkpoint_v1('11111111-1111-4111-8111-111111111111',current_setting('test.oldlease')::uuid,1,'10000000001/creative/11111111-1111-4111-8111-111111111111/checkpoints/'||repeat('b',64)||'.json.gz','sha256:'||repeat('b',64));
select public.shiye_append_creative_checkpoint_v1('11111111-1111-4111-8111-111111111111',current_setting('test.oldlease')::uuid,1,'10000000001/creative/11111111-1111-4111-8111-111111111111/checkpoints/'||repeat('b',64)||'.json.gz','sha256:'||repeat('b',64));
do $$begin
  if (select checkpoint_seq from public.shiye_creative_jobs where id='11111111-1111-4111-8111-111111111111')<>1 then raise exception 'checkpoint duplicate'; end if;
  begin perform public.shiye_append_creative_checkpoint_v1('11111111-1111-4111-8111-111111111111',current_setting('test.oldlease')::uuid,3,'10000000001/creative/11111111-1111-4111-8111-111111111111/checkpoints/'||repeat('b',64)||'.json.gz','sha256:'||repeat('b',64));raise exception 'sequence gap';
  exception when sqlstate '22023' then null; end;
end $$;
update public.shiye_creative_jobs set lease_until=now()-interval '1 second' where id='11111111-1111-4111-8111-111111111111';
select set_config('test.newlease',public.shiye_claim_creative_job_v1('11111111-1111-4111-8111-111111111111','shiye-compute-01')->>'lease_token',false);
do $$begin
  if current_setting('test.oldlease')=current_setting('test.newlease') then raise exception 'lease was reused'; end if;
  begin perform public.shiye_update_creative_job_v1('11111111-1111-4111-8111-111111111111',current_setting('test.oldlease')::uuid,'{"stage":"late"}');raise exception 'stale writer accepted';
  exception when sqlstate '55000' then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','10000000001',false);
select public.shiye_cancel_creative_job_v1('11111111-1111-4111-8111-111111111111');
set role service_role;
do $$begin
  begin perform public.shiye_update_creative_job_v1('11111111-1111-4111-8111-111111111111',current_setting('test.newlease')::uuid,'{"stage":"done"}');raise exception 'cancelled writer accepted';
  exception when sqlstate '55000' then null; end;
  if (public.shiye_claim_creative_job_v1('11111111-1111-4111-8111-111111111111','shiye-compute-01')->>'status')<>'cancelled' then raise exception 'cancelled requeued'; end if;
end $$;
reset role;
insert into public.shiye_creative_jobs(id,user_id,request_id,project_id,input_path,input_hash,deadline_at)
values('22222222-2222-4222-8222-222222222222','10000000001','22222222-2222-4222-8222-222222222222','expired','unused','sha256:'||repeat('a',64),now()-interval '1 second');
set role service_role;
do $$begin
  if (public.shiye_claim_creative_job_v1('22222222-2222-4222-8222-222222222222','shiye-compute-01')->>'status')<>'failed' then raise exception 'expired task restarted'; end if;
end $$;
reset role;
insert into public.shiye_creative_jobs(id,user_id,request_id,project_id,input_path,input_hash)
values('33333333-3333-4333-8333-333333333333','10000000001','33333333-3333-4333-8333-333333333333','final','unused','sha256:'||repeat('a',64));
insert into storage.objects values('shiye-private','10000000001/creative/33333333-3333-4333-8333-333333333333/results/'||repeat('c',64)||'.json');
set role service_role;
select set_config('test.finallease',public.shiye_claim_creative_job_v1('33333333-3333-4333-8333-333333333333','shiye-compute-01')->>'lease_token',false);
select public.shiye_update_creative_job_v1('33333333-3333-4333-8333-333333333333',current_setting('test.finallease')::uuid,null,'10000000001/creative/33333333-3333-4333-8333-333333333333/results/'||repeat('c',64)||'.json');
select public.shiye_update_creative_job_v1('33333333-3333-4333-8333-333333333333',current_setting('test.finallease')::uuid,null,'10000000001/creative/33333333-3333-4333-8333-333333333333/results/'||repeat('c',64)||'.json');
do $$begin
  if (select status from public.shiye_creative_jobs where id='33333333-3333-4333-8333-333333333333')<>'completed' then raise exception 'finish failed'; end if;
end $$;
reset role;

update public.shiye_creative_jobs set updated_at=now()-interval '2 days' where id='33333333-3333-4333-8333-333333333333';
insert into storage.objects values('shiye-private','10000000001/creative/33333333-3333-4333-8333-333333333333/input.json');
set role service_role;
do $$declare plan jsonb;begin
  plan:=public.shiye_creative_cleanup_plan_v1();
  if jsonb_array_length(plan->'names')<>1 or plan->'names'->>0 not like '%/input.json' then raise exception 'undelivered result scheduled for removal';end if;
end $$;
reset role;
insert into public.shiye_records values('10000000001','projects','final','{"creativeCompletedJobs":{"33333333-3333-4333-8333-333333333333":"draft"}}');
set role service_role;
do $$begin
  if jsonb_array_length(public.shiye_creative_cleanup_plan_v1()->'names')<>2 then raise exception 'saved result not reclaimable';end if;
end $$;
reset role;
