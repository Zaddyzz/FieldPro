-- Phase 1 security checks for a live Supabase project (run in SQL Editor). Creates ZZ TEST data, then deletes it.
-- Returns one JSON row with PASS/FAIL per check.

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v from t_ids where k = p $$;
create temp table t_results (n serial, name text, ok boolean, detail text);
grant all on t_results to authenticated, anon; grant usage on sequence t_results_n_seq to authenticated, anon;

-- signups (what Supabase Auth does when someone registers)
insert into auth.users (id, email, raw_user_meta_data) values
 ('a0000000-0000-0000-0000-00000000000a', 'zz-owner-a@test.local', '{"signup_type":"business","full_name":"ZZ Owner A","business_name":"ZZ TEST Lagos Solar","industry":"solar","country":"NG","currency":"NGN","time_zone":"Africa/Lagos","date_format":"dd/MM/yyyy","tax_label":"VAT","phone":"+2348000000001"}'),
 ('b0000000-0000-0000-0000-00000000000b', 'zz-owner-b@test.local', '{"signup_type":"business","full_name":"ZZ Owner B","business_name":"ZZ TEST Austin CCTV","industry":"cctv","country":"US","currency":"USD","time_zone":"America/Chicago","date_format":"MM/dd/yyyy","tax_label":"Sales Tax","phone":"+15125550100"}'),
 ('c0000000-0000-0000-0000-00000000000c', 'zz-tech-1@test.local', '{"full_name":"ZZ Tech One"}'),
 ('d0000000-0000-0000-0000-00000000000d', 'zz-tech-2@test.local', '{"full_name":"ZZ Tech Two"}'),
 ('e0000000-0000-0000-0000-00000000000e', 'zz-stranger@test.local', '{"full_name":"ZZ Stranger"}');

insert into t_ids select 'bizA', business_id from business_members where user_id = 'a0000000-0000-0000-0000-00000000000a';
insert into t_ids select 'bizB', business_id from business_members where user_id = 'b0000000-0000-0000-0000-00000000000b';

insert into t_results (name, ok, detail)
select '1 signup creates business, owner, settings, trial', count(*) = 2,
       string_agg(b.name || ' ' || b.currency || ' ' || b.time_zone || ' ' || s.status, '; ')
from businesses b join business_members m on m.business_id = b.id and m.role = 'owner'
join business_settings st on st.business_id = b.id join business_subscriptions s on s.business_id = b.id
where s.status = 'trial' and s.trial_ends_at > now() + interval '13 days';

-- helper to act as a user
create or replace function pg_temp.act(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false) $$;

-- Owner A invites tech1 and tech2
set role authenticated;
select pg_temp.act('a0000000-0000-0000-0000-00000000000a');
insert into invitations (business_id, email, role, invited_by) values
  (pg_temp.id('bizA'), 'zz-tech-1@test.local', 'technician', 'a0000000-0000-0000-0000-00000000000a'),
  (pg_temp.id('bizA'), 'zz-tech-2@test.local', 'technician', 'a0000000-0000-0000-0000-00000000000a');
reset role;
insert into t_ids select 'inv1', token from invitations where email = 'zz-tech-1@test.local';
insert into t_ids select 'inv2', token from invitations where email = 'zz-tech-2@test.local';

set role authenticated;
-- stranger tries to use tech1's invite
select pg_temp.act('e0000000-0000-0000-0000-00000000000e');
do $$ begin perform public.accept_invitation(pg_temp.id('inv1'));
  insert into t_results (name, ok) values ('2a invite cannot be used by a different email', false);
exception when others then insert into t_results (name, ok, detail) values ('2a invite cannot be used by a different email', true, sqlerrm); end $$;

select pg_temp.act('c0000000-0000-0000-0000-00000000000c'); select public.accept_invitation(pg_temp.id('inv1'));
select pg_temp.act('d0000000-0000-0000-0000-00000000000d'); select public.accept_invitation(pg_temp.id('inv2'));
reset role;
insert into t_results (name, ok, detail)
select '2b technicians joined with technician role', count(*) = 2, string_agg(role, ',')
from business_members where business_id = pg_temp.id('bizA') and role = 'technician';

-- Owner A creates customer + job, assigns tech1
set role authenticated;
select pg_temp.act('a0000000-0000-0000-0000-00000000000a');
insert into customers (business_id, name, phone) values (pg_temp.id('bizA'), 'ZZ TEST Customer A', '+2348011111111');
reset role;
insert into t_ids select 'custA', id from customers where name = 'ZZ TEST Customer A';
set role authenticated;
select pg_temp.act('a0000000-0000-0000-0000-00000000000a');
insert into jobs (business_id, customer_id, title, scheduled_at) values (pg_temp.id('bizA'), pg_temp.id('custA'), 'ZZ TEST install 5kVA inverter', now() + interval '1 day');
insert into jobs (business_id, customer_id, title) values (pg_temp.id('bizA'), pg_temp.id('custA'), 'ZZ TEST second job');
reset role;
insert into t_ids select 'job1', id from jobs where title = 'ZZ TEST install 5kVA inverter';
insert into t_ids select 'job2', id from jobs where title = 'ZZ TEST second job';
insert into t_results (name, ok, detail)
select '3a job references are sequential per business', string_agg(reference, ',' order by number) = 'JOB-0001,JOB-0002', string_agg(reference, ',' order by number)
from jobs where business_id = pg_temp.id('bizA');

set role authenticated;
select pg_temp.act('a0000000-0000-0000-0000-00000000000a');
insert into job_assignments (job_id, business_id, user_id) values (pg_temp.id('job1'), pg_temp.id('bizA'), 'c0000000-0000-0000-0000-00000000000c');
insert into job_assignments (job_id, business_id, user_id) values (pg_temp.id('job2'), pg_temp.id('bizA'), 'd0000000-0000-0000-0000-00000000000d');

-- Tech1 works the job
select pg_temp.act('c0000000-0000-0000-0000-00000000000c');
select public.tech_update_job(pg_temp.id('job1'), 'in_progress');
insert into job_activities (business_id, job_id, kind, note) values (pg_temp.id('bizA'), pg_temp.id('job1'), 'note', 'Arrived on site');
insert into job_materials (business_id, job_id, item, quantity) values (pg_temp.id('bizA'), pg_temp.id('job1'), '6mm cable (m)', 12);
insert into attachments (business_id, job_id, storage_path, caption)
  values (pg_temp.id('bizA'), pg_temp.id('job1'), pg_temp.id('bizA') || '/' || pg_temp.id('job1') || '/zz-test.jpg', 'Inverter mounted');
select public.tech_update_job(pg_temp.id('job1'), 'completed', 'Installed and tested');
insert into t_results (name, ok, detail)
select '4 technician workflow recorded in activity', count(*) filter (where kind in ('created','assigned','status','note','material','photo','completion')) >= 7,
       string_agg(kind, ',' order by created_at)
from job_activities where job_id = pg_temp.id('job1');
insert into t_results (name, ok, detail)
select '4b completed job has completed_at', status = 'completed' and completed_at is not null, status from jobs where id = pg_temp.id('job1');

-- 5: tech1 cannot see job2 (assigned to tech2) — the "change the URL" test
insert into t_results (name, ok, detail)
select '6 technician cannot read another technician''s job', count(*) = 0, count(*)::text from jobs where id = pg_temp.id('job2');
do $$ begin perform public.tech_update_job(pg_temp.id('job2'), 'completed');
  insert into t_results (name, ok) values ('6b technician cannot update another technician''s job', false);
exception when others then insert into t_results (name, ok, detail) values ('6b technician cannot update another technician''s job', true, sqlerrm); end $$;
insert into t_results (name, ok, detail)
select '6c technician sees only own job', count(*) = 1, count(*)::text from jobs;
do $$ begin
  update jobs set status = 'cancelled' where id = pg_temp.id('job1');
  insert into t_results (name, ok, detail) values ('6d technician cannot update jobs directly',
    (select status from jobs where id = pg_temp.id('job1')) = 'completed', 'direct update silently blocked by RLS');
exception when others then insert into t_results (name, ok, detail) values ('6d technician cannot update jobs directly', true, sqlerrm); end $$;
do $$ begin
  insert into customers (business_id, name, phone) values (pg_temp.id('bizA'), 'ZZ hack', '+2348099999999');
  insert into t_results (name, ok) values ('6e technician cannot create customers', false);
exception when others then insert into t_results (name, ok, detail) values ('6e technician cannot create customers', true, sqlerrm); end $$;

-- 7: user cannot change own role / business
do $$ begin
  update business_members set role = 'owner' where user_id = auth.uid();
  insert into t_results (name, ok) values ('7a technician cannot promote self via table update', false);
exception when others then insert into t_results (name, ok, detail) values ('7a technician cannot promote self via table update', true, sqlerrm); end $$;
do $$ declare mid uuid; begin
  select id into mid from business_members where user_id = auth.uid();
  perform public.set_member_role(mid, 'admin');
  insert into t_results (name, ok) values ('7b technician cannot promote self via RPC', false);
exception when others then insert into t_results (name, ok, detail) values ('7b technician cannot promote self via RPC', true, sqlerrm); end $$;
do $$ begin
  insert into business_members (business_id, user_id, role) values (pg_temp.id('bizB'), auth.uid(), 'owner');
  insert into t_results (name, ok) values ('7c user cannot add self to another business', false);
exception when others then insert into t_results (name, ok, detail) values ('7c user cannot add self to another business', true, sqlerrm); end $$;
do $$ begin
  update business_subscriptions set status = 'active';
  insert into t_results (name, ok) values ('7d user cannot change subscription', false);
exception when others then insert into t_results (name, ok, detail) values ('7d user cannot change subscription', true, sqlerrm); end $$;
do $$ begin
  update profiles set is_platform_admin = true where id = auth.uid();
  insert into t_results (name, ok) values ('7e user cannot make self platform admin', false);
exception when others then insert into t_results (name, ok, detail) values ('7e user cannot make self platform admin', true, sqlerrm); end $$;

-- 5: Business B isolation
select pg_temp.act('b0000000-0000-0000-0000-00000000000b');
insert into t_results (name, ok, detail) select '5a B sees no A business', count(*) = 1, count(*)::text from businesses;
insert into t_results (name, ok, detail) select '5b B sees no A customers', count(*) = 0, count(*)::text from customers;
insert into t_results (name, ok, detail) select '5c B sees no A jobs', count(*) = 0, count(*)::text from jobs;
insert into t_results (name, ok, detail) select '5d B sees no A activity/materials/photos', (select count(*) from job_activities) + (select count(*) from job_materials) + (select count(*) from attachments) = 0, '';
insert into t_results (name, ok, detail) select '5e B sees no A members/profiles', (select count(*) from business_members where business_id = pg_temp.id('bizA')) + (select count(*) from profiles where id <> auth.uid()) = 0, '';
insert into t_results (name, ok, detail) select '5f B sees no A invitations', count(*) = 0, count(*)::text from invitations;
do $$ begin
  insert into jobs (business_id, customer_id, title) values (pg_temp.id('bizA'), pg_temp.id('custA'), 'ZZ cross-tenant');
  insert into t_results (name, ok) values ('5g B cannot create a job in A', false);
exception when others then insert into t_results (name, ok, detail) values ('5g B cannot create a job in A', true, sqlerrm); end $$;
update customers set name = 'hacked' where id = pg_temp.id('custA');
insert into customers (business_id, name, phone) values (pg_temp.id('bizB'), 'ZZ TEST Customer B', '+15125550111');
do $$ begin
  insert into jobs (business_id, customer_id, title) values (pg_temp.id('bizB'), pg_temp.id('custA'), 'ZZ job on A customer');
  insert into t_results (name, ok) values ('5i B cannot attach A customer to a B job', false);
exception when others then insert into t_results (name, ok, detail) values ('5i B cannot attach A customer to a B job', true, sqlerrm); end $$;
do $$ begin
  insert into job_assignments (job_id, business_id, user_id) values (pg_temp.id('job2'), pg_temp.id('bizA'), auth.uid());
  insert into t_results (name, ok) values ('5j B cannot assign self to A job', false);
exception when others then insert into t_results (name, ok, detail) values ('5j B cannot assign self to A job', true, sqlerrm); end $$;
insert into jobs (business_id, customer_id, title) select pg_temp.id('bizB'), id, 'ZZ TEST B job' from customers where name = 'ZZ TEST Customer B';
insert into t_results (name, ok, detail) select '5k B numbering independent of A', reference = 'JOB-0001', reference from jobs where title = 'ZZ TEST B job';

-- anon sees nothing
reset role; set role anon;
do $$ begin perform count(*) from jobs; insert into t_results (name, ok) values ('8 anonymous cannot read jobs', false);
exception when others then insert into t_results (name, ok, detail) values ('8 anonymous cannot read jobs', true, sqlerrm); end $$;
reset role;

-- deactivated tech loses access
set role authenticated;
select pg_temp.act('a0000000-0000-0000-0000-00000000000a');
select public.set_member_status((select id from business_members where user_id = 'd0000000-0000-0000-0000-00000000000d'), 'deactivated');
select pg_temp.act('d0000000-0000-0000-0000-00000000000d');
insert into t_results (name, ok, detail) select '9 deactivated technician loses job access', count(*) = 0, count(*)::text from jobs;
reset role;

insert into t_results (name, ok, detail)
select '5h B cannot edit A customer', name = 'ZZ TEST Customer A', name from customers where id = pg_temp.id('custA');
insert into t_results (name, ok, detail)
select '10 audit log written for sensitive actions', count(*) >= 4, string_agg(action, ',') from audit_logs;

reset role;
select set_config('request.jwt.claim.sub', '', false);
-- clean up all ZZ TEST data
delete from public.businesses where name like 'ZZ TEST%';
delete from auth.users where email like 'zz-%@test.local';
select json_agg(json_build_object('r', case when ok then 'PASS' else 'FAIL' end, 'name', name, 'detail', left(coalesce(detail,''),70)) order by n) as results,
       count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed,
       (select count(*) from public.businesses where name like 'ZZ TEST%') + (select count(*) from auth.users where email like 'zz-%@test.local') as leftover
from t_results;
