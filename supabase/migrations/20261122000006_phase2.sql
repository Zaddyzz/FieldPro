-- COVARO Phase 2: equipment, maintenance, quotations, invoices, payments, customer portal.
-- Same rules as Phase 1: business_id on every row, RLS everywhere, no deletes, privileged writes via RPCs.

-- ---------------------------------------------------------------- settings additions
alter table public.business_settings
  add column if not exists quote_prefix text not null default 'QUO-' check (quote_prefix ~ '^[A-Z0-9-]{1,10}$'),
  add column if not exists invoice_prefix text not null default 'INV-' check (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
  add column if not exists default_tax_rate numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  add column if not exists invoice_terms_days integer not null default 14 check (invoice_terms_days between 0 and 365),
  add column if not exists payment_instructions text check (char_length(payment_instructions) <= 1000),
  add column if not exists tax_number text check (char_length(tax_number) <= 60),
  add column if not exists payment_methods text[] not null default array['Cash','Bank transfer','Card','Mobile money','Cheque','Other'];

-- helpers
create or replace function public.is_staff(p_business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_business, array['owner','admin','dispatcher','technician']);
$$;

create or replace function public.minor_digits(p_currency text)
returns integer language sql immutable set search_path = '' as $$
  select case when p_currency in ('JPY','KRW','VND','XAF','XOF','UGX','RWF','CLP','ISK','PYG') then 0
              when p_currency in ('BHD','KWD','OMR','JOD','TND','LYD','IQD') then 3 else 2 end;
$$;

-- ---------------------------------------------------------------- customer portal links
create table public.customer_contacts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, customer_id) references public.customers(business_id, id)
);
create index on public.customer_contacts (customer_id);

alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('admin','dispatcher','technician','customer'));
alter table public.invitations add column if not exists customer_id uuid;
alter table public.invitations add constraint invitations_customer_fk foreign key (business_id, customer_id) references public.customers(business_id, id);
alter table public.invitations add constraint invitations_customer_role check ((role = 'customer') = (customer_id is not null));

create or replace function public.my_customer_id(p_business uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.customer_id from public.customer_contacts c
  join public.business_members m on m.business_id = c.business_id and m.user_id = c.user_id
  where c.business_id = p_business and c.user_id = auth.uid() and m.status = 'active' and m.role = 'customer';
$$;

-- customers must not see staff details; tighten Phase 1 policies
create or replace function public.shares_business(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members a join public.business_members b on a.business_id = b.business_id
                 where a.user_id = auth.uid() and a.status = 'active' and a.role <> 'customer' and b.user_id = p_user);
$$;
drop policy members_select on public.business_members;
create policy members_select on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff(business_id));
drop policy tech_select on public.technician_profiles;
create policy tech_select on public.technician_profiles for select to authenticated using (public.is_staff(business_id));

-- ---------------------------------------------------------------- equipment
create table public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, name),
  unique (business_id, id)
);

create or replace function public.seed_equipment_categories(p_business uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_industry text; names text[];
begin
  select industry into v_industry from public.businesses where id = p_business;
  names := case v_industry
    when 'cctv' then array['Camera','DVR','NVR','Hard drive','Power supply','Monitor']
    when 'solar' then array['Solar panel','Inverter','Battery','Charge controller','Changeover switch']
    when 'internet' then array['Router','Switch','Access point','Radio / CPE','ONT','Cabling']
    else array['Device','Accessory'] end;
  insert into public.equipment_categories (business_id, name) select p_business, unnest(names) on conflict do nothing;
end; $$;

create or replace function public.businesses_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.seed_equipment_categories(new.id); return null; end; $$;
create trigger businesses_ai after insert on public.businesses for each row execute function public.businesses_after_insert();
select public.seed_equipment_categories(id) from public.businesses;

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  manufacturer text check (char_length(manufacturer) <= 80),
  model text check (char_length(model) <= 80),
  serial_number text check (char_length(serial_number) <= 80),
  installed_on date,
  warranty_expires_on date,
  location text check (char_length(location) <= 160),
  installed_by uuid references auth.users(id),
  condition text not null default 'good' check (condition in ('good','fair','faulty','replaced')),
  notes text check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  foreign key (business_id, category_id) references public.equipment_categories(business_id, id) on delete set null (category_id)
);
create index on public.equipment (business_id, status);
create index on public.equipment (customer_id);
create index on public.equipment (business_id, warranty_expires_on);

-- ---------------------------------------------------------------- maintenance
create table public.maintenance_contracts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  title text not null check (char_length(title) between 2 and 120),
  starts_on date not null,
  ends_on date,
  frequency text not null check (frequency in ('monthly','quarterly','semiannual','annual')),
  next_service_on date not null,
  price_minor bigint not null default 0 check (price_minor >= 0),
  notes text check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  check (ends_on is null or ends_on >= starts_on)
);
create index on public.maintenance_contracts (business_id, next_service_on);

create table public.contract_equipment (
  business_id uuid not null,
  contract_id uuid not null,
  equipment_id uuid not null,
  primary key (contract_id, equipment_id),
  foreign key (business_id, contract_id) references public.maintenance_contracts(business_id, id) on delete cascade,
  foreign key (business_id, equipment_id) references public.equipment(business_id, id) on delete cascade
);

alter table public.jobs add column if not exists contract_id uuid;
alter table public.jobs add constraint jobs_contract_fk foreign key (business_id, contract_id) references public.maintenance_contracts(business_id, id) on delete set null (contract_id);
alter table public.jobs add column if not exists source text not null default 'staff' check (source in ('staff','portal','maintenance'));

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  contract_id uuid not null,
  job_id uuid not null,
  serviced_on date not null,
  created_at timestamptz not null default now(),
  unique (job_id),
  foreign key (business_id, contract_id) references public.maintenance_contracts(business_id, id) on delete cascade,
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete cascade
);

create or replace function public.advance_date(p_date date, p_frequency text)
returns date language sql immutable set search_path = '' as $$
  select (p_date + case p_frequency when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months'
                                    when 'semiannual' then interval '6 months' else interval '1 year' end)::date;
$$;

-- completing a maintenance job logs a record and moves the next service date
create or replace function public.jobs_maintenance_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.maintenance_contracts; v_tz text;
begin
  if new.contract_id is not null and new.status = 'completed' and old.status <> 'completed' then
    select * into c from public.maintenance_contracts where id = new.contract_id for update;
    select time_zone into v_tz from public.businesses where id = new.business_id;
    insert into public.maintenance_records (business_id, contract_id, job_id, serviced_on)
      values (new.business_id, new.contract_id, new.id, (now() at time zone v_tz)::date) on conflict (job_id) do nothing;
    update public.maintenance_contracts
      set next_service_on = public.advance_date(greatest(c.next_service_on, (now() at time zone v_tz)::date), c.frequency), updated_at = now()
      where id = c.id;
  end if;
  return null;
end; $$;
create trigger jobs_maint_au after update on public.jobs for each row execute function public.jobs_maintenance_after();

create or replace function public.create_job_from_contract(p_contract uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.maintenance_contracts; v_tz text; v_job uuid; v_addr text;
begin
  select * into c from public.maintenance_contracts where id = p_contract;
  if c.id is null or not public.is_manager(c.business_id) then raise exception 'Contract not found'; end if;
  if c.status <> 'active' then raise exception 'This contract is not active'; end if;
  select time_zone into v_tz from public.businesses where id = c.business_id;
  select concat_ws(', ', address_line1, city) into v_addr from public.customers where id = c.customer_id;
  insert into public.jobs (business_id, customer_id, title, category, status, scheduled_at, address, contract_id, source)
  values (c.business_id, c.customer_id, 'Maintenance: ' || c.title, 'maintenance', 'scheduled',
          (c.next_service_on::timestamp + time '09:00') at time zone v_tz, nullif(v_addr, ''), c.id, 'maintenance')
  returning id into v_job;
  return v_job;
end; $$;

-- ---------------------------------------------------------------- quotations and invoices
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  number integer not null,
  reference text not null,
  customer_id uuid not null,
  job_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  issue_date date not null default current_date,
  valid_until date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  discount_type text not null default 'none' check (discount_type in ('none','amount','percent')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  tax_inclusive boolean not null default false,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  notes text check (char_length(notes) <= 2000),
  invoice_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete set null (job_id)
);
create index on public.quotations (business_id, status);
create index on public.quotations (customer_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  number integer not null,
  reference text not null,
  customer_id uuid not null,
  job_id uuid,
  quotation_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','cancelled')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  discount_type text not null default 'none' check (discount_type in ('none','amount','percent')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  tax_inclusive boolean not null default false,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  amount_paid_minor bigint not null default 0,
  balance_minor bigint not null default 0,
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  foreign key (business_id, job_id) references public.jobs(business_id, id) on delete set null (job_id),
  foreign key (business_id, quotation_id) references public.quotations(business_id, id) on delete set null (quotation_id)
);
create index on public.invoices (business_id, status);
create index on public.invoices (customer_id);
create index on public.invoices (business_id, due_date);
alter table public.quotations add constraint quotations_invoice_fk foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete set null (invoice_id);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  quotation_id uuid not null,
  kind text not null default 'material' check (kind in ('labour','material','other')),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null default 0,
  position integer not null default 0,
  foreign key (business_id, quotation_id) references public.quotations(business_id, id) on delete cascade
);
create index on public.quotation_items (quotation_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  invoice_id uuid not null,
  kind text not null default 'material' check (kind in ('labour','material','other')),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null default 0,
  position integer not null default 0,
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete cascade
);
create index on public.invoice_items (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  invoice_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0),
  paid_on date not null,
  method text not null check (char_length(method) between 1 and 40),
  reference text check (char_length(reference) <= 120),
  notes text check (char_length(notes) <= 500),
  reverses_payment_id uuid unique references public.payments(id),
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  -- cascade only fires if a whole business is removed (clients can never delete invoices)
  foreign key (business_id, invoice_id) references public.invoices(business_id, id) on delete cascade
);
create index on public.payments (invoice_id);
create index on public.payments (business_id, paid_on desc);

-- totals: always computed in the database
create or replace function public.compute_totals(p_subtotal bigint, p_dtype text, p_dvalue numeric, p_rate numeric, p_inclusive boolean, p_digits integer,
  out discount_minor bigint, out tax_minor bigint, out total_minor bigint)
language plpgsql immutable set search_path = '' as $$
declare net bigint;
begin
  discount_minor := case p_dtype when 'percent' then round(p_subtotal * least(p_dvalue, 100) / 100.0)
                                 when 'amount' then least(p_subtotal, round(p_dvalue * power(10, p_digits)))
                                 else 0 end;
  net := p_subtotal - discount_minor;
  if p_inclusive then
    tax_minor := round(net - net / (1 + p_rate / 100.0));
    total_minor := net;
  else
    tax_minor := round(net * p_rate / 100.0);
    total_minor := net + tax_minor;
  end if;
end; $$;

create or replace function public.recalc_quotation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.quotations; sub bigint; t record;
begin
  select * into q from public.quotations where id = p_id;
  if q.id is null then return; end if;
  select coalesce(sum(line_total_minor), 0) into sub from public.quotation_items where quotation_id = p_id;
  select * into t from public.compute_totals(sub, q.discount_type, q.discount_value, q.tax_rate, q.tax_inclusive, public.minor_digits(q.currency));
  update public.quotations set subtotal_minor = sub, discount_minor = t.discount_minor, tax_minor = t.tax_minor, total_minor = t.total_minor
  where id = p_id and (subtotal_minor, discount_minor, tax_minor, total_minor) is distinct from (sub, t.discount_minor, t.tax_minor, t.total_minor);
end; $$;

create or replace function public.recalc_invoice(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invoices; sub bigint; paid bigint; t record; st text;
begin
  select * into i from public.invoices where id = p_id;
  if i.id is null then return; end if;
  select coalesce(sum(line_total_minor), 0) into sub from public.invoice_items where invoice_id = p_id;
  select coalesce(sum(amount_minor), 0) into paid from public.payments where invoice_id = p_id;
  select * into t from public.compute_totals(sub, i.discount_type, i.discount_value, i.tax_rate, i.tax_inclusive, public.minor_digits(i.currency));
  st := i.status;
  if st <> 'cancelled' then
    if paid > 0 and paid >= t.total_minor and t.total_minor > 0 then st := 'paid';
    elsif paid > 0 then st := 'partially_paid';
    elsif st in ('partially_paid','paid') then st := 'sent';
    end if;
  end if;
  update public.invoices set subtotal_minor = sub, discount_minor = t.discount_minor, tax_minor = t.tax_minor, total_minor = t.total_minor,
    amount_paid_minor = paid, balance_minor = t.total_minor - paid, status = st
  where id = p_id and (subtotal_minor, discount_minor, tax_minor, total_minor, amount_paid_minor, status)
        is distinct from (sub, t.discount_minor, t.tax_minor, t.total_minor, paid, st);
end; $$;

-- item triggers: compute line totals, lock items once an invoice has payments or is cancelled
create or replace function public.items_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_parent uuid; v_locked boolean := false;
begin
  if tg_table_name = 'invoice_items' then
    v_parent := coalesce(new.invoice_id, old.invoice_id);
    select (status = 'cancelled' or amount_paid_minor <> 0 or exists (select 1 from public.payments p where p.invoice_id = v_parent))
      into v_locked from public.invoices where id = v_parent;
    if v_locked then raise exception 'This invoice has payments or is cancelled, so its items can no longer change'; end if;
  else
    v_parent := coalesce(new.quotation_id, old.quotation_id);
    select (status in ('accepted','rejected') or invoice_id is not null) into v_locked from public.quotations where id = v_parent;
    if v_locked then raise exception 'This quotation is closed, so its items can no longer change'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.line_total_minor := round(new.quantity * new.unit_price_minor);
  return new;
end; $$;

create or replace function public.items_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'invoice_items' then perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  else perform public.recalc_quotation(coalesce(new.quotation_id, old.quotation_id)); end if;
  return null;
end; $$;

create trigger qi_bi before insert or update or delete on public.quotation_items for each row execute function public.items_before();
create trigger qi_ai after insert or update or delete on public.quotation_items for each row execute function public.items_after();
create trigger ii_bi before insert or update or delete on public.invoice_items for each row execute function public.items_before();
create trigger ii_ai after insert or update or delete on public.invoice_items for each row execute function public.items_after();

-- document headers: numbering, identity guards, recompute on change
-- numbering and defaults on insert (definer: uses the private number counters)
create or replace function public.docs_number_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.business_settings; b public.businesses;
begin
  select * into s from public.business_settings where business_id = new.business_id;
  select * into b from public.businesses where id = new.business_id;
  new.currency := b.currency;
  new.created_by := auth.uid(); new.created_at := now();
  new.subtotal_minor := 0; new.discount_minor := 0; new.tax_minor := 0; new.total_minor := 0;
  if tg_table_name = 'invoices' then
    new.number := public.next_number(new.business_id, 'invoice');
    new.reference := coalesce(s.invoice_prefix, 'INV-') || lpad(new.number::text, 4, '0');
    new.amount_paid_minor := 0; new.balance_minor := 0;
    if new.status not in ('draft','sent') then new.status := 'draft'; end if;
    new.due_date := coalesce(new.due_date, new.issue_date + coalesce(s.invoice_terms_days, 14));
  else
    new.number := public.next_number(new.business_id, 'quotation');
    new.reference := coalesce(s.quote_prefix, 'QUO-') || lpad(new.number::text, 4, '0');
    new.invoice_id := null;
    if new.status not in ('draft','sent') then new.status := 'draft'; end if;
    new.valid_until := coalesce(new.valid_until, new.issue_date + 30);
  end if;
  return new;
end; $$;

-- update guards (invoker: current_user is 'authenticated' for direct client writes,
-- and the table owner when the change comes from a trusted function such as recalc_invoice)
create or replace function public.docs_guard_before()
returns trigger language plpgsql set search_path = '' as $$
declare direct boolean := current_user = 'authenticated';
begin
  if new.business_id <> old.business_id or new.number <> old.number or new.reference <> old.reference or new.currency <> old.currency
     or new.created_by is distinct from old.created_by then
    raise exception 'Document identity fields cannot be changed';
  end if;
  if tg_table_name = 'invoices' then
    if direct and (new.amount_paid_minor <> old.amount_paid_minor or new.balance_minor <> old.balance_minor
       or new.total_minor <> old.total_minor or new.subtotal_minor <> old.subtotal_minor or new.tax_minor <> old.tax_minor or new.discount_minor <> old.discount_minor) then
      raise exception 'Totals are calculated automatically';
    end if;
    if direct and new.status in ('partially_paid','paid') and new.status <> old.status then
      raise exception 'Paid statuses are set from recorded payments';
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'A cancelled invoice cannot be reopened'; end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' and old.amount_paid_minor <> 0 then
      raise exception 'Reverse the payments before cancelling this invoice';
    end if;
    if old.amount_paid_minor <> 0 and (new.discount_type, new.discount_value, new.tax_rate, new.tax_inclusive) is distinct from (old.discount_type, old.discount_value, old.tax_rate, old.tax_inclusive) then
      raise exception 'This invoice has payments, so its amounts can no longer change';
    end if;
  else
    if direct and (new.total_minor <> old.total_minor or new.subtotal_minor <> old.subtotal_minor or new.tax_minor <> old.tax_minor or new.discount_minor <> old.discount_minor) then
      raise exception 'Totals are calculated automatically';
    end if;
    if direct and new.invoice_id is distinct from old.invoice_id then raise exception 'Use Convert to invoice'; end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.docs_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'invoices' then
    if tg_op = 'INSERT' or (new.discount_type, new.discount_value, new.tax_rate, new.tax_inclusive, new.status) is distinct from (old.discount_type, old.discount_value, old.tax_rate, old.tax_inclusive, old.status) then
      perform public.recalc_invoice(new.id);
    end if;
    if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
      perform public.write_audit(new.business_id, 'invoice.cancelled', 'invoices', new.id::text, '{}'::jsonb);
    end if;
  else
    if tg_op = 'INSERT' or (new.discount_type, new.discount_value, new.tax_rate, new.tax_inclusive) is distinct from (old.discount_type, old.discount_value, old.tax_rate, old.tax_inclusive) then
      perform public.recalc_quotation(new.id);
    end if;
  end if;
  return null;
end; $$;

create trigger quotations_bi before insert on public.quotations for each row execute function public.docs_number_before();
create trigger quotations_bu before update on public.quotations for each row execute function public.docs_guard_before();
create trigger quotations_aiu after insert or update on public.quotations for each row execute function public.docs_after();
create trigger invoices_bi before insert on public.invoices for each row execute function public.docs_number_before();
create trigger invoices_bu before update on public.invoices for each row execute function public.docs_guard_before();
create trigger invoices_aiu after insert or update on public.invoices for each row execute function public.docs_after();

create or replace function public.convert_quote_to_invoice(p_quote uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q public.quotations; v_inv uuid;
begin
  select * into q from public.quotations where id = p_quote for update;
  if q.id is null or not public.has_role(q.business_id, array['owner','admin','dispatcher']) then raise exception 'Quotation not found'; end if;
  if q.invoice_id is not null then raise exception 'This quotation has already been converted'; end if;
  if q.status in ('rejected','expired') then raise exception 'This quotation was % and cannot be invoiced', q.status; end if;
  insert into public.invoices (business_id, customer_id, job_id, quotation_id, status, currency, discount_type, discount_value, tax_rate, tax_inclusive, notes)
  values (q.business_id, q.customer_id, q.job_id, q.id, 'draft', q.currency, q.discount_type, q.discount_value, q.tax_rate, q.tax_inclusive, q.notes)
  returning id into v_inv;
  insert into public.invoice_items (business_id, invoice_id, kind, description, quantity, unit_price_minor, position)
  select business_id, v_inv, kind, description, quantity, unit_price_minor, position from public.quotation_items where quotation_id = q.id order by position;
  update public.quotations set status = 'accepted', invoice_id = v_inv, updated_at = now() where id = q.id;
  perform public.write_audit(q.business_id, 'quotation.converted', 'quotations', q.id::text, jsonb_build_object('invoice', v_inv));
  return v_inv;
end; $$;

-- payments: insert-only, via RPC; reversals are negative entries
create or replace function public.record_payment(p_invoice uuid, p_amount_minor bigint, p_paid_on date, p_method text, p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invoices; v_id uuid;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null or not public.has_role(i.business_id, array['owner','admin','dispatcher']) then raise exception 'Invoice not found'; end if;
  if i.status = 'cancelled' then raise exception 'This invoice is cancelled'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  if p_amount_minor > i.balance_minor then raise exception 'This is more than the balance due'; end if;
  if p_paid_on > current_date + 1 then raise exception 'The payment date cannot be in the future'; end if;
  insert into public.payments (business_id, invoice_id, amount_minor, paid_on, method, reference, notes, recorded_by)
  values (i.business_id, i.id, p_amount_minor, p_paid_on, p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  if i.status = 'draft' then update public.invoices set status = 'sent' where id = i.id; end if;
  perform public.recalc_invoice(i.id);
  perform public.write_audit(i.business_id, 'payment.recorded', 'payments', v_id::text, jsonb_build_object('invoice', i.id, 'amount_minor', p_amount_minor));
  return v_id;
end; $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.payments; v_id uuid;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or not public.has_role(p.business_id, array['owner','admin']) then raise exception 'Payment not found'; end if;
  if p.amount_minor < 0 then raise exception 'A reversal cannot be reversed'; end if;
  if exists (select 1 from public.payments where reverses_payment_id = p.id) then raise exception 'This payment has already been reversed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the reversal'; end if;
  insert into public.payments (business_id, invoice_id, amount_minor, paid_on, method, reference, notes, reverses_payment_id, recorded_by)
  values (p.business_id, p.invoice_id, -p.amount_minor, current_date, p.method, p.reference, 'Reversal: ' || trim(p_reason), p.id, auth.uid())
  returning id into v_id;
  perform public.recalc_invoice(p.invoice_id);
  perform public.write_audit(p.business_id, 'payment.reversed', 'payments', p.id::text, jsonb_build_object('reversal', v_id, 'reason', p_reason));
  return v_id;
end; $$;

-- generic guards for new tables
create or replace function public.p2_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name in ('equipment','maintenance_contracts') then new.created_by := auth.uid(); end if;
    new.created_at := now();
  else
    if new.business_id <> old.business_id then raise exception 'business_id cannot be changed'; end if;
    if tg_table_name in ('equipment','maintenance_contracts') then
      new.created_by := old.created_by; new.created_at := old.created_at; new.updated_at := now();
    end if;
  end if;
  return new;
end; $$;
create trigger equipment_g before insert or update on public.equipment for each row execute function public.p2_guard();
create trigger contracts_g before insert or update on public.maintenance_contracts for each row execute function public.p2_guard();

-- ---------------------------------------------------------------- invitations for customers (replace Phase 1 functions)
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
  if exists (select 1 from public.business_members where business_id = inv.business_id and user_id = auth.uid()
             and ((inv.role = 'customer' and role <> 'customer') or (inv.role <> 'customer' and role = 'customer'))) then
    raise exception 'This account already has a different kind of access to this business';
  end if;
  insert into public.business_members (business_id, user_id, role) values (inv.business_id, auth.uid(), inv.role)
    on conflict (business_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  if inv.role = 'technician' then
    insert into public.technician_profiles (business_id, user_id) values (inv.business_id, auth.uid()) on conflict do nothing;
  end if;
  if inv.role = 'customer' then
    insert into public.customer_contacts (business_id, customer_id, user_id) values (inv.business_id, inv.customer_id, auth.uid())
      on conflict (business_id, user_id) do update set customer_id = excluded.customer_id;
  end if;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  perform public.write_audit(inv.business_id, 'member.joined', 'business_members', auth.uid()::text, jsonb_build_object('role', inv.role));
  return inv.business_id;
end; $$;

drop policy invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_role(business_id, array['owner','admin']) and invited_by = auth.uid()
              and accepted_at is null and revoked_at is null
              and (role <> 'admin' or public.has_role(business_id, array['owner'])));

-- ---------------------------------------------------------------- customer portal RPCs (limited columns only)
create or replace function public.portal_overview(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cust uuid;
begin
  v_cust := public.my_customer_id(p_business);
  if v_cust is null then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'customer', (select jsonb_build_object('id', id, 'name', name, 'phone', phone, 'email', email,
                   'address', concat_ws(', ', address_line1, city, region)) from public.customers where id = v_cust),
    'business', (select jsonb_build_object('name', b.name, 'phone', b.phone, 'email', b.email, 'currency', b.currency,
                   'time_zone', b.time_zone, 'date_format', b.date_format, 'tax_label', b.tax_label,
                   'payment_instructions', s.payment_instructions)
                 from public.businesses b join public.business_settings s on s.business_id = b.id where b.id = p_business),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reference', reference, 'title', title, 'status', status,
                   'scheduled_at', scheduled_at, 'completed_at', completed_at, 'category', category, 'work_done', work_done) order by created_at desc)
                 from public.jobs where business_id = p_business and customer_id = v_cust and not archived), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reference', reference, 'status', status, 'issue_date', issue_date,
                   'valid_until', valid_until, 'total_minor', total_minor, 'currency', currency) order by created_at desc)
                 from public.quotations where business_id = p_business and customer_id = v_cust and status <> 'draft'), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reference', reference, 'status', status, 'issue_date', issue_date,
                   'due_date', due_date, 'total_minor', total_minor, 'balance_minor', balance_minor, 'currency', currency) order by created_at desc)
                 from public.invoices where business_id = p_business and customer_id = v_cust and status <> 'draft'), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount_minor', p.amount_minor, 'paid_on', p.paid_on,
                   'method', p.method, 'invoice', i.reference, 'currency', i.currency) order by p.paid_on desc, p.created_at desc)
                 from public.payments p join public.invoices i on i.id = p.invoice_id
                 where i.business_id = p_business and i.customer_id = v_cust and i.status <> 'draft'), '[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'category', c.name, 'manufacturer', e.manufacturer,
                   'model', e.model, 'serial_number', e.serial_number, 'installed_on', e.installed_on,
                   'warranty_expires_on', e.warranty_expires_on, 'location', e.location, 'condition', e.condition) order by e.name)
                 from public.equipment e left join public.equipment_categories c on c.id = e.category_id
                 where e.business_id = p_business and e.customer_id = v_cust and e.status = 'active'), '[]'::jsonb),
    'contracts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'frequency', frequency,
                   'next_service_on', next_service_on, 'starts_on', starts_on, 'ends_on', ends_on) order by next_service_on)
                 from public.maintenance_contracts where business_id = p_business and customer_id = v_cust and status = 'active'), '[]'::jsonb)
  );
end; $$;

create or replace function public.portal_document(p_business uuid, p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cust uuid; doc jsonb; items jsonb;
begin
  v_cust := public.my_customer_id(p_business);
  if v_cust is null then raise exception 'Not allowed'; end if;
  if p_kind = 'invoice' then
    select to_jsonb(i) - 'created_by' into doc
      from public.invoices i where i.id = p_id and i.business_id = p_business and i.customer_id = v_cust and i.status <> 'draft';
    select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'description', description, 'quantity', quantity,
             'unit_price_minor', unit_price_minor, 'line_total_minor', line_total_minor) order by position), '[]') into items
      from public.invoice_items where invoice_id = p_id;
  else
    select to_jsonb(q) - 'created_by' into doc
      from public.quotations q where q.id = p_id and q.business_id = p_business and q.customer_id = v_cust and q.status <> 'draft';
    select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'description', description, 'quantity', quantity,
             'unit_price_minor', unit_price_minor, 'line_total_minor', line_total_minor) order by position), '[]') into items
      from public.quotation_items where quotation_id = p_id;
  end if;
  if doc is null then raise exception 'Not found'; end if;
  return doc || jsonb_build_object('items', items);
end; $$;

create or replace function public.portal_respond_quote(p_business uuid, p_quote uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cust uuid; q public.quotations;
begin
  v_cust := public.my_customer_id(p_business);
  select * into q from public.quotations where id = p_quote and business_id = p_business and customer_id = v_cust for update;
  if v_cust is null or q.id is null then raise exception 'Not found'; end if;
  if q.status <> 'sent' then raise exception 'This quotation can no longer be answered'; end if;
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'This quotation has expired'; end if;
  update public.quotations set status = case when p_accept then 'accepted' else 'rejected' end where id = q.id;
  perform public.write_audit(p_business, case when p_accept then 'quotation.accepted_by_customer' else 'quotation.rejected_by_customer' end, 'quotations', q.id::text, '{}'::jsonb);
end; $$;

create or replace function public.portal_request_service(p_business uuid, p_title text, p_description text, p_preferred text, p_contract uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cust uuid; v_job uuid; v_addr text;
begin
  v_cust := public.my_customer_id(p_business);
  if v_cust is null then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Describe what you need in a few words'; end if;
  if p_contract is not null and not exists (select 1 from public.maintenance_contracts where id = p_contract and customer_id = v_cust and business_id = p_business) then
    raise exception 'Contract not found';
  end if;
  select concat_ws(', ', address_line1, city) into v_addr from public.customers where id = v_cust;
  insert into public.jobs (business_id, customer_id, title, description, category, status, address, contract_id, source)
  values (p_business, v_cust, left(trim(p_title), 160),
          left(concat_ws(E'\n\n', nullif(trim(p_description), ''), case when nullif(trim(p_preferred), '') is not null then 'Preferred time: ' || trim(p_preferred) end), 4000),
          case when p_contract is null then 'repair' else 'maintenance' end, 'new', nullif(v_addr, ''), p_contract, 'portal')
  returning id into v_job;
  return v_job;
end; $$;

-- jobs inserted via portal/maintenance RPCs: allow source to be set only by definer functions
create or replace function public.jobs_source_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and tg_op = 'INSERT' and new.source <> 'staff' then new.source := 'staff'; end if;
  if current_user = 'authenticated' and tg_op = 'UPDATE' and new.source <> old.source then new.source := old.source; end if;
  return new;
end; $$;
create trigger jobs_source_g before insert or update on public.jobs for each row execute function public.jobs_source_guard();

-- ---------------------------------------------------------------- RLS
alter table public.customer_contacts enable row level security;
alter table public.equipment_categories enable row level security;
alter table public.equipment enable row level security;
alter table public.maintenance_contracts enable row level security;
alter table public.contract_equipment enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy cc_select on public.customer_contacts for select to authenticated
  using (user_id = auth.uid() or public.has_role(business_id, array['owner','admin','dispatcher']));

create policy ec_select on public.equipment_categories for select to authenticated using (public.is_staff(business_id));
create policy ec_insert on public.equipment_categories for insert to authenticated with check (public.has_role(business_id, array['owner','admin']));
create policy ec_update on public.equipment_categories for update to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));

create policy eq_select on public.equipment for select to authenticated
  using (public.is_manager(business_id)
         or (public.is_staff(business_id) and exists (select 1 from public.jobs j where j.customer_id = equipment.customer_id and public.is_assigned(j.id))));
create policy eq_insert on public.equipment for insert to authenticated with check (public.is_manager(business_id));
create policy eq_update on public.equipment for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

create policy mc_select on public.maintenance_contracts for select to authenticated using (public.is_manager(business_id));
create policy mc_insert on public.maintenance_contracts for insert to authenticated with check (public.is_manager(business_id));
create policy mc_update on public.maintenance_contracts for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy ce_select on public.contract_equipment for select to authenticated using (public.is_manager(business_id));
create policy ce_insert on public.contract_equipment for insert to authenticated with check (public.is_manager(business_id));
create policy ce_delete on public.contract_equipment for delete to authenticated using (public.is_manager(business_id));
create policy mr_select on public.maintenance_records for select to authenticated using (public.is_manager(business_id));

create policy q_select on public.quotations for select to authenticated using (public.is_manager(business_id));
create policy q_insert on public.quotations for insert to authenticated with check (public.is_manager(business_id));
create policy q_update on public.quotations for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy qi_select on public.quotation_items for select to authenticated using (public.is_manager(business_id));
create policy qi_insert on public.quotation_items for insert to authenticated with check (public.is_manager(business_id));
create policy qi_update on public.quotation_items for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy qi_delete on public.quotation_items for delete to authenticated using (public.is_manager(business_id));

create policy i_select on public.invoices for select to authenticated using (public.is_manager(business_id));
create policy i_insert on public.invoices for insert to authenticated with check (public.is_manager(business_id));
create policy i_update on public.invoices for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy ii_select on public.invoice_items for select to authenticated using (public.is_manager(business_id));
create policy ii_insert on public.invoice_items for insert to authenticated with check (public.is_manager(business_id));
create policy ii_update on public.invoice_items for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));
create policy ii_delete on public.invoice_items for delete to authenticated using (public.is_manager(business_id));

create policy pay_select on public.payments for select to authenticated using (public.is_manager(business_id));

-- ---------------------------------------------------------------- privileges
revoke all on public.customer_contacts, public.equipment_categories, public.equipment, public.maintenance_contracts,
  public.contract_equipment, public.maintenance_records, public.quotations, public.quotation_items, public.invoices,
  public.invoice_items, public.payments from anon;
revoke insert, update, delete on public.customer_contacts, public.maintenance_records, public.payments from authenticated;
revoke delete on public.equipment_categories, public.equipment, public.maintenance_contracts, public.quotations, public.invoices from authenticated;
revoke update on public.contract_equipment from authenticated;

revoke all on all functions in schema public from anon, public;
grant execute on function public.is_member(uuid), public.has_role(uuid, text[]), public.is_manager(uuid), public.is_staff(uuid),
  public.is_assigned(uuid), public.can_see_job(uuid, uuid), public.shares_business(uuid), public.my_customer_id(uuid),
  public.can_access_job_object(text), public.minor_digits(text),
  public.tech_update_job(uuid, text, text), public.accept_invitation(uuid), public.invitation_preview(uuid),
  public.set_member_role(uuid, text), public.set_member_status(uuid, text), public.update_business_settings(uuid, jsonb),
  public.create_job_from_contract(uuid), public.convert_quote_to_invoice(uuid),
  public.record_payment(uuid, bigint, date, text, text, text), public.reverse_payment(uuid, text),
  public.portal_overview(uuid), public.portal_document(uuid, text, uuid), public.portal_respond_quote(uuid, uuid, boolean),
  public.portal_request_service(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.invitation_preview(uuid) to anon;
revoke execute on function public.docs_number_before(), public.docs_guard_before(), public.docs_after(), public.items_before(), public.items_after(),
  public.p2_guard(), public.jobs_maintenance_after(), public.businesses_after_insert(), public.jobs_source_guard(),
  public.compute_totals(bigint, text, numeric, numeric, boolean, integer), public.advance_date(date, text) from authenticated;
revoke execute on function public.recalc_quotation(uuid), public.recalc_invoice(uuid), public.seed_equipment_categories(uuid),
  public.write_audit(uuid, text, text, text, jsonb), public.next_number(uuid, text) from authenticated;

-- settings RPC: add invoicing fields
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
    quote_prefix = coalesce(p->>'quote_prefix', quote_prefix),
    invoice_prefix = coalesce(p->>'invoice_prefix', invoice_prefix),
    default_tax_rate = coalesce((p->>'default_tax_rate')::numeric, default_tax_rate),
    invoice_terms_days = coalesce((p->>'invoice_terms_days')::integer, invoice_terms_days),
    payment_instructions = case when p ? 'payment_instructions' then nullif(p->>'payment_instructions', '') else payment_instructions end,
    tax_number = case when p ? 'tax_number' then nullif(p->>'tax_number', '') else tax_number end,
    payment_methods = case when p ? 'payment_methods' then array(select jsonb_array_elements_text(p->'payment_methods')) else payment_methods end,
    whatsapp_enabled = coalesce((p->>'whatsapp_enabled')::boolean, whatsapp_enabled),
    tax_inclusive = coalesce((p->>'tax_inclusive')::boolean, tax_inclusive),
    setup_completed_at = case when (p->>'setup_completed')::boolean then coalesce(setup_completed_at, now()) else setup_completed_at end
  where business_id = p_business;
  perform public.write_audit(p_business, 'settings.updated', 'businesses', p_business::text, p);
end; $$;
