import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const source=name=>readFileSync(join(root,'deploy/supabase',name),'utf8');
const adapt=sql=>sql.replaceAll('user_id uuid','user_id text')
  .replaceAll('who uuid := auth.uid()','who text := auth.uid()')
  .replaceAll('who uuid := auth.uid();','who text := auth.uid();');
const base=`-- CloudBase PG fresh-account schema. No Supabase data is copied.
-- CloudBase auth.users.id is bigint in this environment; JWT sub and auth.uid()
-- are text, so all Shiye owner keys use text.
create table public.shiye_accounts (
  user_id text primary key,
  username text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shiye_accounts enable row level security;
create policy own_account on public.shiye_accounts for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_accounts from public, anon, authenticated;
grant select on public.shiye_accounts to authenticated;

create table public.shiye_revisions (
  user_id text primary key references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null default 0,
  account_epoch uuid not null default gen_random_uuid()
);
alter table public.shiye_revisions enable row level security;
create policy own_revision on public.shiye_revisions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_revisions from public, anon, authenticated;
grant select on public.shiye_revisions to authenticated;

create table public.shiye_records (
  user_id text not null default auth.uid() references public.shiye_accounts(user_id) on delete cascade,
  store text not null check (store in ('assets','blobs','series','projects','meta','trash')),
  id text not null check (length(id) between 1 and 500),
  record jsonb not null check (jsonb_typeof(record)='object' and record->>'id'=id),
  primary key(user_id,store,id)
);
alter table public.shiye_records enable row level security;
create policy own_records on public.shiye_records for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_records from public, anon, authenticated;
grant select on public.shiye_records to authenticated;

create table public.shiye_changes (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  revision bigint not null,
  keys jsonb not null check (jsonb_typeof(keys)='array'),
  primary key(user_id,revision)
);
alter table public.shiye_changes enable row level security;
create policy own_changes on public.shiye_changes for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_changes from public, anon, authenticated;
grant select on public.shiye_changes to authenticated;

create table public.shiye_commits (
  user_id text not null references public.shiye_accounts(user_id) on delete cascade,
  operation_id uuid not null,
  payload_hash text not null,
  revision bigint not null,
  committed_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.shiye_commits enable row level security;
create policy own_commits on public.shiye_commits for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.shiye_commits from public, anon, authenticated;
grant select on public.shiye_commits to authenticated;

insert into public.shiye_accounts(user_id,username,is_admin)
  select sub,'lzy',true from auth.users where username='lzy';
insert into public.shiye_revisions(user_id,revision)
  select user_id,0 from public.shiye_accounts where username='lzy';
`;
const tombstones=source('deletion-tombstones.sql').split('-- Backfill still-pending legacy deletions.')[0];
const keyVersions=source('key-version-watermarks.sql');
const v3=source('record-cas-v3.sql');
const guarded=source('guarded-v3-commit.sql');
const sql=[base,adapt(tombstones),adapt(keyVersions),adapt(v3),adapt(guarded)].join('\n\n');
const target=join(root,'deploy/cloudbase/schema.sql');
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,sql);
console.log(`Wrote ${target}`);
