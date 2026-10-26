// Give someone a role, or take it away. Roles are Firebase custom claims, which only the
// Admin SDK can set, and firestore.rules trusts them. Run it from this machine while
// signed in to gcloud as the project owner:
//
//   gcloud auth application-default login
//   node scripts/set-role.mjs <email> <admin|clerk|councillor|member|none>          (shows what it would do)
//   node scripts/set-role.mjs <email> <role> --yes                                   (does it)
//
// The person must already exist (Authentication > Users). They are signed out
// everywhere so the new role applies the next time they sign in. No key file is used:
// it relies on your own Application Default Credentials.

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { ROLES } from "../src/auth/session.js";
import { projectId } from "./project-id.mjs";

const PROJECT_ID = projectId();

const [email, role, ...flags] = process.argv.slice(2);
const confirmed = flags.includes("--yes");
const valid = [...ROLES, "none"];

if (!email || !valid.includes(role) || flags.some((f) => f !== "--yes")) {
  console.error(
    `Usage: node scripts/set-role.mjs <email> <${valid.join("|")}> [--yes]`,
  );
  process.exit(2);
}

// Admin calls made with a user's credentials need a project to bill; use this one.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;
const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const auth = getAuth(app);

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  console.error(
    error?.code === "auth/user-not-found"
      ? `No user with the email ${email} in ${PROJECT_ID}. Add them under Authentication > Users first.`
      : `Could not look up ${email}: ${error?.message ?? error}`,
  );
  process.exit(1);
}

const current = user.customClaims?.role ?? "(none)";
const factors = user.multiFactor?.enrolledFactors?.length ?? 0;
console.log(`Project:        ${PROJECT_ID}`);
console.log(`User:           ${user.email} (${user.uid})`);
console.log(`Email verified: ${user.emailVerified}`);
console.log(`Authenticators: ${factors}`);
console.log(
  `Role:           ${current}  ->  ${role === "none" ? "(none)" : role}`,
);

if (!confirmed) {
  console.log("\nNothing changed. Run again with --yes to apply.");
  process.exit(0);
}

const { role: _old, ...otherClaims } = user.customClaims ?? {};
await auth.setCustomUserClaims(
  user.uid,
  role === "none" ? otherClaims : { ...otherClaims, role },
);
await auth.revokeRefreshTokens(user.uid);
console.log("\nDone. They will need to sign in again.");
