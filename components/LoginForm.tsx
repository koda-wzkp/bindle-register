'use client';

import { useState } from 'react';

export function LoginForm({ next, expired }: { next: string; expired?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, next }),
    });
    if (res.ok) {
      setState('sent');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not send the link. Try again.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div className="max-w-md space-y-2 border border-ink p-5">
        <h2 className="font-display text-lg">Check your email</h2>
        <p className="text-sm text-ink-soft">
          If {email} is known here, a sign-in link is on its way. The link signs you in directly —
          no password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      {expired && (
        <p className="border border-rule px-3 py-2 text-sm text-ink-soft">
          That link has expired or was already used. Enter your email for a fresh one.
        </p>
      )}
      <div>
        <label className="field-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          autoComplete="email"
          required
        />
      </div>
      {error && <p role="alert" className="text-sm text-caution">{error}</p>}
      <button type="submit" className="btn" disabled={state === 'busy'}>
        {state === 'busy' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
