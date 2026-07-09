import { redirect } from 'next/navigation';
import { ProductionBuilder } from '@/components/ProductionBuilder';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function NewProductionPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin/productions/new');
  if (!user.isAdmin) redirect('/');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl">New production</h1>
        <p className="text-sm text-ink-soft">
          Name the work, define the pool, and allocate every basis point. Shares are integers —
          10,000 bps is the whole pie, commons included.
        </p>
      </div>
      <ProductionBuilder />
    </div>
  );
}
