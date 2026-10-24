\set ON_ERROR_STOP on
begin;
insert into public.shiye_accounts values('test-A','A',false),('test-B','B',false);
insert into public.shiye_revisions(user_id) values('test-A'),('test-B');
insert into public.shiye_records values
 ('test-A','assets','a','{"id":"a","title":"蓝色车票 ＡＢＣ","kind":"paper","reviewStatus":"ready","blobId":"image-a"}'),
 ('test-B','assets','a','{"id":"a","title":"蓝色车票 OTHER ACCOUNT","kind":"paper","reviewStatus":"ready"}'),
 ('test-A','assets','b','{"id":"b","title":"蓝色便签","kind":"paper","reviewStatus":"pendingReview"}'),
 ('test-A','assets','c','{"id":"c","title":"红色花朵","kind":"sticker","reviewStatus":"ready"}'),
 ('test-A','assets','hidden','{"id":"hidden","title":"蓝色内部素材","isProjectInternal":true}');
set local request.jwt.claims='{"sub":"test-A"}';
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.shiye_search_assets_v1('蓝色','all','ready');
 if jsonb_array_length(result->'results')<>1 or result::text like '%OTHER ACCOUNT%' then
   raise exception 'FAIL keyword owner/readiness filtering: %',result;end if;
 result:=public.shiye_search_assets_v1('abc');
 if jsonb_array_length(result->'results')<>1 then raise exception 'FAIL NFKC keyword normalization';end if;
 result:=public.shiye_search_assets_v1('%');
 if jsonb_array_length(result->'results')<>0 then raise exception 'FAIL query wildcard treated as SQL';end if;
 result:=public.shiye_account_storage_v1();
 if (result->>'recordCount')::integer<>4 then raise exception 'FAIL owner storage scope';end if;
 begin perform 1 from shiye_private.asset_documents;raise exception 'FAIL private documents accessible';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS keyword, NFKC, literal query, storage and private-table permission';
end$$;
reset role;
-- Only a database owner can register a paid embedding model; no key is stored.
insert into shiye_private.embedding_models(model_key,description,enabled) values(repeat('b',64),'test only',true);
create temporary table test_claim(value jsonb);
insert into test_claim select public.shiye_search_candidates_v1(repeat('b',64),1)->0;
do $$declare first_claim jsonb; response jsonb; embedding text;
begin
 select value into first_claim from test_claim;
 embedding:=to_jsonb(array[1::real]||array_fill(0::real,array[1023]))::text;
 -- A rename during model latency changes document_version, not business revision here.
 update public.shiye_records set record=jsonb_set(record,'{title}','"蓝色改名后的车票"')
   where user_id='test-A' and store='assets' and id=first_claim->>'id';
 response:=public.shiye_search_index_put_v1(repeat('b',64),jsonb_build_array(jsonb_build_object(
   'id',first_claim->>'id','content_hash',first_claim->>'contentHash','lease',first_claim->>'lease',
   'epoch',first_claim->>'epoch','embedding',embedding)));
 if response<>jsonb_build_object('indexed',0,'stale',1) then raise exception 'FAIL stale renamed writeback';end if;
 first_claim:=public.shiye_search_candidates_v1(repeat('b',64),1)->0;
 response:=public.shiye_search_index_put_v1(repeat('b',64),jsonb_build_array(jsonb_build_object(
   'id',first_claim->>'id','content_hash',first_claim->>'contentHash','lease',first_claim->>'lease',
   'epoch',first_claim->>'epoch','embedding',embedding)));
 if response<>jsonb_build_object('indexed',1,'stale',0) then raise exception 'FAIL valid vector writeback';end if;
 response:=public.shiye_search_vectors_v1('蓝色',repeat('b',64),embedding,false);
 if jsonb_array_length(response->'results')<>1 or response::text like '%OTHER ACCOUNT%' then
   raise exception 'FAIL semantic owner scope';end if;
 response:=public.shiye_search_vectors_v1('蓝色',repeat('b',64),embedding,true);
 if jsonb_array_length(response->'results')<>2 then raise exception 'FAIL hybrid must include unindexed keyword candidate';end if;
 if (select revision from public.shiye_revisions where user_id='test-A')<>0 then
   raise exception 'FAIL derived index changed sync revision';end if;
 raise notice 'PASS stale rename, valid index, private vector search, hybrid coverage, sync-revision isolation';
end$$;

do $$declare claim jsonb; result jsonb; embedding text;
begin
 embedding:=to_jsonb(array[1::real]||array_fill(0::real,array[1023]))::text;
 claim:=public.shiye_search_candidates_v1(repeat('b',64),1)->0;
 delete from public.shiye_records where user_id='test-A' and store='assets' and id=claim->>'id';
 result:=public.shiye_search_index_put_v1(repeat('b',64),jsonb_build_array(jsonb_build_object(
   'id',claim->>'id','content_hash',claim->>'contentHash','lease',claim->>'lease','epoch',claim->>'epoch','embedding',embedding)));
 if (result->>'stale')::integer<>1 then raise exception 'FAIL deleted asset was indexed';end if;
 claim:=public.shiye_search_candidates_v1(repeat('b',64),1)->0;
 update shiye_private.vector_jobs set lease_until=now()-interval '1 second' where user_id='test-A' and id=claim->>'id';
 result:=public.shiye_search_index_put_v1(repeat('b',64),jsonb_build_array(jsonb_build_object(
   'id',claim->>'id','content_hash',claim->>'contentHash','lease',claim->>'lease','epoch',claim->>'epoch','embedding',embedding)));
 if (result->>'stale')::integer<>1 then raise exception 'FAIL expired lease accepted';end if;
 claim:=public.shiye_search_candidates_v1(repeat('b',64),1)->0;
 update public.shiye_revisions set account_epoch=gen_random_uuid() where user_id='test-A';
 result:=public.shiye_search_index_put_v1(repeat('b',64),jsonb_build_array(jsonb_build_object(
   'id',claim->>'id','content_hash',claim->>'contentHash','lease',claim->>'lease','epoch',claim->>'epoch','embedding',embedding)));
 if (result->>'stale')::integer<>1 then raise exception 'FAIL old epoch accepted';end if;
 raise notice 'PASS deleted asset, expired lease and reset epoch guards';
end$$;
set local role authenticated;
do $$declare n integer;result jsonb;begin
 for n in 1..5 loop
   result:=public.shiye_search_budget_v1(4);
   if result->>'allowed'<>'true' then raise exception 'FAIL budget premature rejection';end if;
 end loop;
 if public.shiye_search_budget_v1(1)->>'allowed'<>'false' then raise exception 'FAIL persistent quota exceeded';end if;
 begin perform public.shiye_search_budget_v1(0);raise exception 'FAIL invalid quota accepted';
 exception when invalid_parameter_value then null;end;
 raise notice 'PASS per-account quota and invalid unit rejection';
end$$;
reset role;
set local role anon;
do $$begin
 begin perform public.shiye_platform_capabilities_v1();raise exception 'FAIL anonymous RPC allowed';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS anonymous caller denied';
end$$;
reset role;
rollback;
