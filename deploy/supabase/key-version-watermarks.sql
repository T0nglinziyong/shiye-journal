-- Durable per-key revision watermarks for cloud conflict detection.
-- Additive: never modifies user assets, projects, or COS objects.
create table if not exists public.shiye_key_versions (
  user_id uuid not null references public.shiye_accounts(user_id) on delete cascade,
  store text not null,
  id text not null,
  revision bigint not null,
  primary key(user_id,store,id)
);
alter table public.shiye_key_versions enable row level security;
drop policy if exists shiye_key_versions_select_own on public.shiye_key_versions;
create policy shiye_key_versions_select_own on public.shiye_key_versions
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.shiye_key_versions from public,anon,authenticated;
grant select on public.shiye_key_versions to authenticated;

create table if not exists public.shiye_key_watermark_start (
  user_id uuid primary key references public.shiye_accounts(user_id) on delete cascade,
  start_revision bigint not null
);
alter table public.shiye_key_watermark_start enable row level security;
drop policy if exists shiye_key_watermark_start_select_own on public.shiye_key_watermark_start;
create policy shiye_key_watermark_start_select_own on public.shiye_key_watermark_start
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.shiye_key_watermark_start from public,anon,authenticated;
grant select on public.shiye_key_watermark_start to authenticated;

-- The earliest retained log provides the provable boundary. Older revisions
-- cannot be inferred as safe from a partial log or sparse watermark table.
insert into public.shiye_key_watermark_start(user_id,start_revision)
select r.user_id,coalesce(min(c.revision)-1,r.revision)
from public.shiye_revisions r
left join public.shiye_changes c on c.user_id=r.user_id
group by r.user_id,r.revision
on conflict(user_id) do nothing;

insert into public.shiye_key_versions(user_id,store,id,revision)
select c.user_id, item->>'store',
  case when item->>'action'='clear' then '*' else item->>'id' end,
  max(c.revision)
from public.shiye_changes c
cross join lateral jsonb_array_elements(c.keys) item
where item->>'store' is not null and (item->>'action'='clear' or item->>'id' is not null)
group by c.user_id,item->>'store',case when item->>'action'='clear' then '*' else item->>'id' end
on conflict(user_id,store,id) do update
  set revision=greatest(public.shiye_key_versions.revision,excluded.revision);

create schema if not exists shiye_internal;
revoke all on schema shiye_internal from public,anon,authenticated;
create or replace function shiye_internal.record_key_revisions()
returns trigger language plpgsql security definer set search_path='' as $$
declare key jsonb; key_id text;
begin
  for key in select value from jsonb_array_elements(new.keys) loop
    key_id:=case when key->>'action'='clear' then '*' else key->>'id' end;
    if key->>'store' is null or key_id is null then
      raise exception '无效的云端变更记录';
    end if;
    insert into public.shiye_key_versions(user_id,store,id,revision)
    values(new.user_id,key->>'store',key_id,new.revision)
    on conflict(user_id,store,id) do update
      set revision=greatest(public.shiye_key_versions.revision,excluded.revision);
  end loop;
  return new;
end;
$$;
revoke all on function shiye_internal.record_key_revisions() from public,anon,authenticated;
drop trigger if exists shiye_capture_key_revisions on public.shiye_changes;
create trigger shiye_capture_key_revisions
  after insert on public.shiye_changes
  for each row execute function shiye_internal.record_key_revisions();
