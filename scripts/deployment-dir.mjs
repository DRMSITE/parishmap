// Where this council's own files are: `deployment/` if it exists, otherwise the committed
// `deployment.example/`, so a fresh clone still builds and tests. Shared by the Vite and
// Vitest configurations. PARISHMAP_DEPLOYMENT names another folder (the screenshot script
// uses it); leave it unset otherwise.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

export const deploymentDir = process.env.PARISHMAP_DEPLOYMENT
  ? resolve(process.env.PARISHMAP_DEPLOYMENT)
  : resolve(
      root,
      existsSync(resolve(root, "deployment/parish.config.js"))
        ? "deployment"
        : "deployment.example",
    );
