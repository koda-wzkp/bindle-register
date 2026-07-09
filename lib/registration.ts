import 'server-only';
import { BindleConfig, glyph, mintBuid, validateRegistrationReadiness } from '@bindle/core';
import { canonicalTerms } from '@/lib/canonical';
import { getProductionDetail } from '@/lib/db';
import { sendRegistrationEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProductionDetail } from '@/lib/types';

/**
 * Registration (spec §9.3). Called after each signature lands; a no-op until
 * the final one. The database function re-checks rule 8 and performs the
 * insert + status transitions + audit entry in one transaction; this module
 * computes the canonical payload, hash, BUID, and glyph, and sends the
 * registration emails after commit.
 */
export async function maybeRegister(productionId: string): Promise<{ registered: boolean; buid?: string }> {
  const detail = await getProductionDetail(productionId);
  if (!detail) throw new Error(`production ${productionId} not found`);
  const { production, contributions } = detail;

  const signatures = contributions.filter((c) => c.signature !== null);
  if (production.status !== 'open_for_signing' || signatures.length !== contributions.length) {
    return { registered: false };
  }

  const terms = canonicalTerms(detail);
  const readiness = validateRegistrationReadiness({
    status: production.status,
    contributionCount: contributions.length,
    signatureHashes: signatures.map((c) => c.signature!.content_hash),
    currentContentHash: terms.contentHash,
  });
  if (readiness.length > 0) {
    throw new Error(`registration blocked: ${readiness.map((e) => e.message).join(' ')}`);
  }

  const glyphSvg = glyph(terms.contentHash);
  const admin = supabaseAdmin();

  // Short-hash collisions trip the BUID unique constraint; extend by 2 and retry.
  let buid = '';
  let registered = false;
  for (
    let shortChars = BindleConfig.HASH_DISPLAY_CHARS;
    shortChars <= 64 && !registered;
    shortChars += 2
  ) {
    buid = mintBuid({
      contentHash: terms.contentHash,
      revision: production.revision,
      parentContentHash: detail.parentRegistration?.content_hash ?? null,
      shortChars,
    });
    const { error } = await admin.rpc('register_production', {
      p_production_id: production.id,
      p_canonical_json: terms.payload,
      p_content_hash: terms.contentHash,
      p_buid: buid,
      p_glyph_svg: glyphSvg,
      p_actor: 'system',
    });
    if (!error) {
      registered = true;
    } else if (error.code === '23505' && /buid/.test(error.message)) {
      continue;
    } else {
      throw new Error(`register_production failed: ${error.message}`);
    }
  }
  if (!registered) throw new Error('could not mint a unique BUID');

  await sendRegistrationEmails(detail, buid, terms.json, glyphSvg);
  return { registered: true, buid };
}

async function sendRegistrationEmails(
  detail: ProductionDetail,
  buid: string,
  canonicalJson: string,
  glyphSvg: string,
): Promise<void> {
  const recordUrl = `${appUrl()}/p/${encodeURIComponent(buid)}`;
  const recipients = detail.contributions.map((c) => ({
    email: c.person.email,
    name: c.person.full_name,
  }));
  for (const adminEmail of (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)) {
    if (!recipients.some((r) => r.email.toLowerCase() === adminEmail.toLowerCase())) {
      recipients.push({ email: adminEmail, name: 'Production admin' });
    }
  }

  const failures: string[] = [];
  for (const r of recipients) {
    try {
      await sendRegistrationEmail({
        to: r.email,
        name: r.name,
        title: detail.production.title,
        buid,
        recordUrl,
        canonicalJson,
        glyphSvg,
      });
    } catch (e) {
      failures.push(`${r.email}: ${(e as Error).message}`);
    }
  }
  if (failures.length > 0) {
    // The registration itself is committed and immutable; surface mail
    // failures without pretending the registration failed.
    console.error(`registration ${buid}: ${failures.length} email(s) failed`, failures);
  }
}
