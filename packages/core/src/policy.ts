/**
 * Split-shape policy: per-instance rules, NOT protocol invariants.
 *
 * The protocol fixes what makes a record verifiable — integer basis points
 * summing to TOTAL_BPS, canonicalization, hashing, BUID grammar, append-only
 * semantics. How a community shapes its splits (commons floor, principal
 * caps) is a policy commitment that legitimately differs by medium: a music
 * venue splitting a door 70/30 between headliner and opener is normal
 * practice, not a violation.
 *
 * The policy id is part of the canonical payload and stored on the
 * registration row, so every record is verifiable against the rules it was
 * actually registered under.
 */
export interface BindlePolicy {
  /** Stable identifier, hashed into the canonical payload. Never reuse an id with different values. */
  id: string;
  /** Minimum commons allocation in basis points. */
  commonsFloorBps: number;
  /** Maximum share for a contributor flagged principal on collaborative works (>1 contributor). */
  principalCapBps: number;
  /** Maximum share for the sole contributor on solo works. */
  soloMaxBps: number;
}

/**
 * Bindle's music-commons commitments: ≥5% commons, ≤49% per principal on
 * collaborative works, ≤85% solo. Puddletown registers under this preset.
 */
export const BINDLE_COMMONS_POLICY: BindlePolicy = {
  id: 'bindle-commons-v1',
  commonsFloorBps: 500,
  principalCapBps: 4_900,
  soloMaxBps: 8_500,
};
