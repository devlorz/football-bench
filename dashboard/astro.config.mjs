// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Every page is built ahead of time and served from Pages (ADR-0028). The
  // numbers arrive in the browser from `/api/*`, which a Worker route claims on
  // the same hostname -- so no origin is a build input and nothing here needs
  // to know where the API lives.
  output: "static",

  vite: {
    server: {
      // Locally there is no Worker route to do that, so `astro dev` proxies the
      // same relative path to `wrangler dev`. The page's fetch is identical in
      // both places.
      proxy: { "/api": "http://127.0.0.1:8787" }
    }
  }
});
