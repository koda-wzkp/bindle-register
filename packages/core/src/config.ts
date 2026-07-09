/**
 * Bindle protocol constants — invariants every implementation shares.
 * Validation and BUID minting read only from this module.
 *
 * Split-shape rules (commons floor, principal caps) are deliberately NOT
 * here: they are per-instance policy, chosen at registration and recorded
 * with the record. See policy.ts.
 */
export const BindleConfig = {
  TOTAL_BPS: 10_000, // splits are integer basis points; floats forbidden
  PROTOCOL_SEGMENT: 'BNDL',
  MEDIUM_SEGMENT: 'PROD', // DECIDE-02
  NAMESPACE_SEGMENT: 'TBD', // DECIDE-01 — do not ship a watershed code until resolved
  HASH_DISPLAY_CHARS: 8, // short form; full SHA-256 always stored
  CONSENT_TEXT_VERSION: 'v1.0', // bump whenever legal consent copy changes
} as const;

export type BindleConfigType = typeof BindleConfig;
