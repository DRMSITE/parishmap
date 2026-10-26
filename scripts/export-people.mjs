// Save a list of who has an account and what role they have, so the accounts could be
// rebuilt after a disaster (Firestore backups do not include Authentication). Run it
// from this machine while signed in to gcloud as the project owner:
//
//   gcloud auth application-default login
//   node scripts/export-people.mjs [file.csv]
//
// The file has email, role, disabled, created and last sign-in, and nothing secret: no
// passwords or password hashes. It is still personal information, so keep it somewhere
// private and do not commit it (`people-*.csv` is in .gitignore). It only reads; nothing
// is changed. No key file is used: it relies on your own Application Default Credentials.

import { writeFileSync } from "node:fs";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { ROLES } from "../src/auth/session.js";
import { projectId } from "./project-id.mjs";

const PROJECT_ID = projectId();

const today = new Date().toISOString().slice(0, 10);
const file = process.argv[2] ?? `people-${today}.csv`;
if (process.argv.length > 3 || file.startsWith("-")) {
  console.error("Usage: node scripts/export-people.mjs [file.csv]");
  process.exit(2);
}

process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;
const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

/** Quote a field, and stop a spreadsheet treating text as a formula. @param {unknown} value */
function cell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const rows = [["email", "role", "disabled", "created", "last_sign_in"]];
let pageToken;
do {
  const page = await getAuth(app).listUsers(1000, pageToken);
  for (const user of page.users) {
    const role = user.customClaims?.role;
    rows.push([
      user.email ?? "",
      ROLES.includes(role) ? role : "",
      user.disabled ? "yes" : "no",
      user.metadata.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : "",
      user.metadata.lastSignInTime
        ? new Date(user.metadata.lastSignInTime).toISOString()
        : "",
    ]);
  }
  pageToken = page.pageToken;
} while (pageToken);

writeFileSync(
  file,
  `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`,
  {
    flag: "wx",
  },
);
console.log(`Wrote ${rows.length - 1} people to ${file}. Keep it private.`);
