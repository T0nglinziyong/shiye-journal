-- Business conflicts must reach the client as HTTP 409. SQLSTATE 40001
-- makes PostgREST 14 retry the same rejected transaction internally forever.
-- Preserve each deployed function's body, privileges and current data rules.
do $repair$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('shiye_commit_v3','shiye_commit_v3_guarded')
      and p.prokind='f'
  loop
    execute replace(pg_get_functiondef(f.oid), '''40001''', '''PT409''');
  end loop;
end;
$repair$;
notify pgrst, 'reload schema';
