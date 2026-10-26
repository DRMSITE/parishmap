import { defineConfig } from "@playwright/test";

// Placeholder web settings for the sign-in build. The tests never reach Firebase; the
// build only needs values so that the app starts.
const FIREBASE_TEST_ENV = {
  VITE_FIREBASE_API_KEY: "test-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-parishmap.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-parishmap",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-parishmap.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "1:1:web:test",
};

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4173" },
  // Tests run against production builds. The first, on port 4173, sets VITE_LOCAL_DATA
  // so the map pages can be tested without signing in (a sign-in needs a real
  // authenticator). The second, on 4174, is a normal build, as deployed, and is used to
  // test the sign-in gate. Each has its own output folder so they do not collide.
  webServer: [
    {
      command: "npm run build && npm run preview -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: true,
      env: { VITE_LOCAL_DATA: "true" },
    },
    {
      command:
        "npx vite build --outDir dist-secure && npx vite preview --outDir dist-secure --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: true,
      env: FIREBASE_TEST_ENV,
    },
  ],
});
