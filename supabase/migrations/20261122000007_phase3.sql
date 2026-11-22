-- Phase 3: plans and limits, in-app notifications, reports, platform admin.
-- No payment provider: plans are changed by a platform admin until one is connected.

-- ---------------------------------------------------------------- plans
create table public.plans (
  code text primary key check (code ~ '^[a-z_]{2,20}$'),
  name text not null check (char_length(name) between 2 and 40),
  sort integer not null default 0,
  max_staff integer check (max_staff is null or max_staff > 0),          -- null = unlimited
  max_jobs_month integer check (max_jobs_month is null or max_jobs_month > 0),
  max_customers integer check (max_customers is null or max_customers > 0),
  prices jsonb not null default '{}'::jsonb,                              -- {"USD": 1900, "NGN": 1500000} in minor units, set by platform admin
  public boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.plans (code, name, sort, max_staff, max_jobs_month, max_customers, public) values
  ('trial',   'Free trial', 0, 10,  500,  1000, false),
  ('starter', 'Starter',    1, 3,   150,  300,  true),
  ('growth',  'Growth',     2, 10,  1000, 3000, true),
  ('pro',     'Pro',        3, null, null, null, true);

alter table public.business_subscriptions
  add constraint business_subscriptions_plan_fk foreign key (plan) references public.plans(code),
  add column notes text check (char_length(notes) <= 500),
  add column updated_by uuid references auth.users(id);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  id boolean primary key default true check (id),
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_whatsapp text check (support_whatsapp is null or support_whatsapp ~ '^\+[1-9][0-9]{6,14}$'),
  upgrade_note text check (char_length(upgrade_note) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- effective state of a business: plan limits, whether it may create records, and why not
create or replace function public.business_state(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.business_subscriptions; p public.plans; b public.businesses; v_reason text;
begin
  select * into b from public.businesses where id = p_business;
  select * into s from public.business_subscriptions where business_id = p_business;
  select * into p from public.plans where code = coalesce(s.plan, 'trial');
  if b.status = 'suspended' or s.status = 'suspended' then v_reason := 'suspended';
  elsif s.status = 'cancelled' then v_reason := 'cancelled';
  elsif s.status = 'trial' and s.trial_ends_at is not null and s.trial_ends_at < now() then v_reason := 'trial_ended';
  end if;
  return jsonb_build_object(
    'plan', p.code, 'plan_name', p.name, 'status', coalesce(s.status, 'trial'),
    'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'writable', v_reason is null, 'blocked_reason', v_reason,
    'max_staff', p.max_staff, 'max_jobs_month', p.max_jobs_month, 'max_customers', p.max_customers);
end; $$;

create or replace function public.assert_can_create(p_business uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare st jsonb; v_count integer; v_tz text; v_limit integer;
begin
  st := public.business_state(p_business);
  if not (st->>'writable')::boolean then
    raise exception using message = case st->>'blocked_reason'
      when 'trial_ended' then 'Your free trial has ended. Upgrade your plan to keep adding records.'
      when 'suspended' then 'This account is suspended. Contact COVARO support.'
      else 'This subscription is cancelled. Upgrade your plan to keep adding records.' end;
  end if;
  if p_kind = 'job' then
    v_limit := (st->>'max_jobs_month')::integer;
    if v_limit is not null then
      select time_zone into v_tz from public.businesses where id = p_business;
      select count(*) into v_count from public.jobs
        where business_id = p_business
          and date_trunc('month', created_at at time zone v_tz) = date_trunc('month', now() at time zone v_tz);
      if v_count >= v_limit then
        raise exception 'Your plan allows % jobs a month and you have reached it. Upgrade to add more.', v_limit;
      end if;
    end if;
  elsif p_kind = 'customer' then
    v_limit := (st->>'max_customers')::integer;
    if v_limit is not null then
      select count(*) into v_count from public.customers where business_id = p_business;
      if v_count >= v_limit then
        raise exception 'Your plan allows % customers and you have reached it. Upgrade to add more.', v_limit;
      end if;
    end if;
  elsif p_kind = 'staff' then
    v_limit := (st->>'max_staff')::integer;
    if v_limit is not null then
      select count(*) into v_count from public.business_members
        where business_id = p_business and role <> 'customer' and status = 'active';
      if v_count >= v_limit then
        raise exception 'Your plan allows % team members and you have reached it. Upgrade or deactivate someone first.', v_limit;
      end if;
    end if;
  end if;
end; $$;

-- enforcement triggers (creation only; existing records stay editable and readable)
create or replace function public.limits_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'jobs' then perform public.assert_can_create(new.business_id, 'job');
  elsif tg_table_name = 'customers' then perform public.assert_can_create(new.business_id, 'customer');
  elsif tg_table_name = 'invitations' then
    if new.role <> 'customer' then perform public.assert_can_create(new.business_id, 'staff');
    else perform public.assert_can_create(new.business_id, 'other'); end if;
  else perform public.assert_can_create(new.business_id, 'other');
  end if;
  return new;
end; $$;

create trigger jobs_limits before insert on public.jobs for each row execute function public.limits_before_insert();
create trigger customers_limits before insert on public.customers for each row execute function public.limits_before_insert();
create trigger invitations_limits before insert on public.invitations for each row execute function public.limits_before_insert();
create trigger quotations_limits before insert on public.quotations for each row execute function public.limits_before_insert();
create trigger invoices_limits before insert on public.invoices for each row execute function public.limits_before_insert();

-- staff seats: checked when someone joins or is reactivated (owner row at signup has no subscription yet: allowed)
create or replace function public.members_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'customer' or new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.role <> 'customer' then return new; end if;
  if not exists (select 1 from public.business_subscriptions where business_id = new.business_id) then return new; end if;
  perform public.assert_can_create(new.business_id, 'staff');
  return new;
end; $$;
create trigger business_members_limits before insert or update of status, role on public.business_members
  for each row execute function public.members_limits();

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 500),
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

create or replace function public.notify_roles(p_business uuid, p_roles text[], p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (business_id, user_id, kind, title, body, link)
  select p_business, m.user_id, p_kind, left(p_title, 200), left(p_body, 500), p_link
  from public.business_members m
  where m.business_id = p_business and m.role = any (p_roles) and m.status = 'active'
    and m.user_id is distinct from auth.uid();
$$;

create or replace function public.notify_jobs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cust text;
begin
  select name into v_cust from public.customers where id = new.customer_id;
  if tg_op = 'INSERT' and new.source = 'portal' then
    perform public.notify_roles(new.business_id, array['owner','admin','dispatcher'], 'service_request',
      'New service request from ' || coalesce(v_cust, 'a customer'), new.reference || ': ' || new.title, '/jobs/' || new.id);
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.status in ('completed','awaiting_parts') then
    perform public.notify_roles(new.business_id, array['owner','admin','dispatcher'],
      'job_' || new.status,
      new.reference || case when new.status = 'completed' then ' completed' else ' is waiting for parts' end,
      new.title || coalesce(' for ' || v_cust, ''), '/jobs/' || new.id);
  end if;
  return null;
end; $$;
create trigger jobs_notify after insert or update of status on public.jobs for each row execute function public.notify_jobs();

create or replace function public.notify_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  if new.user_id = auth.uid() then return null; end if;
  select * into j from public.jobs where id = new.job_id;
  insert into public.notifications (business_id, user_id, kind, title, body, link)
  values (new.business_id, new.user_id, 'job_assigned', 'You were assigned ' || j.reference, j.title, '/jobs/' || j.id);
  return null;
end; $$;
create trigger job_assignments_notify after insert on public.job_assignments for each row execute function public.notify_assignment();

create or replace function public.notify_quotes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cust text;
begin
  if new.status = old.status or new.status not in ('accepted','rejected') then return null; end if;
  if not exists (select 1 from public.business_members where business_id = new.business_id and user_id = auth.uid() and role = 'customer') then
    return null;
  end if;
  select name into v_cust from public.customers where id = new.customer_id;
  perform public.notify_roles(new.business_id, array['owner','admin','dispatcher'], 'quote_' || new.status,
    coalesce(v_cust, 'A customer') || ' ' || new.status || ' ' || new.reference, null, '/quotes/' || new.id);
  return null;
end; $$;
create trigger quotations_notify after update of status on public.quotations for each row execute function public.notify_quotes();

create or replace function public.notify_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.role in ('owner','customer') then return null; end if;
  select full_name into v_name from public.profiles where id = new.user_id;
  perform public.notify_roles(new.business_id, array['owner','admin'], 'member_joined',
    coalesce(v_name, 'Someone') || ' joined as ' || new.role, null, '/team');
  return null;
end; $$;
create trigger business_members_notify after insert on public.business_members for each row execute function public.notify_members();

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------- reports (managers only)
create or replace function public.report_summary(p_business uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_from timestamptz; v_to timestamptz; v_today date; r jsonb;
begin
  if not public.is_manager(p_business) then raise exception 'Not allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid date range'; end if;
  if p_to - p_from > 731 then raise exception 'Choose a range of two years or less'; end if;
  select time_zone into v_tz from public.businesses where id = p_business;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_today := (now() at time zone v_tz)::date;

  with jobs_in as (
    select * from public.jobs where business_id = p_business and not archived and created_at >= v_from and created_at < v_to
  ), done as (
    select * from public.jobs where business_id = p_business and completed_at >= v_from and completed_at < v_to
  ), pay as (
    select * from public.payments where business_id = p_business and paid_on between p_from and p_to
  ), inv as (
    select * from public.invoices where business_id = p_business and status <> 'cancelled' and issue_date between p_from and p_to
  ), open_inv as (
    select i.*, c.name as customer_name from public.invoices i join public.customers c on c.id = i.customer_id
    where i.business_id = p_business and i.status in ('sent','partially_paid') and i.balance_minor > 0
  )
  select jsonb_build_object(
    'jobs_created', (select count(*) from jobs_in),
    'jobs_completed', (select count(*) from done),
    'jobs_cancelled', (select count(*) from jobs_in where status = 'cancelled'),
    'avg_hours_to_complete', (select round(avg(extract(epoch from completed_at - created_at) / 3600)::numeric, 1) from done),
    'portal_requests', (select count(*) from jobs_in where source = 'portal'),
    'jobs_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from jobs_in group by status) s), '{}'::jsonb),
    'jobs_by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from jobs_in group by category) s), '{}'::jsonb),
    'technicians', coalesce((
      select jsonb_agg(t order by (t->>'completed')::int desc) from (
        select jsonb_build_object('user_id', m.user_id, 'name', coalesce(p.full_name, 'Unnamed'),
          'completed', count(d.id),
          'avg_hours', round(avg(extract(epoch from d.completed_at - d.created_at) / 3600)::numeric, 1),
          'open', (select count(*) from public.job_assignments a2 join public.jobs j2 on j2.id = a2.job_id
                   where a2.user_id = m.user_id and j2.business_id = p_business and not j2.archived
                     and j2.status not in ('completed','cancelled'))) t
        from public.business_members m
        left join public.profiles p on p.id = m.user_id
        left join public.job_assignments a on a.user_id = m.user_id and a.business_id = p_business
        left join done d on d.id = a.job_id
        where m.business_id = p_business and m.role = 'technician' and m.status = 'active'
        group by m.user_id, p.full_name) x), '[]'::jsonb),
    'invoiced_minor', (select coalesce(sum(total_minor), 0) from inv),
    'invoice_count', (select count(*) from inv),
    'collected_minor', (select coalesce(sum(amount_minor), 0) from pay),
    'collected_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'amount_minor', coalesce(s.amt, 0)) order by m)
      from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m
      left join (select date_trunc('month', paid_on) mo, sum(amount_minor) amt from pay group by 1) s on s.mo = m), '[]'::jsonb),
    'outstanding_minor', (select coalesce(sum(balance_minor), 0) from open_inv),
    'aging', jsonb_build_object(
      'current', (select coalesce(sum(balance_minor), 0) from open_inv where due_date is null or due_date >= v_today),
      'd1_30', (select coalesce(sum(balance_minor), 0) from open_inv where v_today - due_date between 1 and 30),
      'd31_60', (select coalesce(sum(balance_minor), 0) from open_inv where v_today - due_date between 31 and 60),
      'd61_90', (select coalesce(sum(balance_minor), 0) from open_inv where v_today - due_date between 61 and 90),
      'd90_plus', (select coalesce(sum(balance_minor), 0) from open_inv where v_today - due_date > 90)),
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object('customer_id', customer_id, 'name', name, 'billed_minor', billed, 'invoices', n) order by billed desc)
      from (select i.customer_id, c.name, sum(i.total_minor) billed, count(*) n from inv i join public.customers c on c.id = i.customer_id
            group by i.customer_id, c.name order by billed desc limit 10) tc), '[]'::jsonb)
  ) into r;
  return r;
end; $$;

-- what a business sees about its own plan
create or replace function public.business_usage(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if not public.is_staff(p_business) then raise exception 'Not allowed'; end if;
  select time_zone into v_tz from public.businesses where id = p_business;
  return public.business_state(p_business) || jsonb_build_object(
    'staff', (select count(*) from public.business_members where business_id = p_business and role <> 'customer' and status = 'active'),
    'customers', (select count(*) from public.customers where business_id = p_business),
    'jobs_this_month', (select count(*) from public.jobs where business_id = p_business
                        and date_trunc('month', created_at at time zone v_tz) = date_trunc('month', now() at time zone v_tz)),
    'support', (select jsonb_build_object('email', support_email, 'whatsapp', support_whatsapp, 'note', upgrade_note) from public.platform_settings),
    'plans', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'max_staff', max_staff, 'max_jobs_month', max_jobs_month,
                                                   'max_customers', max_customers, 'prices', prices) order by sort)
              from public.plans where public));
end; $$;

-- ---------------------------------------------------------------- platform admin
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'businesses', coalesce((
      select jsonb_agg(r order by (r->>'created_at') desc) from (
        select jsonb_build_object(
          'id', b.id, 'name', b.name, 'industry', b.industry, 'country', b.country, 'currency', b.currency,
          'created_at', b.created_at, 'business_status', b.status,
          'owner_email', (select u.email from public.business_members m join auth.users u on u.id = m.user_id
                          where m.business_id = b.id and m.role = 'owner' limit 1),
          'plan', s.plan, 'status', s.status, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end, 'notes', s.notes,
          'staff', (select count(*) from public.business_members m where m.business_id = b.id and m.role <> 'customer' and m.status = 'active'),
          'customers', (select count(*) from public.customers c where c.business_id = b.id),
          'jobs', (select count(*) from public.jobs j where j.business_id = b.id),
          'jobs_30d', (select count(*) from public.jobs j where j.business_id = b.id and j.created_at > now() - interval '30 days'),
          'last_activity', (select max(created_at) from public.audit_logs a where a.business_id = b.id)) r
        from public.businesses b left join public.business_subscriptions s on s.business_id = b.id) x), '[]'::jsonb),
    'plans', (select jsonb_agg(to_jsonb(p) order by sort) from public.plans p),
    'settings', (select to_jsonb(ps) - 'id' from public.platform_settings ps));
end; $$;

create or replace function public.admin_set_subscription(p_business uuid, p_plan text, p_status text, p_trial_ends_at timestamptz,
  p_period_end timestamptz, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_row jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.plans where code = p_plan) then raise exception 'Unknown plan'; end if;
  if p_status not in ('trial','active','past_due','cancelled','suspended') then raise exception 'Invalid status'; end if;
  select to_jsonb(s) into old_row from public.business_subscriptions s where business_id = p_business;
  insert into public.business_subscriptions (business_id, plan, status, trial_ends_at, current_period_end, notes, updated_by, updated_at)
  values (p_business, p_plan, p_status, p_trial_ends_at, p_period_end, nullif(trim(p_notes), ''), auth.uid(), now())
  on conflict (business_id) do update set plan = excluded.plan, status = excluded.status, trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  perform public.write_audit(p_business, 'subscription.changed_by_platform', 'business_subscriptions', p_business::text,
    jsonb_build_object('before', old_row, 'plan', p_plan, 'status', p_status, 'trial_ends_at', p_trial_ends_at, 'period_end', p_period_end));
  perform public.notify_roles(p_business, array['owner','admin'], 'plan_changed',
    'Your COVARO plan is now ' || (select name from public.plans where code = p_plan) || ' (' || replace(p_status, '_', ' ') || ')', null, '/settings');
end; $$;

create or replace function public.admin_update_plan(p_code text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update public.plans set
    name = coalesce(p->>'name', name),
    max_staff = case when p ? 'max_staff' then (p->>'max_staff')::integer else max_staff end,
    max_jobs_month = case when p ? 'max_jobs_month' then (p->>'max_jobs_month')::integer else max_jobs_month end,
    max_customers = case when p ? 'max_customers' then (p->>'max_customers')::integer else max_customers end,
    prices = case when p ? 'prices' then p->'prices' else prices end,
    updated_at = now()
  where code = p_code;
  if not found then raise exception 'Unknown plan'; end if;
end; $$;

create or replace function public.admin_update_settings(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update public.platform_settings set
    support_email = case when p ? 'support_email' then nullif(trim(p->>'support_email'), '') else support_email end,
    support_whatsapp = case when p ? 'support_whatsapp' then nullif(trim(p->>'support_whatsapp'), '') else support_whatsapp end,
    upgrade_note = case when p ? 'upgrade_note' then nullif(trim(p->>'upgrade_note'), '') else upgrade_note end,
    updated_at = now()
  where id;
end; $$;

-- ---------------------------------------------------------------- RLS and privileges
alter table public.plans enable row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.notifications enable row level security;

create policy plans_select on public.plans for select to authenticated using (true);
create policy platform_admins_select on public.platform_admins for select to authenticated using (user_id = auth.uid());
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());

revoke all on public.plans, public.platform_admins, public.platform_settings, public.notifications from anon;
revoke insert, update, delete on public.plans, public.platform_admins, public.platform_settings, public.notifications from authenticated;
revoke select on public.platform_settings from authenticated;
revoke insert, update, delete on public.business_subscriptions from authenticated;

revoke all on function public.is_platform_admin(), public.business_state(uuid), public.assert_can_create(uuid, text),
  public.limits_before_insert(), public.members_limits(), public.notify_roles(uuid, text[], text, text, text, text),
  public.notify_jobs(), public.notify_assignment(), public.notify_quotes(), public.notify_members(),
  public.mark_notifications_read(uuid[]), public.report_summary(uuid, date, date), public.business_usage(uuid),
  public.admin_overview(), public.admin_set_subscription(uuid, text, text, timestamptz, timestamptz, text),
  public.admin_update_plan(text, jsonb), public.admin_update_settings(jsonb) from public, anon;
grant execute on function public.is_platform_admin(), public.mark_notifications_read(uuid[]), public.report_summary(uuid, date, date),
  public.business_usage(uuid), public.admin_overview(), public.admin_set_subscription(uuid, text, text, timestamptz, timestamptz, text),
  public.admin_update_plan(text, jsonb), public.admin_update_settings(jsonb) to authenticated;
revoke execute on function public.business_state(uuid), public.assert_can_create(uuid, text), public.limits_before_insert(),
  public.members_limits(), public.notify_roles(uuid, text[], text, text, text, text), public.notify_jobs(), public.notify_assignment(),
  public.notify_quotes(), public.notify_members() from authenticated;
