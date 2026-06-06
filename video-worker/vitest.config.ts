import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Worker resolves `@/*` → ../src (same as tsconfig.json paths) so unit tests can
// import modules that reference the shared frontend src. vitest + deps resolve
// from the parent ai-storybook-editor/node_modules.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
