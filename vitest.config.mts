import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Unit tests only -- these must never need a database, so `npm test` is
    // safe to run anywhere. Integration tests have their own config.
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "src/**/*.test.ts"],
    exclude: ["e2e/**", "tests/integration/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/server/**", "src/modules/**"],
    },
  },
});
