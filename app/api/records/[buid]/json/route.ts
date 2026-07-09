import { canonicalJson, type CanonicalProduction } from '@bindle/core';
import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getProductionDetail, getRegistrationByBuid } from '@/lib/db';
import { buidShareable } from '@/lib/guards';

export const dynamic = 'force-dynamic';

/**
 * Download the canonical JSON for a registered record, wrapped with its BUID
 * and content hash so `npx bindle-verify <file>` works with no extra args.
 * Access: signers of the production and admins (Phase 1; DECIDE-05).
 */
export async function GET(_request: Request, { params }: { params: { buid: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const buid = decodeURIComponent(params.buid);
    const registration = await getRegistrationByBuid(buid);
    if (!registration) return jsonError(404, 'No registered record has this identifier.');

    if (!user.isAdmin) {
      const detail = await getProductionDetail(registration.production_id);
      const isSigner = detail?.contributions.some(
        (c) => c.person.email.toLowerCase() === user.email,
      );
      if (!isSigner) return jsonError(403, 'This record is visible to its signers and admins.');
    }

    // jsonb storage does not preserve byte order; re-canonicalize (JCS is
    // deterministic, so this reproduces the exact hashed bytes).
    const payload = registration.canonical_json as CanonicalProduction;
    // DECIDE-01: while the namespace is TBD the BUID stays off signer
    // downloads; the canonical JSON + content hash remain fully verifiable.
    const includeBuid = buidShareable() || user.isAdmin;
    const body = JSON.stringify(
      {
        ...(includeBuid ? { buid: registration.buid } : {}),
        content_hash: registration.content_hash,
        policy: registration.policy,
        canonical_json: JSON.parse(canonicalJson(payload)),
      },
      null,
      2,
    );

    return new NextResponse(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="bindle-${registration.content_hash.slice(0, 8)}.json"`,
      },
    });
  });
}
