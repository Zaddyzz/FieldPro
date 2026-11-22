-- When a job (or its business) is deleted, its assignments cascade away; do not log "unassigned"
-- for a job that no longer exists.
create or replace function public.assignments_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activities (business_id, job_id, actor_id, kind, to_value)
    values (new.business_id, new.job_id, auth.uid(), 'assigned', new.user_id::text);
    update public.jobs set status = 'assigned' where id = new.job_id and status in ('new','scheduled');
  elsif exists (select 1 from public.jobs where id = old.job_id) then
    insert into public.job_activities (business_id, job_id, actor_id, kind, from_value)
    values (old.business_id, old.job_id, auth.uid(), 'unassigned', old.user_id::text);
  end if;
  return null;
end; $$;
