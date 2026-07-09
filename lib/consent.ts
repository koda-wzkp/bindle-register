import { BindleConfig } from '@bindle/core';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DECIDE-04 — THIS CONSENT TEXT HAS **NOT** HAD LEGAL REVIEW.
 *
 *  Until counsel signs off and CONSENT_TEXT_REVIEWED=true is set in the
 *  environment, production deployments refuse to record signatures
 *  (enforced in lib/guards.ts → signatureCollectionBlocked, checked by the
 *  signing route). Sandbox/UAT signing with dummy data is allowed.
 *
 *  When a single word of this text changes, bump CONSENT_TEXT_VERSION in
 *  @bindle/core config — signatures record the version they consented to.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const CONSENT_TEXT_VERSION = BindleConfig.CONSENT_TEXT_VERSION;

export const CONSENT_TEXT = `By typing my full legal name below and submitting this form, I confirm that:

1. I have reviewed the complete split table, pool definition, and commons allocation for this production as shown on this page.
2. I consent to the share allocated to me and to the shares allocated to every other named contributor.
3. I intend my typed name to act as my electronic signature under the U.S. ESIGN Act and UETA, with the same force as a handwritten signature.
4. I understand the signed terms are identified by a cryptographic content hash recorded with my signature, and that once every contributor has signed, the record is frozen; changes afterward require a new revision signed by everyone.
5. I understand I may withdraw before the record is frozen by asking the production admin to void this signing round, which discards all collected signatures.`;
