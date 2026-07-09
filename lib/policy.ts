import { BINDLE_COMMONS_POLICY, type BindlePolicy } from '@bindle/core';

/**
 * The split-shape policy this deployment registers under. Puddletown uses
 * Bindle's music-commons preset (≥5% commons, ≤49% principal cap). The id is
 * hashed into every canonical payload and stored on the registration row —
 * changing policy never rewrites history, it only applies to new records.
 */
export const INSTANCE_POLICY: BindlePolicy = BINDLE_COMMONS_POLICY;
