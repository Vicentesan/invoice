import { defineConfig } from "vitest/config"

// Each app and package tests itself with its own config.
export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*"]
  }
})
