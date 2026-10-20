-- Apply after schema.sql and 004-private-storage.sql. All mutations are
-- restricted to auth.uid(); storage bytes are deleted by the Storage API.
create table if not exists public.shiye_reset_receipts (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  operation_id uuid not null,
  reset_id uuid not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.shiye_reset_receipts enable row level security;
revoke all on public.shiye_reset_receipts from public,anon,authenticated;

create table if not exists public.shiye_gc_candidates (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  name text not null,
  first_seen timestamptz not null default now(),
  last_scanned timestamptz not null default now(),
  primary key(user_id,name)
);
alter table public.shiye_gc_candidates enable row level security;
revoke all on public.shiye_gc_candidates from public,anon,authenticated;

-- Ordinary backup restores clear the meta store. Keep the reset barrier even
-- through that operation; only the dedicated reset/finish RPC may change it.
create or replace function shiye_internal.protect_reset_barrier()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_store text; target_id text;
begin
  target_store:=case when tg_op='DELETE' then old.store else new.store end;
  target_id:=case when tg_op='DELETE' then old.id else new.id end;
  if target_store='meta' and target_id='shiye-reset-barrier'
    and current_setting('shiye.reset_maintenance',true) is distinct from 'on'
    then return null; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function shiye_internal.protect_reset_barrier() from public,anon,authenticated;
drop trigger if exists shiye_protect_reset_barrier on public.shiye_records;
create trigger shiye_protect_reset_barrier before insert or update or delete
  on public.shiye_records for each row execute function shiye_internal.protect_reset_barrier();

create or replace function public.shiye_reset_account_v1(
  operation_id uuid, expected_epoch uuid, expected_revision bigint,
  confirmation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who text := auth.uid();
  prior public.shiye_reset_receipts%rowtype;
  current_revision bigint;
  current_epoch uuid;
  next_revision bigint;
  reset_id uuid := gen_random_uuid();
  keys jsonb;
begin
  if who is null then raise exception using errcode='28000',message='请先登录'; end if;
  if confirmation <> '清空账号' or operation_id is null then
    raise exception using errcode='22023',message='需要明确确认清空账号';
  end if;
  select revision,account_epoch into current_revision,current_epoch
    from public.shiye_revisions where user_id=who for update;
  if not found then raise exception using errcode='28000',message='账号未获授权'; end if;
  select * into prior from public.shiye_reset_receipts
    where user_id=who and shiye_reset_receipts.operation_id=shiye_reset_account_v1.operation_id;
  if found then return jsonb_build_object('resetId',prior.reset_id,
    'revision',prior.revision,'accepted',true,'replayed',true); end if;
  if current_epoch is distinct from expected_epoch or
     current_revision is distinct from expected_revision then
    raise exception using errcode='PT409',message='账号资料已变化，请重新确认';
  end if;
  next_revision:=current_revision+1;
  perform set_config('shiye.reset_maintenance','on',true);
  delete from public.shiye_records where user_id=who;
  -- Old outbox receipts cannot authorize a post-reset replay. Keep this reset
  -- receipt separately so an interrupted request can be retried safely.
  delete from public.shiye_commits where user_id=who;
  delete from public.shiye_commit_receipts_v3 where user_id=who;
  delete from public.shiye_changes where user_id=who;
  delete from public.shiye_key_versions where user_id=who;
  delete from public.shiye_gc_candidates where user_id=who;
  insert into public.shiye_records(user_id,store,id,record) values
    (who,'meta','shiye-reset-barrier',jsonb_build_object(
      'id','shiye-reset-barrier','resetId',reset_id,'operationId',operation_id,
      'revision',next_revision,'phase','deleting','requestedAt',now()));
  update public.shiye_revisions
    set revision=next_revision,account_epoch=gen_random_uuid() where user_id=who;
  update public.shiye_key_watermark_start
    set start_revision=next_revision-1 where user_id=who;
  keys:=jsonb_build_array(
    jsonb_build_object('store','assets','action','clear'),
    jsonb_build_object('store','blobs','action','clear'),
    jsonb_build_object('store','series','action','clear'),
    jsonb_build_object('store','projects','action','clear'),
    jsonb_build_object('store','meta','action','clear'),
    jsonb_build_object('store','trash','action','clear'),
    jsonb_build_object('store','meta','action','put','id','shiye-reset-barrier'));
  insert into public.shiye_changes(user_id,revision,keys)
    values(who,next_revision,keys);
  insert into public.shiye_reset_receipts(user_id,operation_id,reset_id,revision)
    values(who,operation_id,reset_id,next_revision);
  return jsonb_build_object('resetId',reset_id,'revision',next_revision,
    'accepted',true,'replayed',false);
end;
$$;
revoke all on function public.shiye_reset_account_v1(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.shiye_reset_account_v1(uuid,uuid,bigint,text) to authenticated;

-- This predicate is used both when selecting candidates and in the storage
-- DELETE policy. A second reference check immediately before DELETE closes
-- the race between planning and the Storage API request.
create or replace function shiye_internal.gc_allowed(who text, object_name text, object_created timestamptz)
returns boolean language plpgsql security definer stable set search_path='' as $$
declare marker jsonb;
begin
  if who is null or who<>auth.uid() or
     left(object_name,length(who)+1)<>who||'/'
     or position('..' in object_name)>0 then return false; end if;
  select record into marker from public.shiye_records
    where user_id=who and store='meta' and id='shiye-reset-barrier';
  if exists(select 1 from public.shiye_records r
    where r.user_id=who and r.record::text like '%'||replace(replace(replace(
      object_name,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' escape chr(92))
    then return false; end if;
  if marker ? 'resetId' and left(object_name,
     length(who||'/reset-'||(marker->>'resetId')||'/'))<>
     who||'/reset-'||(marker->>'resetId')||'/' then return true; end if;
  if object_created is null or object_created>now()-interval '30 days' then return false; end if;
  if not exists(select 1 from public.shiye_gc_candidates c
    where c.user_id=who and c.name=object_name
      and c.first_seen<=now()-interval '24 hours') then return false; end if;
  return true;
end;
$$;
revoke all on function shiye_internal.gc_allowed(text,text,timestamptz) from public,anon;
grant usage on schema shiye_internal to authenticated;
grant execute on function shiye_internal.gc_allowed(text,text,timestamptz) to authenticated;

drop policy if exists shiye_private_gc_delete on storage.objects;
create policy shiye_private_gc_delete on storage.objects for delete to authenticated
  using (bucket_id='shiye-private' and
    shiye_internal.gc_allowed((select auth.uid()),name,created_at));

create or replace function public.shiye_gc_plan_v1(max_items integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text:=auth.uid(); marker jsonb; current_prefix text; item record;
  selected jsonb:='[]'::jsonb; scanned integer:=0;
begin
  if who is null or not exists(select 1 from public.shiye_accounts where user_id=who)
    then raise exception using errcode='28000',message='账号未获授权'; end if;
  if max_items<1 or max_items>20 then
    raise exception using errcode='22023',message='单次最多处理 20 个对象'; end if;
  select record into marker from public.shiye_records
    where user_id=who and store='meta' and id='shiye-reset-barrier';
  current_prefix:=case when marker ? 'resetId' then
    who||'/reset-'||(marker->>'resetId')||'/' else null end;
  -- The reset generation has priority. This scan is bounded per invocation;
  -- repeat calls advance as deleted objects disappear from storage.objects.
  for item in select name,created_at from storage.objects
    where bucket_id='shiye-private' and left(name,length(who)+1)=who||'/'
      and current_prefix is not null and left(name,length(current_prefix))<>current_prefix
      and shiye_internal.gc_allowed(who,name,created_at)
    order by name limit max_items loop
    if shiye_internal.gc_allowed(who,item.name,item.created_at) then
      selected:=selected||to_jsonb(item.name); end if;
  end loop;
  if jsonb_array_length(selected)<max_items then
    for item in select o.name,o.created_at from storage.objects o
      left join public.shiye_gc_candidates c on c.user_id=who and c.name=o.name
      where o.bucket_id='shiye-private' and left(o.name,length(who)+1)=who||'/'
        and (current_prefix is null or left(o.name,length(current_prefix))=current_prefix)
        and o.created_at<=now()-interval '30 days'
      order by c.last_scanned nulls first,o.created_at,o.name limit 100 loop
      scanned:=scanned+1;
      if not exists(select 1 from public.shiye_records r
        where r.user_id=who and r.record::text like '%'||replace(replace(replace(
          item.name,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' escape chr(92)) then
        insert into public.shiye_gc_candidates(user_id,name,last_scanned)
          values(who,item.name,now()) on conflict(user_id,name) do update
            set last_scanned=now();
        if shiye_internal.gc_allowed(who,item.name,item.created_at) then
          selected:=selected||to_jsonb(item.name);
          exit when jsonb_array_length(selected)>=max_items;
        end if;
      else
        delete from public.shiye_gc_candidates
          where user_id=who and name=item.name;
      end if;
    end loop;
  end if;
  return jsonb_build_object('names',selected,'resetId',marker->>'resetId',
    'resetPending',marker->>'phase'='deleting','scanned',scanned);
end;
$$;
revoke all on function public.shiye_gc_plan_v1(integer) from public,anon;
grant execute on function public.shiye_gc_plan_v1(integer) to authenticated;

create or replace function public.shiye_gc_finish_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text:=auth.uid(); marker jsonb; old_count bigint;
begin
  if who is null then raise exception using errcode='28000',message='请先登录'; end if;
  select record into marker from public.shiye_records
    where user_id=who and store='meta' and id='shiye-reset-barrier' for update;
  if marker is null then return jsonb_build_object('complete',true); end if;
  if marker->>'resetId' is null then
    raise exception using errcode='22023',message='云端清空标记缺少代际'; end if;
  select count(*) into old_count from storage.objects
    where bucket_id='shiye-private' and left(name,length(who)+1)=who||'/'
      and left(name,length(who||'/reset-'||(marker->>'resetId')||'/'))<>
        who||'/reset-'||(marker->>'resetId')||'/'
      and shiye_internal.gc_allowed(who,name,created_at);
  if old_count=0 and marker->>'phase'='deleting' then
    perform set_config('shiye.reset_maintenance','on',true);
    update public.shiye_records set record=jsonb_set(marker,'{phase}','"complete"'::jsonb)
      where user_id=who and store='meta' and id='shiye-reset-barrier';
  end if;
  return jsonb_build_object('complete',old_count=0,'remaining',old_count);
end;
$$;
revoke all on function public.shiye_gc_finish_v1() from public,anon;
grant execute on function public.shiye_gc_finish_v1() to authenticated;

create or replace function public.shiye_account_maintenance_capabilities_v1()
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('version',1,'reset',true,'gc',true)
$$;
revoke all on function public.shiye_account_maintenance_capabilities_v1()
  from public,anon;
grant execute on function public.shiye_account_maintenance_capabilities_v1()
  to authenticated;
