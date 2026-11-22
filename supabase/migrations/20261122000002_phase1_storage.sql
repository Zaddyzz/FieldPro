-- Private bucket for job photos. Object path: <business_id>/<job_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.can_access_job_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/'); b uuid; j uuid;
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  b := parts[1]::uuid; j := parts[2]::uuid;
  return exists (select 1 from public.jobs where id = j and business_id = b) and public.can_see_job(b, j);
exception when others then return false;
end; $$;
revoke all on function public.can_access_job_object(text) from public, anon;
grant execute on function public.can_access_job_object(text) to authenticated;

create policy "job photos read" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.can_access_job_object(name));
create policy "job photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and public.can_access_job_object(name));
