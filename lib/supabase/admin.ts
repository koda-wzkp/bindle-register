import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requiredEnv } from '@/lib/env';

/**
 * Service-role client. Server-only by import guard; never reaches a client
 * bundle. All mutations flow through route handlers using this client or the
 * sanctioned SQL functions — the append-only guard triggers still apply to it.
 */
export function supabaseAdmin() {
  return createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
