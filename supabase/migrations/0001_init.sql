-- Bindle Register v1 — initial schema.
--
-- Invariants this migration enforces at the database, not just in app code:
--   * registrations and audit_log are append-only: no UPDATE/DELETE policy
--     exists, and guard triggers reject both even from the service role.
--   * signatures are append-only, with exactly one sanctioned exception:
--     void_signing_round(), which discards a whole round inside one audited
--     transaction. The guard trigger checks the transaction-local flag that
--     only that function sets.
--   * productions are editable only in draft; after that, only whitelisted
--     status transitions may occur, and the void/register transitions are
--     valid only inside their respective functions.
--   * registration is transactional: rule-8 checks, the registrations
--     insert, the status transition, and the audit entry commit or roll
--     back together (register_production).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create type production_status as enum
  ('draft', 'open_for_signing', 'registered', 'superseded');

create table productions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null,
  parent_production_id uuid references productions(id), -- amendment lineage
  revision int not null default 0 check (revision >= 0), -- R0, R1... child = parent.revision + 1
  status production_status not null default 'draft',
  pool_definition text not null,      -- human-readable: what dollars enter the pool,
                                      -- what comes off the top (royalties, venue, capped expense list)
  commons_recipient text not null,    -- named recipient; registry validation is a later phase
  commons_bps int not null check (commons_bps >= 0),
  run_opens date,
  run_closes date,
  created_at timestamptz not null default now()
);

create index productions_org_idx on productions (org_id);
create index productions_parent_idx on productions (parent_production_id);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id),
  person_id uuid not null references people(id),
  role text not null,                 -- 'Director', 'Music Director', 'Cast', 'Stage Manager', ...
  share_bps int not null check (share_bps > 0),
  is_principal boolean not null default false,
  unique (production_id, person_id)
);

create index contributions_production_idx on contributions (production_id);
create index contributions_person_idx on contributions (person_id);

create table signatures (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references contributions(id) unique,
  content_hash text not null,         -- full hex SHA-256 of canonical terms at signing time
  consent_text_version text not null,
  typed_name text not null,           -- signer types their full name (ESIGN/UETA intent)
  signed_at timestamptz not null default now(),
  ip inet,
  user_agent text
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) unique,
  canonical_json jsonb not null,      -- exact hashed payload, stored verbatim
  content_hash text not null,         -- full SHA-256 hex
  buid text not null unique,          -- e.g. BNDL::PROD::<NS>::ROOT::R0::a1b2c3d4
  glyph_svg text not null,
  registered_at timestamptz not null default now()
);

create index registrations_buid_idx on registrations (buid);

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  actor text not null,                -- email or 'system'
  action text not null,
  subject_type text not null,
  subject_id uuid,
  detail jsonb,
  at timestamptz not null default now()
);

create index audit_log_org_idx on audit_log (org_id, at desc);

-- ---------------------------------------------------------------------------
-- Immutability guard triggers
-- These fire for every role including service_role; RLS is the second fence.
-- ---------------------------------------------------------------------------

create or replace function guard_append_only() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are append-only (% blocked)', tg_table_name, tg_op
    using errcode = 'raise_exception';
end $$;

create trigger registrations_append_only
  before update or delete on registrations
  for each row execute function guard_append_only();

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function guard_append_only();

create or replace function guard_signatures() returns trigger
language plpgsql as $$
declare
  v_production_id uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'signatures are append-only (UPDATE blocked)';
  end if;
  -- DELETE is legal only inside void_signing_round(), which marks the
  -- transaction with the production id being voided.
  select c.production_id into v_production_id
    from contributions c where c.id = old.contribution_id;
  if coalesce(current_setting('bindle.voiding', true), '') <> v_production_id::text then
    raise exception 'signatures can only be discarded by voiding the signing round';
  end if;
  return old;
end $$;

create trigger signatures_guard
  before update or delete on signatures
  for each row execute function guard_signatures();

create or replace function guard_contributions() returns trigger
language plpgsql as $$
declare
  v_status production_status;
  v_production_id uuid;
begin
  v_production_id := coalesce(new.production_id, old.production_id);
  select status into v_status from productions where id = v_production_id;
  if v_status is distinct from 'draft' then
    raise exception 'contributions can only change while the production is in draft (status is %)', v_status;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger contributions_guard
  before insert or update or delete on contributions
  for each row execute function guard_contributions();

create or replace function guard_productions() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft productions can be deleted';
    end if;
    return old;
  end if;

  -- Drafts are freely editable.
  if old.status = 'draft' then
    return new;
  end if;

  -- Past draft, terms are locked: only a status transition may occur.
  if to_jsonb(new) - 'status' <> to_jsonb(old) - 'status' then
    raise exception 'production % is locked (status %); terms cannot change', old.id, old.status;
  end if;

  -- Whitelisted transitions, each valid only inside its sanctioned function.
  if old.status = 'open_for_signing' and new.status = 'draft' then
    if coalesce(current_setting('bindle.voiding', true), '') <> old.id::text then
      raise exception 'returning to draft requires void_signing_round()';
    end if;
    return new;
  end if;
  if old.status = 'open_for_signing' and new.status = 'registered' then
    if coalesce(current_setting('bindle.registering', true), '') <> old.id::text then
      raise exception 'transition to registered requires register_production()';
    end if;
    return new;
  end if;
  if old.status = 'registered' and new.status = 'superseded' then
    if coalesce(current_setting('bindle.registering', true), '') <> old.id::text then
      raise exception 'supersession happens only when a child registers';
    end if;
    return new;
  end if;

  raise exception 'illegal status transition: % -> %', old.status, new.status;
end $$;

create trigger productions_guard
  before update or delete on productions
  for each row execute function guard_productions();

-- ---------------------------------------------------------------------------
-- Sanctioned transactional operations
-- ---------------------------------------------------------------------------

-- Void a signing round: discard every signature, return to draft, audit.
-- The only path that deletes signatures.
create or replace function void_signing_round(p_production_id uuid, p_actor text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod productions%rowtype;
  v_discarded int;
begin
  select * into v_prod from productions where id = p_production_id for update;
  if not found then
    raise exception 'production % not found', p_production_id;
  end if;
  if v_prod.status <> 'open_for_signing' then
    raise exception 'only an open signing round can be voided (status is %)', v_prod.status;
  end if;

  perform set_config('bindle.voiding', p_production_id::text, true);
  delete from signatures s
    using contributions c
    where s.contribution_id = c.id and c.production_id = p_production_id;
  get diagnostics v_discarded = row_count;
  update productions set status = 'draft' where id = p_production_id;
  perform set_config('bindle.voiding', '', true);

  insert into audit_log (org_id, actor, action, subject_type, subject_id, detail)
  values (
    v_prod.org_id, p_actor, 'signing_round.voided', 'production', p_production_id,
    jsonb_build_object('signatures_discarded', v_discarded, 'reason', p_reason)
  );
end $$;

-- Register a production. Re-checks rule 8 inside the transaction (the app
-- computed and validated already; the database does not take its word for it).
create or replace function register_production(
  p_production_id uuid,
  p_canonical_json jsonb,
  p_content_hash text,
  p_buid text,
  p_glyph_svg text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod productions%rowtype;
  v_contributions int;
  v_signatures int;
  v_mismatched int;
  v_registration_id uuid;
begin
  select * into v_prod from productions where id = p_production_id for update;
  if not found then
    raise exception 'production % not found', p_production_id;
  end if;
  if v_prod.status <> 'open_for_signing' then
    raise exception 'registration requires status open_for_signing (status is %)', v_prod.status;
  end if;

  select count(*) into v_contributions from contributions where production_id = p_production_id;
  select count(*) into v_signatures
    from signatures s join contributions c on c.id = s.contribution_id
    where c.production_id = p_production_id;
  if v_contributions = 0 or v_signatures <> v_contributions then
    raise exception 'signatures incomplete: % of % collected', v_signatures, v_contributions;
  end if;

  select count(*) into v_mismatched
    from signatures s join contributions c on c.id = s.contribution_id
    where c.production_id = p_production_id and s.content_hash <> p_content_hash;
  if v_mismatched > 0 then
    raise exception 'tamper guard: % signature(s) attest to a different content hash', v_mismatched;
  end if;

  -- A short-hash collision trips the buid unique constraint here; the caller
  -- retries with an extended short hash. Full hash remains the truth.
  insert into registrations (production_id, canonical_json, content_hash, buid, glyph_svg)
  values (p_production_id, p_canonical_json, p_content_hash, p_buid, p_glyph_svg)
  returning id into v_registration_id;

  perform set_config('bindle.registering', p_production_id::text, true);
  update productions set status = 'registered' where id = p_production_id;

  if v_prod.parent_production_id is not null then
    perform set_config('bindle.registering', v_prod.parent_production_id::text, true);
    update productions set status = 'superseded'
      where id = v_prod.parent_production_id and status = 'registered';
  end if;
  perform set_config('bindle.registering', '', true);

  insert into audit_log (org_id, actor, action, subject_type, subject_id, detail)
  values (
    v_prod.org_id, p_actor, 'production.registered', 'production', p_production_id,
    jsonb_build_object('buid', p_buid, 'content_hash', p_content_hash, 'registration_id', v_registration_id)
  );

  return v_registration_id;
end $$;

-- Mutations run server-side with the service role; end users never call these.
revoke execute on function void_signing_round(uuid, text, text) from public, anon, authenticated;
revoke execute on function register_production(uuid, jsonb, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table people enable row level security;
alter table productions enable row level security;
alter table contributions enable row level security;
alter table signatures enable row level security;
alter table registrations enable row level security;
alter table audit_log enable row level security;

-- Identity of the signed-in signer (magic-link session).
create or replace function bindle_email() returns text
language sql stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- security definer so RLS policies can consult these without recursion.
create or replace function bindle_my_person_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from people where lower(email) = bindle_email()
$$;

create or replace function bindle_my_production_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select c.production_id
  from contributions c
  join people p on p.id = c.person_id
  where lower(p.email) = bindle_email()
$$;

-- People see: productions they're named in, the co-contributors named beside
-- them (transparency among signers is the design), their own signatures and
-- the registered records they signed. Admin access runs server-side via the
-- service role behind the ADMIN_EMAILS allowlist — v1 has no roles table.

create policy organizations_select on organizations
  for select to authenticated
  using (id in (select org_id from people where id in (select bindle_my_person_ids())));

create policy people_select on people
  for select to authenticated
  using (
    id in (select bindle_my_person_ids())
    or exists (
      select 1 from contributions c
      where c.person_id = people.id
        and c.production_id in (select bindle_my_production_ids())
    )
  );

create policy productions_select on productions
  for select to authenticated
  using (id in (select bindle_my_production_ids()));

create policy contributions_select on contributions
  for select to authenticated
  using (production_id in (select bindle_my_production_ids()));

create policy signatures_select on signatures
  for select to authenticated
  using (
    contribution_id in (
      select c.id from contributions c
      where c.production_id in (select bindle_my_production_ids())
    )
  );

-- INSERT-only: a signer may record a signature on their own contribution
-- while the round is open. No UPDATE or DELETE policy exists at all —
-- the absence is the enforcement (plus the guard triggers above).
create policy signatures_insert on signatures
  for insert to authenticated
  with check (
    contribution_id in (
      select c.id from contributions c
      join productions pr on pr.id = c.production_id
      where c.person_id in (select bindle_my_person_ids())
        and pr.status = 'open_for_signing'
    )
  );

create policy registrations_select on registrations
  for select to authenticated
  using (production_id in (select bindle_my_production_ids()));

-- audit_log: no policies for authenticated users at all. Server-side only.
