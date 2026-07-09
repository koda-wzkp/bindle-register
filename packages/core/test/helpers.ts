import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CanonicalProduction } from '../src/types.js';

export interface Vector {
  description: string;
  payload: CanonicalProduction;
  expected: {
    content_hash: string;
    buid: string;
  };
}

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), 'vectors');

export function loadVectors(): Array<{ file: string; vector: Vector }> {
  return readdirSync(vectorsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      vector: JSON.parse(readFileSync(join(vectorsDir, file), 'utf8')) as Vector,
    }));
}
