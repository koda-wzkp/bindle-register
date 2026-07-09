import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { getProduction } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Void the signing round: every collected signature is discarded inside one
 * audited transaction (the only delete path that exists for signatures) and
 * the production returns to draft.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() || null : null;

    const db = supabaseAdmin();
    const production = await getProduction(params.id, db);
    if (!production) return jsonError(404, 'Production not found.');

    const { error } = await db.rpc('void_signing_round', {
      p_production_id: params.id,
      p_actor: admin.email,
      p_reason: reason,
    });
    if (error) {
      if (/only an open signing round/i.test(error.message)) {
        return jsonError(409, 'Only an open signing round can be voided.');
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  });
}
