-- Quick setup: remember when a business finished (or skipped) the setup wizard.
alter table public.business_settings add column if not exists setup_completed_at timestamptz;

create or replace function public.update_business_settings(p_business uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_business, array['owner','admin']) then raise exception 'Not allowed'; end if;
  update public.businesses set
    name = coalesce(p->>'name', name), currency = upper(coalesce(p->>'currency', currency)),
    time_zone = coalesce(p->>'time_zone', time_zone), date_format = coalesce(p->>'date_format', date_format),
    tax_label = coalesce(p->>'tax_label', tax_label), country = upper(coalesce(p->>'country', country)),
    phone = coalesce(nullif(p->>'phone', ''), phone), email = coalesce(nullif(p->>'email', ''), email),
    address_line1 = coalesce(p->>'address_line1', address_line1), city = coalesce(p->>'city', city),
    region = coalesce(p->>'region', region), postal_code = coalesce(p->>'postal_code', postal_code)
  where id = p_business;
  update public.business_settings set
    job_prefix = coalesce(p->>'job_prefix', job_prefix),
    whatsapp_enabled = coalesce((p->>'whatsapp_enabled')::boolean, whatsapp_enabled),
    tax_inclusive = coalesce((p->>'tax_inclusive')::boolean, tax_inclusive),
    setup_completed_at = case when (p->>'setup_completed')::boolean then coalesce(setup_completed_at, now()) else setup_completed_at end
  where business_id = p_business;
  perform public.write_audit(p_business, 'settings.updated', 'businesses', p_business::text, p);
end; $$;
