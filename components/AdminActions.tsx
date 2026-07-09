'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; id?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error, id: data.id };
}

export function VoidRoundButton({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    const reason = window.prompt(
      'Voiding discards every collected signature and returns the production to draft. This is audit-logged.\n\nReason for voiding:',
    );
    if (reason === null) return;
    setBusy(true);
    setError(null);
    const result = await post(`/api/productions/${productionId}/void`, { reason });
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Void failed.');
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className="btn-danger" onClick={handleVoid} disabled={busy}>
        {busy ? 'Voiding…' : 'Void signing round'}
      </button>
      {error && <span role="alert" className="text-xs text-caution">{error}</span>}
    </span>
  );
}

export function ResendLinkButton({
  productionId,
  contributionId,
  email,
}: {
  productionId: string;
  contributionId: string;
  email: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  async function handleResend() {
    setState('busy');
    const result = await post(`/api/productions/${productionId}/resend`, {
      contribution_id: contributionId,
    });
    setState(result.ok ? 'sent' : 'failed');
  }

  return (
    <button
      type="button"
      className="btn-quiet !px-2 !py-1 text-xs"
      onClick={handleResend}
      disabled={state === 'busy' || state === 'sent'}
      title={`Resend signing link to ${email}`}
    >
      {state === 'busy' ? 'Sending…' : state === 'sent' ? 'Link sent' : state === 'failed' ? 'Failed — retry' : 'Resend link'}
    </button>
  );
}

export function ReviseButton({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevise() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/productions/${productionId}/revise`);
    setBusy(false);
    if (result.id) {
      router.push(`/admin/productions/${result.id}`);
      router.refresh();
    } else {
      setError(result.error ?? 'Could not create revision.');
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className="btn-quiet" onClick={handleRevise} disabled={busy}>
        {busy ? 'Creating revision…' : 'Create revision'}
      </button>
      {error && <span role="alert" className="text-xs text-caution">{error}</span>}
    </span>
  );
}

export function DiscardDraftButton({ productionId }: { productionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDiscard() {
    if (!window.confirm('Discard this draft? Nothing has been signed; this only removes the draft.')) return;
    setBusy(true);
    const res = await fetch(`/api/productions/${productionId}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      router.push('/admin');
      router.refresh();
    }
  }

  return (
    <button type="button" className="btn-danger" onClick={handleDiscard} disabled={busy}>
      {busy ? 'Discarding…' : 'Discard draft'}
    </button>
  );
}
