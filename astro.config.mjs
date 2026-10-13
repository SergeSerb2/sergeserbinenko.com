// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://sergeserbinenko.com",
  output: "static",
  trailingSlash: "ignore",
  integrations: [sitemap()],
  build: {
    format: "directory",
  },
  vite: {
    // Lightning CSS folds animation-timeline into the animation shorthand, which browsers
    // reject, silently dropping every scroll-driven animation. esbuild keeps them apart.
    build: { cssMinify: "esbuild" },
  },
});
