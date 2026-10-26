// Which Firebase project the admin scripts act on: FIREBASE_PROJECT if set, otherwise the
// default in `.firebaserc` (which `firebase use` writes). Failing loudly beats acting on
// the wrong project, so there is no built-in fallback.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

export function projectId() {
  if (process.env.FIREBASE_PROJECT) return process.env.FIREBASE_PROJECT;
  const file = resolve(root, ".firebaserc");
  if (existsSync(file)) {
    const id = JSON.parse(readFileSync(file, "utf8")).projects?.default;
    if (id) return id;
  }
  console.error(
    "No Firebase project set. Run `firebase use <project-id>` (this writes .firebaserc) or set FIREBASE_PROJECT.",
  );
  process.exit(2);
}
