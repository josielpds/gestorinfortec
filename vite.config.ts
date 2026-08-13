// @lovable.dev/vite-tanstack-config already includes the following — do NOT
// add them manually or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss,
//     tsConfigPaths, nitro (build-only), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, sandbox detection.
//
// GitHub Pages serves only static files. We use TanStack Start's prerender
// option to emit static HTML for every route at build time — the resulting
// output (dist/client) can be published as-is to the gh-pages branch.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Custom domain at the apex: base is "/".
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  tanstackStart: {
    // Redirect the bundled server entry to src/server.ts (our SSR wrapper).
    // Kept for type/import compatibility but unused when prerender is on.
    server: { entry: "server" },
    prerender: {
      enabled: true,
      autoSubfolderIndex: true,
      autoStaticPathsDiscovery: true,
      crawlLinks: true,
      concurrency: 14,
      retryCount: 2,
      retryDelay: 1000,
      maxRedirects: 5,
      // Don't fail the build on a per-route error; log instead.
      failOnError: false,
    },
  },
});
