# Database tests

`01-immutability.sql` exercises the append-only contract (spec acceptance
criteria 3, 4, 5) against a plain Postgres 16: mutation attempts on
signatures, registrations, and the audit log must raise; voiding is the only
signature-discard path and is audit-logged; supersession happens only when a
child registers.

`00-supabase-shim.sql` stands in for the Supabase runtime (auth.jwt(), the
anon/authenticated/service_role roles) so the migration applies outside a
Supabase project.

Run locally:

```sh
createdb bindle_test
psql -d bindle_test -v ON_ERROR_STOP=1 -f tests/00-supabase-shim.sql
psql -d bindle_test -v ON_ERROR_STOP=1 -f migrations/0001_init.sql
psql -d bindle_test -v ON_ERROR_STOP=1 -f tests/01-immutability.sql
```

The last line must print `ALL IMMUTABILITY CHECKS PASSED`. CI runs the same
sequence on every push. On a real Supabase project, apply only
`migrations/`; the shim is for tests.
