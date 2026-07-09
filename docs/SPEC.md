# SPEC — Bindle Register v1 (Phase 0 + Phase 1)

**Project:** Production registration + split-signing application
**Design partner / first deployment:** Puddletown Theatre Collective (single-tenant, their accounts — Model A)
**Steward:** Pleco LLC (Bindle portfolio)
**Spec date:** 2026-07-07 · revised 2026-07-09 (protocol/policy split; BUID naming; attribution hardening)
**Hard deadline:** Floyd Collins split registered by **2026-09-28** (rehearsals open 2026-10-01)

> Identifier naming: the identifier is always the **BUID**. Revision history
> of this document used "PUID" in places; BUID is correct everywhere.

---

## 1. Purpose

Build the minimal backstage slice of Bindle for theatre: an admin creates a production with named contributors and splits; every contributor reviews and consents via magic link; on full consent the record is canonicalized, hashed into a BUID, rendered as a deterministic glyph, and frozen append-only. No payments, no settlement, no audience pages in this phase.

This is a Bindle reference implementation at n=1. Federation, multi-tenancy, and payouts are explicitly out of scope.

---

## 2. Repo, licensing, naming

- **Repo:** `bindle-register` (Pleco GitHub org), plus extracted package `@bindle/core`.
- **Licensing (per locked Bindle model — node software AGPL, SDKs Apache):**
  - `bindle-register` app → **AGPL-3.0**
  - `@bindle/core` (canonicalization, BUID, validation, glyph — pure functions, no I/O) → **Apache-2.0**, lives in `/packages/core` as a workspace package, publishable later.
- Rationale: the app is proto-node software; the core primitives are SDK material other implementations must be able to adopt freely.

---

## 3. Stack

- Next.js 14 App Router, TypeScript, Tailwind
- Supabase (Postgres + Auth email magic link / OTP) — **in Puddletown's Supabase account**
- Resend for transactional email — **Puddletown's account**
- Vercel deploy — **Puddletown's account**, Pleco as collaborator
- No Sanity. The ledger never touches a CMS.
- No blockchain, no tokens, no keypairs for users. "Engineering, not casino."

---

## 4. Configuration — protocol invariants vs. instance policy

**Revised.** The original spec put all constants in one `as const` module.
That conflated two different kinds of rule:

**Protocol invariants** (`packages/core/src/config.ts`) — what makes a record
a Bindle record at all. Every implementation shares these; they are never
per-deployment:

```ts
export const BindleConfig = {
  TOTAL_BPS: 10_000,            // splits are integer basis points; floats forbidden
  PROTOCOL_SEGMENT: 'BNDL',
  MEDIUM_SEGMENT: 'PROD',       // DECIDE-02
  NAMESPACE_SEGMENT: 'TBD',     // DECIDE-01 — do not ship a watershed code until resolved
  HASH_DISPLAY_CHARS: 8,        // short form; full SHA-256 always stored
  CONSENT_TEXT_VERSION: 'v1.0', // bump whenever legal consent copy changes
} as const;
```

**Split-shape policy** (`packages/core/src/policy.ts`) — how a community
shapes its splits. These are *commitments a deployment opts into*, not
protocol law; other media legitimately differ (a music venue splitting a door
70/30 between headliner and opener exceeds a 49% cap as normal practice):

```ts
export interface BindlePolicy {
  id: string;               // stable identifier, hashed into the canonical payload
  commonsFloorBps: number;
  principalCapBps: number;
  soloMaxBps: number;
}

export const BINDLE_COMMONS_POLICY: BindlePolicy = {
  id: 'bindle-commons-v1',
  commonsFloorBps: 500,     // ≥5% commons, per Bindle locked economics
  principalCapBps: 4_900,   // ≤49% per principal on collaborative works
  soloMaxBps: 8_500,        // 85% max on solo works
};
```

Puddletown registers under `BINDLE_COMMONS_POLICY` (the app pins it as
`lib/policy.ts → INSTANCE_POLICY`). The policy **id** is included in the
canonical payload (hash-covered) and stored on the registration row, so every
record is verifiable against the rules it was actually registered under.
A policy id must never be reused with different values — new values, new id.

v1 ships exactly one preset. No venue preset until a venue deployment exists.

---

## 5. Data model (Supabase / Postgres)

As implemented in `supabase/migrations/0001_init.sql`. Differences from the
original sketch:

- `signatures.signer_email text not null` — the email of the **authenticated
  session** that signed, recorded server-side. Never taken from the request
  body or the link. This is the attribution anchor for ESIGN/UETA.
- `registrations.policy text not null` — the split-shape policy id;
  duplicated from the canonical payload for queryability, and
  `register_production()` rejects a mismatch between the two.
- `registrations.puid` → **`registrations.buid`**.

All money-adjacent numbers are integers (bps). Registrations, signatures, and
the audit log are append-only — enforced by guard triggers that fire for
every role including `service_role`, plus the absence of any RLS
UPDATE/DELETE policy. The one sanctioned exception: `void_signing_round()`
discards a round's signatures inside a single audited transaction.

**Immutability rules (enforced, not aspirational):**
- `productions` may be edited only while `status = 'draft'`.
- Transition to `open_for_signing` locks terms. Changing terms pre-registration requires voiding the round (all signatures discarded, audit-logged) and returning to `draft`. The `open_for_signing → draft` transition is only possible inside `void_signing_round()`.
- Post-registration, the production row and all children are frozen. Changes = new production with `parent_production_id` set, `revision + 1`, full re-sign. The parent becomes `superseded` only when the child registers, and only inside `register_production()`.

---

## 6. Canonicalization and BUID (`@bindle/core`)

### 6.1 Canonical payload

The hash covers the **terms**, not the signatures. Signatures attest to the content hash; storing them inside the hashed payload would make the BUID unmintable until signing and unverifiable after.

```ts
interface CanonicalProduction {
  protocol: 'BNDL';
  medium: string;              // config.MEDIUM_SEGMENT
  namespace: string;           // config.NAMESPACE_SEGMENT
  org: string;                 // organization name, NFC-normalized
  title: string;               // NFC-normalized
  parent_buid: string | null;  // null for ROOT
  revision: number;
  policy: string;              // split-shape policy id (see §4) — hash-covered
  pool_definition: string;
  commons: { recipient: string; bps: number };
  contributors: Array<{        // sorted by (name, role) ascending, code-point order
    name: string;
    role: string;
    bps: number;
    principal: boolean;
  }>;
}
```

### 6.2 Algorithm (deterministic, test-vectored)

1. Build `CanonicalProduction`; NFC-normalize all strings; sort contributors as specified.
2. Serialize with **RFC 8785 (JCS) JSON canonicalization** — use a maintained JCS library; do not hand-roll key ordering.
3. `content_hash = SHA-256(utf8(canonical_json))`, lowercase hex.
4. Short hash = first `HASH_DISPLAY_CHARS` of `content_hash`.
5. **BUID** = `BNDL::{MEDIUM}::{NAMESPACE}::{ROOT | parent short-hash}::R{revision}::{short-hash}`
   - Root production: lineage segment is literal `ROOT`.
   - Amendment: lineage segment is the parent's short hash.
6. Collision handling: on insert, if `buid` unique constraint trips (short-hash collision), extend the short hash by 2 chars and retry. Full hash is always the source of truth.

### 6.3 Verification contract

Anyone with the `canonical_json` can recompute `content_hash` and the BUID offline. `@bindle/core` ships a `verify(canonicalJson, buid)` function and a CLI (`npx bindle-verify <file>`).

### 6.4 Test vectors

Committed fixtures (payload → expected hash → expected BUID) lock the
pipeline: a root collaborative work, a non-ASCII (diacritics) payload pinning
NFC behavior, an amendment whose lineage segment is the parent's short hash,
and a policy-identifier vector (same terms under a different policy id →
different hash). CI fails if vectors drift.

---

## 7. Glyph (`@bindle/core`)

Contract: **pure function `glyph(contentHashHex: string): string`** returning standalone SVG. Same input → byte-identical output. No randomness, no Date, no external fetches. Monochrome (`currentColor`), 240×240, print-clean. Visual language may iterate; determinism and the signature are frozen. v1 hardcodes `glyph_version` 1.

---

## 8. Validation (`@bindle/core`, server-enforced; client mirrors for UX only)

**Revised.** `validateProduction(p, policy)` takes an explicit
`BindlePolicy`; there is no implicit global. Registration and status
transitions require an empty error array.

Protocol invariants (always enforced, not policy):

1. Contributor `bps` all integers > 0.
2. `sum(contributor bps) + commons_bps === TOTAL_BPS` exactly.
3. `commons_recipient` non-empty.
4. Every contributor has non-empty `name`, `email` (valid format), `role`.
5. `pool_definition` non-empty (min 40 chars — force a real definition, not "TBD").
6. **Rule 8 (registration gate):** status `open_for_signing`, zero validation errors, `count(signatures) === count(contributions)`, and every signature's `content_hash` matching the current canonical hash. Re-checked inside the `register_production()` transaction — the tamper guard.

Policy rules (from the explicit `policy` argument):

7. `commons_bps >= policy.commonsFloorBps`.
8. If contributors.length > 1: every contributor with `is_principal` has `bps <= policy.principalCapBps`.
9. If contributors.length === 1: `bps <= policy.soloMaxBps`.

The policy id used at validation time is the one hashed into the canonical
payload and stored on the registration row (§4, §6.1).

---

## 9. Flows

### 9.1 Admin (Chase / treasurer) — authenticated via Supabase magic link, allowlisted admin emails in env

1. Create production → enter title, run dates, pool definition, commons recipient + bps.
2. Add contributors (name, email, role, bps, principal flag). Live validation panel shows sum, floor, cap status.
3. `Open for signing` → server validates → status transition → each contributor emailed a signing link.
4. Dashboard shows per-contributor signature status. Resend link, void round (with confirm + audit log), or wait.
5. On final signature the system auto-registers (§9.3). Admin and all signers receive the registration email.

### 9.2 Contributor signing ceremony

1. Email (Resend): "You're named in *{title}* — review and sign your split." Link = Supabase OTP magic link scoped to their email; no passwords, no accounts to create. **Links are single-use and expire after 1 hour** (project auth setting); expired links land on `/login`, where any known signer can self-serve a fresh one.
2. Review page shows the **entire split table** (all names, roles, percentages — transparency among signers is the design, not a leak), pool definition, commons line, and the consent text (version from config).
3. Signer types their full legal name + checks consent → POST records signature with current `content_hash`, consent version, typed name, **authenticated session email (`signer_email`)**, timestamp, IP, UA. The signing route verifies the session's email matches the contribution's person before recording — a forwarded link cannot sign someone else's contribution from a different session. **DECIDE-04** gates real signature collection behind `CONSENT_TEXT_REVIEWED=true` in production.
4. Confirmation screen + email. Signature is one per contribution (DB unique) and cannot be edited — withdrawal pre-registration = admin voids the round.

### 9.3 Registration (system, transactional)

On final signature, inside one DB transaction (`register_production()`):
1. Re-run full validation incl. rule 8.
2. Build canonical payload → JCS → hash → BUID → glyph.
3. Insert `registrations` row (with policy id); transition production to `registered`.
4. Audit-log the event.
5. Email every signer + admin: canonical JSON attachment (their offline verification copy) and — **only once DECIDE-01 is resolved** — the BUID, glyph, and permalink. While the namespace is `TBD`, the email carries the content hash instead and no BUID leaves the system (runtime-guarded).

### 9.4 Amendment

`Create revision` on a registered production → clones contributors into a new draft with `parent_production_id` + `revision+1` → full flow repeats → on child registration, parent status → `superseded`. Lineage renders as a chain on the production record page.

---

## 10. Pages

- `/admin` — production list + statuses
- `/admin/productions/new`, `/admin/productions/[id]` — builder + signing dashboard
- `/sign/[contributionId]` — signing ceremony (magic-link entry)
- `/p/[buid]` — registered record: title, glyph, split table, pool definition, commons line, lineage, `Download canonical JSON`. **Access-controlled to signers + admins in Phase 1**; public visibility is a Phase 2 toggle (DECIDE-05). While DECIDE-01 is unresolved, non-admin visitors see a "registered — identifier pending" notice instead of the BUID.

---

## 11. Security / RLS sketch

- RLS on all tables; org-scoped. Signers see productions they're named in, co-contributors beside them, their signatures, and registered records they signed.
- Admin allowlist via env (`ADMIN_EMAILS`) checked server-side — v1 has no roles table; don't build one.
- `registrations`, `signatures`, `audit_log`: INSERT-only. No UPDATE/DELETE policy exists at all, **and** guard triggers block those operations for every role.
- All validation server-side; client validation is cosmetic. No route handler accepts a client-supplied content hash, validity flag, or BUID for any mutation — the server recomputes canonical terms from database state every time.
- No service-role key in client bundles; mutations via route handlers only.
- Route-handler authorization is integration-tested against the real migration (`tests/routes/`).

---

## 12. Explicitly out of scope (Phase 1)

Payments/Stripe, settlement math, ticketing, public audience pages, email marketing, multi-tenancy, federation/nodes, commons-recipient registry, carving guides, watershed registry, PDF generation, venue policy presets.

---

## 13. Milestones

| Date | Milestone | Owner |
|---|---|---|
| 2026-07-20 | Spec sign-off; DECIDE-01..05 resolved or explicitly deferred | Koda (+ Chase for 03/05) |
| 2026-08-02 | Repo scaffold, schema migrated, `@bindle/core` with test vectors passing | Koda |
| 2026-08-16 | Admin builder + validation complete | Koda |
| 2026-08-30 | Signing ceremony + registration transaction end-to-end on staging | Koda |
| 2026-09-13 | Puddletown UAT with a dummy production; consent copy finalized | Koda + Chase |
| 2026-09-21 | Production deploy in Puddletown accounts | Koda |
| **2026-09-28** | **Floyd Collins registered — all signatures in** | Chase drives, Koda supports |
| 2026-10-01 | Rehearsals open; system frozen | — |

---

## 14. Open decisions

- **DECIDE-01 — Namespace segment.** Watershed naming is culturally load-bearing in Bindle's music context. Until resolved, `NAMESPACE_SEGMENT` stays `TBD` and a **runtime guard** keeps BUIDs off every email and every non-admin surface. Owner: Koda.
- **DECIDE-02 — Medium segment.** `PROD` proposed for theatrical productions; confirm against the BUID segment grammar. Owner: Koda.
- **DECIDE-03 — Pool definition text for Floyd Collins.** Owner: Chase, by 2026-08-16.
- **DECIDE-04 — Consent text legal review.** Until reviewed, `CONSENT_TEXT_REVIEWED` stays unset and production signature collection is blocked. Owner: Koda, by UAT.
- **DECIDE-05 — Record visibility default.** Signers-only in Phase 1. Owner: Chase.

---

## 15. Acceptance criteria

1. A production with 8+ contributors validates, opens for signing, collects all signatures, and auto-registers; every signer receives the registration email with canonical JSON.
2. `npx bindle-verify` recomputes hash + BUID from the emailed JSON and matches.
3. No code path can mutate a registration or signature (attempt in test → denial).
4. Editing terms after any signature is impossible without voiding the round; voiding is audit-logged.
5. Amendment flow produces a child BUID whose lineage segment equals the parent's short hash; parent shows `superseded` only after child registers.
6. Test vectors pass in CI; a diacritic name produces identical hashes across machines.
7. Glyph function is pure: 1,000 repeated calls on the same hash yield byte-identical SVG.
8. Route handlers enforce authorization: non-admins cannot mutate; a signer cannot sign another's contribution; no mutation trusts client-supplied hashes or validity flags.
9. A record's registration row and canonical payload agree on the policy id it was validated under.
