-- Only current authenticated owner may remove private Supabase Storage
-- objects from their own UUID prefix. The client must use Storage API remove,
-- never DELETE FROM storage.objects (which leaves orphaned object bytes).
-- Apply to the test Supabase project before enabling /api/account-reset.
drop policy if exists shiye_private_owner_delete on storage.objects;
create policy shiye_private_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'shiye-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.shiye_accounts
              where user_id=(select auth.uid()))
);
