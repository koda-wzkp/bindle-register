-- Exercises the immutability contract (spec acceptance criteria 3, 4, 5).
-- Every "expect_error" block must catch an exception or the script fails.
\set ON_ERROR_STOP on

create or replace function expect_error(sql text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'OK (blocked): % -> %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % was allowed but must be blocked', label;
end $$;

-- Seed
insert into organizations (id, name) values ('00000000-0000-0000-0000-00000000000a', 'Puddletown Theatre Collective');
insert into people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Morgan Ellery', 'morgan@example.org'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Chase Whitfield', 'chase@example.org');

insert into productions (id, org_id, title, pool_definition, commons_recipient, commons_bps)
values ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000000a', 'Floyd Collins',
        'Earned-revenue surplus less royalties, venue, and the capped expense list agreed by the company.',
        'Puddletown Commons Fund', 500);

insert into contributions (id, production_id, person_id, role, share_bps, is_principal) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000001', 'Director', 4750, true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000002', 'Music Director', 4750, true);

-- Draft edits are allowed
update productions set title = 'Floyd Collins ' where id = '00000000-0000-0000-0000-0000000000b0';
update productions set title = 'Floyd Collins' where id = '00000000-0000-0000-0000-0000000000b0';

-- Open for signing (draft rows may change status freely)
update productions set status = 'open_for_signing' where id = '00000000-0000-0000-0000-0000000000b0';

-- Terms are now locked
select expect_error(
  $q$update productions set commons_bps = 600 where id = '00000000-0000-0000-0000-0000000000b0'$q$,
  'editing terms while open_for_signing');
select expect_error(
  $q$update contributions set share_bps = 5000 where id = '00000000-0000-0000-0000-0000000000c1'$q$,
  'editing a contribution while open_for_signing');
select expect_error(
  $q$update productions set status = 'draft' where id = '00000000-0000-0000-0000-0000000000b0'$q$,
  'returning to draft without void_signing_round()');
select expect_error(
  $q$update productions set status = 'registered' where id = '00000000-0000-0000-0000-0000000000b0'$q$,
  'jumping to registered without register_production()');

-- One signature lands
insert into signatures (contribution_id, content_hash, consent_text_version, typed_name)
values ('00000000-0000-0000-0000-0000000000c1', repeat('ab', 32), 'v1.0', 'Morgan Ellery');

select expect_error(
  $q$update signatures set typed_name = 'Someone Else'$q$,
  'mutating a signature');
select expect_error(
  $q$delete from signatures$q$,
  'deleting a signature outside void_signing_round()');

-- Registration blocked while signatures incomplete
select expect_error(
  $q$select register_production('00000000-0000-0000-0000-0000000000b0', '{}'::jsonb, repeat('ab', 32), 'BNDL::PROD::TBD::ROOT::R0::abababab', '<svg/>', 'test')$q$,
  'registering with incomplete signatures');

-- Void: the only sanctioned discard path — must succeed and audit
select void_signing_round('00000000-0000-0000-0000-0000000000b0', 'chase@example.org', 'term change needed');
do $$ begin
  if (select count(*) from signatures) <> 0 then raise exception 'FAIL: void left signatures behind'; end if;
  if (select status from productions where id = '00000000-0000-0000-0000-0000000000b0') <> 'draft' then
    raise exception 'FAIL: void did not return production to draft'; end if;
  if not exists (select from audit_log where action = 'signing_round.voided') then
    raise exception 'FAIL: void was not audit-logged'; end if;
end $$;

-- Round 2: open, everyone signs, register
update productions set status = 'open_for_signing' where id = '00000000-0000-0000-0000-0000000000b0';
insert into signatures (contribution_id, content_hash, consent_text_version, typed_name) values
  ('00000000-0000-0000-0000-0000000000c1', repeat('ab', 32), 'v1.0', 'Morgan Ellery'),
  ('00000000-0000-0000-0000-0000000000c2', repeat('ab', 32), 'v1.0', 'Chase Whitfield');

-- Tamper guard: registration with a hash the signatures did not attest to
select expect_error(
  $q$select register_production('00000000-0000-0000-0000-0000000000b0', '{}'::jsonb, repeat('cd', 32), 'BNDL::PROD::TBD::ROOT::R0::cdcdcdcd', '<svg/>', 'test')$q$,
  'registering with mismatched content hash');

select register_production('00000000-0000-0000-0000-0000000000b0', '{"canonical": true}'::jsonb,
  repeat('ab', 32), 'BNDL::PROD::TBD::ROOT::R0::abababab', '<svg/>', 'system');

do $$ begin
  if (select status from productions where id = '00000000-0000-0000-0000-0000000000b0') <> 'registered' then
    raise exception 'FAIL: production not registered'; end if;
end $$;

-- Registered records and their signatures are frozen — no code path mutates them
select expect_error(
  $q$update registrations set content_hash = repeat('ff', 32)$q$,
  'mutating a registration');
select expect_error(
  $q$delete from registrations$q$,
  'deleting a registration');
select expect_error(
  $q$delete from signatures$q$,
  'deleting signatures after registration');
select expect_error(
  $q$update productions set title = 'Renamed' where id = '00000000-0000-0000-0000-0000000000b0'$q$,
  'editing a registered production');
select expect_error(
  $q$update productions set status = 'superseded' where id = '00000000-0000-0000-0000-0000000000b0'$q$,
  'superseding without a registered child');
select expect_error(
  $q$update audit_log set actor = 'nobody'$q$,
  'mutating the audit log');
select expect_error(
  $q$delete from audit_log$q$,
  'deleting audit log rows');

-- Amendment: child production, full re-sign, parent superseded only after child registers
insert into productions (id, org_id, title, parent_production_id, revision, pool_definition, commons_recipient, commons_bps)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'Floyd Collins',
        '00000000-0000-0000-0000-0000000000b0', 1,
        'Earned-revenue surplus less royalties, venue, and the capped expense list agreed by the company.',
        'Puddletown Commons Fund', 500);
insert into contributions (id, production_id, person_id, role, share_bps, is_principal) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'Director', 4750, true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'Music Director', 4750, true);
update productions set status = 'open_for_signing' where id = '00000000-0000-0000-0000-0000000000b1';

do $$ begin
  if (select status from productions where id = '00000000-0000-0000-0000-0000000000b0') <> 'registered' then
    raise exception 'FAIL: parent superseded before the child registered'; end if;
end $$;

insert into signatures (contribution_id, content_hash, consent_text_version, typed_name) values
  ('00000000-0000-0000-0000-0000000000c3', repeat('ef', 32), 'v1.0', 'Morgan Ellery'),
  ('00000000-0000-0000-0000-0000000000c4', repeat('ef', 32), 'v1.0', 'Chase Whitfield');
select register_production('00000000-0000-0000-0000-0000000000b1', '{"canonical": true, "revision": 1}'::jsonb,
  repeat('ef', 32), 'BNDL::PROD::TBD::abababab::R1::efefefef', '<svg/>', 'system');

do $$ begin
  if (select status from productions where id = '00000000-0000-0000-0000-0000000000b0') <> 'superseded' then
    raise exception 'FAIL: parent not superseded after child registration'; end if;
  if (select status from productions where id = '00000000-0000-0000-0000-0000000000b1') <> 'registered' then
    raise exception 'FAIL: child not registered'; end if;
end $$;

-- BUID uniqueness: a duplicate insert must trip the constraint (collision retry path)
select expect_error(
  $q$insert into registrations (production_id, canonical_json, content_hash, buid, glyph_svg)
     values ('00000000-0000-0000-0000-0000000000b0', '{}'::jsonb, repeat('ab', 32), 'BNDL::PROD::TBD::ROOT::R0::abababab', '<svg/>')$q$,
  'duplicate BUID');

select 'ALL IMMUTABILITY CHECKS PASSED' as result;
