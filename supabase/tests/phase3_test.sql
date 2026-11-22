-- Phase 3 checks (plans and limits, notifications, reports, platform admin).
-- Creates ZZ TEST data, runs checks, deletes it. Returns one JSON row with PASS/FAIL per check.
create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v from t_ids where k = p $$;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage on sequence t_results_n_seq to authenticated, anon;
create or replace function pg_temp.act(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.r(n text, ok boolean, d text default '') returns void language sql as $$ insert into t_results (name, ok, detail) values (n, ok, d) $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('a3000000-0000-0000-0000-00000000000a', 'zz-p3-owner-a@test.local', '{"signup_type":"business","full_name":"ZZ Owner A","business_name":"ZZ TEST P3 Solar","industry":"solar","country":"NG","currency":"NGN","time_zone":"Africa/Lagos"}'),
 ('b3000000-0000-0000-0000-00000000000b', 'zz-p3-owner-b@test.local', '{"signup_type":"business","full_name":"ZZ Owner B","business_name":"ZZ TEST P3 CCTV","industry":"cctv","country":"US","currency":"USD","time_zone":"America/Chicago"}'),
 ('c3000000-0000-0000-0000-00000000000c', 'zz-p3-tech@test.local', '{"full_name":"ZZ Tech One"}'),
 ('c3000000-0000-0000-0000-0000000000c2', 'zz-p3-tech2@test.local', '{"full_name":"ZZ Tech Two"}'),
 ('d3000000-0000-0000-0000-00000000000d', 'zz-p3-cust@test.local', '{"full_name":"ZZ Customer"}'),
 ('f3000000-0000-0000-0000-00000000000f', 'zz-p3-platform@test.local', '{"full_name":"ZZ Platform"}');
insert into public.platform_admins (user_id) values ('f3000000-0000-0000-0000-00000000000f');
insert into public.plans (code, name, sort, max_staff, max_jobs_month, max_customers, public) values ('zz_test', 'ZZ test plan', 99, 3, 2, 2, false);
insert into t_ids select 'bizA', business_id from business_members where user_id = 'a3000000-0000-0000-0000-00000000000a';
insert into t_ids select 'bizB', business_id from business_members where user_id = 'b3000000-0000-0000-0000-00000000000b';

set role authenticated; select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('1 new business starts on a writable 14-day trial',
  u->>'plan' = 'trial' and (u->>'writable')::boolean and (u->>'trial_ends_at')::timestamptz between now() + interval '13 days' and now() + interval '15 days',
  u->>'plan' || ' ' || (u->>'trial_ends_at')) from (select business_usage(pg_temp.id('bizA')) u) s;
select pg_temp.r('2 owner can read plans', count(*) >= 4, '') from plans;
do $$ begin update business_subscriptions set plan = 'pro', status = 'active' where business_id = pg_temp.id('bizA');
  perform pg_temp.r('3 owner cannot change own plan directly', (select plan from business_subscriptions where business_id = pg_temp.id('bizA')) = 'trial', '');
exception when others then perform pg_temp.r('3 owner cannot change own plan directly', true, sqlerrm); end $$;
do $$ begin perform admin_overview(); perform pg_temp.r('4a business owner cannot open platform admin', false);
exception when others then perform pg_temp.r('4a business owner cannot open platform admin', true, sqlerrm); end $$;
do $$ begin perform admin_set_subscription(pg_temp.id('bizA'), 'pro', 'active', null, null, 'free upgrade');
  perform pg_temp.r('4b business owner cannot upgrade self through admin RPC', false);
exception when others then perform pg_temp.r('4b business owner cannot upgrade self through admin RPC', true, sqlerrm); end $$;
select pg_temp.r('4c platform admin list is not readable by others', count(*) = 0, '') from platform_admins;

-- platform admin moves A to the small test plan (3 staff, 2 jobs a month, 2 customers)
select pg_temp.act('f3000000-0000-0000-0000-00000000000f');
select admin_set_subscription(pg_temp.id('bizA'), 'zz_test', 'active', null, now() + interval '30 days', 'ZZ test');
select pg_temp.r('5a platform admin sees all businesses with owner and usage',
  exists (select 1 from jsonb_array_elements(o->'businesses') b where b->>'name' = 'ZZ TEST P3 Solar' and b->>'owner_email' = 'zz-p3-owner-a@test.local' and b->>'plan' = 'zz_test'), '')
from (select admin_overview() o) s;
reset role;
select pg_temp.r('5b plan change is audited', count(*) = 1, '') from audit_logs where business_id = pg_temp.id('bizA') and action = 'subscription.changed_by_platform';
set role authenticated;

-- limits: customers (2), jobs per month (2), staff (3)
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('5c owner is told about the plan change', count(*) = 1, title) from notifications where kind = 'plan_changed' group by title;
insert into customers (business_id, name, phone) values (pg_temp.id('bizA'), 'ZZ TEST P3 Cust 1', '+2348011111111'), (pg_temp.id('bizA'), 'ZZ TEST P3 Cust 2', '+2348022222222');
do $$ begin insert into customers (business_id, name, phone) values (pg_temp.id('bizA'), 'ZZ TEST P3 Cust 3', '+2348033333333');
  perform pg_temp.r('6a customer limit enforced', false);
exception when others then perform pg_temp.r('6a customer limit enforced', sqlerrm like '%allows 2 customers%', sqlerrm); end $$;
reset role; insert into t_ids select 'cust1', id from customers where name = 'ZZ TEST P3 Cust 1'; set role authenticated;
insert into jobs (business_id, customer_id, title) values (pg_temp.id('bizA'), pg_temp.id('cust1'), 'ZZ job one'), (pg_temp.id('bizA'), pg_temp.id('cust1'), 'ZZ job two');
do $$ begin insert into jobs (business_id, customer_id, title) values (pg_temp.id('bizA'), pg_temp.id('cust1'), 'ZZ job three');
  perform pg_temp.r('6b monthly job limit enforced', false);
exception when others then perform pg_temp.r('6b monthly job limit enforced', sqlerrm like '%allows 2 jobs a month%', sqlerrm); end $$;
insert into invitations (business_id, email, role, invited_by) values
  (pg_temp.id('bizA'), 'zz-p3-tech@test.local', 'technician', 'a3000000-0000-0000-0000-00000000000a'),
  (pg_temp.id('bizA'), 'zz-p3-tech2@test.local', 'technician', 'a3000000-0000-0000-0000-00000000000a');
reset role;
insert into t_ids select 'invT1', token from invitations where email = 'zz-p3-tech@test.local';
insert into t_ids select 'invT2', token from invitations where email = 'zz-p3-tech2@test.local';
set role authenticated;
select pg_temp.act('c3000000-0000-0000-0000-00000000000c'); select accept_invitation(pg_temp.id('invT1'));
select pg_temp.act('c3000000-0000-0000-0000-0000000000c2'); select accept_invitation(pg_temp.id('invT2'));
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('7a owner is told when technicians join', count(*) = 2, '') from notifications where kind = 'member_joined';
do $$ begin insert into invitations (business_id, email, role, invited_by) values (pg_temp.id('bizA'), 'zz-p3-extra@test.local', 'dispatcher', 'a3000000-0000-0000-0000-00000000000a');
  perform pg_temp.r('7b staff seat limit blocks a 4th invite', false);
exception when others then perform pg_temp.r('7b staff seat limit blocks a 4th invite', sqlerrm like '%allows 3 team members%', sqlerrm); end $$;
reset role; insert into t_ids select 'mT2', id from business_members where user_id = 'c3000000-0000-0000-0000-0000000000c2'; set role authenticated;
select set_member_status(pg_temp.id('mT2'), 'deactivated');
insert into invitations (business_id, email, role, invited_by) values (pg_temp.id('bizA'), 'zz-p3-extra@test.local', 'dispatcher', 'a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('7c freeing a seat lets the owner invite again', count(*) = 1, '') from invitations where email = 'zz-p3-extra@test.local';
select set_member_status(pg_temp.id('mT2'), 'active');
select pg_temp.r('7d reactivating within the limit works', status = 'active', status) from business_members where id = pg_temp.id('mT2');

-- notifications: assignment, completion, portal request, quote answer
reset role; insert into t_ids select 'job1', id from jobs where title = 'ZZ job one'; set role authenticated;
insert into job_assignments (job_id, business_id, user_id) values (pg_temp.id('job1'), pg_temp.id('bizA'), 'c3000000-0000-0000-0000-00000000000c');
select pg_temp.act('c3000000-0000-0000-0000-00000000000c');
select pg_temp.r('8a technician is told about the assignment', count(*) = 1 and bool_and(link = '/jobs/' || pg_temp.id('job1')), '') from notifications where kind = 'job_assigned';
select pg_temp.r('8b technician sees only own notifications', count(*) = 0, '') from notifications where user_id <> auth.uid();
select tech_update_job(pg_temp.id('job1'), 'in_progress', null);
select tech_update_job(pg_temp.id('job1'), 'completed', 'ZZ done');
do $$ begin insert into notifications (business_id, user_id, kind, title) values (pg_temp.id('bizA'), 'a3000000-0000-0000-0000-00000000000a', 'x', 'fake');
  perform pg_temp.r('8c users cannot create notifications directly', false);
exception when others then perform pg_temp.r('8c users cannot create notifications directly', true, sqlerrm); end $$;
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('8d owner is told the job was completed', count(*) = 1, '') from notifications where kind = 'job_completed';
select mark_notifications_read(null);
select pg_temp.r('8e mark all read works for own notifications', count(*) = 0, '') from notifications where read_at is null;
select pg_temp.act('c3000000-0000-0000-0000-00000000000c');
select pg_temp.r('8f marking read does not touch other users', count(*) = 0, '') from notifications where read_at is not null;

-- portal: upgrade to growth first so creation limits do not interfere
select pg_temp.act('f3000000-0000-0000-0000-00000000000f');
select admin_set_subscription(pg_temp.id('bizA'), 'growth', 'active', null, now() + interval '30 days', 'ZZ test');
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
insert into invitations (business_id, email, role, invited_by, customer_id) values
  (pg_temp.id('bizA'), 'zz-p3-cust@test.local', 'customer', 'a3000000-0000-0000-0000-00000000000a', pg_temp.id('cust1'));
insert into quotations (business_id, customer_id) values (pg_temp.id('bizA'), pg_temp.id('cust1'));
reset role;
insert into t_ids select 'invC', token from invitations where email = 'zz-p3-cust@test.local';
insert into t_ids select 'q1', id from quotations where business_id = pg_temp.id('bizA');
set role authenticated;
insert into quotation_items (business_id, quotation_id, kind, description, quantity, unit_price_minor) values (pg_temp.id('bizA'), pg_temp.id('q1'), 'labour', 'ZZ service', 1, 5000000);
update quotations set status = 'sent' where id = pg_temp.id('q1');
select pg_temp.act('d3000000-0000-0000-0000-00000000000d'); select accept_invitation(pg_temp.id('invC'));
select portal_request_service(pg_temp.id('bizA'), 'ZZ camera offline', 'Since yesterday', null);
select portal_respond_quote(pg_temp.id('bizA'), pg_temp.id('q1'), true);
select pg_temp.r('9a customer gets no staff notifications', count(*) = 0, '') from notifications;
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
select pg_temp.r('9b owner is told about the portal request', count(*) = 1, max(title)) from notifications where kind = 'service_request';
select pg_temp.r('9c owner is told the customer accepted the quote', count(*) = 1, max(title)) from notifications where kind = 'quote_accepted';
select pg_temp.act('c3000000-0000-0000-0000-00000000000c');
select pg_temp.r('9d technicians are not told about portal requests', count(*) = 0, '') from notifications where kind in ('service_request','quote_accepted');

-- reports
select pg_temp.act('a3000000-0000-0000-0000-00000000000a');
do $$ declare i uuid; begin i := convert_quote_to_invoice(pg_temp.id('q1')); insert into t_ids values ('inv1', i); end $$;
update invoices set status = 'sent', due_date = current_date - 40 where id = pg_temp.id('inv1');
select record_payment(pg_temp.id('inv1'), 2000000, current_date, 'Cash');
select pg_temp.r('10a report totals match the records',
  (r->>'jobs_created')::int = 3 and (r->>'jobs_completed')::int = 1 and (r->>'portal_requests')::int = 1
  and (r->>'invoiced_minor')::bigint = 5000000 and (r->>'collected_minor')::bigint = 2000000 and (r->>'outstanding_minor')::bigint = 3000000
  and (r->'aging'->>'d31_60')::bigint = 3000000,
  'created=' || (r->>'jobs_created') || ' done=' || (r->>'jobs_completed') || ' inv=' || (r->>'invoiced_minor') || ' paid=' || (r->>'collected_minor') || ' aging=' || (r->'aging')::text)
from (select report_summary(pg_temp.id('bizA'), current_date - 30, current_date) r) s;
select pg_temp.r('10b technician performance lists completed work',
  exists (select 1 from jsonb_array_elements(r->'technicians') t where t->>'name' = 'ZZ Tech One' and (t->>'completed')::int = 1), (r->'technicians')::text)
from (select report_summary(pg_temp.id('bizA'), current_date - 30, current_date) r) s;
select pg_temp.act('c3000000-0000-0000-0000-00000000000c');
do $$ begin perform report_summary(pg_temp.id('bizA'), current_date - 30, current_date); perform pg_temp.r('10c technician cannot run reports', false);
exception when others then perform pg_temp.r('10c technician cannot run reports', true, sqlerrm); end $$;
select pg_temp.act('d3000000-0000-0000-0000-00000000000d');
do $$ begin perform report_summary(pg_temp.id('bizA'), current_date - 30, current_date); perform pg_temp.r('10d customer cannot run reports', false);
exception when others then perform pg_temp.r('10d customer cannot run reports', true, sqlerrm); end $$;
select pg_temp.act('b3000000-0000-0000-0000-00000000000b');
do $$ begin perform report_summary(pg_temp.id('bizA'), current_date - 30, current_date); perform pg_temp.r('10e another business cannot run A''s reports', false);
exception when others then perform pg_temp.r('10e another business cannot run A''s reports', true, sqlerrm); end $$;
select pg_temp.r('10f another business sees none of A''s notifications', count(*) = 0, '') from notifications;
do $$ begin perform business_usage(pg_temp.id('bizA')); perform pg_temp.r('10g another business cannot read A''s plan usage', false);
exception when others then perform pg_temp.r('10g another business cannot read A''s plan usage', true, sqlerrm); end $$;

-- trial ended / suspended: creation blocked, existing records still editable
reset role;
insert into customers (business_id, name, phone) values (pg_temp.id('bizB'), 'ZZ TEST P3 B old', '+12025550101');
update business_subscriptions set plan = 'trial', status = 'trial', trial_ends_at = now() - interval '1 day' where business_id = pg_temp.id('bizB');
set role authenticated; select pg_temp.act('b3000000-0000-0000-0000-00000000000b');
select pg_temp.r('11a expired trial shows as not writable', not (u->>'writable')::boolean and u->>'blocked_reason' = 'trial_ended', u->>'blocked_reason')
from (select business_usage(pg_temp.id('bizB')) u) s;
do $$ begin insert into customers (business_id, name, phone) values (pg_temp.id('bizB'), 'ZZ TEST P3 B cust', '+12025550100');
  perform pg_temp.r('11b expired trial cannot add customers', false);
exception when others then perform pg_temp.r('11b expired trial cannot add customers', sqlerrm like '%trial has ended%', sqlerrm); end $$;
select pg_temp.r('11c expired trial still reads existing customers', count(*) = 1, '') from customers;
update customers set notes = 'ZZ still editable' where name = 'ZZ TEST P3 B old';
select pg_temp.r('11d expired trial can still edit existing records', count(*) = 1, '') from customers where notes = 'ZZ still editable';
reset role;
update business_subscriptions set status = 'suspended', trial_ends_at = null where business_id = pg_temp.id('bizB');
set role authenticated;
do $$ begin insert into invoices (business_id, customer_id) select pg_temp.id('bizB'), id from customers limit 1;
  perform pg_temp.r('11e suspended business cannot create invoices', false);
exception when others then perform pg_temp.r('11e suspended business cannot create invoices', sqlerrm like '%suspended%', sqlerrm); end $$;
reset role; set role anon;
do $$ begin perform count(*) from notifications; perform pg_temp.r('12 anonymous cannot read notifications', false);
exception when others then perform pg_temp.r('12 anonymous cannot read notifications', true, sqlerrm); end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
delete from public.businesses where name like 'ZZ TEST P3%';
delete from auth.users where email like 'zz-p3-%@test.local';
delete from public.plans where code = 'zz_test';
select json_agg(json_build_object('r', case when ok then 'PASS' else 'FAIL' end, 'name', name, 'detail', left(coalesce(detail,''),90)) order by n) as results,
       count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       (select count(*) from public.businesses where name like 'ZZ TEST P3%') + (select count(*) from auth.users where email like 'zz-p3-%@test.local')
       + (select count(*) from public.plans where code = 'zz_test') as leftover
from t_results;
