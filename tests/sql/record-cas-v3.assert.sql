\set ON_ERROR_STOP on
do $$
declare
  who uuid:='11111111-1111-4111-8111-111111111111';
  other uuid:='22222222-2222-4222-8222-222222222222';
  epoch uuid;
  answer jsonb;
  repeat_answer jsonb;
  op_a jsonb:='[{"store":"assets","action":"put","item":{"id":"a","title":"A"}}]';
  op_b jsonb:='[{"store":"assets","action":"put","item":{"id":"b","title":"B"}}]';
  blocked boolean:=false;
begin
  insert into public.shiye_accounts values(who),(other);
  insert into public.shiye_revisions(user_id) values(who),(other);
  insert into public.shiye_key_watermark_start values(who,0),(other,0)
    on conflict(user_id) do nothing;
  perform set_config('request.jwt.claim.sub',who::text,true);
  select account_epoch into epoch from public.shiye_revisions where user_id=who;
  answer:=public.shiye_commit_v3(op_a,0,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',epoch,3);
  if answer->>'revision'<>'1' then raise exception 'first CAS failed'; end if;
  -- B is independent, so stale account cursor 0 remains a valid B baseline.
  answer:=public.shiye_commit_v3(op_b,0,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',epoch,3);
  if answer->>'revision'<>'2' then raise exception 'disjoint CAS failed'; end if;
  repeat_answer:=public.shiye_commit_v3(op_b,0,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',epoch,3);
  if answer<>repeat_answer then raise exception 'receipt changed on retry'; end if;
  begin
    perform public.shiye_commit_v3(
      '[{"store":"assets","action":"put","item":{"id":"b","title":"different"}}]',
      0,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',epoch,3);
  exception when others then blocked:=true; end;
  if not blocked then raise exception 'same ID accepted a changed payload'; end if;
  blocked:=false;
  begin
    perform public.shiye_commit_v3(
      '[{"store":"assets","action":"put","item":{"id":"a","title":"competing"}}]',
      0,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',epoch,3);
  exception when sqlstate '40001' then blocked:=true; end;
  if not blocked then raise exception 'same-key CAS was not rejected'; end if;
  perform set_config('request.jwt.claim.sub',other::text,true);
  if exists(select 1 from public.shiye_records where user_id=other) then
    raise exception 'cross-account contamination';
  end if;
  perform set_config('request.jwt.claim.sub',who::text,true);
  answer:=public.shiye_commit_v3(
    '[{"store":"assets","action":"clear"},{"store":"blobs","action":"clear"},{"store":"series","action":"clear"},{"store":"projects","action":"clear"},{"store":"meta","action":"clear"},{"store":"trash","action":"clear"}]',
    2,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',epoch,3);
  if answer->>'accountEpoch'=epoch::text then raise exception 'reset did not rotate epoch'; end if;
  blocked:=false;
  begin
    perform public.shiye_commit_v3(op_a,2,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',epoch,3);
  exception when others then blocked:=true; end;
  if not blocked then raise exception 'old epoch revived a reset record'; end if;
end $$;
select 'record-cas-v3 pass' as result;
do $$
begin
  if has_table_privilege('authenticated','public.shiye_commit_receipts_v3','INSERT') then
    raise exception 'client can forge a v3 receipt';
  end if;
end $$;
select account_epoch as test_epoch from public.shiye_revisions
  where user_id='11111111-1111-4111-8111-111111111111' \gset
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select (public.shiye_commit_v3(
  '[{"store":"assets","action":"put","item":{"id":"authenticated-write"}}]',
  3,'ffffffff-ffff-4fff-8fff-ffffffffffff',:'test_epoch'::uuid,3
))->>'status' as authenticated_status;
reset role;
\i deploy/supabase/record-cas-v3-enforce.sql
do $$
begin
  if has_function_privilege('authenticated','public.shiye_commit(jsonb,bigint)','EXECUTE') or
     has_function_privilege('authenticated','public.shiye_commit_v2(jsonb,bigint,uuid)','EXECUTE') or
     has_table_privilege('authenticated','public.shiye_records','INSERT') then
    raise exception 'an old client can bypass the v3 write gate';
  end if;
end $$;
select account_epoch as gated_epoch,revision as gated_revision from public.shiye_revisions
  where user_id='11111111-1111-4111-8111-111111111111' \gset
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select (public.shiye_commit_v3(
  '[{"store":"assets","action":"put","item":{"id":"gated-write"}}]',
  :'gated_revision'::bigint,'99999999-9999-4999-8999-999999999999',
  :'gated_epoch'::uuid,3
))->>'status' as gated_status;
reset role;
