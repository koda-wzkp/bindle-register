#!/usr/bin/env node
/**
 * bindle-verify — offline verification of a Bindle registration.
 *
 *   npx bindle-verify <canonical.json> [BUID]
 *
 * The file is the canonical JSON payload emailed at registration, either
 * bare or wrapped as { canonical_json, buid, content_hash } (the record
 * download format). If the BUID isn't embedded, pass it as the second arg.
 */
import { readFileSync } from 'node:fs';
import { verify } from './verify.js';

function fail(msg: string): never {
  console.error(`bindle-verify: ${msg}`);
  process.exit(1);
}

const [, , file, buidArg] = process.argv;
if (!file) fail('usage: bindle-verify <canonical.json> [BUID]');

let raw: string;
try {
  raw = readFileSync(file, 'utf8');
} catch (e) {
  fail(`cannot read ${file}: ${(e as Error).message}`);
}

let parsed: any;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  fail(`not valid JSON: ${(e as Error).message}`);
}

const payload = parsed.canonical_json ?? parsed;
const buid: string | undefined = buidArg ?? parsed.buid;
if (!buid) fail('no BUID: pass it as the second argument or use the wrapped download format');

const result = verify(payload, buid);

console.log(`content hash  ${result.computedHash}`);
console.log(`computed BUID ${result.computedBuid}`);
console.log(`claimed BUID  ${buid}`);
if (parsed.content_hash && parsed.content_hash !== result.computedHash) {
  result.errors.push(`embedded content_hash does not match: ${parsed.content_hash}`);
}
if (result.ok && result.errors.length === 0) {
  console.log('MATCH — record verifies');
  process.exit(0);
} else {
  console.error('MISMATCH');
  for (const err of result.errors) console.error(`  - ${err}`);
  process.exit(1);
}
