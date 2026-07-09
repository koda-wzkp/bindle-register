/**
 * Bindle protocol constants. Validation and PUID minting read only from this
 * module so deployment-specific tuning never forks logic.
 */
export const BindleConfig = {
  TOTAL_BPS: 10_000, // splits are integer basis points; floats forbidden
  COMMONS_FLOOR_BPS: 500, // ≥5% commons, per Bindle locked economics
  PRINCIPAL_CAP_BPS: 4_900, // ≤49% per principal contributor on collaborative works
  SOLO_MAX_BPS: 8_500, // 85% max on solo works (theatre: effectively unused, keep for parity)
  PROTOCOL_SEGMENT: 'BNDL',
  MEDIUM_SEGMENT: 'PROD', // DECIDE-02
  NAMESPACE_SEGMENT: 'TBD', // DECIDE-01 — do not ship a watershed code until resolved
  HASH_DISPLAY_CHARS: 8, // short form; full SHA-256 always stored
  CONSENT_TEXT_VERSION: 'v1.0', // bump whenever legal consent copy changes
} as const;

export type BindleConfigType = typeof BindleConfig;
