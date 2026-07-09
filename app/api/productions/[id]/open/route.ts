import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { canonicalTerms } from '@/lib/canonical';
import { auditLog, getProductionDetail } from '@/lib/db';
import { validateDraftInput } from '@/lib/drafts';
import { sendSigningInvite } from '@/lib/email';
import { generateMagicLink } from '@/lib/magiclink';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Open a draft for signing: server-side validation gate, status transition,
 * then a personal signing link to every contributor (spec §9.1 step 3).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const db = supabaseAdmin();
    const detail = await getProductionDetail(params.id, db);
    if (!detail) return jsonError(404, 'Production not found.');
    const { production, contributions } = detail;

    if (production.status !== 'draft') {
      return jsonError(409, `Only a draft can open for signing (status is ${production.status}).`);
    }
    if (production.parent_production_id && !detail.parentRegistration) {
      return jsonError(409, 'The parent revision must be registered before this one can open.');
    }

    const errors = validateDraftInput({
      title: production.title,
      pool_definition: production.pool_definition,
      commons_recipient: production.commons_recipient,
      commons_bps: production.commons_bps,
      run_opens: production.run_opens,
      run_closes: production.run_closes,
      contributors: contributions.map((c) => ({
        full_name: c.person.full_name,
        email: c.person.email,
        role: c.role,
        share_bps: c.share_bps,
        is_principal: c.is_principal,
      })),
    });
    if (errors.length > 0) {
      return jsonError(422, 'The split does not validate yet.', { validation: errors });
    }

    // Lock the terms. From here, edits require voiding the round.
    const { error } = await db
      .from('productions')
      .update({ status: 'open_for_signing' })
      .eq('id', production.id)
      .eq('status', 'draft');
    if (error) throw new Error(error.message);

    const terms = canonicalTerms(detail);
    await auditLog({
      org_id: production.org_id,
      actor: admin.email,
      action: 'signing.opened',
      subject_type: 'production',
      subject_id: production.id,
      detail: { content_hash: terms.contentHash, contributors: contributions.length },
    });

    const failed: string[] = [];
    for (const c of contributions) {
      try {
        const link = await generateMagicLink(c.person.email, `/sign/${c.id}`);
        await sendSigningInvite({
          to: c.person.email,
          name: c.person.full_name,
          title: production.title,
          link,
        });
      } catch (e) {
        console.error(`signing invite failed for ${c.person.email}`, e);
        failed.push(c.person.email);
      }
    }

    return NextResponse.json({
      ok: true,
      content_hash: terms.contentHash,
      invited: contributions.length - failed.length,
      failed,
    });
  });
}
