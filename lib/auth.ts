import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { adminEmails } from '@/lib/env';

export interface SessionUser {
  email: string;
  isAdmin: boolean;
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

/** The signed-in user, or null. Uses getUser() (verified against Supabase), not the raw cookie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  return { email, isAdmin: isAdminEmail(email) };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  return user;
}

/** Admin allowlist via env — v1 has no roles table by design. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new HttpError(403, 'This area is for production admins.');
  return user;
}
