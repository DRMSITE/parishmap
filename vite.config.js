import { defineConfig, loadEnv } from "vite";
import { deploymentDir } from "./scripts/deployment-dir.mjs";
import { loadParishConfig, parishPlugin } from "./scripts/parish-plugin.mjs";

// Everything particular to one council is in `deployment/` (git-ignored). Until a council
// makes one, the committed `deployment.example/` stands in (see scripts/deployment-dir.mjs).
// The plugin hands the browser the settings it may know (scripts/parish-plugin.mjs).
const parish = await loadParishConfig();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  // In development there is no Hosting rewrite, so send tile and API requests to the
  // deployed functions. In production Firebase Hosting rewrites /tiles/** and /api/**.
  const functionsOrigin = env.VITE_FIREBASE_PROJECT_ID
    ? `https://${env.VITE_FUNCTIONS_REGION || parish.region || "europe-west2"}-${env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`
    : undefined;
  /** @type {Record<string, import("vite").ProxyOptions>} */
  const proxy = functionsOrigin
    ? {
        "/tiles": { target: functionsOrigin, changeOrigin: true },
        "/api": { target: functionsOrigin, changeOrigin: true },
      }
    : {};
  return {
    // Lets the app be served from a sub-path. The router reads the same value
    // back through import.meta.env.BASE_URL.
    base: env.VITE_BASE_URL || "/",
    plugins: [parishPlugin(parish)],
    resolve: { alias: { "@deployment": deploymentDir } },
    server: { proxy },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.js"],
    },
  };
});
