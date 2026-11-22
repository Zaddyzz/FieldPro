-- Phase 2 checks (equipment, maintenance, quotes, invoices, payments, portal).
-- Creates ZZ TEST data, runs checks, deletes it. Returns one JSON row with PASS/FAIL per check.
create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v from t_ids where k = p $$;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage on sequence t_results_n_seq to authenticated, anon;
create or replace function pg_temp.act(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.r(n text, ok boolean, d text default '') returns void language sql as $$ insert into t_results (name, ok, detail) values (n, ok, d) $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a2000000-0000-0000-0000-00000000000a', 'zz-p2-owner-a@test.local', '{"signup_type":"business","full_name":"ZZ Owner A","business_name":"ZZ TEST P2 Solar","industry":"solar","country":"NG","currency":"NGN","time_zone":"Africa/Lagos"}'),
 ('b2000000-0000-0000-0000-00000000000b', 'zz-p2-owner-b@test.local', '{"signup_type":"business","full_name":"ZZ Owner B","business_name":"ZZ TEST P2 CCTV","industry":"cctv","country":"US","currency":"USD","time_zone":"America/Chicago"}'),
 ('c2000000-0000-0000-0000-00000000000c', 'zz-p2-tech@test.local', '{"full_name":"ZZ Tech"}'),
 ('d2000000-0000-0000-0000-00000000000d', 'zz-p2-cust-x@test.local', '{"full_name":"ZZ Customer X"}'),
 ('e2000000-0000-0000-0000-00000000000e', 'zz-p2-cust-y@test.local', '{"full_name":"ZZ Customer Y"}');
insert into t_ids select 'bizA', business_id from business_members where user_id = 'a2000000-0000-0000-0000-00000000000a';
insert into t_ids select 'bizB', business_id from business_members where user_id = 'b2000000-0000-0000-0000-00000000000b';

select pg_temp.r('1 new business gets industry equipment categories', count(*) >= 5, string_agg(name, ', ' order by name))
from equipment_categories where business_id = pg_temp.id('bizA');

-- set up: customers X and Y, a technician, all in A
set role authenticated; select pg_temp.act('a2000000-0000-0000-0000-00000000000a');
insert into customers (business_id, name, phone, address_line1, city) values (pg_temp.id('bizA'), 'ZZ TEST Cust X', '+2348011111111', '1 Main St', 'Benin City');
insert into customers (business_id, name, phone) values (pg_temp.id('bizA'), 'ZZ TEST Cust Y', '+2348022222222');
insert into invitations (business_id, email, role, invited_by) values (pg_temp.id('bizA'), 'zz-p2-tech@test.local', 'technician', 'a2000000-0000-0000-0000-00000000000a');
reset role;
insert into t_ids select 'custX', id from customers where name = 'ZZ TEST Cust X';
insert into t_ids select 'custY', id from customers where name = 'ZZ TEST Cust Y';
insert into t_ids select 'catInv', id from equipment_categories where business_id = pg_temp.id('bizA') and name = 'Inverter';
insert into t_ids select 'invTech', token from invitations where email = 'zz-p2-tech@test.local';
set role authenticated; select pg_temp.act('c2000000-0000-0000-0000-00000000000c'); select accept_invitation(pg_temp.id('invTech'));

-- equipment
select pg_temp.act('a2000000-0000-0000-0000-00000000000a');
insert into equipment (business_id, customer_id, category_id, name, serial_number, installed_on, warranty_expires_on)
values (pg_temp.id('bizA'), pg_temp.id('custX'), pg_temp.id('catInv'), 'ZZ 5kVA inverter', 'SN-123', current_date - 300, current_date + 20);
reset role; insert into t_ids select 'eq1', id from equipment where serial_number = 'SN-123'; set role authenticated;
select pg_temp.r('2 equipment registered for customer', count(*) = 1, '') from equipment where customer_id = pg_temp.id('custX');

-- maintenance: contract -> job -> technician completes -> record + next date moves
insert into maintenance_contracts (business_id, customer_id, title, starts_on, frequency, next_service_on, price_minor)
values (pg_temp.id('bizA'), pg_temp.id('custX'), 'ZZ quarterly solar service', current_date - 90, 'quarterly', current_date, 2500000);
reset role; insert into t_ids select 'con1', id from maintenance_contracts where title = 'ZZ quarterly solar service'; set role authenticated;
insert into contract_equipment (business_id, contract_id, equipment_id) values (pg_temp.id('bizA'), pg_temp.id('con1'), pg_temp.id('eq1'));
reset role; insert into t_ids (k, v) values ('mjob', null); set role authenticated;
do $$ declare j uuid; begin j := create_job_from_contract(pg_temp.id('con1')); update t_ids set v = j where k = 'mjob'; end $$;
insert into job_assignments (job_id, business_id, user_id) values (pg_temp.id('mjob'), pg_temp.id('bizA'), 'c2000000-0000-0000-0000-00000000000c');
select pg_temp.r('3a job created from contract is a scheduled maintenance job', category = 'maintenance' and status in ('scheduled','assigned') and source = 'maintenance', status || '/' || source)
from jobs where id = pg_temp.id('mjob');
select pg_temp.act('c2000000-0000-0000-0000-00000000000c');
select tech_update_job(pg_temp.id('mjob'), 'completed', 'Panels cleaned, battery checked');
select pg_temp.act('a2000000-0000-0000-0000-00000000000a');
select pg_temp.r('3b completing it logs a maintenance record', count(*) = 1, '') from maintenance_records where contract_id = pg_temp.id('con1');
select pg_temp.r('3c next service date moved forward 3 months', next_service_on = ((now() at time zone 'Africa/Lagos')::date + interval '3 months')::date, next_service_on::text)
from maintenance_contracts where id = pg_temp.id('con1');

-- quotation totals: 2 x 50,000 + 1 x 150,000 = 250,000; 10% off = 225,000; VAT 7.5% = 16,875; total 241,875 (NGN, kobo)
insert into quotations (business_id, customer_id, discount_type, discount_value, tax_rate) values (pg_temp.id('bizA'), pg_temp.id('custX'), 'percent', 10, 7.5);
reset role; insert into t_ids select 'q1', id from quotations where business_id = pg_temp.id('bizA') order by created_at desc limit 1; set role authenticated;
insert into quotation_items (business_id, quotation_id, kind, description, quantity, unit_price_minor) values
  (pg_temp.id('bizA'), pg_temp.id('q1'), 'material', 'ZZ 200W panel', 2, 5000000),
  (pg_temp.id('bizA'), pg_temp.id('q1'), 'labour', 'ZZ installation', 1, 15000000);
select pg_temp.r('4 quote totals computed in the database', subtotal_minor = 25000000 and discount_minor = 2500000 and tax_minor = 1687500 and total_minor = 24187500 and reference = 'QUO-0001',
  reference || ' ' || subtotal_minor || '/' || discount_minor || '/' || tax_minor || '/' || total_minor) from quotations where id = pg_temp.id('q1');
do $$ begin update quotations set total_minor = 1 where id = pg_temp.id('q1'); perform pg_temp.r('5 client cannot overwrite totals', false);
exception when others then perform pg_temp.r('5 client cannot overwrite totals', true, sqlerrm); end $$;

-- convert to invoice
update quotations set status = 'sent' where id = pg_temp.id('q1');
reset role; insert into t_ids (k, v) values ('inv1', null); set role authenticated;
do $$ declare i uuid; begin i := convert_quote_to_invoice(pg_temp.id('q1')); update t_ids set v = i where k = 'inv1'; end $$;
select pg_temp.r('6 convert copies items and totals; quote becomes accepted',
  i.total_minor = 24187500 and i.reference = 'INV-0001' and q.status = 'accepted' and (select count(*) from invoice_items where invoice_id = i.id) = 2,
  i.reference || ' ' || i.total_minor || ' quote=' || q.status) from invoices i join quotations q on q.invoice_id = i.id where i.id = pg_temp.id('inv1');
do $$ begin perform convert_quote_to_invoice(pg_temp.id('q1')); perform pg_temp.r('6b quote cannot be converted twice', false);
exception when others then perform pg_temp.r('6b quote cannot be converted twice', true, sqlerrm); end $$;

-- payments
reset role; insert into t_ids (k, v) values ('pay1', null); set role authenticated;
do $$ declare p uuid; begin p := record_payment(pg_temp.id('inv1'), 10000000, current_date, 'Bank transfer', 'TRF-1'); update t_ids set v = p where k = 'pay1'; end $$;
select pg_temp.r('7a partial payment sets Partially paid', status = 'partially_paid' and balance_minor = 14187500, status || ' bal=' || balance_minor) from invoices where id = pg_temp.id('inv1');
do $$ begin perform record_payment(pg_temp.id('inv1'), 99999999, current_date, 'Cash'); perform pg_temp.r('7b overpayment rejected', false);
exception when others then perform pg_temp.r('7b overpayment rejected', true, sqlerrm); end $$;
do $$ begin insert into invoice_items (business_id, invoice_id, description, quantity, unit_price_minor) values (pg_temp.id('bizA'), pg_temp.id('inv1'), 'ZZ extra', 1, 100);
  perform pg_temp.r('8 items locked once payments exist', false);
exception when others then perform pg_temp.r('8 items locked once payments exist', true, sqlerrm); end $$;
do $$ begin update invoices set status = 'paid' where id = pg_temp.id('inv1'); perform pg_temp.r('8b cannot mark paid by hand', false);
exception when others then perform pg_temp.r('8b cannot mark paid by hand', true, sqlerrm); end $$;
do $$ begin insert into payments (business_id, invoice_id, amount_minor, paid_on, method) values (pg_temp.id('bizA'), pg_temp.id('inv1'), 1, current_date, 'Cash');
  perform pg_temp.r('8c payments cannot be inserted directly', false);
exception when others then perform pg_temp.r('8c payments cannot be inserted directly', true, sqlerrm); end $$;
do $$ begin delete from payments where id = pg_temp.id('pay1');
  perform pg_temp.r('8d payments cannot be deleted', (select count(*) from payments where id = pg_temp.id('pay1')) = 1, 'no rows removed');
exception when others then perform pg_temp.r('8d payments cannot be deleted', true, sqlerrm); end $$;
select record_payment(pg_temp.id('inv1'), 14187500, current_date, 'Cash');
select pg_temp.r('7c full payment sets Paid', status = 'paid' and balance_minor = 0, status) from invoices where id = pg_temp.id('inv1');
do $$ begin update invoices set status = 'cancelled' where id = pg_temp.id('inv1'); perform pg_temp.r('9a cannot cancel an invoice with payments', false);
exception when others then perform pg_temp.r('9a cannot cancel an invoice with payments', true, sqlerrm); end $$;
select reverse_payment(pg_temp.id('pay1'), 'Bank transfer bounced');
select pg_temp.r('9b reversal restores balance and status', status = 'partially_paid' and balance_minor = 10000000, status || ' bal=' || balance_minor) from invoices where id = pg_temp.id('inv1');
do $$ begin perform reverse_payment(pg_temp.id('pay1'), 'again'); perform pg_temp.r('9c a payment cannot be reversed twice', false);
exception when others then perform pg_temp.r('9c a payment cannot be reversed twice', true, sqlerrm); end $$;
select pg_temp.r('9d audit log has payment events', count(*) >= 3, string_agg(action, ',')) from audit_logs
  where business_id = pg_temp.id('bizA') and action like 'payment.%';

-- a draft invoice for Y (must stay hidden from customers)
insert into invoices (business_id, customer_id) values (pg_temp.id('bizA'), pg_temp.id('custY'));
reset role; insert into t_ids select 'invY', id from invoices where customer_id = pg_temp.id('custY'); set role authenticated;

-- technician access
select pg_temp.act('c2000000-0000-0000-0000-00000000000c');
select pg_temp.r('10a technician cannot read invoices, quotes or payments', (select count(*) from invoices) + (select count(*) from quotations) + (select count(*) from payments) = 0, '');
do $$ begin perform record_payment(pg_temp.id('inv1'), 1, current_date, 'Cash'); perform pg_temp.r('10b technician cannot record payments', false);
exception when others then perform pg_temp.r('10b technician cannot record payments', true, sqlerrm); end $$;
select pg_temp.r('10c technician sees equipment of their customer', count(*) = 1, '') from equipment;

-- customer portal
select pg_temp.act('a2000000-0000-0000-0000-00000000000a');
insert into invitations (business_id, email, role, invited_by, customer_id) values
  (pg_temp.id('bizA'), 'zz-p2-cust-x@test.local', 'customer', 'a2000000-0000-0000-0000-00000000000a', pg_temp.id('custX')),
  (pg_temp.id('bizA'), 'zz-p2-cust-y@test.local', 'customer', 'a2000000-0000-0000-0000-00000000000a', pg_temp.id('custY'));
reset role;
insert into t_ids select 'invCX', token from invitations where email = 'zz-p2-cust-x@test.local';
insert into t_ids select 'invCY', token from invitations where email = 'zz-p2-cust-y@test.local';
set role authenticated;
select pg_temp.act('d2000000-0000-0000-0000-00000000000d'); select accept_invitation(pg_temp.id('invCX'));
select pg_temp.act('e2000000-0000-0000-0000-00000000000e'); select accept_invitation(pg_temp.id('invCY'));

select pg_temp.act('d2000000-0000-0000-0000-00000000000d');
select pg_temp.r('11a customer X sees own invoice, quote, equipment, contract and job in portal',
  jsonb_array_length(o->'invoices') = 1 and jsonb_array_length(o->'quotes') = 1 and jsonb_array_length(o->'equipment') = 1
  and jsonb_array_length(o->'contracts') = 1 and jsonb_array_length(o->'jobs') = 1 and o->'customer'->>'name' = 'ZZ TEST Cust X',
  'inv=' || jsonb_array_length(o->'invoices') || ' jobs=' || jsonb_array_length(o->'jobs'))
from (select portal_overview(pg_temp.id('bizA')) o) s;
select pg_temp.r('11b customer cannot read business tables directly',
  (select count(*) from invoices) + (select count(*) from jobs) + (select count(*) from customers) + (select count(*) from equipment) + (select count(*) from payments) = 0, '');
select pg_temp.r('11c customer cannot see staff profiles or team list',
  (select count(*) from profiles where id <> auth.uid()) + (select count(*) from business_members where user_id <> auth.uid()) = 0, '');
do $$ begin perform portal_document(pg_temp.id('bizA'), 'invoice', pg_temp.id('invY')); perform pg_temp.r('11d customer X cannot open customer Y''s invoice', false);
exception when others then perform pg_temp.r('11d customer X cannot open customer Y''s invoice', true, sqlerrm); end $$;
select pg_temp.r('11e portal invoice shows items and payments state', jsonb_array_length(d->'items') = 2 and (d->>'balance_minor')::bigint = 10000000, d->>'reference')
from (select portal_document(pg_temp.id('bizA'), 'invoice', pg_temp.id('inv1')) d) s;
reset role; insert into t_ids (k, v) values ('reqjob', null); set role authenticated;
do $$ declare j uuid; begin j := portal_request_service(pg_temp.id('bizA'), 'ZZ inverter beeping', 'Beeps every night', 'Weekday mornings'); update t_ids set v = j where k = 'reqjob'; end $$;
reset role;
select pg_temp.r('12 service request creates a New job from the portal', status = 'new' and source = 'portal' and customer_id = pg_temp.id('custX'), status || '/' || source)
from jobs where id = pg_temp.id('reqjob');
set role authenticated;
select pg_temp.act('e2000000-0000-0000-0000-00000000000e');
select pg_temp.r('11f customer Y sees no invoices (own is draft) and none of X''s', jsonb_array_length(o->'invoices') = 0 and jsonb_array_length(o->'jobs') = 0, '')
from (select portal_overview(pg_temp.id('bizA')) o) s;

-- business B isolation
select pg_temp.act('b2000000-0000-0000-0000-00000000000b');
select pg_temp.r('13a B sees none of A''s equipment, contracts, quotes, invoices, payments',
  (select count(*) from equipment) + (select count(*) from maintenance_contracts) + (select count(*) from quotations)
  + (select count(*) from invoices) + (select count(*) from payments) + (select count(*) from equipment_categories where business_id = pg_temp.id('bizA')) = 0, '');
do $$ begin perform record_payment(pg_temp.id('inv1'), 1, current_date, 'Cash'); perform pg_temp.r('13b B cannot record a payment on A''s invoice', false);
exception when others then perform pg_temp.r('13b B cannot record a payment on A''s invoice', true, sqlerrm); end $$;
do $$ begin perform portal_overview(pg_temp.id('bizA')); perform pg_temp.r('13c B owner cannot use A''s portal', false);
exception when others then perform pg_temp.r('13c B owner cannot use A''s portal', true, sqlerrm); end $$;
do $$ begin insert into equipment (business_id, customer_id, name) values (pg_temp.id('bizB'), pg_temp.id('custX'), 'ZZ cross');
  perform pg_temp.r('13d B cannot attach A''s customer to equipment', false);
exception when others then perform pg_temp.r('13d B cannot attach A''s customer to equipment', true, sqlerrm); end $$;
insert into quotations (business_id, customer_id) select pg_temp.id('bizB'), null where false;
reset role; set role anon;
do $$ begin perform count(*) from invoices; perform pg_temp.r('14 anonymous cannot read invoices', false);
exception when others then perform pg_temp.r('14 anonymous cannot read invoices', true, sqlerrm); end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
delete from public.businesses where name like 'ZZ TEST P2%';
delete from auth.users where email like 'zz-p2-%@test.local';
select json_agg(json_build_object('r', case when ok then 'PASS' else 'FAIL' end, 'name', name, 'detail', left(coalesce(detail,''),70)) order by n) as results,
       count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       (select count(*) from public.businesses where name like 'ZZ TEST P2%') + (select count(*) from auth.users where email like 'zz-p2-%@test.local') as leftover
from t_results;
