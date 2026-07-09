import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SignForm } from '@/components/SignForm';
import { SplitTable } from '@/components/SplitTable';
import { getSessionUser } from '@/lib/auth';
import { canonicalTerms } from '@/lib/canonical';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent';
import { getProductionDetail } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** The signing ceremony (spec §9.2): full split table, pool, commons, consent. */
export default async function SignPage({ params }: { params: { contributionId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/sign/${params.contributionId}`);

  const db = supabaseAdmin();
  const lookup = await db
    .from('contributions')
    .select('production_id')
    .eq('id', params.contributionId)
    .maybeSingle();
  if (lookup.error) throw new Error(lookup.error.message);
  if (!lookup.data) notFound();

  const detail = await getProductionDetail((lookup.data as { production_id: string }).production_id, db);
  if (!detail) notFound();
  const { production, org, contributions, registration } = detail;
  const contribution = contributions.find((c) => c.id === params.contributionId)!;

  if (contribution.person.email.toLowerCase() !== user.email && !user.isAdmin) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="font-display text-2xl">This isn&rsquo;t your signing page</h1>
        <p className="text-sm text-ink-soft">
          You&rsquo;re signed in as {user.email}, but this page belongs to another contributor.
          If you were forwarded this link, ask the production admin to send yours.
        </p>
      </div>
    );
  }

  const splitRows = contributions.map((c) => ({
    name: c.person.full_name,
    role: c.role,
    bps: c.share_bps,
    principal: c.is_principal,
  }));

  return (
    <article className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-2">
        <p className="eyebrow">{org.name} · signing ceremony</p>
        <h1 className="font-display text-3xl">{production.title}</h1>
        <p className="text-sm text-ink-soft">
          You are named as <strong className="text-ink">{contribution.role}</strong> with a share of{' '}
          <strong className="text-ink">{(contribution.share_bps / 100).toFixed(2)}%</strong>.
          Review everything below — every signer sees this same table.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow">The split</h2>
        <SplitTable
          rows={splitRows}
          commonsRecipient={production.commons_recipient}
          commonsBps={production.commons_bps}
        />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">What money this covers</h2>
        <p className="whitespace-pre-wrap border-l-2 border-rule pl-4 text-sm leading-relaxed">
          {production.pool_definition}
        </p>
      </section>

      {production.status === 'open_for_signing' && !contribution.signature && (
        <>
          <section className="space-y-3">
            <h2 className="eyebrow">Consent · {CONSENT_TEXT_VERSION}</h2>
            <div className="whitespace-pre-wrap border border-rule bg-white p-4 text-sm leading-relaxed">
              {CONSENT_TEXT}
            </div>
            <p className="font-mono text-[11px] text-ink-soft">
              terms hash {canonicalTerms(detail).contentHash}
            </p>
          </section>
          <SignForm contributionId={contribution.id} expectedName={contribution.person.full_name} />
        </>
      )}

      {contribution.signature && (
        <section className="space-y-2 border border-ink p-5">
          <h2 className="font-display text-lg">Your signature is recorded</h2>
          <p className="text-sm text-ink-soft">
            Signed {new Date(contribution.signature.signed_at).toLocaleString()} as{' '}
            <em>{contribution.signature.typed_name}</em>. Signatures can&rsquo;t be edited; to
            withdraw before registration, ask the admin to void the round.
          </p>
          {registration && (
            <p className="text-sm">
              This production is registered:{' '}
              <Link href={`/p/${encodeURIComponent(registration.buid)}`} className="font-mono text-prompt underline">
                {registration.buid}
              </Link>
            </p>
          )}
        </section>
      )}

      {production.status === 'draft' && (
        <p className="border border-rule p-4 text-sm text-ink-soft">
          This production isn&rsquo;t open for signing right now — the signing round was voided
          while terms change. You&rsquo;ll get a fresh link when it reopens.
        </p>
      )}
    </article>
  );
}
