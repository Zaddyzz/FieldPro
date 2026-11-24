-- Logo permissions (8 checks, live-safe: creates and deletes ZZ TEST LOGO data). Run in the Supabase SQL Editor.
create temp table r (n serial, name text, ok boolean, d text); grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a4000000-0000-0000-0000-00000000000a', 'zz-logo-a@test.local', '{"signup_type":"business","full_name":"ZZ A","business_name":"ZZ TEST LOGO A","industry":"solar","country":"NG","currency":"NGN","time_zone":"Africa/Lagos"}'),
 ('b4000000-0000-0000-0000-00000000000b', 'zz-logo-b@test.local', '{"signup_type":"business","full_name":"ZZ B","business_name":"ZZ TEST LOGO B","industry":"cctv","country":"US","currency":"USD","time_zone":"America/Chicago"}');
create temp table ids as select (select business_id from business_members where user_id='a4000000-0000-0000-0000-00000000000a') a, (select business_id from business_members where user_id='b4000000-0000-0000-0000-00000000000b') b;
grant select on ids to authenticated;
set role authenticated; select set_config('request.jwt.claim.sub','a4000000-0000-0000-0000-00000000000a',false);
insert into r(name, ok) select 'owner can manage own logo file', can_manage_logo_object((select a from ids)::text || '/logo-1764000000000.png');
insert into r(name, ok) select 'owner cannot manage another business logo file', not can_manage_logo_object((select b from ids)::text || '/logo-1764000000000.png');
insert into r(name, ok) select 'svg and odd names refused', not can_manage_logo_object((select a from ids)::text || '/logo-1764000000000.svg') and not can_manage_logo_object((select a from ids)::text || '/x/../logo-1.png');
select set_business_logo((select a from ids), (select a from ids)::text || '/logo-1764000000000.png', false);
insert into r(name, ok) select 'owner sets logo and watermark off', logo_path like '%/logo-1764000000000.png' and not logo_watermark from businesses where id = (select a from ids);
do $$ begin perform set_business_logo((select a from ids), (select b from ids)::text || '/logo-1764000000000.png', null); insert into r(name, ok) values ('logo path from another business refused', false);
exception when others then insert into r(name, ok, d) values ('logo path from another business refused', true, sqlerrm); end $$;
do $$ begin perform set_business_logo((select b from ids), '', null); insert into r(name, ok) values ('cannot change another business logo', false);
exception when others then insert into r(name, ok, d) values ('cannot change another business logo', true, sqlerrm); end $$;
do $$ begin update businesses set logo_path = null where id = (select a from ids);
  insert into r(name, ok) select 'direct update of logo column blocked', (select logo_path from businesses where id = (select a from ids)) is not null;
exception when others then insert into r(name, ok, d) values ('direct update of logo column blocked', true, sqlerrm); end $$;
select set_business_logo((select a from ids), '', true);
insert into r(name, ok) select 'remove logo works', logo_path is null and logo_watermark from businesses where id = (select a from ids);
reset role;
delete from businesses where name like 'ZZ TEST LOGO%'; delete from auth.users where email like 'zz-logo-%@test.local';
select count(*) filter (where ok) passed, count(*) filter (where not ok) failed, json_agg(name) filter (where not ok) failures,
 (select count(*) from businesses where name like 'ZZ TEST LOGO%') leftover from r;
