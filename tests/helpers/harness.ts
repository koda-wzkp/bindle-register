import { Pool } from 'pg';
import { createShimClient, type ShimClient } from './pg-shim';
import { TEST_DB } from './global-setup';

/** Mutable session identity consumed by the mocked supabase server client. */
export const session = {
  email: null as string | null,
};

export interface OutboxEntry {
  kind: string;
  to: string;
  [key: string]: unknown;
}

/** Captured outbound email; the '@/lib/email' mock pushes here. */
export const outbox: OutboxEntry[] = [];

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ database: TEST_DB, max: 4 });
  }
  return pool;
}

export function shimClient(): ShimClient {
  return createShimClient(getPool());
}

export async function truncateAll(): Promise<void> {
  // TRUNCATE fires no row-level triggers, so the append-only guards don't
  // apply — this is test plumbing, not a mutation path the app has.
  await getPool().query(
    'truncate table audit_log, signatures, registrations, contributions, productions, people, organizations restart identity cascade',
  );
  outbox.length = 0;
  session.email = null;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}

export const ADMIN_EMAIL = 'chase@example.org';

export interface Seeded {
  orgId: string;
  productionId: string;
  /** contribution id by contributor email */
  contributions: Record<string, string>;
  people: Record<string, string>;
}

export const POOL_DEFINITION =
  'Earned-revenue surplus from the run, less royalties, venue rental, and the capped expense list agreed by the company.';

/**
 * Seed one draft production. morgan and dana are contributors; evan exists
 * in the org but is NOT named in the production.
 */
export async function seedProduction(
  opts: { status?: 'draft' | 'open_for_signing'; title?: string } = {},
): Promise<Seeded> {
  const pg = getPool();
  const org = await pg.query(
    `insert into organizations (name) values ('Puddletown Theatre Collective') returning id`,
  );
  const orgId = org.rows[0].id as string;

  const people: Record<string, string> = {};
  for (const [name, email] of [
    ['Morgan Ellery', 'morgan@example.org'],
    ['Dana Ruiz', 'dana@example.org'],
    ['Evan Park', 'evan@example.org'],
  ]) {
    const r = await pg.query(
      `insert into people (org_id, full_name, email) values ($1, $2, $3) returning id`,
      [orgId, name, email],
    );
    people[email] = r.rows[0].id as string;
  }

  const production = await pg.query(
    `insert into productions (org_id, title, pool_definition, commons_recipient, commons_bps)
     values ($1, $2, $3, 'Puddletown Commons Fund', 500) returning id`,
    [orgId, opts.title ?? 'Floyd Collins', POOL_DEFINITION],
  );
  const productionId = production.rows[0].id as string;

  const contributions: Record<string, string> = {};
  for (const [email, role, bps, principal] of [
    ['morgan@example.org', 'Director', 4750, true],
    ['dana@example.org', 'Stage Manager', 4750, false],
  ] as const) {
    const r = await pg.query(
      `insert into contributions (production_id, person_id, role, share_bps, is_principal)
       values ($1, $2, $3, $4, $5) returning id`,
      [productionId, people[email], role, bps, principal],
    );
    contributions[email] = r.rows[0].id as string;
  }

  if (opts.status === 'open_for_signing') {
    await pg.query(`update productions set status = 'open_for_signing' where id = $1`, [productionId]);
  }

  return { orgId, productionId, contributions, people };
}

export async function readJson(res: Response): Promise<any> {
  return res.json();
}

export function postJson(body?: unknown): Request {
  return new Request('http://test.local/api/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'vitest',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
