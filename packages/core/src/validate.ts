import { BindleConfig } from './config.js';
import type { BindlePolicy } from './policy.js';
import type { ValidationError } from './types.js';

/**
 * No node imports in this module: the client mirrors it for live UX in the
 * admin builder. Server-side enforcement is the real gate.
 *
 * Protocol invariants (integer bps, exact TOTAL_BPS, named commons
 * recipient, well-formed contributors, real pool definition) always apply.
 * Split-shape rules (commons floor, principal/solo caps) come from the
 * explicit policy argument — see policy.ts for why.
 */

export interface ContributorForValidation {
  name: string;
  email: string;
  role: string;
  bps: number;
  principal: boolean;
}

export interface ProductionForValidation {
  title: string;
  pool_definition: string;
  commons_recipient: string;
  commons_bps: number;
  contributors: ContributorForValidation[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_POOL_DEFINITION_CHARS = 40;

export function validateProduction(
  p: ProductionForValidation,
  policy: BindlePolicy,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const err = (code: string, message: string, field?: string) =>
    errors.push({ code, message, field });

  if (!p.title || p.title.trim() === '') {
    err('title_required', 'Title is required.', 'title');
  }

  // Rule 7 — a real pool definition, not "TBD"
  if (!p.pool_definition || p.pool_definition.trim().length < MIN_POOL_DEFINITION_CHARS) {
    err(
      'pool_definition_too_short',
      `Pool definition must be at least ${MIN_POOL_DEFINITION_CHARS} characters — define what dollars enter the pool and what comes off the top.`,
      'pool_definition',
    );
  }

  // Rule 3 — commons floor (policy) and named recipient (protocol)
  if (!p.commons_recipient || p.commons_recipient.trim() === '') {
    err('commons_recipient_required', 'Commons recipient must be named.', 'commons_recipient');
  }
  if (!Number.isInteger(p.commons_bps)) {
    err('commons_bps_not_integer', 'Commons share must be an integer number of basis points.', 'commons_bps');
  } else if (p.commons_bps < policy.commonsFloorBps) {
    err(
      'commons_below_floor',
      `Commons share must be at least ${policy.commonsFloorBps} bps (${policy.commonsFloorBps / 100}%) under the ${policy.id} policy.`,
      'commons_bps',
    );
  }

  if (p.contributors.length === 0) {
    err('contributors_required', 'At least one contributor is required.', 'contributors');
  }

  // Rules 1 and 6 — per-contributor integrity
  let sum = 0;
  let allBpsValid = true;
  p.contributors.forEach((c, i) => {
    if (!Number.isInteger(c.bps) || c.bps <= 0) {
      allBpsValid = false;
      err(
        'bps_invalid',
        `Contributor ${i + 1}: share must be an integer number of basis points greater than zero.`,
        `contributors.${i}.bps`,
      );
    } else {
      sum += c.bps;
    }
    if (!c.name || c.name.trim() === '') {
      err('contributor_name_required', `Contributor ${i + 1}: name is required.`, `contributors.${i}.name`);
    }
    if (!c.role || c.role.trim() === '') {
      err('contributor_role_required', `Contributor ${i + 1}: role is required.`, `contributors.${i}.role`);
    }
    if (!c.email || !EMAIL_RE.test(c.email)) {
      err('contributor_email_invalid', `Contributor ${i + 1}: a valid email is required.`, `contributors.${i}.email`);
    }
  });

  // Rule 2 — exact total (only meaningful once individual bps are sane)
  if (allBpsValid && Number.isInteger(p.commons_bps) && p.contributors.length > 0) {
    const total = sum + p.commons_bps;
    if (total !== BindleConfig.TOTAL_BPS) {
      err(
        'total_mismatch',
        `Contributor shares plus commons must equal exactly ${BindleConfig.TOTAL_BPS} bps; currently ${total}.`,
        'total',
      );
    }
  }

  // Rules 4 and 5 — policy caps
  if (p.contributors.length > 1) {
    p.contributors.forEach((c, i) => {
      if (c.principal && Number.isInteger(c.bps) && c.bps > policy.principalCapBps) {
        err(
          'principal_over_cap',
          `Contributor ${i + 1}: principal contributors are capped at ${policy.principalCapBps} bps on collaborative works under the ${policy.id} policy.`,
          `contributors.${i}.bps`,
        );
      }
    });
  } else if (p.contributors.length === 1) {
    const c = p.contributors[0];
    if (Number.isInteger(c.bps) && c.bps > policy.soloMaxBps) {
      err(
        'solo_over_max',
        `Solo works are capped at ${policy.soloMaxBps} bps under the ${policy.id} policy.`,
        'contributors.0.bps',
      );
    }
  }

  return errors;
}

export interface RegistrationReadiness {
  status: string;
  contributionCount: number;
  /** content_hash recorded on each collected signature */
  signatureHashes: string[];
  /** canonical content hash of the production's current terms */
  currentContentHash: string;
}

/**
 * Rule 8 — the tamper guard. Registration requires open_for_signing status,
 * a signature per contribution, and every signature's content_hash matching
 * the current canonical hash. If terms somehow mutated after someone signed,
 * their signature no longer matches and registration is blocked.
 * Protocol invariant — not policy.
 */
export function validateRegistrationReadiness(r: RegistrationReadiness): ValidationError[] {
  const errors: ValidationError[] = [];
  if (r.status !== 'open_for_signing') {
    errors.push({
      code: 'wrong_status',
      message: `Registration requires status open_for_signing; current status is ${r.status}.`,
    });
  }
  if (r.signatureHashes.length !== r.contributionCount) {
    errors.push({
      code: 'signatures_incomplete',
      message: `Every contributor must sign: ${r.signatureHashes.length} of ${r.contributionCount} signatures collected.`,
    });
  }
  const stale = r.signatureHashes.filter((h) => h !== r.currentContentHash);
  if (stale.length > 0) {
    errors.push({
      code: 'signature_hash_mismatch',
      message: `${stale.length} signature(s) attest to a different content hash than the current terms. Registration blocked.`,
    });
  }
  return errors;
}
