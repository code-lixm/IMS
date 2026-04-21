import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "packages/shared/vitest.config.ts",
      "packages/server/vitest.config.ts",
    ],
  },
});
