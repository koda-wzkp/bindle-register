# @bindle/core

Bindle core primitives: canonicalization, content hashing, BUID minting, split
validation, and the deterministic registration glyph. Pure functions, no I/O —
SDK material any Bindle implementation can adopt freely.

**License: Apache-2.0** (the surrounding `bindle-register` app is AGPL-3.0;
this package is deliberately more permissive per the Bindle licensing model —
node software AGPL, SDKs Apache).

## What's here

| Module | Exports | Notes |
|---|---|---|
| `config` | `BindleConfig` | Protocol constants (bps totals, floors, caps, BUID segments). Validation reads only from here. |
| `canonical` | `buildCanonicalProduction`, `canonicalJson` | NFC-normalizes strings, sorts contributors by `(name, role)` in code-point order, serializes via RFC 8785 (JCS). |
| `hash` | `sha256Hex` | Lowercase hex SHA-256 (node runtime). |
| `buid` | `mintBuid`, `parseBuid`, `shortHash` | `BNDL::{MEDIUM}::{NAMESPACE}::{ROOT\|parent-short}::R{rev}::{short}` |
| `validate` | `validateProduction`, `validateRegistrationReadiness` | Spec rules 1–8. Browser-safe (no node imports) so UIs can mirror it live. |
| `glyph` | `glyph(contentHashHex)` | Pure, deterministic 240×240 monochrome SVG. Byte-identical output per hash. Browser-safe. |
| `verify` | `verify(canonicalJson, buid)` | Offline verification: recompute hash + BUID from a record's canonical JSON. |

## The hash covers terms, not signatures

Signatures attest to the content hash; they are never part of the hashed
payload. Storing them inside it would make the BUID unmintable until signing
and unverifiable after.

## Offline verification

```sh
npx bindle-verify path/to/canonical.json 'BNDL::PROD::TBD::ROOT::R0::a1b2c3d4'
# or, with the wrapped download format { canonical_json, buid, content_hash }:
npx bindle-verify path/to/record.json
```

Exit code 0 and `MATCH` mean the JSON you hold hashes to the identifier you
were given. No server, no database, no trust required.

## Test vectors

`test/vectors/*.json` lock the canonicalization → hash → BUID pipeline,
including a non-ASCII vector that pins NFC behavior across machines. If the
vector suite fails, the change is a protocol break: registrations in the wild
would stop verifying. CI failing there is the point.
