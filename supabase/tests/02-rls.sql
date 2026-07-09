-- RLS behavior for end-user (authenticated) connections. Runs after
-- 01-immutability.sql on the same database and uses the state it leaves
-- behind (morgan + chase, two registered/superseded productions, four
-- signatures).
--
-- This is the DB-layer fence. The route-handler integration tests
-- (tests/routes/) cover the app-layer fence and run as the service role,
-- which — like production — bypasses RLS entirely; this file is what makes
-- end-user RLS a tested claim rather than an implied one.
\set ON_ERROR_STOP on

-- A signer sees their world: productions they're named in, co-contributors,
-- signatures on those productions, registered records. Never the audit log.
set role authenticated;
set request.jwt.claims = '{"email": "morgan@example.org"}';

do $$
declare n int;
begin
  select count(*) into n from productions;
  if n <> 2 then raise exception 'FAIL: signer should see 2 productions, sees %', n; end if;
  select count(*) into n from contributions;
  if n <> 4 then raise exception 'FAIL: signer should see 4 contributions, sees %', n; end if;
  select count(*) into n from people;
  if n <> 2 then raise exception 'FAIL: signer should see 2 people (self + co-contributor), sees %', n; end if;
  select count(*) into n from signatures;
  if n <> 4 then raise exception 'FAIL: signer should see 4 signatures, sees %', n; end if;
  select count(*) into n from registrations;
  if n <> 2 then raise exception 'FAIL: signer should see 2 registrations, sees %', n; end if;
  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'FAIL: audit log must be invisible to signers, sees % rows', n; end if;
end $$;

-- No UPDATE/DELETE policy exists → zero rows are even visible to mutate.
do $$
declare n int;
begin
  update signatures set typed_name = 'evil';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: signer UPDATE on signatures touched % rows', n; end if;
  delete from registrations;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: signer DELETE on registrations touched % rows', n; end if;
  update productions set title = 'evil';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: signer UPDATE on productions touched % rows', n; end if;
end $$;

-- A stranger (valid session, unknown email) sees nothing at all.
set request.jwt.claims = '{"email": "stranger@example.org"}';
do $$
declare n int;
begin
  select count(*) into n from productions;
  if n <> 0 then raise exception 'FAIL: stranger sees % productions', n; end if;
  select count(*) into n from signatures;
  if n <> 0 then raise exception 'FAIL: stranger sees % signatures', n; end if;
  select count(*) into n from registrations;
  if n <> 0 then raise exception 'FAIL: stranger sees % registrations', n; end if;
end $$;

reset role;

-- The signatures INSERT policy: a signer may insert on their own
-- contribution while the round is open — and only there. Seed a fresh open
-- round as superuser, then exercise both sides as authenticated.
insert into productions (id, org_id, title, pool_definition, commons_recipient, commons_bps, status)
values ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-00000000000a', 'RLS Probe',
        'Earned-revenue surplus less royalties, venue, and the capped expense list agreed by the company.',
        'Puddletown Commons Fund', 500, 'draft');
insert into contributions (id, production_id, person_id, role, share_bps, is_principal) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-000000000001', 'Director', 4750, true),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-000000000002', 'Music Director', 4750, true);
update productions set status = 'open_for_signing' where id = '00000000-0000-0000-0000-0000000000d0';

set role authenticated;
set request.jwt.claims = '{"email": "morgan@example.org"}';

-- Own contribution, open round → allowed by the INSERT-only policy.
insert into signatures (contribution_id, content_hash, consent_text_version, typed_name, signer_email)
values ('00000000-0000-0000-0000-0000000000d1', repeat('11', 32), 'v1.0', 'Morgan Ellery', 'morgan@example.org');

-- Someone else's contribution → the with-check clause refuses.
do $$
begin
  begin
    insert into signatures (contribution_id, content_hash, consent_text_version, typed_name, signer_email)
    values ('00000000-0000-0000-0000-0000000000d2', repeat('22', 32), 'v1.0', 'Not Chase', 'morgan@example.org');
  exception when others then
    raise notice 'OK (blocked): signer inserting a signature on another contribution -> %', sqlerrm;
    return;
  end;
  raise exception 'FAIL: signer inserted a signature on someone else''s contribution';
end $$;

reset role;

select 'ALL RLS CHECKS PASSED' as result;
