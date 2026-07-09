'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** The consent + typed-name form of the signing ceremony (spec §9.2). */
export function SignForm({ contributionId, expectedName }: { contributionId: string; expectedName: string }) {
  const router = useRouter();
  const [typedName, setTypedName] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { registered: boolean; buid?: string }>(null);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${contributionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ typed_name: typedName, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Signing failed. Try again.');
        return;
      }
      setDone({ registered: Boolean(data.registered), buid: data.buid });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3 border border-ink p-5">
        <h2 className="font-display text-lg">Signature recorded</h2>
        {done.registered ? (
          <p className="text-sm">
            Yours was the final signature — the record is now registered and frozen. A copy of the
            canonical terms and the registered identifier is on its way to your inbox.
            {done.buid && (
              <>
                {' '}
                <a className="text-prompt underline" href={`/p/${encodeURIComponent(done.buid)}`}>
                  View the registered record
                </a>
                .
              </>
            )}
          </p>
        ) : (
          <p className="text-sm">
            A confirmation email is on its way. When every contributor has signed, the record
            freezes and you&rsquo;ll receive its permanent identifier.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSign} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="typed_name">
          Type your full legal name
        </label>
        <input
          id="typed_name"
          className="field max-w-md font-display"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={expectedName}
          autoComplete="name"
          required
        />
      </div>
      <label className="flex max-w-xl items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 accent-prompt"
          required
        />
        <span>I have read the consent statement above and intend my typed name as my electronic signature.</span>
      </label>
      {error && (
        <p role="alert" className="max-w-xl border border-caution px-3 py-2 text-sm text-caution">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy || !typedName.trim() || !consent}>
        {busy ? 'Recording…' : 'Sign these terms'}
      </button>
    </form>
  );
}
