// Tests that need the Firestore emulator: security rules and the Firestore data source.
// Run with `npm run test:rules`, which starts the emulator first.

import { defineConfig } from "vitest/config";
import { deploymentDir } from "./scripts/deployment-dir.mjs";
import { loadParishConfig, parishPlugin } from "./scripts/parish-plugin.mjs";

export default defineConfig({
  plugins: [parishPlugin(await loadParishConfig())],
  resolve: { alias: { "@deployment": deploymentDir } },
  test: {
    environment: "node",
    include: ["test-rules/**/*.test.js"],
    // The tests share one emulator database, so they must not run side by side.
    fileParallelism: false,
  },
});
