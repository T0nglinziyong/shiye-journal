-- Run only in the CloudBase test SQL editor after 007-account-reset-gc.sql.
-- Every write is rolled back, including the synthetic account and reset marker.
begin;
do $$
declare
  who text := 'shiye-gc-fixture-'||replace(gen_random_uuid()::text,'-','');
  epoch uuid; reply jsonb; repeated jsonb; marker jsonb; blocked boolean:=false;
  reset_operation uuid := gen_random_uuid();
begin
  insert into public.shiye_accounts(user_id,username,is_admin)
    values(who,who,false);
  insert into public.shiye_revisions(user_id,revision) values(who,0);
  insert into public.shiye_records(user_id,store,id,record)
    values(who,'assets','a','{"id":"a","title":"fixture"}'::jsonb);
  select account_epoch into epoch from public.shiye_revisions where user_id=who;
  perform set_config('request.jwt.claim.sub',who,true);
  reply:=public.shiye_reset_account_v1(reset_operation,epoch,0,'清空账号');
  if reply->>'accepted'<>'true' then raise exception 'reset was not acknowledged'; end if;
  repeated:=public.shiye_reset_account_v1(reset_operation,epoch,0,'清空账号');
  if repeated->>'resetId'<>reply->>'resetId' or repeated->>'replayed'<>'true'
    then raise exception 'reset retry is not idempotent'; end if;
  if exists(select 1 from public.shiye_records where user_id=who and store='assets')
    then raise exception 'reset left business records'; end if;
  select record into marker from public.shiye_records
    where user_id=who and store='meta' and id='shiye-reset-barrier';
  if marker->>'resetId'<>reply->>'resetId' or marker->>'phase'<>'deleting'
    then raise exception 'reset marker is missing'; end if;
  if exists(select 1 from public.shiye_revisions
      where user_id=who and account_epoch=epoch)
    then raise exception 'old epoch was not invalidated'; end if;
  begin
    perform public.shiye_commit_v3_guarded(
      '[{"store":"assets","action":"put","item":{"id":"a"}}]'::jsonb,
      0,gen_random_uuid(),epoch,3);
  exception when others then blocked:=true; end;
  if not blocked then raise exception 'old epoch revived a record'; end if;
  -- A normal full-backup restore can clear meta without removing the barrier.
  perform set_config('shiye.reset_maintenance','off',true);
  delete from public.shiye_records where user_id=who and store='meta';
  if not exists(select 1 from public.shiye_records
      where user_id=who and store='meta' and id='shiye-reset-barrier')
    then raise exception 'normal meta clear removed reset barrier'; end if;
end $$;
rollback;
