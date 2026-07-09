import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditLog, getProductionDetail } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';
import { generateMagicLink } from '@/lib/magiclink';

export const dynamic = 'force-dynamic';

/** Resend a contributor's signing link while the round is open. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const contributionId = String(body?.contribution_id ?? '');

    const detail = await getProductionDetail(params.id);
    if (!detail) return jsonError(404, 'Production not found.');
    if (detail.production.status !== 'open_for_signing') {
      return jsonError(409, 'Signing links only exist while the round is open.');
    }
    const contribution = detail.contributions.find((c) => c.id === contributionId);
    if (!contribution) return jsonError(404, 'Contributor not found on this production.');
    if (contribution.signature) return jsonError(409, `${contribution.person.full_name} has already signed.`);

    const link = await generateMagicLink(contribution.person.email, `/sign/${contribution.id}`);
    await sendSigningInvite({
      to: contribution.person.email,
      name: contribution.person.full_name,
      title: detail.production.title,
      link,
    });
    await auditLog({
      org_id: detail.production.org_id,
      actor: admin.email,
      action: 'signing.link_resent',
      subject_type: 'contribution',
      subject_id: contribution.id,
      detail: { email: contribution.person.email },
    });
    return NextResponse.json({ ok: true });
  });
}
