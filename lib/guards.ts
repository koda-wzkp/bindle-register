import { BindleConfig } from '@bindle/core';

/**
 * DECIDE-01 — the namespace segment is unresolved and ships as 'TBD'.
 * Until it is resolved, BUIDs must not leave the building: no email may
 * contain one, and no signer-facing surface may render one. Internal admin
 * views may display them. Flip by changing NAMESPACE_SEGMENT in
 * @bindle/core config once the watershed framing is confirmed.
 */
export function buidShareable(): boolean {
  return (BindleConfig.NAMESPACE_SEGMENT as string) !== 'TBD';
}

/**
 * DECIDE-04 — the consent copy has not had legal review. Until
 * CONSENT_TEXT_REVIEWED=true is set, signature collection is blocked in
 * production deployments. Sandbox/UAT (non-production) can sign with dummy
 * data so the flow stays testable.
 */
export function signatureCollectionBlocked(): { blocked: boolean; reason?: string } {
  const reviewed = process.env.CONSENT_TEXT_REVIEWED === 'true';
  // On Vercel, VERCEL_ENV distinguishes production from preview (NODE_ENV is
  // 'production' for both, and previews are the UAT surface). Elsewhere,
  // NODE_ENV decides.
  const isProduction = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === 'production'
    : process.env.NODE_ENV === 'production';
  if (!reviewed && isProduction) {
    return {
      blocked: true,
      reason:
        'Signature collection is disabled: the consent text is pending legal review (DECIDE-04). Set CONSENT_TEXT_REVIEWED=true once counsel signs off.',
    };
  }
  return { blocked: false };
}
