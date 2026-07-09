import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { getSessionUser } from '@/lib/auth';
import { buidShareable } from '@/lib/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProductionRow, RegistrationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="font-display text-3xl leading-tight">
          Register the work.<br />Sign the split. Freeze the record.
        </h1>
        <p className="text-ink-soft">
          A production&rsquo;s profit-sharing terms, consented to by every named contributor,
          hashed into a permanent identifier anyone can verify offline. No tokens, no
          casino — a ledger for the company.
        </p>
        <Link href="/login" className="btn">Sign in</Link>
      </div>
    );
  }
  if (user.isAdmin) redirect('/admin');

  // A signer's home: the productions they're named in.
  const db = supabaseAdmin();
  const { data: person } = await db.from('people').select('id').eq('email', user.email).maybeSingle();
  let productions: ProductionRow[] = [];
  let registrationsByProduction = new Map<string, RegistrationRow>();
  if (person) {
    const { data: contributions } = await db
      .from('contributions')
      .select('production_id')
      .eq('person_id', (person as { id: string }).id);
    const ids = (contributions ?? []).map((c) => (c as { production_id: string }).production_id);
    if (ids.length > 0) {
      const { data: prods } = await db.from('productions').select('*').in('id', ids).order('created_at', { ascending: false });
      productions = (prods ?? []) as ProductionRow[];
      const { data: regs } = await db.from('registrations').select('*').in('production_id', ids);
      registrationsByProduction = new Map(
        ((regs ?? []) as RegistrationRow[]).map((r) => [r.production_id, r]),
      );
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Your productions</h1>
      {productions.length === 0 ? (
        <p className="text-ink-soft">
          Nothing here yet. When a production names you as a contributor, the signing invitation
          arrives by email.
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {productions.map((p) => {
            const reg = registrationsByProduction.get(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <span className="font-display">{p.title}</span>
                <span className="flex items-center gap-3">
                  {reg &&
                    (buidShareable() ? (
                      <Link href={`/p/${encodeURIComponent(reg.buid)}`} className="font-mono text-xs text-prompt underline">
                        {reg.buid}
                      </Link>
                    ) : (
                      <span className="font-mono text-[11px] text-ink-soft">identifier pending namespace</span>
                    ))}
                  <StatusBadge status={p.status} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
