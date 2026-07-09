import { describe, expect, it } from 'vitest';
import { canonicalJson, mintBuid, sha256Hex, verify } from '../src/index.js';
import { loadVectors } from './helpers.js';

describe('verify', () => {
  const { vector } = loadVectors()[0];

  it('verifies a genuine record from object or raw JSON string', () => {
    expect(verify(vector.payload, vector.expected.buid).ok).toBe(true);
    const raw = JSON.stringify(vector.payload);
    expect(verify(raw, vector.expected.buid).ok).toBe(true);
  });

  it('detects tampered terms', () => {
    const tampered = JSON.parse(JSON.stringify(vector.payload));
    tampered.contributors[0].bps += 100;
    const result = verify(tampered, vector.expected.buid);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('content hash mismatch');
  });

  it('detects a BUID whose segments do not match the payload', () => {
    const wrongRev = vector.expected.buid.replace('::R0::', '::R7::');
    const result = verify(vector.payload, wrongRev);
    expect(result.ok).toBe(false);
  });

  it('accepts collision-extended short hashes', () => {
    const json = canonicalJson(vector.payload);
    const hash = sha256Hex(json);
    const extended = mintBuid({ contentHash: hash, revision: 0, shortChars: 12 });
    expect(verify(vector.payload, extended).ok).toBe(true);
  });

  it('reports malformed BUIDs instead of throwing', () => {
    const result = verify(vector.payload, 'garbage');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
