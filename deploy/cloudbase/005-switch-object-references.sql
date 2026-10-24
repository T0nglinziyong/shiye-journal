-- Run only after every referenced COS object has been copied to shiye-private
-- and independently downloaded with matching SHA-256. Existing COS bytes are
-- retained during the rollout. This updates metadata and the sync cursor in
-- one transaction; it never deletes an image or account.
begin;

do $$
declare account_id text;
declare changed jsonb;
declare next_revision bigint;
begin
  if (select count(*) from storage.objects where bucket_id='shiye-presets'
        and name ~ '^journal-presets/source/([1-9]|[1-6][0-9]|70)[.]jpg$') <> 70 then
    raise exception 'The 70 source presets are not all in CloudBase storage';
  end if;
  if exists (
    select 1 from public.shiye_records r
    where r.store='blobs' and r.record->>'storageProvider'='cos'
      and not exists (
        select 1 from storage.objects o
        where o.bucket_id='shiye-private' and o.name=r.record->>'storagePath'
      )
  ) then
    raise exception 'A COS blob reference has no CloudBase object';
  end if;

  for account_id in
    select distinct user_id from public.shiye_records
    where store='blobs' and record->>'storageProvider'='cos'
  loop
    -- Follow the same lock order as the guarded sync transaction.
    select revision+1 into next_revision from public.shiye_revisions
      where user_id=account_id for update;
    if next_revision is null then raise exception 'Missing account revision'; end if;
    with moved as (
      update public.shiye_records
      set record=jsonb_set(record,'{storageProvider}','"cloudbase"'::jsonb,true)
      where user_id=account_id and store='blobs'
        and record->>'storageProvider'='cos'
      returning id
    )
    select jsonb_agg(jsonb_build_object('store','blobs','action','put','id',id))
      into changed from moved;
    if changed is not null then
      update public.shiye_revisions set revision=next_revision
        where user_id=account_id;
      insert into public.shiye_changes(user_id,revision,keys)
        values(account_id,next_revision,changed);
      delete from public.shiye_changes
        where user_id=account_id and revision<next_revision-250;
    end if;
  end loop;
end $$;

-- Older open tabs retain their local outbox; they may not publish a new COS
-- reference after this switch. A supported client can retry the same data
-- through CloudBase storage on its next launch.
alter table public.shiye_records
  add constraint shiye_cloudbase_blob_provider
  check (store <> 'blobs' or (record->>'storageProvider') is not distinct from 'cloudbase');

commit;
