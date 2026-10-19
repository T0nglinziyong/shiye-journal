-- Optional pgvector migration. Apply AFTER 001. No embedding provider is called.
-- A failed extension install rolls this migration back; keyword search stays usable.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $$begin
 if to_regclass('shiye_private.asset_documents') is null then raise exception 'Apply 001-platform-search first'; end if;
end$$;
create schema if not exists shiye_extensions;
revoke create on schema shiye_extensions from public,anon,authenticated;
create extension if not exists vector with schema shiye_extensions;
-- Respect an existing installation under public/extensions/another schema.
do $install$
declare ns name;
begin
 select n.nspname into strict ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector';
 execute format($ddl$create table if not exists shiye_private.asset_vectors(
   user_id text not null, id text not null,
   model_key text not null references shiye_private.embedding_models(model_key) on delete cascade,
   content_hash text not null, document_version uuid not null, epoch uuid not null,
   embedding %I.vector(1024) not null, updated_at timestamptz not null default now(),
   primary key(user_id,id,model_key),
   foreign key(user_id,id) references shiye_private.asset_documents(user_id,id) on delete cascade
 )$ddl$,ns);
end$install$;
alter table shiye_private.asset_vectors enable row level security;
revoke all on shiye_private.asset_vectors from public,anon,authenticated;
create index if not exists shiye_vectors_owner_model on shiye_private.asset_vectors(user_id,model_key);
-- Exact cosine search after owner/model filtering is intentional for a personal
-- library. A global ANN index may lose recall after tenant/filter post-filtering.

create or replace function shiye_private.check_model(key text) returns name
language plpgsql security definer set search_path='' as $$
declare ns name;
begin
 if key is null or key !~ '^[a-f0-9]{64}$' or not exists(
   select 1 from shiye_private.embedding_models where model_key=key and enabled and dimensions=1024) then
   raise exception 'Vector model is not registered/enabled' using errcode='22023';
 end if;
 select n.nspname into ns from pg_catalog.pg_extension e
   join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='vector';
 if ns is null then raise exception 'pgvector is unavailable' using errcode='55000'; end if;
 return ns;
end$$;
create or replace function shiye_private.check_embedding(input text) returns text
language plpgsql immutable set search_path='' as $$
declare arr jsonb; component jsonb; nonzero boolean:=false; number numeric;
begin
 if input is null or octet_length(input)>50000 then raise exception 'Invalid embedding size' using errcode='22023'; end if;
 begin arr:=input::jsonb;exception when others then raise exception 'Invalid embedding JSON' using errcode='22023';end;
 if jsonb_typeof(arr)<>'array' then raise exception 'Embedding must be an array' using errcode='22023'; end if;
 if jsonb_array_length(arr)<>1024 then raise exception 'Embedding must have 1024 dimensions' using errcode='22023'; end if;
 for component in select value from jsonb_array_elements(arr) loop
   if jsonb_typeof(component)<>'number' then raise exception 'Embedding must be numeric' using errcode='22023'; end if;
   number:=(component#>>'{}')::numeric;
   if abs(number)>1000000 then raise exception 'Embedding component out of range' using errcode='22023'; end if;
   nonzero:=nonzero or number<>0;
 end loop;
 if not nonzero then raise exception 'Zero vector is not valid for cosine search' using errcode='22023'; end if;
 return arr::text;
end$$;

create or replace function public.shiye_search_candidates_v1(p_model_key text,p_limit integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); current_epoch uuid; candidate record;
 claim uuid; result jsonb:='[]'::jsonb;
begin
 perform shiye_private.check_model(p_model_key);
 if p_limit is null or p_limit not between 1 and 4 then raise exception 'Invalid batch size' using errcode='22023';end if;
 -- Same lock order as business commits. Never keep the lock during model I/O.
 select account_epoch into strict current_epoch from public.shiye_revisions where user_id=who for update;
 for candidate in
   select d.* from shiye_private.asset_documents d
   left join shiye_private.asset_vectors v on v.user_id=d.user_id and v.id=d.id and v.model_key=p_model_key
     and v.content_hash=d.content_hash and v.document_version=d.document_version and v.epoch=current_epoch
   left join shiye_private.vector_jobs j on j.user_id=d.user_id and j.id=d.id and j.model_key=p_model_key
     and j.content_hash=d.content_hash and j.document_version=d.document_version and j.epoch=current_epoch
     and j.lease_until>clock_timestamp()
   where d.user_id=who and d.epoch=current_epoch and v.id is null and j.id is null
   order by d.id limit p_limit
 loop
   claim:=gen_random_uuid();
   insert into shiye_private.vector_jobs(user_id,id,model_key,content_hash,document_version,epoch,lease,lease_until)
   values(who,candidate.id,p_model_key,candidate.content_hash,candidate.document_version,current_epoch,claim,clock_timestamp()+interval '2 minutes')
   on conflict(user_id,id,model_key) do update set content_hash=excluded.content_hash,
     document_version=excluded.document_version,epoch=excluded.epoch,lease=excluded.lease,lease_until=excluded.lease_until;
   result:=result||jsonb_build_array(jsonb_build_object('id',candidate.id,'content',candidate.content,
     'contentHash',candidate.content_hash,'lease',claim::text,'epoch',current_epoch::text));
 end loop;
 return result;
end$$;

create or replace function public.shiye_search_index_put_v1(p_model_key text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); ns name; current_epoch uuid;
 item jsonb; job record; vector_text text; indexed_count integer:=0; stale_count integer:=0;
begin
 ns:=shiye_private.check_model(p_model_key);
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Expected index item array' using errcode='22023';end if;
 if jsonb_array_length(p_items) not between 1 and 4 or octet_length(p_items::text)>250000 then
   raise exception 'Invalid index batch size' using errcode='22023';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then
   raise exception 'Duplicate or missing index item IDs' using errcode='22023';end if;
 select account_epoch into strict current_epoch from public.shiye_revisions where user_id=who for update;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
   if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string'
     or jsonb_typeof(item->'embedding') is distinct from 'string' then
     raise exception 'Invalid index item' using errcode='22023';end if;
   select j.* into job from shiye_private.vector_jobs j
     join shiye_private.asset_documents d on d.user_id=j.user_id and d.id=j.id
       and d.document_version=j.document_version and d.content_hash=j.content_hash and d.epoch=j.epoch
     where j.user_id=who and j.id=item->>'id' and j.model_key=p_model_key
       and j.epoch=current_epoch and j.epoch::text=item->>'epoch'
       and j.content_hash=item->>'content_hash' and j.lease::text=item->>'lease'
       and j.lease_until>clock_timestamp()
     for update of j,d;
   if not found then stale_count:=stale_count+1;continue;end if;
   vector_text:=shiye_private.check_embedding(item->>'embedding');
   execute format($write$
     insert into shiye_private.asset_vectors(user_id,id,model_key,content_hash,document_version,epoch,embedding)
     values($1,$2,$3,$4,$5,$6,$7::%I.vector(1024))
     on conflict(user_id,id,model_key) do update set content_hash=excluded.content_hash,
       document_version=excluded.document_version,epoch=excluded.epoch,embedding=excluded.embedding,updated_at=now()
   $write$,ns) using who,job.id,p_model_key,job.content_hash,job.document_version,current_epoch,vector_text;
   delete from shiye_private.vector_jobs where user_id=who and id=job.id and model_key=p_model_key and lease=job.lease;
   indexed_count:=indexed_count+1;
 end loop;
 return jsonb_build_object('indexed',indexed_count,'stale',stale_count);
end$$;

create or replace function public.shiye_search_vectors_v1(p_query text,p_model_key text,p_embedding text,
 p_hybrid boolean default false,p_kind text default 'all',p_status text default 'all',
 p_series text default 'all',p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text:=shiye_private.require_account(); ns name; q text; vector_text text; result jsonb;
begin
 ns:=shiye_private.check_model(p_model_key);
 q:=shiye_private.check_search(p_query,p_kind,p_status,p_series,p_limit);
 vector_text:=shiye_private.check_embedding(p_embedding);
 if p_hybrid is null then raise exception 'Invalid hybrid flag' using errcode='22023';end if;
 -- Only extension namespace identifiers enter SQL text, from pg_extension.
 -- Query text, owner, model, vector and filters remain bound parameters.
 execute format($search$
   with owned as materialized (
     select d.id,d.content,r.record,v.embedding,
       case when lower(normalize(r.record->>'title',NFKC))=$1 then 1.0
         when strpos(lower(normalize(r.record->>'title',NFKC)),$1)>0 then 0.75
         when strpos(d.content,$1)>0 then 0.25 else 0.0 end keyword_score
     from shiye_private.asset_documents d
     join public.shiye_records r on r.user_id=d.user_id and r.id=d.id and r.store='assets'
     join public.shiye_revisions rev on rev.user_id=d.user_id and rev.account_epoch=d.epoch
     left join shiye_private.asset_vectors v on v.user_id=d.user_id and v.id=d.id
       and v.model_key=$3 and v.content_hash=d.content_hash and v.document_version=d.document_version and v.epoch=d.epoch
     where d.user_id=$2 and shiye_private.asset_matches(r.record,$6,$7,$8)
   ), scored as (
     select id,record,
       case when $5 then 0.8*coalesce(1-(embedding operator(%1$I.<=>) $4::%1$I.vector(1024)),0)+0.2*keyword_score
         else 1-(embedding operator(%1$I.<=>) $4::%1$I.vector(1024)) end score
     from owned where embedding is not null or $5 and keyword_score>0
   ), candidates as (select * from scored order by score desc,id limit $9+1),
   page as (select * from candidates order by score desc,id limit $9)
   select jsonb_build_object('mode',case when $5 then 'hybrid' else 'semantic' end,'modelKey',$3,
     'results',coalesce((select jsonb_agg(jsonb_build_object('id',id,'score',score,
       'record',shiye_private.compact_asset(record)) order by score desc,id) from page),'[]'::jsonb),
     'truncated',(select count(*)>$9 from candidates))
 $search$,ns) into result using q,who,p_model_key,vector_text,p_hybrid,p_kind,p_status,p_series,p_limit;
 return result;
end$$;
revoke all on all functions in schema shiye_private from public,anon,authenticated;
revoke all on function public.shiye_search_candidates_v1(text,integer) from public,anon,authenticated;
revoke all on function public.shiye_search_index_put_v1(text,jsonb) from public,anon,authenticated;
revoke all on function public.shiye_search_vectors_v1(text,text,text,boolean,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.shiye_search_candidates_v1(text,integer),
 public.shiye_search_index_put_v1(text,jsonb),
 public.shiye_search_vectors_v1(text,text,text,boolean,text,text,text,integer) to authenticated;
insert into shiye_private.platform_migrations(name) values('002-platform-vector') on conflict do nothing;
notify pgrst,'reload schema';
commit;
