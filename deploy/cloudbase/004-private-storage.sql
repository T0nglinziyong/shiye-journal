-- CloudBase PG Storage for account objects and the 70 shared source templates.
-- Copy and verify all template JPEGs before deploying the frontend.
insert into storage.buckets(id,name,public,file_size_limit)
values ('shiye-private','拾页私有图片',false,52428800)
on conflict (id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('shiye-presets','拾页预设原图',false,52428800,array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='shiye_private_read') then
    create policy shiye_private_read on storage.objects for select to authenticated
      using (bucket_id='shiye-private' and (storage.foldername(name))[1]=(select auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='shiye_private_insert') then
    create policy shiye_private_insert on storage.objects for insert to authenticated
      with check (bucket_id='shiye-private' and (storage.foldername(name))[1]=(select auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='shiye_presets_read') then
    create policy shiye_presets_read on storage.objects for select to authenticated
      using (bucket_id='shiye-presets' and name ~ '^journal-presets/source/([1-9]|[1-6][0-9]|70)[.]jpg$');
  end if;
end $$;

-- These hash-addressed objects are immutable. No browser UPDATE or DELETE
-- policy is granted; later garbage collection needs a separate audited path.
