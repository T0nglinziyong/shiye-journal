-- Read-only access for the fourteen verified new-template case previews.
-- The preset bucket remains private; anonymous reads and browser writes are
-- still denied. Admin upload is a separate, reviewed deployment step.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='shiye_template_cases_read') then
    create policy shiye_template_cases_read on storage.objects for select to authenticated
      using (bucket_id='shiye-presets' and
        name ~ '^journal-presets/template-cases/v1/case-(0[1-9]|1[0-4])[.]jpg$');
  end if;
end $$;
