-- Account roles and usernames are provisioned only by the auth trigger.
-- Supabase default table grants can be wider than this table's initial GRANT.
revoke all on table public.shiye_accounts from public, anon, authenticated;
grant select on table public.shiye_accounts to authenticated;
