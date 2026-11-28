-- Every CloudBase Auth user gets a normal Shiye account at registration.
-- Apply in the test environment with the CloudBase SQL administrator. Existing
-- account rows, including the original administrator, keep their permissions.
begin;

create or replace function public.shiye_register_auth_account(
  p_user_id text, p_username text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  account_name text;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id::text = p_user_id
  ) then
    raise exception 'CloudBase Auth user does not exist';
  end if;

  account_name := coalesce(nullif(btrim(p_username), ''), 'user-' || p_user_id);
  insert into public.shiye_accounts(user_id, username, is_admin)
    values (p_user_id, account_name, false)
    on conflict do nothing;

  -- A deleted Auth identity may leave an older Shiye row with the same name.
  -- Never take that row over or grant its old administrator bit to a new ID.
  if not exists (select 1 from public.shiye_accounts where user_id = p_user_id) then
    insert into public.shiye_accounts(user_id, username, is_admin)
      values (p_user_id, 'user-' || p_user_id, false)
      on conflict do nothing;
  end if;
  if not exists (select 1 from public.shiye_accounts where user_id = p_user_id) then
    raise exception 'Could not create Shiye account for Auth user %', p_user_id;
  end if;

  insert into public.shiye_revisions(user_id, revision)
    values (p_user_id, 0)
    on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.shiye_register_auth_account(text, text)
  from public, anon, authenticated;

create or replace function public.shiye_on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.shiye_register_auth_account(new.id::text, new.username);
  return new;
end;
$$;

revoke all on function public.shiye_on_auth_user_created()
  from public, anon, authenticated;

drop trigger if exists shiye_auth_user_created on auth.users;
create trigger shiye_auth_user_created
  after insert on auth.users for each row
  execute function public.shiye_on_auth_user_created();

-- The built-in console administrator is not an application account. Backfill
-- users already created before this trigger, including the new test user.
do $$
declare member record;
begin
  for member in
    select id::text as user_id, username from auth.users
    where coalesce(username, '') <> 'administrator'
  loop
    perform public.shiye_register_auth_account(member.user_id, member.username);
  end loop;
end;
$$;

commit;
