import type { CanonicalProduction } from '@bindle/core';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Glyph } from '@/components/Glyph';
import { SplitTable } from '@/components/SplitTable';
import { getSessionUser } from '@/lib/auth';
import { getProductionDetail, getRegistrationByBuid } from '@/lib/db';
import { buidShareable } from '@/lib/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProductionRow, RegistrationRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface LineageEntry {
  revision: number;
  buid: string;
  registeredAt: string;
  current: boolean;
}

/** Walk the amendment chain both directions and return it oldest-first. */
async function lineage(productionId: string): Promise<LineageEntry[]> {
  const db = supabaseAdmin();
  const chain: ProductionRow[] = [];

  let cursor: string | null = productionId;
  while (cursor) {
    const { data } = await db.from('productions').select('*').eq('id', cursor).maybeSingle();
    if (!data) break;
    const row = data as ProductionRow;
    chain.unshift(row);
    cursor = row.parent_production_id;
  }
  cursor = productionId;
  for (;;) {
    const { data } = await db
      .from('productions')
      .select('*')
      .eq('parent_production_id', cursor)
      .not('status', 'in', '(draft,open_for_signing)')
      .maybeSingle();
    if (!data) break;
    const row = data as ProductionRow;
    chain.push(row);
    cursor = row.id;
  }

  const { data: regs } = await db
    .from('registrations')
    .select('*')
    .in('production_id', chain.map((p) => p.id));
  const regByProduction = new Map(
    ((regs ?? []) as RegistrationRow[]).map((r) => [r.production_id, r]),
  );

  return chain
    .filter((p) => regByProduction.has(p.id))
    .map((p) => ({
      revision: p.revision,
      buid: regByProduction.get(p.id)!.buid,
      registeredAt: regByProduction.get(p.id)!.registered_at,
      current: p.status === 'registered',
    }));
}

/**
 * The registered record (spec §10): restrained and print-friendly — the
 * glyph is designed to be reproduced in a paper program. Signers + admins
 * only in Phase 1 (DECIDE-05).
 */
export default async function RecordPage({ params }: { params: { buid: string } }) {
  const buid = decodeURIComponent(params.buid);
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/p/${params.buid}`);

  const registration = await getRegistrationByBuid(buid);
  if (!registration) notFound();

  const detail = await getProductionDetail(registration.production_id);
  if (!detail) notFound();

  const isSigner = detail.contributions.some((c) => c.person.email.toLowerCase() === user.email);
  if (!user.isAdmin && !isSigner) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="font-display text-2xl">This record is private</h1>
        <p className="text-sm text-ink-soft">
          Registered records are visible to their signers and production admins.
        </p>
      </div>
    );
  }

  // DECIDE-01: while the namespace segment is TBD, the identifier is not
  // shared beyond internal admin views — even with signers.
  if (!user.isAdmin && !buidShareable()) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="font-display text-2xl">Registered — identifier pending</h1>
        <p className="text-sm text-ink-soft">
          This production is registered and its terms are frozen. The permanent public
          identifier will be shared once the registry namespace is finalized. Your emailed
          canonical JSON and content hash already prove exactly what was signed.
        </p>
      </div>
    );
  }

  // The canonical payload is the frozen truth; render the record from it,
  // not from mutable rows.
  const canonical = registration.canonical_json as CanonicalProduction;
  const signatureByName = new Map(
    detail.contributions.map((c) => [c.person.full_name, c.signature?.signed_at ?? null]),
  );
  const rows = canonical.contributors.map((c) => ({
    name: c.name,
    role: c.role,
    bps: c.bps,
    principal: c.principal,
    signedAt: signatureByName.get(c.name) ?? null,
  }));

  const chain = await lineage(registration.production_id);

  return (
    <article className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-6 text-center">
        <p className="eyebrow">{canonical.org} · registered production</p>
        <h1 className="font-display text-4xl">{canonical.title}</h1>
        <Glyph svg={registration.glyph_svg} className="mx-auto w-40 text-ink [&_svg]:h-auto [&_svg]:w-full" />
        <div className="space-y-1">
          <p className="font-mono text-sm tracking-tight">{registration.buid}</p>
          <p className="font-mono text-[11px] text-ink-soft break-all">
            sha-256 {registration.content_hash}
          </p>
          <p className="text-xs text-ink-soft">
            Registered {new Date(registration.registered_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            {detail.production.status === 'superseded' && ' · superseded — see lineage'}
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow">The split</h2>
        <SplitTable
          rows={rows}
          commonsRecipient={canonical.commons.recipient}
          commonsBps={canonical.commons.bps}
          showSignatures
        />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Pool definition</h2>
        <p className="whitespace-pre-wrap border-l-2 border-rule pl-4 text-sm leading-relaxed">
          {canonical.pool_definition}
        </p>
      </section>

      {chain.length > 1 && (
        <section className="space-y-3">
          <h2 className="eyebrow">Lineage</h2>
          <ol className="space-y-1">
            {chain.map((entry) => (
              <li key={entry.buid} className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
                <span className="text-ink-soft">R{entry.revision}</span>
                {entry.buid === registration.buid ? (
                  <span className="font-medium">{entry.buid}</span>
                ) : (
                  <Link href={`/p/${encodeURIComponent(entry.buid)}`} className="text-prompt underline">
                    {entry.buid}
                  </Link>
                )}
                <span className="text-ink-soft">
                  {new Date(entry.registeredAt).toLocaleDateString()}
                  {entry.current && ' · current'}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="no-print space-y-3 border-t border-rule pt-6">
        <a href={`/api/records/${encodeURIComponent(registration.buid)}/json`} className="btn-quiet">
          Download canonical JSON
        </a>
        <p className="font-mono text-[11px] text-ink-soft">
          Verify offline: npx bindle-verify &lt;downloaded file&gt;
        </p>
      </footer>
    </article>
  );
}
