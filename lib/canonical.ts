import 'server-only';
import {
  buildCanonicalProduction,
  canonicalJson,
  sha256Hex,
  type CanonicalProduction,
} from '@bindle/core';
import { INSTANCE_POLICY } from '@/lib/policy';
import type { ProductionDetail } from '@/lib/types';

export interface CanonicalTerms {
  payload: CanonicalProduction;
  json: string;
  contentHash: string;
}

/**
 * The terms currently on the table for a production, as they would be hashed.
 * For an amendment the parent must already be registered — its BUID is part
 * of the child's canonical payload.
 */
export function canonicalTerms(detail: ProductionDetail): CanonicalTerms {
  const { production, org, contributions, parentRegistration } = detail;
  if (production.parent_production_id && !parentRegistration) {
    throw new Error('Amendment cannot be canonicalized until its parent is registered.');
  }
  const payload = buildCanonicalProduction({
    org: org.name,
    title: production.title,
    parentBuid: parentRegistration?.buid ?? null,
    revision: production.revision,
    policyId: INSTANCE_POLICY.id,
    poolDefinition: production.pool_definition,
    commons: { recipient: production.commons_recipient, bps: production.commons_bps },
    contributors: contributions.map((c) => ({
      name: c.person.full_name,
      role: c.role,
      bps: c.share_bps,
      principal: c.is_principal,
    })),
  });
  const json = canonicalJson(payload);
  return { payload, json, contentHash: sha256Hex(json) };
}
