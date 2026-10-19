-- Additive migration for the existing CloudBase PG schema. NEVER rerun schema.sql.
-- Run as database owner after backup. No business records or COS objects are deleted.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $$begin
  if to_regclass('public.shiye_accounts') is null or
     to_regclass('public.shiye_records') is null or
     to_regclass('public.shiye_revisions') is null then
    raise exception 'Existing Shiye CloudBase schema is required';
  end if;
end$$;
create schema if not exists shiye_private;
revoke all on schema shiye_private from public, anon, authenticated;

create table if not exists shiye_private.platform_migrations(
  name text primary key, applied_at timestamptz not null default now()
);
create table if not exists shiye_private.asset_documents(
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  id text not null,
  content text not null check (length(content)<=2048),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{32}$'),
  document_version uuid not null default gen_random_uuid(),
  epoch uuid not null,
  primary key(user_id,id)
);
create table if not exists shiye_private.embedding_models(
  model_key text primary key check(model_key ~ '^[a-f0-9]{64}$'),
  dimensions integer not null default 1024 check(dimensions=1024),
  description text not null,
  enabled boolean not null default false
);
create table if not exists shiye_private.vector_jobs(
  user_id text not null,
  id text not null,
  model_key text not null references shiye_private.embedding_models(model_key) on delete cascade,
  content_hash text not null,
  document_version uuid not null,
  epoch uuid not null,
  lease uuid not null,
  lease_until timestamptz not null,
  primary key(user_id,id,model_key),
  foreign key(user_id,id) references shiye_private.asset_documents(user_id,id) on delete cascade
);
create table if not exists shiye_private.search_budgets(
  user_id text primary key references public.shiye_accounts(user_id) on delete cascade,
  minute_start timestamptz not null,
  minute_units integer not null check(minute_units between 0 and 20),
  day_start date not null,
  day_units integer not null check(day_units between 0 and 500)
);
alter table shiye_private.asset_documents enable row level security;
alter table shiye_private.embedding_models enable row level security;
alter table shiye_private.vector_jobs enable row level security;
alter table shiye_private.search_budgets enable row level security;
revoke all on all tables in schema shiye_private from public,anon,authenticated;

-- CloudBase subjects are TEXT, not necessarily UUIDs. No caller-supplied owner.
create or replace function shiye_private.require_account() returns text
language plpgsql security definer set search_path='' as $$
declare who text:=auth.uid();
begin
  if who is null or who='' then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.shiye_accounts where user_id=who) then
    raise exception 'Account not allowed' using errcode='42501';
  end if;
  return who;
end$$;

create or replace function shiye_private.text_tags(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(left(t#>>'{}',80) order by ord),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end)
    with ordinality x(t,ord)
  where ord<=8 and jsonb_typeof(t)='string'
$$;
create or replace function shiye_private.asset_content(value jsonb) returns text
language sql immutable set search_path='' as $$
  select lower(normalize(left(concat_ws(' ',left(value->>'title',512),
    value->>'kind',value->>'role',value->>'texture',
    shiye_private.text_tags(value->'tags')::text,
    shiye_private.text_tags(value->'contentTags')::text,
    shiye_private.text_tags(value->'styleTags')::text,
    shiye_private.text_tags(value->'materialTags')::text,
    shiye_private.text_tags(value->'semanticTags')::text,
    shiye_private.text_tags(value->'semanticColorNames')::text),2048),NFKC))
$$;
create or replace function shiye_private.compact_asset(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',value->>'id','title',left(value->>'title',512),
    'kind',value->>'kind','role',value->>'role','texture',value->>'texture',
    'tags',shiye_private.text_tags(value->'tags'),
    'contentTags',shiye_private.text_tags(value->'contentTags'),
    'styleTags',shiye_private.text_tags(value->'styleTags'),
    'seriesID',value->>'seriesID','blobId',value->>'blobId',
    'physicalWidthMM',value->'physicalWidthMM','physicalHeightMM',value->'physicalHeightMM',
    'reviewStatus',value->>'reviewStatus','usageStatus',value->>'usageStatus',
    'createdAt',value->>'createdAt','updatedAt',value->>'updatedAt',
    'isFavorite',value->'isFavorite')
$$;
create or replace function shiye_private.asset_matches(value jsonb,k text,s text,series text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(value->>'isProjectInternal','false')<>'true'
  and (k='all' or value->>'kind'=k)
  and (series='all' or series='none' and coalesce(value->>'seriesID','')=''
       or series not in ('all','none') and value->>'seriesID'=series)
  and case s
    when 'all' then true
    when 'ready' then value->>'reviewStatus'='ready'
    when 'pendingReview' then coalesce(value->>'reviewStatus','')<>'ready'
    when 'unready' then coalesce(value->>'reviewStatus','')<>'ready'
    when 'used' then value->>'usageStatus'='used'
    when 'unused' then coalesce(value->>'usageStatus','')<>'used'
    when 'favorite' then value->>'isFavorite'='true'
    when 'inside' then coalesce(value->>'seriesID','')<>''
    when 'outside' then coalesce(value->>'seriesID','')=''
    else false end
$$;
create or replace function shiye_private.check_search(q text,k text,s text,series text,n integer)
returns text language plpgsql immutable set search_path='' as $$
declare query text:=lower(normalize(btrim(q),NFKC));
begin
 if query is null or length(query) not between 1 and 256 or n is null or n not between 1 and 50 or
    k is null or length(k) not between 1 and 30 or series is null or length(series)>200 or
    s is null or s not in ('all','ready','pendingReview','unready','used','unused','favorite','inside','outside') then
   raise exception 'Invalid search input' using errcode='22023';
 end if;
 return query;
end$$;

-- Derived documents are part of the same transaction as each asset mutation.
-- The version changes only when indexed content/epoch changes, not on every drag.
create or replace function shiye_private.track_asset_document() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; who text; asset_id text; content text; current_epoch uuid;
begin
 if tg_op='DELETE' then
   if old.store='assets' then delete from shiye_private.asset_documents where user_id=old.user_id and id=old.id; end if;
   return old;
 end if;
 if tg_op='UPDATE' and old.store='assets' and (old.store<>new.store or old.user_id<>new.user_id or old.id<>new.id) then
   delete from shiye_private.asset_documents where user_id=old.user_id and id=old.id;
 end if;
 if new.store<>'assets' then return new; end if;
 who:=new.user_id;asset_id:=new.id;item:=new.record;
 if item->>'isProjectInternal'='true' then
   delete from shiye_private.asset_documents where user_id=who and id=asset_id;return new;
 end if;
 select account_epoch into strict current_epoch from public.shiye_revisions where user_id=who;
 content:=shiye_private.asset_content(item);
 insert into shiye_private.asset_documents(user_id,id,content,content_hash,epoch)
 values(who,asset_id,content,md5(content),current_epoch)
 on conflict(user_id,id) do update set content=excluded.content,content_hash=excluded.content_hash,
   epoch=excluded.epoch,document_version=gen_random_uuid()
 where asset_documents.content_hash is distinct from excluded.content_hash
    or asset_documents.epoch is distinct from excluded.epoch;
 return new;
end$$;
lock table public.shiye_records in share row exclusive mode;
drop trigger if exists shiye_asset_search_document on public.shiye_records;
create trigger shiye_asset_search_document after insert or update or delete on public.shiye_records
 for each row execute function shiye_private.track_asset_document();
insert into shiye_private.asset_documents(user_id,id,content,content_hash,epoch)
select r.user_id,r.id,shiye_private.asset_content(r.record),md5(shiye_private.asset_content(r.record)),v.account_epoch
from public.shiye_records r join public.shiye_revisions v on v.user_id=r.user_id
where r.store='assets' and coalesce(r.record->>'isProjectInternal','false')<>'true'
on conflict(user_id,id) do update set content=excluded.content,content_hash=excluded.content_hash,
 epoch=excluded.epoch,document_version=gen_random_uuid()
where asset_documents.content_hash is distinct from excluded.content_hash
   or asset_documents.epoch is distinct from excluded.epoch;

create or replace function public.shiye_platform_capabilities_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); has_vector boolean;
begin
 has_vector:=to_regclass('shiye_private.asset_vectors') is not null;
 return jsonb_build_object('schemaVersion',1,'keyword',true,'vector',has_vector,
   'vectorModels',coalesce((select jsonb_agg(model_key order by model_key)
     from shiye_private.embedding_models where enabled and has_vector),'[]'::jsonb),
   'accountReset',false,'keywordEngine','normalized-substring','vectorEngine','pgvector-exact');
end$$;
create or replace function public.shiye_search_assets_v1(p_query text,p_kind text default 'all',
 p_status text default 'all',p_series text default 'all',p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); q text; result jsonb;
begin
 q:=shiye_private.check_search(p_query,p_kind,p_status,p_series,p_limit);
 with candidates as (
   select d.id,r.record,case when lower(normalize(r.record->>'title',NFKC))=q then 4
     when strpos(lower(normalize(r.record->>'title',NFKC)),q)>0 then 3 else 1 end score
   from shiye_private.asset_documents d
   join public.shiye_records r on r.user_id=d.user_id and r.id=d.id and r.store='assets'
   join public.shiye_revisions v on v.user_id=d.user_id and v.account_epoch=d.epoch
   where d.user_id=who and strpos(d.content,q)>0
     and shiye_private.asset_matches(r.record,p_kind,p_status,p_series)
   order by score desc,d.id limit p_limit+1
 ), page as (select * from candidates order by score desc,id limit p_limit)
 select jsonb_build_object('mode','keyword','results',coalesce((select jsonb_agg(
   jsonb_build_object('id',id,'score',score,'record',shiye_private.compact_asset(record)) order by score desc,id)
   from page),'[]'::jsonb),'truncated',(select count(*)>p_limit from candidates)) into result;
 return result;
end$$;
create or replace function public.shiye_account_storage_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); result jsonb;
begin
 select jsonb_build_object('recordCount',count(*),'metadataJSONBytes',coalesce(sum(octet_length(record::text)),0),
   'blobReferenceCount',count(*) filter(where store='blobs'),'assetCount',count(*) filter(where store='assets'),
   'projectCount',count(*) filter(where store='projects'),'measurement','logical-json-not-billed-physical-storage')
 into result from public.shiye_records where user_id=who;
 return result;
end$$;
create or replace function public.shiye_search_budget_v1(p_units integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); minute_key timestamptz:=date_trunc('minute',clock_timestamp());
 day_key date:=(clock_timestamp() at time zone 'UTC')::date; used_minute integer; used_day integer;
begin
 if p_units is null or p_units not between 1 and 4 then raise exception 'Invalid units' using errcode='22023'; end if;
 insert into shiye_private.search_budgets as budget(user_id,minute_start,minute_units,day_start,day_units)
 values(who,minute_key,p_units,day_key,p_units)
 on conflict(user_id) do update set minute_start=minute_key,day_start=day_key,
   minute_units=(case when budget.minute_start=minute_key then budget.minute_units else 0 end)+p_units,
   day_units=(case when budget.day_start=day_key then budget.day_units else 0 end)+p_units
 where (case when budget.minute_start=minute_key then budget.minute_units else 0 end)+p_units<=20
   and (case when budget.day_start=day_key then budget.day_units else 0 end)+p_units<=500
 returning minute_units,day_units into used_minute,used_day;
 return jsonb_build_object('allowed',found,'minuteRemaining',greatest(0,20-coalesce(used_minute,20)),
   'dayRemaining',greatest(0,500-coalesce(used_day,500)));
end$$;
revoke all on all functions in schema shiye_private from public,anon,authenticated;
revoke all on function public.shiye_platform_capabilities_v1() from public,anon,authenticated;
revoke all on function public.shiye_search_assets_v1(text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.shiye_account_storage_v1() from public,anon,authenticated;
revoke all on function public.shiye_search_budget_v1(integer) from public,anon,authenticated;
grant execute on function public.shiye_platform_capabilities_v1(),
 public.shiye_search_assets_v1(text,text,text,text,integer),public.shiye_account_storage_v1(),
 public.shiye_search_budget_v1(integer) to authenticated;
insert into shiye_private.platform_migrations(name) values('001-platform-search') on conflict do nothing;
notify pgrst,'reload schema';
commit;
