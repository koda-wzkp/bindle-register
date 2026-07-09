import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditLog, getProductionDetail } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Amendment (spec §9.4): clone a registered production's contributors into a
 * new draft with parent lineage and revision + 1. The full flow repeats;
 * the parent is superseded only when the child registers.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const db = supabaseAdmin();
    const detail = await getProductionDetail(params.id, db);
    if (!detail) return jsonError(404, 'Production not found.');
    const { production, contributions } = detail;

    if (production.status !== 'registered') {
      return jsonError(409, 'Only a registered production can be revised.');
    }

    const existingChild = await db
      .from('productions')
      .select('id, status')
      .eq('parent_production_id', production.id)
      .in('status', ['draft', 'open_for_signing'])
      .maybeSingle();
    if (existingChild.error) throw new Error(existingChild.error.message);
    if (existingChild.data) {
      return jsonError(409, 'A revision of this production is already in progress.', {
        id: (existingChild.data as { id: string }).id,
      });
    }

    const { data, error } = await db
      .from('productions')
      .insert({
        org_id: production.org_id,
        title: production.title,
        parent_production_id: production.id,
        revision: production.revision + 1,
        pool_definition: production.pool_definition,
        commons_recipient: production.commons_recipient,
        commons_bps: production.commons_bps,
        run_opens: production.run_opens,
        run_closes: production.run_closes,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const childId = (data as { id: string }).id;

    for (const c of contributions) {
      const { error: insertError } = await db.from('contributions').insert({
        production_id: childId,
        person_id: c.person_id,
        role: c.role,
        share_bps: c.share_bps,
        is_principal: c.is_principal,
      });
      if (insertError) throw new Error(insertError.message);
    }

    await auditLog({
      org_id: production.org_id,
      actor: admin.email,
      action: 'production.revision_created',
      subject_type: 'production',
      subject_id: childId,
      detail: { parent_production_id: production.id, revision: production.revision + 1 },
    });

    return NextResponse.json({ id: childId }, { status: 201 });
  });
}
