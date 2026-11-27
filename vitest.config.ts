import { defineConfig } from "vitest/config"

// Each app tests itself with its own Vite config.
export default defineConfig({
  test: {
    projects: ["apps/*"]
  }
})
