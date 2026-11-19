create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;
grant usage on schema auth to authenticated;
create table public.shiye_accounts(user_id text primary key);
create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
insert into public.shiye_accounts values('10000000001'),('10000000002');

create table public.shiye_records(user_id text,store text,id text,record jsonb);
