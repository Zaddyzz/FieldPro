-- FieldPro Phase 1: tenancy, roles, team, customers, jobs, technician workflow, audit.
-- Every tenant table carries business_id and is protected by Row Level Security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  industry text not null check (industry in ('cctv','solar','internet','other')),
  country text not null check (country ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  time_zone text not null,
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd')),
  tax_label text not null default 'Tax' check (char_length(tax_label) <= 30),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text,
  address_line1 text, address_line2 text, city text, region text, postal_code text,
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_tz_valid check (now() at time zone time_zone is not null)
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','dispatcher','technician','customer')),
  status text not null default 'active' check (status in ('active','deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index on public.business_members (user_id);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  job_prefix text not null default 'JOB-' check (job_prefix ~ '^[A-Z0-9-]{1,10}$'),
  whatsapp_enabled boolean not null default false,
  tax_inclusive boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Counters are never exposed to clients (no policies), so numbers cannot be tampered with.
create table public.number_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('job','quotation','invoice')),
  last_value integer not null default 0,
  primary key (business_id, kind)
);

create table public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','suspended')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin','dispatcher','technician')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invitations (business_id);

create table public.technician_profiles (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  service_area text check (char_length(service_area) <= 120),
  skills text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null default 'individual' check (kind in ('individual','company')),
  name text not null check (char_length(name) between 1 and 160),
  contact_person text,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line1 text, address_line2 text, city text, region text, postal_code text, country text,
  notes text check (char_length(notes) <= 4000),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create index on public.customers (business_id, status);
create index on public.customers (business_id, phone);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  number integer not null,
  reference text not null,
  customer_id uuid not null,
  title text not null check (char_length(title) between 2 and 160),
  description text check (char_length(description) <= 4000),
  category text not null default 'installation' check (category in ('installation','repair','maintenance','survey','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'new' check (status in ('new','scheduled','assigned','in_progress','awaiting_parts','completed','cancelled')),
  scheduled_at timestamptz,
  address text check (char_length(address) <= 400),
  map_link text check (map_link is null or map_link ~* '^https://'),
  internal_notes text check (char_length(internal_notes) <= 4000),
  work_done text check (char_length(work_done) <= 4000),
  completed_at timestamptz,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id)
);
create index on public.jobs (business_id, status);
create index on public.jobs (business_id, scheduled_at);
create index on public.jobs (customer_id);

create table public.job_assignments (
  job_id uuid not null,
  business_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (job_id, user_id),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete cascade
);
create index on public.job_assignments (user_id);
create index on public.job_assignments (business_id);

create table public.job_activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  job_id uuid not null,
  actor_id uuid references auth.users(id),
  kind text not null check (kind in ('created','status','assigned','unassigned','note','photo','material','completion','updated')),
  from_value text,
  to_value text,
  note text check (char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete cascade
);
create index on public.job_activities (job_id, created_at);
create index on public.job_activities (business_id, created_at desc);

create table public.job_materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  job_id uuid not null,
  item text not null check (char_length(item) between 1 and 160),
  quantity numeric(12,2) not null check (quantity > 0),
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete cascade
);
create index on public.job_materials (job_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  job_id uuid not null,
  storage_path text not null unique,
  caption text check (char_length(caption) <= 200),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete cascade,
  check (storage_path like business_id::text || '/' || job_id::text || '/%')
);
create index on public.attachments (job_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  record_table text,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (business_id, created_at desc);

-- ---------------------------------------------------------------- helper functions

create or replace function public.is_member(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m join public.businesses b on b.id = m.business_id
                 where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.has_role(p_business uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business and m.user_id = auth.uid()
                   and m.status = 'active' and m.role = any (p_roles));
$$;

create or replace function public.is_manager(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_business, array['owner','admin','dispatcher']);
$$;

create or replace function public.is_assigned(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.job_assignments a
                 join public.business_members m on m.business_id = a.business_id and m.user_id = a.user_id
                 where a.job_id = p_job and a.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.can_see_job(p_business uuid, p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_manager(p_business) or public.is_assigned(p_job);
$$;

create or replace function public.shares_business(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members a join public.business_members b on a.business_id = b.business_id
                 where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user);
$$;

create or replace function public.write_audit(p_business uuid, p_action text, p_table text, p_record text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (business_id, actor_id, action, record_table, record_id, details)
  values (p_business, auth.uid(), p_action, p_table, p_record, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

-- ---------------------------------------------------------------- signup: one transaction creates everything

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_business uuid;
  v_phone text;
begin
  v_phone := case when meta->>'phone' ~ '^\+[1-9][0-9]{6,14}$' then meta->>'phone' end;
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, coalesce(left(meta->>'full_name', 120), ''), v_phone, new.email);

  if meta->>'signup_type' = 'business' then
    insert into public.businesses (name, industry, country, currency, time_zone, date_format, tax_label, phone, email, created_by)
    values (meta->>'business_name', coalesce(meta->>'industry', 'other'), upper(meta->>'country'),
            upper(meta->>'currency'), coalesce(meta->>'time_zone', 'UTC'),
            coalesce(meta->>'date_format', 'dd/MM/yyyy'), coalesce(meta->>'tax_label', 'Tax'),
            v_phone, new.email, new.id)
    returning id into v_business;
    insert into public.business_members (business_id, user_id, role) values (v_business, new.id, 'owner');
    insert into public.business_settings (business_id) values (v_business);
    insert into public.business_subscriptions (business_id, plan, status, trial_ends_at)
      values (v_business, 'trial', 'trial', now() + interval '14 days');
    insert into public.audit_logs (business_id, actor_id, action, record_table, record_id)
      values (v_business, new.id, 'business.created', 'businesses', v_business::text);
  end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- jobs: numbering, guards, activity

create or replace function public.next_number(p_business uuid, p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.number_counters (business_id, kind, last_value) values (p_business, p_kind, 1)
  on conflict (business_id, kind) do update set last_value = public.number_counters.last_value + 1
  returning last_value into v;
  return v;
end; $$;

create or replace function public.jobs_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prefix text;
begin
  select job_prefix into v_prefix from public.business_settings where business_id = new.business_id;
  new.number := public.next_number(new.business_id, 'job');
  new.reference := coalesce(v_prefix, 'JOB-') || lpad(new.number::text, 4, '0');
  new.created_by := auth.uid();
  new.created_at := now();
  if new.status = 'completed' then new.completed_at := now(); else new.completed_at := null; end if;
  return new;
end; $$;

create or replace function public.jobs_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_id <> old.business_id or new.number <> old.number or new.reference <> old.reference
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Job identity fields cannot be changed';
  end if;
  if new.status = 'completed' and old.status <> 'completed' then new.completed_at := now();
  elsif new.status <> 'completed' then new.completed_at := null; end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.jobs_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activities (business_id, job_id, actor_id, kind, to_value)
    values (new.business_id, new.id, auth.uid(), 'created', new.status);
  elsif new.status <> old.status then
    insert into public.job_activities (business_id, job_id, actor_id, kind, from_value, to_value)
    values (new.business_id, new.id, auth.uid(), case when new.status = 'completed' then 'completion' else 'status' end, old.status, new.status);
  elsif new.scheduled_at is distinct from old.scheduled_at then
    insert into public.job_activities (business_id, job_id, actor_id, kind, from_value, to_value)
    values (new.business_id, new.id, auth.uid(), 'updated', 'scheduled_at:' || coalesce(old.scheduled_at::text, ''), coalesce(new.scheduled_at::text, ''));
  end if;
  if tg_op = 'UPDATE' and new.archived <> old.archived then
    perform public.write_audit(new.business_id, case when new.archived then 'job.archived' else 'job.restored' end, 'jobs', new.id::text, '{}'::jsonb);
  end if;
  return null;
end; $$;

create trigger jobs_bi before insert on public.jobs for each row execute function public.jobs_before_insert();
create trigger jobs_bu before update on public.jobs for each row execute function public.jobs_before_update();
create trigger jobs_ai after insert or update on public.jobs for each row execute function public.jobs_after_change();

-- assignments: assignee must be an active technician/dispatcher/admin/owner of the same business
create or replace function public.assignments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.business_members m where m.business_id = new.business_id
                   and m.user_id = new.user_id and m.status = 'active' and m.role <> 'customer') then
      raise exception 'Assignee is not an active team member of this business';
    end if;
    new.assigned_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end; $$;

create or replace function public.assignments_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_activities (business_id, job_id, actor_id, kind, to_value)
    values (new.business_id, new.job_id, auth.uid(), 'assigned', new.user_id::text);
    update public.jobs set status = 'assigned' where id = new.job_id and status in ('new','scheduled');
  else
    insert into public.job_activities (business_id, job_id, actor_id, kind, from_value)
    values (old.business_id, old.job_id, auth.uid(), 'unassigned', old.user_id::text);
  end if;
  return null;
end; $$;

create trigger assignments_bi before insert on public.job_assignments for each row execute function public.assignments_guard();
create trigger assignments_ai after insert or delete on public.job_assignments for each row execute function public.assignments_after();

-- customers: identity guard + archive audit
create or replace function public.customers_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.status := 'active';
  else
    if new.business_id <> old.business_id or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Customer identity fields cannot be changed';
    end if;
    if new.status <> old.status then
      perform public.write_audit(new.business_id, 'customer.' || new.status, 'customers', new.id::text, '{}'::jsonb);
    end if;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger customers_guard before insert or update on public.customers for each row execute function public.customers_guard();

-- activities/materials/attachments: force actor and timestamp to the caller
create or replace function public.force_actor()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'job_activities' then new.actor_id := auth.uid();
  elsif tg_table_name = 'job_materials' then new.added_by := auth.uid();
  elsif tg_table_name = 'attachments' then new.uploaded_by := auth.uid(); end if;
  new.created_at := now();
  return new;
end; $$;
create trigger force_actor before insert on public.job_activities for each row when (current_user = 'authenticated') execute function public.force_actor();
create trigger force_actor before insert on public.job_materials for each row execute function public.force_actor();
create trigger force_actor before insert on public.attachments for each row execute function public.force_actor();

create or replace function public.materials_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_activities (business_id, job_id, actor_id, kind, note)
  values (new.business_id, new.job_id, auth.uid(), 'material', new.item || ' × ' || new.quantity::text);
  return null;
end; $$;
create trigger materials_ai after insert on public.job_materials for each row execute function public.materials_after();

create or replace function public.attachments_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_activities (business_id, job_id, actor_id, kind, note)
  values (new.business_id, new.job_id, auth.uid(), 'photo', new.caption);
  return null;
end; $$;
create trigger attachments_ai after insert on public.attachments for each row execute function public.attachments_after();

create trigger t_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_businesses before update on public.businesses for each row execute function public.touch_updated_at();
create trigger t_settings before update on public.business_settings for each row execute function public.touch_updated_at();
create trigger t_tech before update on public.technician_profiles for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RPCs (all privileged changes go through these)

create or replace function public.tech_update_job(p_job uuid, p_status text, p_work_done text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null or not public.can_see_job(j.business_id, j.id) then raise exception 'Job not found'; end if;
  if not public.is_manager(j.business_id) and p_status not in ('in_progress','awaiting_parts','completed') then
    raise exception 'Technicians can only set In Progress, Awaiting Parts or Completed';
  end if;
  if j.status in ('completed','cancelled') and not public.is_manager(j.business_id) then
    raise exception 'This job is closed';
  end if;
  update public.jobs set status = p_status, work_done = coalesce(p_work_done, work_done) where id = p_job;
end; $$;

create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null or inv.revoked_at is not null then raise exception 'Invitation not found'; end if;
  if inv.accepted_at is not null then raise exception 'Invitation already used'; end if;
  if inv.expires_at < now() then raise exception 'Invitation has expired'; end if;
  if lower(v_email) <> lower(inv.email) then raise exception 'This invitation was sent to a different email address'; end if;
  insert into public.business_members (business_id, user_id, role) values (inv.business_id, auth.uid(), inv.role)
    on conflict (business_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  if inv.role = 'technician' then
    insert into public.technician_profiles (business_id, user_id) values (inv.business_id, auth.uid()) on conflict do nothing;
  end if;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  perform public.write_audit(inv.business_id, 'member.joined', 'business_members', auth.uid()::text, jsonb_build_object('role', inv.role));
  return inv.business_id;
end; $$;

create or replace function public.invitation_preview(p_token uuid)
returns table (business_name text, role text, email text, expired boolean, used boolean)
language sql stable security definer set search_path = '' as $$
  select b.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null
  from public.invitations i join public.businesses b on b.id = i.business_id
  where i.token = p_token and i.revoked_at is null;
$$;

create or replace function public.set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.business_members;
begin
  select * into m from public.business_members where id = p_member for update;
  if m.id is null then raise exception 'Member not found'; end if;
  if m.user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('admin','dispatcher','technician') then raise exception 'Invalid role'; end if;
  if m.role = 'owner' then raise exception 'The owner role cannot be changed here'; end if;
  if not public.has_role(m.business_id, array['owner','admin']) then raise exception 'Not allowed'; end if;
  if p_role = 'admin' and not public.has_role(m.business_id, array['owner']) then raise exception 'Only the owner can make admins'; end if;
  update public.business_members set role = p_role, updated_at = now() where id = p_member;
  if p_role = 'technician' then
    insert into public.technician_profiles (business_id, user_id) values (m.business_id, m.user_id) on conflict do nothing;
  end if;
  perform public.write_audit(m.business_id, 'member.role_changed', 'business_members', p_member::text,
                             jsonb_build_object('from', m.role, 'to', p_role));
end; $$;

create or replace function public.set_member_status(p_member uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.business_members;
begin
  select * into m from public.business_members where id = p_member for update;
  if m.id is null then raise exception 'Member not found'; end if;
  if m.user_id = auth.uid() then raise exception 'You cannot deactivate yourself'; end if;
  if m.role = 'owner' then raise exception 'The owner cannot be deactivated'; end if;
  if p_status not in ('active','deactivated') then raise exception 'Invalid status'; end if;
  if not public.has_role(m.business_id, array['owner','admin']) then raise exception 'Not allowed'; end if;
  if m.role = 'admin' and not public.has_role(m.business_id, array['owner']) then raise exception 'Only the owner can deactivate admins'; end if;
  update public.business_members set status = p_status, updated_at = now() where id = p_member;
  perform public.write_audit(m.business_id, 'member.' || p_status, 'business_members', p_member::text, '{}'::jsonb);
end; $$;

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
    tax_inclusive = coalesce((p->>'tax_inclusive')::boolean, tax_inclusive)
  where business_id = p_business;
  perform public.write_audit(p_business, 'settings.updated', 'businesses', p_business::text, p);
end; $$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_settings enable row level security;
alter table public.number_counters enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.invitations enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_activities enable row level security;
alter table public.job_materials enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_business(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy businesses_select on public.businesses for select to authenticated using (public.is_member(id));

create policy members_select on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(business_id));

create policy settings_select on public.business_settings for select to authenticated using (public.is_member(business_id));
create policy subs_select on public.business_subscriptions for select to authenticated using (public.is_member(business_id));

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_role(business_id, array['owner','admin']));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_role(business_id, array['owner','admin']) and invited_by = auth.uid()
              and accepted_at is null and revoked_at is null
              and (role <> 'admin' or public.has_role(business_id, array['owner'])));
create policy invitations_revoke on public.invitations for update to authenticated
  using (public.has_role(business_id, array['owner','admin']) and accepted_at is null)
  with check (public.has_role(business_id, array['owner','admin']) and accepted_at is null);

create policy tech_select on public.technician_profiles for select to authenticated using (public.is_member(business_id));
create policy tech_update on public.technician_profiles for update to authenticated
  using (public.has_role(business_id, array['owner','admin']) or (user_id = auth.uid() and public.is_member(business_id)))
  with check (public.has_role(business_id, array['owner','admin']) or (user_id = auth.uid() and public.is_member(business_id)));

create policy customers_select on public.customers for select to authenticated
  using (public.is_manager(business_id)
         or exists (select 1 from public.jobs j where j.customer_id = customers.id and public.is_assigned(j.id)));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_manager(business_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_manager(business_id)) with check (public.is_manager(business_id));

create policy jobs_select on public.jobs for select to authenticated using (public.can_see_job(business_id, id));
create policy jobs_insert on public.jobs for insert to authenticated with check (public.is_manager(business_id));
create policy jobs_update on public.jobs for update to authenticated
  using (public.is_manager(business_id)) with check (public.is_manager(business_id));

create policy assign_select on public.job_assignments for select to authenticated
  using (public.is_manager(business_id) or user_id = auth.uid());
create policy assign_insert on public.job_assignments for insert to authenticated with check (public.is_manager(business_id));
create policy assign_delete on public.job_assignments for delete to authenticated using (public.is_manager(business_id));

create policy activities_select on public.job_activities for select to authenticated using (public.can_see_job(business_id, job_id));
create policy activities_insert on public.job_activities for insert to authenticated
  with check (kind = 'note' and public.can_see_job(business_id, job_id));

create policy materials_select on public.job_materials for select to authenticated using (public.can_see_job(business_id, job_id));
create policy materials_insert on public.job_materials for insert to authenticated with check (public.can_see_job(business_id, job_id));

create policy attachments_select on public.attachments for select to authenticated using (public.can_see_job(business_id, job_id));
create policy attachments_insert on public.attachments for insert to authenticated with check (public.can_see_job(business_id, job_id));

create policy audit_select on public.audit_logs for select to authenticated using (public.has_role(business_id, array['owner']));

-- ---------------------------------------------------------------- privileges

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke insert, update, delete on public.profiles, public.businesses, public.business_members, public.business_settings,
  public.number_counters, public.business_subscriptions, public.audit_logs from authenticated;
revoke all on public.number_counters from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;
revoke update on public.technician_profiles from authenticated;
grant update (service_area, skills) on public.technician_profiles to authenticated;
revoke delete on public.customers, public.jobs, public.job_activities, public.job_materials, public.attachments,
  public.invitations, public.technician_profiles from authenticated;
revoke update on public.job_activities, public.job_materials, public.attachments, public.job_assignments from authenticated;

grant execute on function public.is_member(uuid), public.has_role(uuid, text[]), public.is_manager(uuid),
  public.is_assigned(uuid), public.can_see_job(uuid, uuid), public.shares_business(uuid),
  public.tech_update_job(uuid, text, text), public.accept_invitation(uuid), public.invitation_preview(uuid),
  public.set_member_role(uuid, text), public.set_member_status(uuid, text),
  public.update_business_settings(uuid, jsonb) to authenticated;
-- write_audit and next_number are internal only
revoke execute on function public.write_audit(uuid, text, text, text, jsonb), public.next_number(uuid, text) from authenticated;
-- the invite page must show who invited you before you sign in (token is an unguessable secret)
grant execute on function public.invitation_preview(uuid) to anon;
