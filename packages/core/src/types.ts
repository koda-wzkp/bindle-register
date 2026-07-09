/** The exact shape that gets JCS-serialized and hashed. Terms only — never signatures. */
export interface CanonicalContributor {
  name: string;
  role: string;
  bps: number;
  principal: boolean;
}

export interface CanonicalProduction {
  protocol: 'BNDL';
  medium: string; // config.MEDIUM_SEGMENT
  namespace: string; // config.NAMESPACE_SEGMENT
  org: string; // organization name, NFC-normalized
  title: string; // NFC-normalized
  parent_buid: string | null; // null for ROOT
  revision: number;
  pool_definition: string;
  commons: { recipient: string; bps: number };
  contributors: CanonicalContributor[]; // sorted by (name, role) ascending, code point order
}

export interface ValidationError {
  code: string;
  message: string;
  /** Dot-path hint for the UI, e.g. "contributors.2.bps" */
  field?: string;
}
