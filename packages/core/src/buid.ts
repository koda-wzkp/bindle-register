import { BindleConfig } from './config.js';

const SEP = '::';

/** First `chars` characters of a full lowercase-hex content hash. */
export function shortHash(contentHash: string, chars: number = BindleConfig.HASH_DISPLAY_CHARS): string {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    throw new Error('contentHash must be 64 lowercase hex chars (full SHA-256)');
  }
  if (chars < BindleConfig.HASH_DISPLAY_CHARS || chars > contentHash.length) {
    throw new Error(`short hash length out of range: ${chars}`);
  }
  return contentHash.slice(0, chars);
}

export interface MintBuidOptions {
  contentHash: string;
  revision: number;
  /**
   * Full content hash of the parent registration, or null for a root
   * production. The lineage segment is the parent's short hash; roots use the
   * literal `ROOT`.
   */
  parentContentHash?: string | null;
  /**
   * Length of this record's short-hash segment. Defaults to
   * HASH_DISPLAY_CHARS; on a BUID unique-constraint collision, callers retry
   * with +2 until the constraint clears. The full hash is always the source
   * of truth.
   */
  shortChars?: number;
  medium?: string;
  namespace?: string;
}

/** BUID = BNDL::{MEDIUM}::{NAMESPACE}::{ROOT | parent short-hash}::R{revision}::{short-hash} */
export function mintBuid(opts: MintBuidOptions): string {
  const {
    contentHash,
    revision,
    parentContentHash = null,
    shortChars = BindleConfig.HASH_DISPLAY_CHARS,
    medium = BindleConfig.MEDIUM_SEGMENT,
    namespace = BindleConfig.NAMESPACE_SEGMENT,
  } = opts;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`revision must be a non-negative integer, got ${revision}`);
  }
  const lineage = parentContentHash === null ? 'ROOT' : shortHash(parentContentHash);
  return [
    BindleConfig.PROTOCOL_SEGMENT,
    medium,
    namespace,
    lineage,
    `R${revision}`,
    shortHash(contentHash, shortChars),
  ].join(SEP);
}

export interface ParsedBuid {
  protocol: string;
  medium: string;
  namespace: string;
  lineage: string; // 'ROOT' or the parent's short hash
  revision: number;
  short: string;
}

export function parseBuid(buid: string): ParsedBuid {
  const parts = buid.split(SEP);
  if (parts.length !== 6) throw new Error(`malformed BUID (expected 6 segments): ${buid}`);
  const [protocol, medium, namespace, lineage, rev, short] = parts;
  const revMatch = /^R(\d+)$/.exec(rev);
  if (!revMatch) throw new Error(`malformed BUID revision segment: ${rev}`);
  return { protocol, medium, namespace, lineage, revision: Number(revMatch[1]), short };
}
