import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';

/**
 * Mint a Supabase OTP magic link for `email`, delivered by us through Resend
 * (not Supabase's mailer). The link lands on our /auth/confirm route, which
 * verifies the token hash server-side and starts the session — no passwords,
 * no accounts for signers to create.
 *
 * Security properties this design relies on (GoTrue-enforced):
 *  - SINGLE-USE: verifyOtp consumes the token hash; a second visit fails and
 *    lands on /login with a fresh-link prompt.
 *  - TTL: set "Email OTP expiration" to 3600s (1 hour) in the Supabase
 *    project's auth settings. One hour is deliberate: the link is a bearer
 *    credential backing legal attribution, so the window stays tight, and
 *    expiry costs a signer almost nothing — the expired link redirects to
 *    /login where they can self-serve a fresh one in one step, and the
 *    admin dashboard has a per-contributor resend. Cast members who open the
 *    email a day later are covered by those two paths, not by a long TTL.
 *  - EMAIL BINDING: the session that verifyOtp creates belongs to the
 *    invited email. The signing route additionally re-checks that the
 *    session email matches the contribution's person before recording, and
 *    the signature row stores the session email (signer_email).
 */
export async function generateMagicLink(email: string, nextPath: string): Promise<string> {
  const admin = supabaseAdmin();

  let linkRes = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkRes.error) {
    // First contact: the auth user doesn't exist yet. Create it confirmed
    // (identity is proven by possession of the emailed link) and retry.
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already/i.test(created.error.message)) {
      throw new Error(`could not provision signer account: ${created.error.message}`);
    }
    linkRes = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkRes.error) throw new Error(`could not generate magic link: ${linkRes.error.message}`);
  }

  const tokenHash = linkRes.data.properties?.hashed_token;
  if (!tokenHash) throw new Error('magic link response missing hashed_token');

  const url = new URL('/auth/confirm', appUrl());
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('next', nextPath);
  return url.toString();
}
