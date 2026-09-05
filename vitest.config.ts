import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./test/postgres-global-setup.ts"],
    sequence: {
      concurrent: false
    },
    // `dist/` is a local build output (gitignored) that mirrors `test/` as
    // compiled JS; unexcluded it runs stale copies of every test alongside
    // the real ones. Vitest's own default exclude already names it, but a
    // root that has never set `exclude` before was still picking it up, so
    // it is named explicitly rather than trusted to a default this repo
    // never observed holding.
    exclude: [...configDefaults.exclude, "dist/**"]
  }
});
