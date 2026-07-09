import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Route-handler integration tests. The handlers run unmodified against the
 * real migration on a local Postgres (see tests/helpers/) — only the session
 * cookie plumbing, email transport, and magic-link minting are substituted.
 * @bindle/core has its own vitest setup in packages/core.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // One shared database; run files sequentially.
    fileParallelism: false,
    globalSetup: ['tests/helpers/global-setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // 'server-only' throws outside a React Server environment; the guard it
      // provides (never reaching a client bundle) is irrelevant under vitest.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
});
