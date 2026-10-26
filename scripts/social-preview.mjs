// Renders docs/social-preview.html to docs/social-preview.png (1280 x 640), the image GitHub
// shows when the repository is shared. Upload it in the repository's Settings, Social preview.
//
//   node scripts/social-preview.mjs
//
// It uses the Chromium that `npx playwright install chromium` provides.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.goto(pathToFileURL(resolve(root, "docs/social-preview.html")).href);
  await page.screenshot({ path: resolve(root, "docs/social-preview.png") });
  console.log("Wrote docs/social-preview.png");
} finally {
  await browser.close();
}
