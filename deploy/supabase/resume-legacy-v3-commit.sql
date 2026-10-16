-- Roll back the temporary legacy-v3 pause if test clients cannot use the
-- guarded entry point or the old request storm does not subside.
grant execute on function public.shiye_commit_v3(jsonb,bigint,uuid,uuid,integer)
  to authenticated;
