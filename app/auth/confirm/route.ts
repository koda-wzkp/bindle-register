import { NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/api';
import { appUrl } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Magic-link landing: verify the OTP token hash and start the session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const next = safeNextPath(url.searchParams.get('next'), '/');

  if (tokenHash) {
    const supabase = supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, appUrl()));
    }
  }
  const login = new URL('/login', appUrl());
  login.searchParams.set('error', 'expired');
  login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}
