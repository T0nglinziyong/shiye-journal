-- Apply only after the guarded v3 function and matching test client have been
-- verified. This prevents old clients from running the expensive account-lock
-- conflict path. Their local outboxes remain on those devices.
revoke execute on function public.shiye_commit_v3(jsonb,bigint,uuid,uuid,integer)
  from authenticated;
