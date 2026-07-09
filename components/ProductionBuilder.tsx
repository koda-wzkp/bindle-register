'use client';

/**
 * Draft builder with a live validation panel. The panel mirrors
 * @bindle/core's server-enforced rules for UX only (spec §8) — the
 * open-for-signing route re-runs the same validation server-side.
 */
import { BindleConfig } from '@bindle/core/config';
import { BINDLE_COMMONS_POLICY } from '@bindle/core/policy';
import { validateProduction } from '@bindle/core/validate';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ProductionDraftInput } from '@/lib/types';

interface ContributorDraft {
  full_name: string;
  email: string;
  role: string;
  share_bps: string; // keep raw field input; parse on read
  is_principal: boolean;
}

export interface BuilderInitial {
  id?: string;
  title: string;
  pool_definition: string;
  commons_recipient: string;
  commons_bps: number;
  run_opens: string | null;
  run_closes: string | null;
  contributors: Array<{
    full_name: string;
    email: string;
    role: string;
    share_bps: number;
    is_principal: boolean;
  }>;
}

const EMPTY_CONTRIBUTOR: ContributorDraft = {
  full_name: '',
  email: '',
  role: '',
  share_bps: '',
  is_principal: false,
};

const parseBps = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

const pct = (bps: number) => (Number.isFinite(bps) ? `${(bps / 100).toFixed(2)}%` : '—');

export function ProductionBuilder({ initial }: { initial?: BuilderInitial }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [poolDefinition, setPoolDefinition] = useState(initial?.pool_definition ?? '');
  const [commonsRecipient, setCommonsRecipient] = useState(initial?.commons_recipient ?? '');
  // Mirrors the server's INSTANCE_POLICY (both are the Bindle commons
  // preset); the open-for-signing route re-validates with the real thing.
  const policy = BINDLE_COMMONS_POLICY;
  const [commonsBps, setCommonsBps] = useState(String(initial?.commons_bps ?? policy.commonsFloorBps));
  const [runOpens, setRunOpens] = useState(initial?.run_opens ?? '');
  const [runCloses, setRunCloses] = useState(initial?.run_closes ?? '');
  const [contributors, setContributors] = useState<ContributorDraft[]>(
    initial?.contributors.map((c) => ({ ...c, share_bps: String(c.share_bps) })) ?? [
      { ...EMPTY_CONTRIBUTOR },
    ],
  );
  const [busy, setBusy] = useState<null | 'save' | 'open'>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = useMemo(
    () =>
      validateProduction(
        {
          title,
          pool_definition: poolDefinition,
          commons_recipient: commonsRecipient,
          commons_bps: parseBps(commonsBps),
          contributors: contributors.map((c) => ({
            name: c.full_name,
            email: c.email,
            role: c.role,
            bps: parseBps(c.share_bps),
            principal: c.is_principal,
          })),
        },
        policy,
      ),
    [title, poolDefinition, commonsRecipient, commonsBps, contributors, policy],
  );

  const contributorSum = contributors.reduce((sum, c) => {
    const n = parseBps(c.share_bps);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const commons = parseBps(commonsBps);
  const total = contributorSum + (Number.isFinite(commons) ? commons : 0);

  const updateContributor = (i: number, patch: Partial<ContributorDraft>) => {
    setContributors((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };

  const payload = (): ProductionDraftInput => ({
    title,
    pool_definition: poolDefinition,
    commons_recipient: commonsRecipient,
    commons_bps: parseBps(commonsBps),
    run_opens: runOpens || null,
    run_closes: runCloses || null,
    contributors: contributors.map((c) => ({
      full_name: c.full_name,
      email: c.email,
      role: c.role,
      share_bps: parseBps(c.share_bps),
      is_principal: c.is_principal,
    })),
  });

  async function save(): Promise<string | null> {
    setServerError(null);
    const res = await fetch(initial?.id ? `/api/productions/${initial.id}` : '/api/productions', {
      method: initial?.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(data.error ?? 'Save failed.');
      return null;
    }
    return data.id as string;
  }

  async function handleSave() {
    setBusy('save');
    try {
      const id = await save();
      if (id) {
        router.push(`/admin/productions/${id}`);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenForSigning() {
    setBusy('open');
    try {
      const id = await save();
      if (!id) return;
      const res = await fetch(`/api/productions/${id}/open`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error ?? 'Could not open for signing.');
        if (!initial?.id) router.push(`/admin/productions/${id}`);
        return;
      }
      router.push(`/admin/productions/${id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="eyebrow">Production</h2>
          <div>
            <label className="field-label" htmlFor="title">Title</label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Floyd Collins" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="run_opens">Run opens</label>
              <input id="run_opens" type="date" className="field" value={runOpens} onChange={(e) => setRunOpens(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="run_closes">Run closes</label>
              <input id="run_closes" type="date" className="field" value={runCloses} onChange={(e) => setRunCloses(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="pool">Pool definition</label>
            <textarea
              id="pool"
              className="field min-h-28"
              value={poolDefinition}
              onChange={(e) => setPoolDefinition(e.target.value)}
              placeholder="What dollars enter the pool, and what comes off the top: royalties, venue, the capped expense list…"
            />
            <p className="mt-1 text-xs text-ink-soft">
              Signers consent to this text verbatim. Minimum 40 characters — a real definition, not “TBD”.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="commons_recipient">Commons recipient</label>
              <input id="commons_recipient" className="field" value={commonsRecipient} onChange={(e) => setCommonsRecipient(e.target.value)} placeholder="Puddletown Commons Fund" />
            </div>
            <div>
              <label className="field-label" htmlFor="commons_bps">Commons share (bps)</label>
              <input id="commons_bps" type="number" min={policy.commonsFloorBps} step={1} className="field" value={commonsBps} onChange={(e) => setCommonsBps(e.target.value)} />
              <p className="mt-1 text-xs text-ink-soft">{pct(parseBps(commonsBps))} · floor {policy.commonsFloorBps} bps ({policy.id})</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow">Contributors</h2>
            <span className="font-mono text-xs text-ink-soft">shares in basis points · 100 bps = 1%</span>
          </div>
          {contributors.map((c, i) => (
            <div key={i} className="grid gap-2 border border-rule p-3 sm:grid-cols-[1fr_1fr_1fr_110px_auto_auto]">
              <input aria-label={`Contributor ${i + 1} name`} className="field" placeholder="Full name" value={c.full_name} onChange={(e) => updateContributor(i, { full_name: e.target.value })} />
              <input aria-label={`Contributor ${i + 1} email`} type="email" className="field" placeholder="email@example.org" value={c.email} onChange={(e) => updateContributor(i, { email: e.target.value })} />
              <input aria-label={`Contributor ${i + 1} role`} className="field" placeholder="Role (Director, Cast…)" value={c.role} onChange={(e) => updateContributor(i, { role: e.target.value })} />
              <input aria-label={`Contributor ${i + 1} share in bps`} type="number" min={1} step={1} className="field text-right font-mono" placeholder="bps" value={c.share_bps} onChange={(e) => updateContributor(i, { share_bps: e.target.value })} />
              <label className="flex items-center gap-1.5 px-1 text-xs text-ink-soft">
                <input type="checkbox" checked={c.is_principal} onChange={(e) => updateContributor(i, { is_principal: e.target.checked })} className="accent-prompt" />
                principal
              </label>
              <button
                type="button"
                className="btn-quiet !px-2 !py-1 text-xs"
                onClick={() => setContributors((prev) => prev.filter((_, j) => j !== i))}
                disabled={contributors.length === 1}
                aria-label={`Remove contributor ${i + 1}`}
              >
                remove
              </button>
            </div>
          ))}
          <button type="button" className="btn-quiet" onClick={() => setContributors((prev) => [...prev, { ...EMPTY_CONTRIBUTOR }])}>
            Add contributor
          </button>
        </section>

        {serverError && (
          <p role="alert" className="border border-caution px-3 py-2 text-sm text-caution">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-quiet" onClick={handleSave} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleOpenForSigning}
            disabled={busy !== null || errors.length > 0}
            title={errors.length > 0 ? 'Resolve the validation panel first' : undefined}
          >
            {busy === 'open' ? 'Opening…' : 'Open for signing'}
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          Opening for signing locks these terms and emails every contributor a personal signing link.
          Editing afterwards requires voiding the round, which discards all signatures.
        </p>
      </div>

      <aside aria-live="polite" className="h-fit space-y-4 border border-rule p-4 lg:sticky lg:top-6">
        <h2 className="eyebrow">Live validation</h2>
        <dl className="space-y-1 font-mono text-xs tabular-nums">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Contributors</dt>
            <dd>{pct(contributorSum)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Commons</dt>
            <dd>{pct(Number.isFinite(commons) ? commons : NaN)}</dd>
          </div>
          <div className={`flex justify-between border-t border-rule pt-1 ${total === BindleConfig.TOTAL_BPS ? 'text-ink' : 'text-caution'}`}>
            <dt>Total</dt>
            <dd>{pct(total)} / 100%</dd>
          </div>
        </dl>
        {errors.length === 0 ? (
          <p className="text-sm text-prompt">Splits validate. Ready to open for signing.</p>
        ) : (
          <ul className="space-y-2 text-xs text-ink">
            {errors.map((e, i) => (
              <li key={i} className="border-l-2 border-caution pl-2">
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
