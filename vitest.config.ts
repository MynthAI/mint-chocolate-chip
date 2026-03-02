import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    server: {
      deps: {
        inline: ["@evolution-sdk/aiken-uplc", "@evolution-sdk/scalus-uplc"],
      },
    },
  },
});
