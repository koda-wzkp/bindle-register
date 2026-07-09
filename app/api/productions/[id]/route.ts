import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditLog, getProduction } from '@/lib/db';
import { saveDraft } from '@/lib/drafts';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Update a draft's terms (replaces the contributor list). */
export async function PUT(request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const { id } = await saveDraft(body, admin.email, params.id);
    return NextResponse.json({ id });
  });
}

/** Discard a draft entirely. Only drafts can be deleted (DB-enforced). */
export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const db = supabaseAdmin();
    const production = await getProduction(params.id, db);
    if (!production) return jsonError(404, 'Production not found.');
    if (production.status !== 'draft') {
      return jsonError(409, 'Only drafts can be discarded.');
    }
    const contributions = await db.from('contributions').delete().eq('production_id', params.id);
    if (contributions.error) throw new Error(contributions.error.message);
    const { error } = await db.from('productions').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    await auditLog({
      org_id: production.org_id,
      actor: admin.email,
      action: 'production.draft_discarded',
      subject_type: 'production',
      subject_id: params.id,
      detail: { title: production.title },
    });
    return NextResponse.json({ ok: true });
  });
}
