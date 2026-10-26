// Sets up sign-in the way ParishMap needs it, through the Identity Platform admin API:
//
//   - email and password sign-in on;
//   - sign-up OFF, so nobody can make themselves an account (people are invited);
//   - authenticator-app (TOTP) second factor available.
//
// Firebase has no "require MFA" switch. The app makes everyone enrol, and firestore.rules
// refuses any token without the second factor, so "available" is all this needs to set.
//
// Do the console step first: Authentication > Get started, then upgrade to Identity
// Platform (docs/firebase-setup.md). Then:
//
//   gcloud auth application-default login
//   node scripts/configure-auth.mjs          shows what would change
//   node scripts/configure-auth.mjs --yes    does it
//
// It uses your own Application Default Credentials; no key file is involved. The project
// comes from .firebaserc (or FIREBASE_PROJECT).

import { pathToFileURL } from "node:url";

/** The settings ParishMap needs, in the shape the Identity Platform API uses. */
export const WANTED = {
  signIn: { email: { enabled: true, passwordRequired: true } },
  client: { permissions: { disabledUserSignup: true } },
  mfa: {
    state: "ENABLED",
    providerConfigs: [{ state: "ENABLED", totpProviderConfig: {} }],
  },
};

/** Which parts of the config the update touches, so nothing else is changed. */
export const UPDATE_MASK = "signIn.email,client.permissions.disabledUserSignup,mfa";

/**
 * Plain-words differences between the current config and what is wanted.
 * @param {Record<string, any>} current
 * @returns {string[]} Empty if nothing needs changing.
 */
export function describeChanges(current) {
  /** @type {string[]} */
  const changes = [];
  const email = current.signIn?.email;
  if (!email?.enabled) changes.push("turn on email and password sign-in");
  else if (!email.passwordRequired)
    changes.push("require a password (not just an emailed link)");
  if (!current.client?.permissions?.disabledUserSignup)
    changes.push("turn sign-up off, so people can only be invited");
  const totp = (current.mfa?.providerConfigs ?? []).find(
    (/** @type {any} */ p) => p.totpProviderConfig,
  );
  if (
    !["ENABLED", "MANDATORY"].includes(current.mfa?.state) ||
    !totp ||
    !["ENABLED", "MANDATORY"].includes(totp.state)
  )
    changes.push("make the authenticator-app (TOTP) second factor available");
  return changes;
}

/**
 * The body to send. Keeps an existing TOTP setting (such as its interval) if there is one.
 * @param {Record<string, any>} current
 */
export function buildPatch(current) {
  const keep = (current.mfa?.providerConfigs ?? []).find(
    (/** @type {any} */ p) => p.totpProviderConfig,
  );
  return {
    ...WANTED,
    mfa: {
      state: current.mfa?.state === "MANDATORY" ? "MANDATORY" : "ENABLED",
      providerConfigs: [
        {
          state: keep?.state === "MANDATORY" ? "MANDATORY" : "ENABLED",
          totpProviderConfig: keep?.totpProviderConfig ?? {},
        },
      ],
    },
  };
}

async function main() {
  const { applicationDefault, initializeApp } = await import("firebase-admin/app");
  const { projectId } = await import("./project-id.mjs");
  const id = projectId();
  const confirmed = process.argv.includes("--yes");

  initializeApp({ credential: applicationDefault(), projectId: id });
  /** @type {{ access_token: string }} */
  let token;
  try {
    token = await applicationDefault().getAccessToken();
  } catch {
    throw new Error(
      "Could not sign in with your Google credentials. Run `gcloud auth application-default login` and try again.",
    );
  }
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${id}/config`;
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
    // Bill the project you are changing, not whatever your credentials last used.
    "X-Goog-User-Project": id,
  };

  const read = await fetch(url, { headers });
  if (!read.ok)
    throw new Error(
      `Could not read the sign-in settings for ${id} (${read.status}). Have you upgraded to Identity Platform, and run \`gcloud auth application-default login\`?`,
    );
  const current = await read.json();
  const changes = describeChanges(current);

  console.log(`Project: ${id}`);
  if (!changes.length) {
    console.log("Sign-in is already set up as ParishMap needs it. Nothing to change.");
    return;
  }
  console.log("This would:");
  for (const change of changes) console.log(`  - ${change}`);
  if (!confirmed) {
    console.log("\nNothing changed. Add --yes to do it.");
    return;
  }

  const write = await fetch(`${url}?updateMask=${UPDATE_MASK}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(buildPatch(current)),
  });
  if (!write.ok)
    throw new Error(`The update was refused (${write.status}): ${await write.text()}`);
  console.log("\nDone. Sign-in is set up.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
