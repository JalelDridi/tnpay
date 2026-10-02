import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // Tests that talk to the fake server or the sandbox take longer.
    testTimeout: 15_000,
  },
});
