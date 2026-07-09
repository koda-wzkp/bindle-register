import { describe, expect, it } from 'vitest';
import { mintBuid, parseBuid, shortHash } from '../src/index.js';

const HASH_A = 'a1b2c3d4'.padEnd(64, '0');
const HASH_B = 'ffee0011'.padEnd(64, '9');

describe('mintBuid', () => {
  it('mints a root BUID with literal ROOT lineage', () => {
    expect(mintBuid({ contentHash: HASH_A, revision: 0 })).toBe(
      'BNDL::PROD::TBD::ROOT::R0::a1b2c3d4',
    );
  });

  it('mints an amendment BUID whose lineage is the parent short hash', () => {
    expect(
      mintBuid({ contentHash: HASH_B, revision: 1, parentContentHash: HASH_A }),
    ).toBe('BNDL::PROD::TBD::a1b2c3d4::R1::ffee0011');
  });

  it('extends the short hash on collision retry', () => {
    expect(mintBuid({ contentHash: HASH_A, revision: 0, shortChars: 10 })).toBe(
      'BNDL::PROD::TBD::ROOT::R0::a1b2c3d400',
    );
  });

  it('rejects negative or fractional revisions', () => {
    expect(() => mintBuid({ contentHash: HASH_A, revision: -1 })).toThrow();
    expect(() => mintBuid({ contentHash: HASH_A, revision: 0.5 })).toThrow();
  });
});

describe('shortHash', () => {
  it('rejects non-hash input', () => {
    expect(() => shortHash('not-a-hash')).toThrow();
    expect(() => shortHash(HASH_A.toUpperCase())).toThrow();
  });

  it('rejects lengths below the configured display length', () => {
    expect(() => shortHash(HASH_A, 4)).toThrow();
  });
});

describe('parseBuid', () => {
  it('round-trips a minted BUID', () => {
    const buid = mintBuid({ contentHash: HASH_B, revision: 3, parentContentHash: HASH_A });
    expect(parseBuid(buid)).toEqual({
      protocol: 'BNDL',
      medium: 'PROD',
      namespace: 'TBD',
      lineage: 'a1b2c3d4',
      revision: 3,
      short: 'ffee0011',
    });
  });

  it('rejects malformed BUIDs', () => {
    expect(() => parseBuid('BNDL::PROD::TBD::ROOT::R0')).toThrow();
    expect(() => parseBuid('BNDL::PROD::TBD::ROOT::zero::a1b2c3d4')).toThrow();
  });
});
