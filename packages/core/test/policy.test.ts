import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BINDLE_COMMONS_POLICY } from '../src/index.js';

/**
 * Policy presets are append-only: the hash on every registration covers the
 * policy id, so an id's values may never change once it exists. If either
 * test below fails, do NOT update the expectation — mint a new policy id
 * and leave bindle-commons-v1 exactly as it is.
 */
describe('bindle-commons-v1 preset is pinned', () => {
  it('matches its committed literal values exactly', () => {
    // Inline literals AND a committed fixture: editing the preset must fail
    // CI even if someone also edits one of the two expectations.
    expect(BINDLE_COMMONS_POLICY).toEqual({
      id: 'bindle-commons-v1',
      commonsFloorBps: 500,
      principalCapBps: 4900,
      soloMaxBps: 8500,
    });

    const fixture = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'policy-bindle-commons-v1.json'),
        'utf8',
      ),
    );
    expect(BINDLE_COMMONS_POLICY).toEqual(fixture.policy);
  });

  it('is frozen at runtime', () => {
    expect(Object.isFrozen(BINDLE_COMMONS_POLICY)).toBe(true);
    expect(() => {
      (BINDLE_COMMONS_POLICY as { commonsFloorBps: number }).commonsFloorBps = 0;
    }).toThrow(TypeError);
  });
});
