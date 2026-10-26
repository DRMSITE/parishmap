// Cloud Functions for ParishMap. Admin SDK code lives here and never in
// the browser bundle.
//
// `tiles` proxies map tiles from providers that need a key, so that the key stays in
// Secret Manager. Which providers, their secrets, the area covered and the region all come
// from tiles.config.json, which `npm run generate` writes from deployment/parish.config.js
// (it is generated, not edited). Set each key with:
//   firebase functions:secrets:set <SECRET_NAME> --project <your-project-id>
//
// `api` is how the clerk and admins manage people (invites, roles, disabling). It uses the
// Admin SDK, which is why it is a function and not browser code. The same token header
// as `tiles` is used, for the same reason (Cloud Run reads Authorization itself). Its
// `directory` action also serves councillors, with ids and emails only.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { handlePeopleRequest, ROLES } from "./people-handler.js";
import { handleTileRequest } from "./tiles-handler.js";

initializeApp();

/** @type {{ region: string } & import("./tiles-handler.js").TilesSettings} */
const settings = (() => {
  try {
    return JSON.parse(
      readFileSync(new URL("./tiles.config.json", import.meta.url), "utf8"),
    );
  } catch {
    throw new Error(
      "functions/tiles.config.json is missing. Run `npm run generate` in the project root, then deploy again.",
    );
  }
})();
const REGION = settings.region;

// One secret per proxied provider. The values are read only while handling a request.
const secrets = Object.fromEntries(
  [...new Set(Object.values(settings.providers).map((p) => p.secret))].map(
    (name) => [name, defineSecret(name)],
  ),
);

export const tiles = onRequest(
  {
    region: REGION,
    secrets: Object.values(secrets),
    // The function checks the sign-in itself, so Cloud Run must let the request in.
    invoker: "public",
    cors: false,
    // A ceiling on cost and on use of the provider's quota if something goes wrong.
    maxInstances: 5,
    memory: "256MiB",
    timeoutSeconds: 15,
  },
  async (req, res) => {
    const result = await handleTileRequest(
      {
        method: req.method,
        path: req.path,
        idToken: req.get("x-firebase-token"),
      },
      {
        // checkRevoked: a person signed out everywhere (as set-role.mjs does) loses tiles at once.
        verifyToken: (idToken) => getAuth().verifyIdToken(idToken, true),
        secretValue: (name) => secrets[name].value(),
        async fetchUrl(url) {
          // The key is in the address because providers take it there. It is never logged
          // or sent back to the browser.
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
          });
          return {
            status: response.status,
            contentType: response.headers.get("content-type") ?? "",
            body: await response.arrayBuffer(),
          };
        },
      },
      settings,
    );
    res.status(result.status).set(result.headers);
    res.send(
      typeof result.body === "string" ? result.body : Buffer.from(result.body),
    );
  },
);

/**
 * @param {import("firebase-admin/auth").UserRecord} user
 * @returns {import("./people-handler.js").Person}
 */
function toPerson(user) {
  const role = user.customClaims?.role;
  return {
    uid: user.uid,
    email: user.email ?? "",
    role: ROLES.includes(role) ? role : null,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    authenticators: user.multiFactor?.enrolledFactors?.length ?? 0,
    lastSignIn: user.metadata.lastSignInTime
      ? new Date(user.metadata.lastSignInTime).toISOString()
      : null,
  };
}

/** @param {string} uid */
async function signOutEverywhere(uid) {
  await getAuth().revokeRefreshTokens(uid);
}

/** @type {import("./people-handler.js").PeopleDeps} */
const peopleDeps = {
  // checkRevoked also refuses a disabled account, so a disabled clerk loses access at once.
  verifyToken: (idToken) => getAuth().verifyIdToken(idToken, true),
  async listPeople() {
    // One page of up to 1000 is far more than a parish council needs.
    const result = await getAuth().listUsers(1000);
    return result.users.map(toPerson);
  },
  async getPerson(uid) {
    try {
      return toPerson(await getAuth().getUser(uid));
    } catch (error) {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    }
  },
  async findByEmail(email) {
    try {
      return toPerson(await getAuth().getUserByEmail(email));
    } catch (error) {
      if (error?.code === "auth/user-not-found") return null;
      throw error;
    }
  },
  // The password is random and never shown: the person sets their own from the emailed link.
  async createPerson(email) {
    const user = await getAuth().createUser({
      email,
      emailVerified: false,
      password: randomBytes(24).toString("base64url"),
    });
    return toPerson(user);
  },
  async setRole(uid, role) {
    const user = await getAuth().getUser(uid);
    await getAuth().setCustomUserClaims(uid, {
      ...user.customClaims,
      role,
    });
    await signOutEverywhere(uid);
  },
  async setDisabled(uid, disabled) {
    await getAuth().updateUser(uid, { disabled });
    await signOutEverywhere(uid);
  },
  async resetAuthenticators(uid) {
    await getAuth().updateUser(uid, {
      multiFactor: { enrolledFactors: null },
    });
    await signOutEverywhere(uid);
  },
  async audit(entry) {
    await getFirestore()
      .collection("auditLog")
      .add({ ...entry, at: FieldValue.serverTimestamp() });
  },
};

export const api = onRequest(
  {
    region: REGION,
    // The function checks the sign-in itself, so Cloud Run must let the request in.
    invoker: "public",
    // Called only through Hosting's /api rewrite, so it is same-origin: no CORS.
    cors: false,
    maxInstances: 3,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      const result = await handlePeopleRequest(
        {
          method: req.method,
          idToken: req.get("x-firebase-token"),
          body: req.body,
        },
        peopleDeps,
      );
      res.status(result.status).json(result.body);
    } catch (error) {
      // The details stay in the logs; the caller gets nothing to learn from.
      console.error("[api] Request failed.", error);
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    }
  },
);
