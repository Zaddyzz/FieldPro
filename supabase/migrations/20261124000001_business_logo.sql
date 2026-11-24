-- Business logo on quotes, invoices and the customer portal, with an optional watermark.
-- Logos live in a public bucket (they are printed on documents sent to customers anyway).
-- Only owners and admins can upload, replace or remove their own business's logo. SVG is not allowed (script risk).

alter table public.businesses
  add column logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/logo-[0-9]{10,16}\.(png|jpg|webp)$'),
  add column logo_watermark boolean not null default true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-logos', 'business-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create or replace function public.can_manage_logo_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 2 or parts[2] !~ '^logo-[0-9]{10,16}\.(png|jpg|webp)$' then return false; end if;
  return public.has_role(parts[1]::uuid, array['owner','admin']);
exception when others then return false;
end; $$;
revoke all on function public.can_manage_logo_object(text) from public, anon;
grant execute on function public.can_manage_logo_object(text) to authenticated;

create policy "business logos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-logos' and public.can_manage_logo_object(name));
create policy "business logos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-logos' and public.can_manage_logo_object(name));

create or replace function public.set_business_logo(p_business uuid, p_path text, p_watermark boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_business, array['owner','admin']) then raise exception 'Not allowed'; end if;
  if p_path is not null and p_path <> '' and split_part(p_path, '/', 1) <> p_business::text then raise exception 'Invalid logo file'; end if;
  update public.businesses set
    logo_path = case when p_path = '' then null else coalesce(p_path, logo_path) end,
    logo_watermark = coalesce(p_watermark, logo_watermark)
  where id = p_business;
  perform public.write_audit(p_business, 'settings.logo_updated', 'businesses', p_business::text,
    jsonb_build_object('logo_path', p_path, 'watermark', p_watermark));
end; $$;
revoke all on function public.set_business_logo(uuid, text, boolean) from public, anon;
grant execute on function public.set_business_logo(uuid, text, boolean) to authenticated;
