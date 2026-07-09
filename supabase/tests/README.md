# Database tests

`01-immutability.sql` exercises the append-only contract (spec acceptance
criteria 3, 4, 5) against a plain Postgres 16: mutation attempts on
signatures, registrations, and the audit log must raise; voiding is the only
signature-discard path and is audit-logged; supersession happens only when a
child registers. These checks run as superuser on purpose — the guard
triggers must hold even at the service role's trust level.

`02-rls.sql` covers end-user connections: it runs as the `authenticated`
role with `request.jwt.claims` set, asserting a signer sees exactly their
world (and never the audit log), a stranger sees nothing, mutations touch
zero rows, and the signatures INSERT policy admits a signer's own
contribution while refusing anyone else's. This is the DB-layer fence; the
route-handler integration tests in `tests/routes/` cover the app-layer fence
and — like the production service role — bypass RLS entirely.

`00-supabase-shim.sql` stands in for the Supabase runtime (auth.jwt(), the
anon/authenticated/service_role roles) so the migration applies outside a
Supabase project.

Run locally:

```sh
createdb bindle_test
psql -d bindle_test -v ON_ERROR_STOP=1 -f tests/00-supabase-shim.sql
psql -d bindle_test -v ON_ERROR_STOP=1 -f migrations/0001_init.sql
psql -d bindle_test -v ON_ERROR_STOP=1 -f tests/01-immutability.sql
psql -d bindle_test -v ON_ERROR_STOP=1 -f tests/02-rls.sql
```

The suites must print `ALL IMMUTABILITY CHECKS PASSED` and
`ALL RLS CHECKS PASSED` (02 depends on the state 01 leaves behind). CI runs
the same sequence on every push. On a real Supabase project, apply only
`migrations/`; the shim is for tests.
