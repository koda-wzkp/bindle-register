/**
 * Route-handler authorization matrix, run against the real migration on a
 * real Postgres. Only the session cookie plumbing, email transport, and
 * magic-link minting are substituted — every authorization decision under
 * test is production code.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', async () => {
  const { shimClient } = await import('../helpers/harness');
  return { supabaseAdmin: () => shimClient() };
});
vi.mock('@/lib/supabase/server', async () => {
  const { session } = await import('../helpers/harness');
  return {
    supabaseServer: () => ({
      auth: {
        getUser: async () => ({
          data: { user: session.email ? { email: session.email } : null },
        }),
      },
    }),
  };
});
vi.mock('@/lib/email', async () => {
  const { outbox } = await import('../helpers/harness');
  const record = (kind: string) => async (opts: { to: string }) => {
    outbox.push({ kind, ...opts });
  };
  return {
    sendSigningInvite: record('invite'),
    sendSignatureConfirmation: record('confirmation'),
    sendRegistrationEmail: record('registration'),
    sendRegistrationEmailNamespacePending: record('registration_pending_namespace'),
    sendLoginLink: record('login'),
  };
});
vi.mock('@/lib/magiclink', () => ({
  generateMagicLink: async (email: string, next: string) =>
    `http://test.local/auth/confirm?token_hash=fake&next=${encodeURIComponent(next)}&for=${email}`,
}));

import { POST as createProduction } from '@/app/api/productions/route';
import { DELETE as deleteProduction, PUT as updateProduction } from '@/app/api/productions/[id]/route';
import { POST as openForSigning } from '@/app/api/productions/[id]/open/route';
import { POST as voidRound } from '@/app/api/productions/[id]/void/route';
import { POST as resendLink } from '@/app/api/productions/[id]/resend/route';
import { POST as revise } from '@/app/api/productions/[id]/revise/route';
import { POST as sign } from '@/app/api/sign/[contributionId]/route';
import {
  ADMIN_EMAIL,
  POOL_DEFINITION,
  closePool,
  getPool,
  postJson,
  seedProduction,
  session,
  truncateAll,
} from '../helpers/harness';

beforeAll(() => {
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.ORG_NAME = 'Puddletown Theatre Collective';
  delete process.env.VERCEL_ENV; // vitest NODE_ENV=test → consent gate open for dummy data
});
afterAll(async () => {
  await closePool();
});
beforeEach(async () => {
  await truncateAll();
});

const draftBody = {
  title: 'Iolanthe',
  pool_definition: POOL_DEFINITION,
  commons_recipient: 'Puddletown Commons Fund',
  commons_bps: 500,
  run_opens: null,
  run_closes: null,
  contributors: [
    { full_name: 'Morgan Ellery', email: 'morgan@example.org', role: 'Director', share_bps: 4750, is_principal: true },
    { full_name: 'Dana Ruiz', email: 'dana@example.org', role: 'Stage Manager', share_bps: 4750, is_principal: false },
  ],
};

describe('admin-only route handlers (item 1c)', () => {
  const cases: Array<[string, (id: string, contributionId: string) => Promise<Response>]> = [
    ['POST /api/productions', () => createProduction(postJson(draftBody))],
    ['PUT /api/productions/[id]', (id) => updateProduction(postJson(draftBody), { params: { id } })],
    ['DELETE /api/productions/[id]', (id) => deleteProduction(postJson(), { params: { id } })],
    ['POST /api/productions/[id]/open', (id) => openForSigning(postJson(), { params: { id } })],
    ['POST /api/productions/[id]/void', (id) => voidRound(postJson({ reason: 'x' }), { params: { id } })],
    ['POST /api/productions/[id]/resend', (id, cid) => resendLink(postJson({ contribution_id: cid }), { params: { id } })],
    ['POST /api/productions/[id]/revise', (id) => revise(postJson(), { params: { id } })],
  ];

  for (const [label, call] of cases) {
    it(`${label}: 401 unauthenticated, 403 for a non-admin contributor, DB untouched`, async () => {
      const seeded = await seedProduction();
      const before = await getPool().query('select count(*)::int as n, min(status::text) as status from productions');

      session.email = null;
      const anon = await call(seeded.productionId, seeded.contributions['morgan@example.org']);
      expect(anon.status).toBe(401);

      // morgan is a legitimate signer on this production — but not an admin.
      session.email = 'morgan@example.org';
      const nonAdmin = await call(seeded.productionId, seeded.contributions['morgan@example.org']);
      expect(nonAdmin.status).toBe(403);

      const after = await getPool().query('select count(*)::int as n, min(status::text) as status from productions');
      expect(after.rows).toEqual(before.rows);
    });
  }

  it('sanity: the same calls succeed for the allowlisted admin', async () => {
    session.email = ADMIN_EMAIL;
    const created = await createProduction(postJson(draftBody));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const opened = await openForSigning(postJson(), { params: { id } });
    expect(opened.status).toBe(200);
    const voided = await voidRound(postJson({ reason: 'test' }), { params: { id } });
    expect(voided.status).toBe(200);
  });
});

describe('signature authorization (items 1a, 1b, 2)', () => {
  it('1a / forwarded-link case: another contributor on the same production cannot sign for me', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    // dana holds a session as herself (e.g. morgan forwarded his email, but
    // the link only ever authenticates its own invitee — dana's session is dana).
    session.email = 'dana@example.org';
    const res = await sign(postJson({ typed_name: 'Morgan Ellery', consent: true }), {
      params: { contributionId: seeded.contributions['morgan@example.org'] },
    });
    expect(res.status).toBe(403);
    const sigs = await getPool().query('select count(*)::int as n from signatures');
    expect(sigs.rows[0].n).toBe(0);
  });

  it('1b: an org member not named in the production cannot sign any of its contributions', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    session.email = 'evan@example.org';
    const res = await sign(postJson({ typed_name: 'Evan Park', consent: true }), {
      params: { contributionId: seeded.contributions['morgan@example.org'] },
    });
    expect(res.status).toBe(403);
    const sigs = await getPool().query('select count(*)::int as n from signatures');
    expect(sigs.rows[0].n).toBe(0);
  });

  it('unknown contribution ids are a 404, not an oracle', async () => {
    await seedProduction({ status: 'open_for_signing' });
    session.email = 'morgan@example.org';
    const res = await sign(postJson({ typed_name: 'Morgan Ellery', consent: true }), {
      params: { contributionId: '00000000-0000-0000-0000-00000000dead' },
    });
    expect(res.status).toBe(404);
  });

  it('signing requires a session at all', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    session.email = null;
    const res = await sign(postJson({ typed_name: 'Morgan Ellery', consent: true }), {
      params: { contributionId: seeded.contributions['morgan@example.org'] },
    });
    expect(res.status).toBe(401);
  });
});

describe('no client-supplied hash, validity flag, or BUID is trusted (item 1d)', () => {
  it('smuggled content_hash / registered / buid fields in the sign body are ignored; the hash is recomputed from DB state', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    session.email = 'morgan@example.org';
    const res = await sign(
      postJson({
        typed_name: 'Morgan Ellery',
        consent: true,
        // none of these fields exist in the handler's contract:
        content_hash: 'ff'.repeat(32),
        registered: true,
        valid: true,
        buid: 'BNDL::PROD::EVIL::ROOT::R0::deadbeef',
      }),
      { params: { contributionId: seeded.contributions['morgan@example.org'] } },
    );
    expect(res.status).toBe(200);

    const sig = await getPool().query('select content_hash, signer_email, typed_name from signatures');
    expect(sig.rows).toHaveLength(1);
    // Recomputed server-side: a real SHA-256 that is NOT the smuggled value.
    expect(sig.rows[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sig.rows[0].content_hash).not.toBe('ff'.repeat(32));
    // Attribution comes from the verified session (item 2), not the body.
    expect(sig.rows[0].signer_email).toBe('morgan@example.org');
    // One signature of two — the smuggled `registered: true` did not register.
    const regs = await getPool().query('select count(*)::int as n from registrations');
    expect(regs.rows[0].n).toBe(0);
  });

  it('a second signature by the same signer is refused', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    session.email = 'morgan@example.org';
    const first = await sign(postJson({ typed_name: 'Morgan Ellery', consent: true }), {
      params: { contributionId: seeded.contributions['morgan@example.org'] },
    });
    expect(first.status).toBe(200);
    const second = await sign(postJson({ typed_name: 'Morgan Again', consent: true }), {
      params: { contributionId: seeded.contributions['morgan@example.org'] },
    });
    expect(second.status).toBe(409);
  });
});
