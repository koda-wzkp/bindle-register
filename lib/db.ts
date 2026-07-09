import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { orgName } from '@/lib/env';
import type {
  ContributionRow,
  ContributionWithPerson,
  OrganizationRow,
  PersonRow,
  ProductionDetail,
  ProductionRow,
  RegistrationRow,
  SignatureRow,
} from '@/lib/types';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Expected data, got null');
  return result.data;
}

/** Single-tenant bootstrap: fetch or create the organization named in env. */
export async function getOrg(db: SupabaseClient = supabaseAdmin()): Promise<OrganizationRow> {
  const name = orgName();
  const existing = await db.from('organizations').select('*').eq('name', name).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as OrganizationRow;
  return unwrap(await db.from('organizations').insert({ name }).select().single()) as OrganizationRow;
}

export async function getProduction(
  id: string,
  db: SupabaseClient = supabaseAdmin(),
): Promise<ProductionRow | null> {
  const result = await db.from('productions').select('*').eq('id', id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as ProductionRow | null;
}

export async function getProductionDetail(
  id: string,
  db: SupabaseClient = supabaseAdmin(),
): Promise<ProductionDetail | null> {
  const production = await getProduction(id, db);
  if (!production) return null;

  const [orgRes, contributionsRes, peopleRes, registration] = await Promise.all([
    db.from('organizations').select('*').eq('id', production.org_id).single(),
    db.from('contributions').select('*').eq('production_id', id),
    db.from('people').select('*').eq('org_id', production.org_id),
    db.from('registrations').select('*').eq('production_id', id).maybeSingle(),
  ]);

  const org = unwrap(orgRes) as OrganizationRow;
  const contributions = unwrap(contributionsRes) as ContributionRow[];
  const people = unwrap(peopleRes) as PersonRow[];
  if (registration.error) throw new Error(registration.error.message);

  const signatures =
    contributions.length === 0
      ? []
      : (unwrap(
          await db
            .from('signatures')
            .select('*')
            .in('contribution_id', contributions.map((c) => c.id)),
        ) as SignatureRow[]);

  let parentRegistration: RegistrationRow | null = null;
  if (production.parent_production_id) {
    const parent = await db
      .from('registrations')
      .select('*')
      .eq('production_id', production.parent_production_id)
      .maybeSingle();
    if (parent.error) throw new Error(parent.error.message);
    parentRegistration = parent.data as RegistrationRow | null;
  }

  const personById = new Map(people.map((p) => [p.id, p]));
  const signatureByContribution = new Map(signatures.map((s) => [s.contribution_id, s]));

  const withPeople: ContributionWithPerson[] = contributions
    .map((c) => ({
      ...c,
      person: personById.get(c.person_id)!,
      signature: signatureByContribution.get(c.id) ?? null,
    }))
    .sort((a, b) => a.person.full_name.localeCompare(b.person.full_name));

  return {
    production,
    org: org as OrganizationRow,
    contributions: withPeople,
    registration: (registration.data as RegistrationRow | null) ?? null,
    parentRegistration,
  };
}

export async function getRegistrationByBuid(
  buid: string,
  db: SupabaseClient = supabaseAdmin(),
): Promise<RegistrationRow | null> {
  const result = await db.from('registrations').select('*').eq('buid', buid).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as RegistrationRow | null;
}

export async function auditLog(
  entry: {
    org_id: string;
    actor: string;
    action: string;
    subject_type: string;
    subject_id?: string | null;
    detail?: unknown;
  },
  db: SupabaseClient = supabaseAdmin(),
): Promise<void> {
  const { error } = await db.from('audit_log').insert(entry);
  if (error) throw new Error(`audit log write failed: ${error.message}`);
}
