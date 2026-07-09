/**
 * End-to-end registration behavior against the real migration: the full
 * signing flow, the forced BUID short-hash collision retry (item 3), the
 * DECIDE-01 namespace guard on emails and responses, and the DECIDE-04
 * consent gate (item 5).
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

import {
  BINDLE_COMMONS_POLICY,
  buildCanonicalProduction,
  canonicalJson,
  mintBuid,
  sha256Hex,
  verify,
} from '@bindle/core';
import { POST as sign } from '@/app/api/sign/[contributionId]/route';
import {
  ADMIN_EMAIL,
  POOL_DEFINITION,
  closePool,
  getPool,
  outbox,
  postJson,
  seedProduction,
  session,
  truncateAll,
} from '../helpers/harness';

beforeAll(() => {
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.ORG_NAME = 'Puddletown Theatre Collective';
  delete process.env.VERCEL_ENV;
  delete process.env.CONSENT_TEXT_REVIEWED;
});
afterAll(async () => {
  await closePool();
});
beforeEach(async () => {
  await truncateAll();
});

async function signAs(email: string, contributionId: string, typedName: string): Promise<Response> {
  session.email = email;
  return sign(postJson({ typed_name: typedName, consent: true }), {
    params: { contributionId },
  });
}

/** The canonical terms the server will derive for the seeded production. */
function expectedTerms(title: string) {
  const payload = buildCanonicalProduction({
    org: 'Puddletown Theatre Collective',
    title,
    parentBuid: null,
    revision: 0,
    policyId: BINDLE_COMMONS_POLICY.id,
    poolDefinition: POOL_DEFINITION,
    commons: { recipient: 'Puddletown Commons Fund', bps: 500 },
    contributors: [
      { name: 'Morgan Ellery', role: 'Director', bps: 4750, principal: true },
      { name: 'Dana Ruiz', role: 'Stage Manager', bps: 4750, principal: false },
    ],
  });
  const json = canonicalJson(payload);
  const contentHash = sha256Hex(json);
  return { payload, json, contentHash };
}

describe('registration on final signature', () => {
  it('registers with the policy id recorded on the row and inside the hashed payload', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });

    const first = await signAs('morgan@example.org', seeded.contributions['morgan@example.org'], 'Morgan Ellery');
    expect(first.status).toBe(200);
    expect((await first.json()).registered).toBeFalsy();

    const final = await signAs('dana@example.org', seeded.contributions['dana@example.org'], 'Dana Ruiz');
    expect(final.status).toBe(200);
    const body = await final.json();
    expect(body.registered).toBe(true);

    const reg = await getPool().query('select buid, content_hash, policy, canonical_json from registrations');
    expect(reg.rows).toHaveLength(1);
    const row = reg.rows[0];

    const terms = expectedTerms('Floyd Collins');
    expect(row.content_hash).toBe(terms.contentHash);
    expect(row.policy).toBe('bindle-commons-v1');
    expect(row.canonical_json.policy).toBe('bindle-commons-v1');
    expect(row.buid).toBe(mintBuid({ contentHash: terms.contentHash, revision: 0 }));
    expect(verify(row.canonical_json, row.buid).ok).toBe(true);

    const prod = await getPool().query('select status::text from productions where id = $1', [seeded.productionId]);
    expect(prod.rows[0].status).toBe('registered');
  });

  it('DECIDE-01 guard: while the namespace is TBD, no email and no signer response carries the BUID', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    await signAs('morgan@example.org', seeded.contributions['morgan@example.org'], 'Morgan Ellery');
    const final = await signAs('dana@example.org', seeded.contributions['dana@example.org'], 'Dana Ruiz');

    // dana is not an admin → the response confirms registration but omits the BUID
    const body = await final.json();
    expect(body.registered).toBe(true);
    expect(body.buid).toBeUndefined();

    // registration emails went out as the namespace-pending variant, to both
    // signers and the admin, carrying the content hash but no BUID field
    const regMail = outbox.filter((m) => m.kind.startsWith('registration'));
    expect(regMail.map((m) => m.kind)).toEqual([
      'registration_pending_namespace',
      'registration_pending_namespace',
      'registration_pending_namespace',
    ]);
    expect(new Set(regMail.map((m) => m.to))).toEqual(
      new Set(['morgan@example.org', 'dana@example.org', ADMIN_EMAIL]),
    );
    for (const mail of regMail) {
      expect(mail.buid).toBeUndefined();
      expect(mail.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(mail)).not.toContain('BNDL::');
    }
  });

  it('DECIDE-04 gate: production deployments refuse signatures until CONSENT_TEXT_REVIEWED=true', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    process.env.VERCEL_ENV = 'production';
    try {
      const blocked = await signAs('morgan@example.org', seeded.contributions['morgan@example.org'], 'Morgan Ellery');
      expect(blocked.status).toBe(503);
      expect((await getPool().query('select count(*)::int as n from signatures')).rows[0].n).toBe(0);

      process.env.CONSENT_TEXT_REVIEWED = 'true';
      const allowed = await signAs('morgan@example.org', seeded.contributions['morgan@example.org'], 'Morgan Ellery');
      expect(allowed.status).toBe(200);
    } finally {
      delete process.env.VERCEL_ENV;
      delete process.env.CONSENT_TEXT_REVIEWED;
    }
  });
});

describe('forced BUID short-hash collision (item 3)', () => {
  it('extends the short hash by 2 and retries; the full content hash stays the source of truth', async () => {
    const seeded = await seedProduction({ status: 'open_for_signing' });
    const terms = expectedTerms('Floyd Collins');
    const collidingBuid = mintBuid({ contentHash: terms.contentHash, revision: 0 });

    // Occupy the 8-char BUID this production would mint, attached to an
    // unrelated decoy production with a different content hash.
    const pg = getPool();
    const decoy = await pg.query(
      `insert into productions (org_id, title, pool_definition, commons_recipient, commons_bps)
       values ($1, 'Decoy', $2, 'Puddletown Commons Fund', 500) returning id`,
      [seeded.orgId, POOL_DEFINITION],
    );
    await pg.query(
      `insert into registrations (production_id, canonical_json, content_hash, buid, policy, glyph_svg)
       values ($1, '{"decoy": true}'::jsonb, $2, $3, 'bindle-commons-v1', '<svg/>')`,
      [decoy.rows[0].id, 'a'.repeat(64), collidingBuid],
    );

    await signAs('morgan@example.org', seeded.contributions['morgan@example.org'], 'Morgan Ellery');
    const final = await signAs('dana@example.org', seeded.contributions['dana@example.org'], 'Dana Ruiz');
    expect(final.status).toBe(200);
    expect((await final.json()).registered).toBe(true);

    const reg = await pg.query(
      'select buid, content_hash, canonical_json from registrations where production_id = $1',
      [seeded.productionId],
    );
    expect(reg.rows).toHaveLength(1);
    const row = reg.rows[0];

    // The collision forced the retry: 10-char short segment instead of 8.
    expect(row.buid).toBe(mintBuid({ contentHash: terms.contentHash, revision: 0, shortChars: 10 }));
    const short = row.buid.split('::')[5];
    expect(short).toHaveLength(10);
    expect(short.startsWith(collidingBuid.split('::')[5])).toBe(true);

    // Source of truth: the full hash matches the terms exactly, and the
    // extended BUID verifies offline against the stored canonical JSON.
    expect(row.content_hash).toBe(terms.contentHash);
    const verdict = verify(row.canonical_json, row.buid);
    expect(verdict.ok).toBe(true);
    expect(verdict.computedHash).toBe(terms.contentHash);
  });
});
