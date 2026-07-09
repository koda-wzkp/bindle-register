import { canonicalJson } from './canonical.js';
import { BindleConfig } from './config.js';
import { mintBuid, parseBuid } from './buid.js';
import { sha256Hex } from './hash.js';
import type { CanonicalProduction } from './types.js';

export interface VerifyResult {
  ok: boolean;
  computedHash: string;
  computedBuid: string;
  errors: string[];
}

/**
 * The auditability promise in executable form: anyone holding the canonical
 * JSON can recompute the content hash and BUID offline and compare them to
 * the record they were given. No server, no database, no trust required.
 *
 * Accepts the payload as an object or a raw JSON string. String input is
 * parsed and re-canonicalized (RFC 8785 is idempotent over its own output,
 * so a faithful copy of the emailed file verifies byte-for-byte).
 */
export function verify(payload: CanonicalProduction | string, buid: string): VerifyResult {
  const errors: string[] = [];
  const obj: CanonicalProduction = typeof payload === 'string' ? JSON.parse(payload) : payload;

  const json = canonicalJson(obj);
  const computedHash = sha256Hex(json);

  let claimed;
  try {
    claimed = parseBuid(buid);
  } catch (e) {
    return {
      ok: false,
      computedHash,
      computedBuid: '',
      errors: [(e as Error).message],
    };
  }

  // The record's short segment may have been collision-extended past
  // HASH_DISPLAY_CHARS; recompute at the claimed length, then check segments.
  const shortChars = Math.max(claimed.short.length, BindleConfig.HASH_DISPLAY_CHARS);
  let parentShort: string | null = null;
  if (obj.parent_buid != null) {
    try {
      parentShort = parseBuid(obj.parent_buid).short.slice(0, BindleConfig.HASH_DISPLAY_CHARS);
    } catch (e) {
      errors.push(`parent_buid is malformed: ${(e as Error).message}`);
    }
  }

  const computedBuid = [
    obj.protocol,
    obj.medium,
    obj.namespace,
    parentShort === null ? 'ROOT' : parentShort,
    `R${obj.revision}`,
    computedHash.slice(0, shortChars),
  ].join('::');

  if (claimed.protocol !== obj.protocol) errors.push(`protocol segment mismatch: ${claimed.protocol} vs ${obj.protocol}`);
  if (claimed.medium !== obj.medium) errors.push(`medium segment mismatch: ${claimed.medium} vs ${obj.medium}`);
  if (claimed.namespace !== obj.namespace) errors.push(`namespace segment mismatch: ${claimed.namespace} vs ${obj.namespace}`);
  if (claimed.revision !== obj.revision) errors.push(`revision mismatch: R${claimed.revision} vs R${obj.revision}`);
  const expectedLineage = parentShort === null ? 'ROOT' : parentShort;
  if (claimed.lineage !== expectedLineage) errors.push(`lineage segment mismatch: ${claimed.lineage} vs ${expectedLineage}`);
  if (claimed.short.length < BindleConfig.HASH_DISPLAY_CHARS) {
    errors.push(`short-hash segment too short: ${claimed.short}`);
  }
  if (!computedHash.startsWith(claimed.short)) {
    errors.push(
      `content hash mismatch: BUID claims ${claimed.short}…, canonical JSON hashes to ${computedHash.slice(0, shortChars)}…`,
    );
  }

  return { ok: errors.length === 0, computedHash, computedBuid, errors };
}

export { mintBuid };
