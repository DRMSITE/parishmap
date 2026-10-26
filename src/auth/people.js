// Managing people from the browser: who the interface offers actions for, and the client
// for the `api` function. The decisions are made again on the server (functions/people-
// handler.js), so this only keeps the interface from offering what would be refused.

import { ROLES } from "./session.js";

/** @typedef {import("../types.js").Person} Person */

const ROLE_LABELS = /** @type {Record<string, string>} */ ({
  admin: "Administrator",
  clerk: "Clerk",
  councillor: "Councillor",
  member: "Member",
});

/** How a role is shown to people. @param {string | null} role */
export function roleLabel(role) {
  return role ? (ROLE_LABELS[role] ?? role) : "No role";
}

/**
 * The roles a person of `role` may give. Keep in step with functions/people-handler.js.
 * @param {string | undefined} role
 * @returns {readonly string[]}
 */
export function assignableRoles(role) {
  return role === "admin" ? ROLES : ["councillor", "member"];
}

/**
 * Whether a person of `role` may change someone who currently has `targetRole`.
 * @param {string | undefined} role
 * @param {string | null} targetRole
 */
export function canManage(role, targetRole) {
  if (role === "admin") return true;
  return !targetRole || targetRole === "councillor" || targetRole === "member";
}

/**
 * Remember the directory for a few minutes, so opening several dialogs does not ask the
 * server each time. A failure is not remembered, so the next ask tries again.
 * @param {() => Promise<import("../types.js").DirectoryPerson[]>} fetchDirectory
 * @param {number} [maxAgeMs]
 * @param {() => number} [now]
 * @returns {() => Promise<import("../types.js").DirectoryPerson[]>}
 */
export function cacheDirectory(
  fetchDirectory,
  maxAgeMs = 5 * 60_000,
  now = Date.now,
) {
  /** @type {{ at: number, people: import("../types.js").DirectoryPerson[] } | null} */
  let cached = null;
  return async () => {
    if (cached && now() - cached.at < maxAgeMs) return cached.people;
    const people = await fetchDirectory();
    cached = { at: now(), people };
    return people;
  };
}

/**
 * @param {() => Promise<string>} getToken A current ID token.
 * @returns {import("../types.js").PeopleApi}
 */
export function createPeopleApi(getToken) {
  /**
   * @param {Record<string, unknown>} body
   * @returns {Promise<any>}
   */
  async function call(body) {
    let response;
    try {
      response = await fetch("/api/people", {
        method: "POST",
        // Not Authorization: Cloud Run would try to validate a Firebase token there itself.
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-Token": await getToken(),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error("Cannot reach the server. Check your connection.", {
        cause: error,
      });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Something went wrong. Please try again.",
      );
    return result;
  }

  return {
    async list() {
      return (await call({ action: "list" })).people;
    },
    async directory() {
      return (await call({ action: "directory" })).people;
    },
    async invite(email, role) {
      return (await call({ action: "invite", email, role })).person;
    },
    async setRole(uid, role) {
      await call({ action: "setRole", uid, role });
    },
    async setDisabled(uid, disabled) {
      await call({ action: "setDisabled", uid, disabled });
    },
    async resetAuthenticators(uid) {
      await call({ action: "resetAuthenticators", uid });
    },
  };
}
