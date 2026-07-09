# bindle-register

Register creative works, sign the splits, freeze the record. Content-addressed
production registration for profit-sharing companies — no tokens, no casino.

Bindle reference implementation at n=1. First deployment: Puddletown Theatre
Collective (single-tenant, their accounts). Steward: Pleco LLC.

## What it does

1. **Terms.** An admin drafts a production: title, pool definition (what
   dollars enter the pool, what comes off the top), a commons allocation, and
   every contributor's share in integer basis points. Live validation enforces
   the Bindle economics: shares + commons = exactly 10,000 bps, commons ≥ 5%,
   principals ≤ 49% on collaborative works.
2. **Signatures.** Opening for signing locks the terms and emails every
   contributor a personal magic link. Each signer sees the *entire* split —
   transparency among signers is the design — and signs by typing their legal
   name (ESIGN/UETA). Each signature records the SHA-256 of the exact terms.
3. **Frozen record.** The final signature triggers registration in one
   database transaction: the terms are canonicalized (RFC 8785), hashed,
   minted into a **BUID** (`BNDL::PROD::<NS>::ROOT::R0::a1b2c3d4`), rendered
   as a deterministic glyph, and stored append-only. Every signer gets the
   canonical JSON — their offline verification copy:

   ```sh
   npx bindle-verify canonical.json
   ```

Changes after registration are a new revision: full re-sign, child BUID
carrying the parent's short hash in its lineage segment, parent marked
superseded only after the child registers.

## Repo layout

| Path | What | License |
|---|---|---|
| `/` | Next.js 14 App Router app (admin builder, signing ceremony, record pages) | **AGPL-3.0** |
| `packages/core` | `@bindle/core` — canonicalization, hashing, BUID, validation, glyph, verify CLI. Pure functions, no I/O. | **Apache-2.0** |
| `supabase/migrations` | Schema, RLS, guard triggers, transactional `register_production` / `void_signing_round` | AGPL-3.0 |
| `supabase/tests` | Immutability test suite (runs in CI against Postgres 16) | AGPL-3.0 |

Per the Bindle licensing model: node software AGPL, SDK primitives Apache so
other implementations can adopt them freely.

## Protocol vs. policy

What makes a record verifiable — integer bps summing to 10,000,
canonicalization, hashing, BUID grammar, append-only semantics — is protocol
and lives in `BindleConfig`. How a community shapes its splits — commons
floor, principal caps — is **per-instance policy** (`BindlePolicy`), chosen
explicitly at validation time. Puddletown registers under the
`bindle-commons-v1` preset. The policy id is hashed into every canonical
payload and stored on the registration row, so each record is verifiable
against the rules it was actually registered under. See `docs/SPEC.md` §4/§8.

## Immutability is enforced, not aspirational

- `registrations` and `audit_log`: guard triggers reject UPDATE/DELETE for
  **every** role, service role included. No RLS UPDATE/DELETE policy exists.
- `signatures`: same, with one sanctioned exception — `void_signing_round()`
  discards a whole round inside one audited transaction and returns the
  production to draft.
- `productions`: freely editable in draft only. Past draft, only whitelisted
  status transitions are possible, and the void/register transitions only
  work inside their sanctioned SQL functions.
- Registration re-checks rule 8 (every signature's hash matches the current
  terms) inside the transaction. If terms mutated after someone signed,
  registration is blocked.

`supabase/tests/01-immutability.sql` proves all of this against a real
Postgres on every CI run.

## Stack

Next.js 14 (App Router, TypeScript, Tailwind) · Supabase (Postgres + magic
link auth) · Resend (all transactional email) · Vercel. No CMS touches the
ledger. No blockchain, no user keypairs.

## Setup

1. **Supabase**: create a project, then apply `supabase/migrations/0001_init.sql`
   (SQL editor or `supabase db push`).
2. **Resend**: verify the sending domain, create an API key.
3. **Env**: copy `.env.example` to `.env.local` and fill everything in.
   `ADMIN_EMAILS` is the admin allowlist — there is no roles table in v1.
4. ```sh
   npm install
   npm run build --workspace @bindle/core
   npm run dev
   ```

Deploy: Vercel project in the org's account, same env vars, plus the
migration applied to the production Supabase project.

## Tests

```sh
npm run test:core             # @bindle/core: vectors, validation, glyph purity, verify
npm run test:routes           # route handlers against the real migration on Postgres:
                              # authorization matrix, forced BUID collision retry,
                              # namespace + consent guards (needs PG* env vars)
supabase/tests/README.md      # database immutability suite (psql)
npx tsc --noEmit && npx next build
```

The committed test vectors in `packages/core/test/vectors/` lock the
canonicalization → hash → BUID pipeline, including NFC normalization of
non-ASCII names. If they fail, the change is a protocol break.

## Open decisions (spec §14) — enforced in code

- **DECIDE-01**: `NAMESPACE_SEGMENT` ships as the placeholder `TBD`. A
  runtime guard (`lib/guards.ts`) keeps BUIDs out of every email and off
  every non-admin surface until it's resolved — signers still get their
  canonical JSON and content hash, which verify independently.
- **DECIDE-04**: the consent copy (`lib/consent.ts`) has not had legal
  review. Production deployments refuse to record signatures until
  `CONSENT_TEXT_REVIEWED=true` is set; preview/UAT can sign dummy data.
- `PROD` as the medium segment is DECIDE-02. Bump `CONSENT_TEXT_VERSION` in
  `packages/core/src/config.ts` whenever a word of the consent text changes.
