import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { glyph } from '../src/index.js';

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex');

describe('glyph', () => {
  it('is pure: 1,000 repeated calls yield byte-identical SVG', () => {
    const hash = hashOf('floyd collins');
    const first = glyph(hash);
    for (let i = 0; i < 1000; i++) {
      expect(glyph(hash)).toBe(first);
    }
  });

  it('distinct hashes yield distinct glyphs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(glyph(hashOf(`production-${i}`)));
    }
    expect(seen.size).toBe(50);
  });

  it('returns standalone monochrome SVG using currentColor', () => {
    const svg = glyph(hashOf('x'));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('currentColor');
    expect(svg).toContain('data-glyph-version="1"');
    // No absolute colors or external references (xmlns is the one allowed URL).
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(|url\(|href/);
  });

  it('rejects input that is not a full lowercase-hex SHA-256', () => {
    expect(() => glyph('abc')).toThrow();
    expect(() => glyph(hashOf('x').toUpperCase())).toThrow();
  });
});
