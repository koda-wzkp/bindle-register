import { NextResponse } from 'next/server';
import { handle, jsonError, safeNextPath } from '@/lib/api';
import { isAdminEmail } from '@/lib/auth';
import { sendLoginLink } from '@/lib/email';
import { generateMagicLink } from '@/lib/magiclink';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Email a sign-in link. Only admins and people already named in a production
 * can sign in — there is nothing here for anyone else. The response never
 * reveals whether an email is known.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const next = safeNextPath(body?.next, '/');
    if (!email || !email.includes('@')) return jsonError(400, 'Enter the email address you use with this theatre.');

    let known = isAdminEmail(email);
    if (!known) {
      const { data } = await supabaseAdmin().from('people').select('id').eq('email', email).maybeSingle();
      known = Boolean(data);
    }
    if (known) {
      const link = await generateMagicLink(email, next);
      await sendLoginLink({ to: email, link });
    }
    return NextResponse.json({ ok: true });
  });
}
