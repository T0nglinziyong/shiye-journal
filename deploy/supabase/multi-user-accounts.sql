-- Additive migration: preserve every existing account and record.
-- Only the existing lrx account is promoted to the read-only cross-account role.
alter table public.shiye_accounts add column if not exists is_admin boolean not null default false;
update public.shiye_accounts set is_admin = true where username = 'lrx';

create schema if not exists shiye_private;
revoke all on schema shiye_private from public, anon;
grant usage on schema shiye_private to authenticated;

create or replace function shiye_private.is_shiye_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shiye_accounts
    where user_id = (select auth.uid()) and is_admin = true
  );
$$;
revoke all on function shiye_private.is_shiye_admin() from public, anon;
grant execute on function shiye_private.is_shiye_admin() to authenticated;

create policy admin_read_accounts on public.shiye_accounts for select to authenticated
  using ((select shiye_private.is_shiye_admin()));
create policy admin_read_records on public.shiye_records for select to authenticated
  using ((select shiye_private.is_shiye_admin()));

-- Signup metadata is used once to provision a display name. It is never used
-- for authorization; subsequent checks use the immutable auth user id and DB role.
create or replace function shiye_private.create_account_after_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare new_username text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
begin
  if new_username !~ '^[a-z][a-z0-9_]{2,31}$' or new_username = 'lrx' then
    raise exception 'invalid or reserved username';
  end if;
  insert into public.shiye_accounts(user_id, username, is_admin)
    values(new.id, new_username, false);
  insert into public.shiye_revisions(user_id, revision) values(new.id, 0);
  return new;
end;
$$;
revoke all on function shiye_private.create_account_after_signup() from public, anon, authenticated;
create trigger shiye_create_account after insert on auth.users
  for each row execute function shiye_private.create_account_after_signup();
