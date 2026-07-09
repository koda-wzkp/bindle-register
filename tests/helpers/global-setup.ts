import { execFileSync } from 'node:child_process';

export const TEST_DB = 'bindle_routes_test';

function psql(args: string[], database?: string): void {
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', ...(database ? ['-d', database] : []), ...args], {
    stdio: 'pipe',
    env: process.env,
  });
}

/**
 * Fresh database with the Supabase shim + the real migration applied.
 * Connection settings come from the standard PG* env vars: a local socket
 * (PGHOST=/tmp/bindle-pg) or the CI postgres service (PGHOST=localhost).
 */
export default function setup(): void {
  psql(['-c', `drop database if exists ${TEST_DB}`]);
  psql(['-c', `create database ${TEST_DB}`]);
  psql(['-f', 'supabase/tests/00-supabase-shim.sql'], TEST_DB);
  psql(['-f', 'supabase/migrations/0001_init.sql'], TEST_DB);
}
