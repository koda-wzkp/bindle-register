import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  DiscardDraftButton,
  ResendLinkButton,
  ReviseButton,
  VoidRoundButton,
} from '@/components/AdminActions';
import { ProductionBuilder } from '@/components/ProductionBuilder';
import { StatusBadge } from '@/components/StatusBadge';
import { getSessionUser } from '@/lib/auth';
import { canonicalTerms } from '@/lib/canonical';
import { getProductionDetail } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ProductionAdminPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/productions/${params.id}`);
  if (!user.isAdmin) redirect('/');

  const detail = await getProductionDetail(params.id);
  if (!detail) notFound();
  const { production, contributions, registration } = detail;

  if (production.status === 'draft') {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">{production.title || 'Untitled production'}</h1>
            <p className="text-sm text-ink-soft">
              Draft{production.revision > 0 ? ` — revision R${production.revision}` : ''}. Terms are editable until signing opens.
            </p>
          </div>
          <span className="flex items-center gap-3">
            <StatusBadge status={production.status} />
            <DiscardDraftButton productionId={production.id} />
          </span>
        </div>
        <ProductionBuilder
          initial={{
            id: production.id,
            title: production.title,
            pool_definition: production.pool_definition,
            commons_recipient: production.commons_recipient,
            commons_bps: production.commons_bps,
            run_opens: production.run_opens,
            run_closes: production.run_closes,
            contributors: contributions.map((c) => ({
              full_name: c.person.full_name,
              email: c.person.email,
              role: c.role,
              share_bps: c.share_bps,
              is_principal: c.is_principal,
            })),
          }}
        />
      </div>
    );
  }

  const signedCount = contributions.filter((c) => c.signature).length;
  const terms = production.status === 'open_for_signing' ? canonicalTerms(detail) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{production.title}</h1>
          <p className="text-sm text-ink-soft">
            Revision R{production.revision}
            {production.run_opens && ` · opens ${production.run_opens}`}
            {production.run_closes && ` · closes ${production.run_closes}`}
          </p>
        </div>
        <StatusBadge status={production.status} />
      </div>

      {production.status === 'open_for_signing' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="eyebrow">Signatures — {signedCount} of {contributions.length}</h2>
            <VoidRoundButton productionId={production.id} />
          </div>
          <ul className="divide-y divide-rule border-y border-rule">
            {contributions.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  {c.person.full_name}
                  <span className="ml-2 text-sm text-ink-soft">{c.role}</span>
                  <span className="ml-2 font-mono text-xs text-ink-soft">{c.person.email}</span>
                </span>
                {c.signature ? (
                  <span className="font-mono text-xs">
                    signed {new Date(c.signature.signed_at).toLocaleString()}
                  </span>
                ) : (
                  <ResendLinkButton
                    productionId={production.id}
                    contributionId={c.id}
                    email={c.person.email}
                  />
                )}
              </li>
            ))}
          </ul>
          {terms && (
            <p className="font-mono text-xs text-ink-soft">
              terms hash {terms.contentHash}
            </p>
          )}
          <p className="max-w-2xl text-xs text-ink-soft">
            The final signature registers the record automatically. To change any term now, void
            the round — every signature is discarded, the event is audit-logged, and the
            production returns to draft.
          </p>
        </section>
      )}

      {(production.status === 'registered' || production.status === 'superseded') && registration && (
        <section className="space-y-4">
          <h2 className="eyebrow">Registered record</h2>
          <p>
            <Link
              href={`/p/${encodeURIComponent(registration.buid)}`}
              className="font-mono text-sm text-prompt underline"
            >
              {registration.buid}
            </Link>
          </p>
          <p className="text-sm text-ink-soft">
            Registered {new Date(registration.registered_at).toLocaleString()} — frozen, append-only.
          </p>
          {production.status === 'registered' && <ReviseButton productionId={production.id} />}
        </section>
      )}
    </div>
  );
}
