import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./test/postgres-global-setup.ts"],
    sequence: {
      concurrent: false
    }
  }
});
