import { describe, expect, it } from 'vitest';
import { BindleConfig, validateProduction, validateRegistrationReadiness } from '../src/index.js';
import type { ProductionForValidation } from '../src/index.js';

const POOL =
  'Earned-revenue surplus from the run, less royalties, venue rental, and the capped expense list.';

function collaborative(overrides: Partial<ProductionForValidation> = {}): ProductionForValidation {
  return {
    title: 'Floyd Collins',
    pool_definition: POOL,
    commons_recipient: 'Puddletown Commons Fund',
    commons_bps: 500,
    contributors: [
      { name: 'Morgan Ellery', email: 'morgan@example.org', role: 'Director', bps: 4750, principal: true },
      { name: 'Chase Whitfield', email: 'chase@example.org', role: 'Music Director', bps: 4750, principal: true },
    ],
    ...overrides,
  };
}

const codes = (p: ProductionForValidation) => validateProduction(p).map((e) => e.code);

describe('validateProduction', () => {
  it('passes a well-formed collaborative production', () => {
    expect(validateProduction(collaborative())).toEqual([]);
  });

  it('rule 1: rejects zero, negative, and fractional bps', () => {
    for (const bps of [0, -100, 12.5]) {
      const p = collaborative();
      p.contributors[0].bps = bps;
      expect(codes(p)).toContain('bps_invalid');
    }
  });

  it('rule 2: rejects totals that do not equal TOTAL_BPS exactly', () => {
    const p = collaborative();
    p.contributors[0].bps = 4749;
    expect(codes(p)).toContain('total_mismatch');
  });

  it('rule 3: enforces the commons floor and named recipient', () => {
    const low = collaborative({ commons_bps: BindleConfig.COMMONS_FLOOR_BPS - 1 });
    expect(codes(low)).toContain('commons_below_floor');
    const unnamed = collaborative({ commons_recipient: '  ' });
    expect(codes(unnamed)).toContain('commons_recipient_required');
  });

  it('rule 4: caps principals on collaborative works', () => {
    const p = collaborative();
    p.contributors[0].bps = BindleConfig.PRINCIPAL_CAP_BPS + 100;
    p.contributors[1].bps =
      BindleConfig.TOTAL_BPS - 500 - p.contributors[0].bps;
    expect(codes(p)).toContain('principal_over_cap');
  });

  it('rule 4 does not cap non-principals', () => {
    const p = collaborative();
    p.contributors[0].principal = false;
    p.contributors[0].bps = 5000;
    p.contributors[1].bps = 4500;
    expect(validateProduction(p)).toEqual([]);
  });

  it('rule 5: caps solo works at SOLO_MAX_BPS', () => {
    const solo = collaborative({
      commons_bps: 1000,
      contributors: [
        { name: 'Morgan Ellery', email: 'morgan@example.org', role: 'Author', bps: 9000, principal: true },
      ],
    });
    expect(codes(solo)).toContain('solo_over_max');
    const ok = collaborative({
      commons_bps: 1500,
      contributors: [
        { name: 'Morgan Ellery', email: 'morgan@example.org', role: 'Author', bps: 8500, principal: true },
      ],
    });
    expect(validateProduction(ok)).toEqual([]);
  });

  it('rule 6: requires name, valid email, and role', () => {
    const p = collaborative();
    p.contributors[0].name = '';
    p.contributors[0].email = 'not-an-email';
    p.contributors[1].role = ' ';
    const found = codes(p);
    expect(found).toContain('contributor_name_required');
    expect(found).toContain('contributor_email_invalid');
    expect(found).toContain('contributor_role_required');
  });

  it('rule 7: rejects a pool definition under 40 chars', () => {
    expect(codes(collaborative({ pool_definition: 'TBD' }))).toContain('pool_definition_too_short');
  });

  it('rejects an empty contributor list', () => {
    expect(codes(collaborative({ contributors: [] }))).toContain('contributors_required');
  });
});

describe('validateRegistrationReadiness (rule 8)', () => {
  const HASH = 'ab'.repeat(32);

  it('passes when all signatures match the current hash', () => {
    expect(
      validateRegistrationReadiness({
        status: 'open_for_signing',
        contributionCount: 2,
        signatureHashes: [HASH, HASH],
        currentContentHash: HASH,
      }),
    ).toEqual([]);
  });

  it('blocks wrong status', () => {
    const errors = validateRegistrationReadiness({
      status: 'draft',
      contributionCount: 0,
      signatureHashes: [],
      currentContentHash: HASH,
    });
    expect(errors.map((e) => e.code)).toContain('wrong_status');
  });

  it('blocks incomplete signatures', () => {
    const errors = validateRegistrationReadiness({
      status: 'open_for_signing',
      contributionCount: 3,
      signatureHashes: [HASH],
      currentContentHash: HASH,
    });
    expect(errors.map((e) => e.code)).toContain('signatures_incomplete');
  });

  it('blocks when any signature attests to a different hash — the tamper guard', () => {
    const errors = validateRegistrationReadiness({
      status: 'open_for_signing',
      contributionCount: 2,
      signatureHashes: [HASH, 'cd'.repeat(32)],
      currentContentHash: HASH,
    });
    expect(errors.map((e) => e.code)).toContain('signature_hash_mismatch');
  });
});
