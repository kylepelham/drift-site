import { defineConfig } from "astro/config"

export default defineConfig({
  site: process.env.SITE_URL ?? "https://driftagent.dev",
  server: { port: 5181 },
  build: { inlineStylesheets: "never" },
})
