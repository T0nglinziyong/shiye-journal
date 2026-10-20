-- Additive, read-only capacity view for the invited account. Apply once to the
-- existing database; never rerun the fresh-account schema on a live project.
begin;
create or replace function public.shiye_account_storage_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=auth.uid(); result jsonb;
begin
 if who is null or not exists(select 1 from public.shiye_accounts where user_id=who) then
   raise exception 'Account not allowed' using errcode='42501';
 end if;
 select jsonb_build_object('recordCount',count(*),
   'metadataJSONBytes',coalesce(sum(octet_length(record::text)),0),
   'blobReferenceCount',count(*) filter(where store='blobs'),
   'assetCount',count(*) filter(where store='assets'),
   'projectCount',count(*) filter(where store='projects'),
   'measurement','logical-json-not-billed-physical-storage')
 into result from public.shiye_records where user_id=who;
 return result;
end$$;
revoke all on function public.shiye_account_storage_v1() from public,anon,authenticated;
grant execute on function public.shiye_account_storage_v1() to authenticated;
notify pgrst,'reload schema';
commit;
