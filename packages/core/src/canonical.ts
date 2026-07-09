import canonicalizeImport from 'canonicalize';
import { BindleConfig } from './config.js';

type Jcs = (input: unknown) => string | undefined;
// canonicalize is CJS with `export default` typings; the live binding differs
// between Node ESM and bundler interop, so accept both shapes.
const canonicalize: Jcs =
  ((canonicalizeImport as unknown as { default?: Jcs }).default ??
    canonicalizeImport) as Jcs;
import type { CanonicalContributor, CanonicalProduction } from './types.js';

export interface CanonicalInput {
  org: string;
  title: string;
  parentBuid: string | null;
  revision: number;
  poolDefinition: string;
  commons: { recipient: string; bps: number };
  contributors: Array<{ name: string; role: string; bps: number; principal: boolean }>;
  /** Override config segments only in tests; production code uses config. */
  medium?: string;
  namespace?: string;
}

const nfc = (s: string): string => s.normalize('NFC');

/**
 * Compare by Unicode code point, which is identical to UTF-8 byte order.
 * Plain `<` on JS strings compares UTF-16 code units, which mis-orders
 * astral-plane characters relative to byte order — so we walk code points.
 */
export function compareCodePoints(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const an = ai.next();
    const bn = bi.next();
    if (an.done && bn.done) return 0;
    if (an.done) return -1;
    if (bn.done) return 1;
    const ac = an.value.codePointAt(0)!;
    const bc = bn.value.codePointAt(0)!;
    if (ac !== bc) return ac < bc ? -1 : 1;
  }
}

function sortContributors(contributors: CanonicalContributor[]): CanonicalContributor[] {
  return [...contributors].sort(
    (x, y) => compareCodePoints(x.name, y.name) || compareCodePoints(x.role, y.role),
  );
}

/** Build the canonical payload: NFC-normalize all strings, sort contributors. */
export function buildCanonicalProduction(input: CanonicalInput): CanonicalProduction {
  const contributors = sortContributors(
    input.contributors.map((c) => ({
      name: nfc(c.name),
      role: nfc(c.role),
      bps: c.bps,
      principal: c.principal,
    })),
  );
  return {
    protocol: BindleConfig.PROTOCOL_SEGMENT,
    medium: nfc(input.medium ?? BindleConfig.MEDIUM_SEGMENT),
    namespace: nfc(input.namespace ?? BindleConfig.NAMESPACE_SEGMENT),
    org: nfc(input.org),
    title: nfc(input.title),
    parent_buid: input.parentBuid,
    revision: input.revision,
    pool_definition: nfc(input.poolDefinition),
    commons: { recipient: nfc(input.commons.recipient), bps: input.commons.bps },
    contributors,
  };
}

/**
 * RFC 8785 (JCS) serialization via the maintained `canonicalize` library —
 * key ordering is never hand-rolled here.
 */
export function canonicalJson(payload: CanonicalProduction): string {
  const out = canonicalize(payload);
  if (out === undefined) {
    throw new Error('canonicalize returned undefined — payload is not serializable');
  }
  return out;
}
