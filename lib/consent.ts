import { BindleConfig } from '@bindle/core';

/**
 * E-sign consent copy, versioned via BindleConfig.CONSENT_TEXT_VERSION.
 * DECIDE-04: this text goes to legal review before UAT; bump the version in
 * @bindle/core config whenever a word of it changes.
 */
export const CONSENT_TEXT_VERSION = BindleConfig.CONSENT_TEXT_VERSION;

export const CONSENT_TEXT = `By typing my full legal name below and submitting this form, I confirm that:

1. I have reviewed the complete split table, pool definition, and commons allocation for this production as shown on this page.
2. I consent to the share allocated to me and to the shares allocated to every other named contributor.
3. I intend my typed name to act as my electronic signature under the U.S. ESIGN Act and UETA, with the same force as a handwritten signature.
4. I understand the signed terms are identified by a cryptographic content hash recorded with my signature, and that once every contributor has signed, the record is frozen; changes afterward require a new revision signed by everyone.
5. I understand I may withdraw before the record is frozen by asking the production admin to void this signing round, which discards all collected signatures.`;
