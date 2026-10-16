-- Run only after every supported client and reset endpoint uses v3.
-- Old tabs keep their local drafts and receive an update-required error.
revoke execute on function public.shiye_commit(jsonb,bigint)
  from public, anon, authenticated;
revoke execute on function public.shiye_commit_v2(jsonb,bigint,uuid)
  from public, anon, authenticated;
revoke insert,update,delete on public.shiye_records from public,anon,authenticated;
revoke insert,update,delete on public.shiye_revisions from public,anon,authenticated;
revoke insert,update,delete on public.shiye_changes from public,anon,authenticated;
revoke insert,update,delete on public.shiye_commits from public,anon,authenticated;
