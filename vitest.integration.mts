import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Integration tests: these talk to a real PostgreSQL database.
 *
 * Run with `npm run test:integration` against a database prepared with
 * `npm run db:deploy && npm run db:seed`, pointed at by TEST_DATABASE_URL.
 * They are kept out of `npm test` so the unit suite never needs infrastructure.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    // Postings share sequences and the ledger; run them serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
