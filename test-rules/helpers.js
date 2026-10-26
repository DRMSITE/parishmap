import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import rules from "../firestore.rules?raw";

export const PROJECT_ID = "demo-parishmap";

/** Start the emulator-backed test environment with the real rules file. */
export function createTestEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rules },
  });
}

/**
 * A signed-in context. By default the user has a role and has used a second factor.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} uid
 * @param {{ role?: string, mfa?: boolean }} [options]
 */
export function userContext(env, uid, { role, mfa = true } = {}) {
  /** @type {Record<string, unknown>} */
  const claims = { email: `${uid}@example.org` };
  if (role) claims.role = role;
  if (mfa) claims.firebase = { sign_in_second_factor: "totp" };
  return env.authenticatedContext(uid, claims);
}

const SEEDED_AT = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

/**
 * The author and time stamps every project, action and note carries.
 * @param {string} uid
 */
const seededStamps = (uid) => ({
  createdBy: uid,
  createdByEmail: `${uid}@example.org`,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
  updatedBy: uid,
  updatedByEmail: `${uid}@example.org`,
});

/**
 * Store a document directly, bypassing the rules.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} collectionName
 * @param {string} id
 * @param {Record<string, unknown>} data
 */
function seed(env, collectionName, id, data) {
  return env.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), collectionName, id), data),
  );
}

/**
 * Store a project. `responsibleUid` is the councillor in charge of it.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} id
 * @param {string} responsibleUid
 * @param {Record<string, unknown>} [overrides]
 */
export function seedProject(env, id, responsibleUid, overrides = {}) {
  return seed(env, "projects", id, {
    title: "Seeded project",
    summary: "",
    status: "active",
    parentId: null,
    responsibleUid,
    responsibleEmail: `${responsibleUid}@example.org`,
    featureIds: [],
    ...seededStamps("boss"),
    ...overrides,
  });
}

/**
 * Store an action, written by `ownerUid`.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} id
 * @param {string} projectId
 * @param {string} ownerUid
 * @param {Record<string, unknown>} [overrides]
 */
export function seedAction(env, id, projectId, ownerUid, overrides = {}) {
  return seed(env, "actions", id, {
    projectId,
    title: "Seeded action",
    details: "",
    lane: "agreed",
    order: 1,
    featureIds: [],
    ...seededStamps(ownerUid),
    ...overrides,
  });
}

/**
 * Store a note, written by `ownerUid`.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} id
 * @param {string} projectId
 * @param {string} ownerUid
 * @param {Record<string, unknown>} [overrides]
 */
export function seedNote(env, id, projectId, ownerUid, overrides = {}) {
  return seed(env, "notes", id, {
    projectId,
    body: "Seeded note",
    ...seededStamps(ownerUid),
    ...overrides,
  });
}

/**
 * Store a feature directly, bypassing the rules, as the starting state for a test.
 * @param {import("@firebase/rules-unit-testing").RulesTestEnvironment} env
 * @param {string} id
 * @param {string} ownerUid
 * @param {Record<string, unknown>} [overrides]
 */
export async function seedFeature(env, id, ownerUid, overrides = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "features", id), {
      lat: 52.39,
      lng: 0.21,
      data: { title: "Seeded", notes: "" },
      createdBy: ownerUid,
      createdByEmail: `${ownerUid}@example.org`,
      createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
      ...overrides,
    });
  });
}
