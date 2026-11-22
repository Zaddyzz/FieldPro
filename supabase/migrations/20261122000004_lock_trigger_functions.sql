-- Trigger and internal functions are never called directly by clients.
revoke execute on function public.assignments_after(), public.assignments_guard(), public.attachments_after(),
  public.customers_guard(), public.handle_new_user(), public.jobs_after_change(), public.jobs_before_insert(),
  public.jobs_before_update(), public.materials_after(), public.force_actor(), public.touch_updated_at(),
  public.write_audit(uuid, text, text, text, jsonb), public.next_number(uuid, text)
  from authenticated, anon, public;
