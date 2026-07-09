import { describe, expect, it } from 'vitest';
import {
  buildCanonicalProduction,
  canonicalJson,
  compareCodePoints,
  sha256Hex,
} from '../src/index.js';
import type { CanonicalInput } from '../src/index.js';

const base: CanonicalInput = {
  org: 'Puddletown Theatre Collective',
  title: 'Floyd Collins',
  parentBuid: null,
  revision: 0,
  policyId: 'bindle-commons-v1',
  poolDefinition: 'Earned-revenue surplus less royalties, venue, and the capped expense list.',
  commons: { recipient: 'Puddletown Commons Fund', bps: 500 },
  contributors: [
    { name: 'Morgan Ellery', role: 'Director', bps: 4750, principal: true },
    { name: 'Chase Whitfield', role: 'Music Director', bps: 4750, principal: true },
  ],
};

describe('buildCanonicalProduction', () => {
  it('NFC-normalizes: composed and decomposed input hash identically', () => {
    const composedName = 'Zo\u00eb \u00c5kesson'; // precomposed
    const decomposedName = 'Zoe\u0308 A\u030akesson'; // combining marks
    expect(composedName).not.toBe(decomposedName);
    const mk = (name: string) => ({
      ...base,
      contributors: [{ name, role: 'Cast', bps: 9500, principal: false }],
    });
    const h1 = sha256Hex(canonicalJson(buildCanonicalProduction(mk(composedName))));
    const h2 = sha256Hex(canonicalJson(buildCanonicalProduction(mk(decomposedName))));
    expect(h1).toBe(h2);
  });

  it('sorts contributors by (name, role) ascending', () => {
    const built = buildCanonicalProduction(base);
    expect(built.contributors.map((c) => c.name)).toEqual(['Chase Whitfield', 'Morgan Ellery']);
  });

  it('breaks name ties by role', () => {
    const built = buildCanonicalProduction({
      ...base,
      contributors: [
        { name: 'Sam Ash', role: 'Stage Manager', bps: 4750, principal: false },
        { name: 'Sam Ash', role: 'Cast', bps: 4750, principal: false },
      ],
    });
    expect(built.contributors.map((c) => c.role)).toEqual(['Cast', 'Stage Manager']);
  });

  it('contributor input order does not change the hash', () => {
    const reversed = { ...base, contributors: [...base.contributors].reverse() };
    expect(sha256Hex(canonicalJson(buildCanonicalProduction(base)))).toBe(
      sha256Hex(canonicalJson(buildCanonicalProduction(reversed))),
    );
  });

  it('canonicalJson is key-order independent (JCS)', () => {
    const a = buildCanonicalProduction(base);
    const shuffled = JSON.parse(
      JSON.stringify({ contributors: a.contributors, title: a.title, ...a }),
    );
    expect(canonicalJson(shuffled)).toBe(canonicalJson(a));
  });
});

describe('compareCodePoints', () => {
  it('orders by code point (UTF-8 byte order), not UTF-16 code units', () => {
    // U+FF21 FULLWIDTH LATIN A vs U+1D400 MATHEMATICAL BOLD A: as UTF-16 code
    // units the surrogate pair (0xD835...) sorts before 0xFF21, but by code
    // point U+FF21 < U+1D400.
    expect(compareCodePoints('Ａ', '\u{1d400}')).toBeLessThan(0);
    expect('Ａ' < '\u{1d400}').toBe(false); // the trap this function avoids
    expect(compareCodePoints('a', 'b')).toBeLessThan(0);
    expect(compareCodePoints('a', 'a')).toBe(0);
    expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0);
  });
});
