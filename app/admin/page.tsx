import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { getSessionUser } from '@/lib/auth';
import { getOrg } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProductionRow, RegistrationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  if (!user.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const org = await getOrg(db);
  const { data: prods, error } = await db
    .from('productions')
    .select('*')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const productions = (prods ?? []) as ProductionRow[];

  const { data: regs } = await db
    .from('registrations')
    .select('*')
    .in('production_id', productions.map((p) => p.id));
  const regByProduction = new Map(((regs ?? []) as RegistrationRow[]).map((r) => [r.production_id, r]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">{org.name}</h1>
          <p className="text-sm text-ink-soft">Productions and their signing state.</p>
        </div>
        <Link href="/admin/productions/new" className="btn">
          New production
        </Link>
      </div>

      {productions.length === 0 ? (
        <div className="border border-rule p-8 text-center">
          <p className="font-display text-lg">No productions yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Create one, name the contributors, set the split, and open it for signing.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {productions.map((p) => {
            const reg = regByProduction.get(p.id);
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/productions/${p.id}`} className="font-display hover:text-prompt">
                    {p.title}
                    <span className="ml-2 font-mono text-xs text-ink-soft">R{p.revision}</span>
                  </Link>
                  <StatusBadge status={p.status} />
                </div>
                {reg && (
                  <Link
                    href={`/p/${encodeURIComponent(reg.buid)}`}
                    className="font-mono text-xs text-prompt underline"
                  >
                    {reg.buid}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
