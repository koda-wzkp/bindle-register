import 'server-only';
import { validateProduction, type ValidationError } from '@bindle/core';
import { HttpError } from '@/lib/auth';
import { auditLog, getOrg, getProduction } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PersonRow, ProductionDraftInput } from '@/lib/types';

export function validateDraftInput(input: ProductionDraftInput): ValidationError[] {
  return validateProduction({
    title: input.title,
    pool_definition: input.pool_definition,
    commons_recipient: input.commons_recipient,
    commons_bps: input.commons_bps,
    contributors: input.contributors.map((c) => ({
      name: c.full_name,
      email: c.email,
      role: c.role,
      bps: c.share_bps,
      principal: c.is_principal,
    })),
  });
}

function parseDraftInput(body: unknown): ProductionDraftInput {
  const b = body as Partial<ProductionDraftInput> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.contributors)) {
    throw new HttpError(400, 'Malformed draft payload.');
  }
  return {
    title: String(b.title ?? '').trim(),
    pool_definition: String(b.pool_definition ?? '').trim(),
    commons_recipient: String(b.commons_recipient ?? '').trim(),
    commons_bps: Number(b.commons_bps),
    run_opens: b.run_opens || null,
    run_closes: b.run_closes || null,
    contributors: b.contributors.map((c) => ({
      full_name: String(c.full_name ?? '').trim(),
      email: String(c.email ?? '').trim().toLowerCase(),
      role: String(c.role ?? '').trim(),
      share_bps: Number(c.share_bps),
      is_principal: Boolean(c.is_principal),
    })),
  };
}

/**
 * Create or replace a draft's terms. Drafts are the only editable state;
 * the contributions guard trigger enforces that at the database.
 * Draft saves are allowed with validation errors outstanding (work in
 * progress); opening for signing is the gate that requires a clean slate.
 */
export async function saveDraft(
  body: unknown,
  actor: string,
  productionId?: string,
): Promise<{ id: string }> {
  const input = parseDraftInput(body);
  const db = supabaseAdmin();
  const org = await getOrg(db);

  const emails = input.contributors.map((c) => c.email);
  if (new Set(emails).size !== emails.length) {
    throw new HttpError(400, 'Each contributor needs a distinct email: one signature per person per production.');
  }

  let id = productionId;
  if (id) {
    const existing = await getProduction(id, db);
    if (!existing) throw new HttpError(404, 'Production not found.');
    if (existing.status !== 'draft') {
      throw new HttpError(409, 'Terms are locked once signing opens. Void the signing round to edit.');
    }
    const { error } = await db
      .from('productions')
      .update({
        title: input.title,
        pool_definition: input.pool_definition,
        commons_recipient: input.commons_recipient,
        commons_bps: input.commons_bps,
        run_opens: input.run_opens,
        run_closes: input.run_closes,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    const del = await db.from('contributions').delete().eq('production_id', id);
    if (del.error) throw new Error(del.error.message);
  } else {
    const { data, error } = await db
      .from('productions')
      .insert({
        org_id: org.id,
        title: input.title,
        pool_definition: input.pool_definition,
        commons_recipient: input.commons_recipient,
        commons_bps: input.commons_bps,
        run_opens: input.run_opens,
        run_closes: input.run_closes,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = (data as { id: string }).id;
  }

  for (const c of input.contributors) {
    const person = await upsertPerson(org.id, c.full_name, c.email);
    const { error } = await db.from('contributions').insert({
      production_id: id,
      person_id: person.id,
      role: c.role,
      share_bps: c.share_bps,
      is_principal: c.is_principal,
    });
    if (error) throw new Error(error.message);
  }

  await auditLog({
    org_id: org.id,
    actor,
    action: productionId ? 'production.draft_updated' : 'production.created',
    subject_type: 'production',
    subject_id: id,
    detail: { title: input.title, contributors: input.contributors.length },
  });

  return { id };
}

async function upsertPerson(orgId: string, fullName: string, email: string): Promise<PersonRow> {
  const db = supabaseAdmin();
  const existing = await db
    .from('people')
    .select('*')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const person = existing.data as PersonRow;
    if (person.full_name !== fullName) {
      const { error } = await db.from('people').update({ full_name: fullName }).eq('id', person.id);
      if (error) throw new Error(error.message);
      return { ...person, full_name: fullName };
    }
    return person;
  }
  const { data, error } = await db
    .from('people')
    .insert({ org_id: orgId, full_name: fullName, email })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PersonRow;
}
