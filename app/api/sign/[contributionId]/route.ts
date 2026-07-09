import { NextResponse } from 'next/server';
import { clientMeta, handle, jsonError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { canonicalTerms } from '@/lib/canonical';
import { CONSENT_TEXT_VERSION } from '@/lib/consent';
import { auditLog, getProductionDetail } from '@/lib/db';
import { sendSignatureConfirmation } from '@/lib/email';
import { buidShareable, signatureCollectionBlocked } from '@/lib/guards';
import { maybeRegister } from '@/lib/registration';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * The signing ceremony's POST (spec §9.2): records the signature against the
 * current content hash with typed name, consent version, timestamp, IP, and
 * user agent. On the final signature, registration runs (§9.3).
 */
export async function POST(request: Request, { params }: { params: { contributionId: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const typedName = String(body?.typed_name ?? '').trim();
    const consented = body?.consent === true;

    if (!typedName) return jsonError(400, 'Type your full legal name to sign.');
    if (!consented) return jsonError(400, 'Check the consent box to sign.');

    // DECIDE-04: no real signatures until the consent copy has legal review.
    const gate = signatureCollectionBlocked();
    if (gate.blocked) return jsonError(503, gate.reason!);

    const db = supabaseAdmin();
    const contributionLookup = await db
      .from('contributions')
      .select('id, production_id')
      .eq('id', params.contributionId)
      .maybeSingle();
    if (contributionLookup.error) throw new Error(contributionLookup.error.message);
    if (!contributionLookup.data) return jsonError(404, 'This signing link does not match a current contribution.');

    const detail = await getProductionDetail(
      (contributionLookup.data as { production_id: string }).production_id,
      db,
    );
    if (!detail) return jsonError(404, 'Production not found.');
    const contribution = detail.contributions.find((c) => c.id === params.contributionId)!;

    if (contribution.person.email.toLowerCase() !== user.email) {
      return jsonError(403, 'This signing page belongs to a different contributor.');
    }
    if (detail.production.status !== 'open_for_signing') {
      return jsonError(409, 'This production is not open for signing.');
    }
    if (contribution.signature) {
      return jsonError(409, 'Your signature is already recorded. Signatures cannot be edited — ask the admin to void the round to withdraw.');
    }

    const terms = canonicalTerms(detail);
    const { ip, userAgent } = clientMeta(request);

    const { error } = await db.from('signatures').insert({
      contribution_id: contribution.id,
      content_hash: terms.contentHash,
      consent_text_version: CONSENT_TEXT_VERSION,
      typed_name: typedName,
      // Attribution comes from the verified session, never from the request
      // body or the link.
      signer_email: user.email,
      ip,
      user_agent: userAgent,
    });
    if (error) {
      if (error.code === '23505') {
        return jsonError(409, 'Your signature is already recorded.');
      }
      throw new Error(error.message);
    }

    await auditLog({
      org_id: detail.production.org_id,
      actor: user.email,
      action: 'signature.recorded',
      subject_type: 'contribution',
      subject_id: contribution.id,
      detail: { content_hash: terms.contentHash, consent_text_version: CONSENT_TEXT_VERSION },
    });

    try {
      await sendSignatureConfirmation({
        to: contribution.person.email,
        name: contribution.person.full_name,
        title: detail.production.title,
        contentHash: terms.contentHash,
      });
    } catch (e) {
      console.error('signature confirmation email failed', e);
    }

    const result = await maybeRegister(detail.production.id);
    // DECIDE-01: the BUID stays off signer-facing surfaces (including this
    // response) until the namespace is resolved. Admins may see it.
    if (result.buid && !buidShareable() && !user.isAdmin) {
      return NextResponse.json({ ok: true, registered: result.registered });
    }
    return NextResponse.json({ ok: true, ...result });
  });
}
