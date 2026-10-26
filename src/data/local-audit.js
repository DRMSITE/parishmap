// A stand-in for the audit log, for the local, sign-in-free start-up (development and the
// end-to-end tests only). It makes enough entries for two pages.

/** @typedef {import("../types.js").AuditEntry} AuditEntry */

const ACTIONS = [
  ["invite", "councillor"],
  ["setRole", "member -> councillor"],
  ["disable", ""],
  ["enable", ""],
  ["resetAuthenticator", ""],
];

/** @returns {Pick<import("../types.js").AuditAccess, "list">} */
export function createLocalAudit() {
  const total = 60;
  /** @type {AuditEntry[]} */
  const all = Array.from({ length: total }, (_, i) => {
    const [action, detail] = ACTIONS[i % ACTIONS.length];
    return {
      id: `e${i}`,
      action: action === "resetAuthenticator" ? "resetAuthenticators" : action,
      byEmail: i % 2 ? "clerk@example.org" : "me@example.org",
      targetEmail: `person${i}@example.org`,
      detail,
      at: new Date(Date.UTC(2026, 9, 21, 12, 0) - i * 3_600_000).toISOString(),
    };
  });
  const pageSize = 50;
  return {
    async list(cursor) {
      const start = typeof cursor === "number" ? cursor : 0;
      const end = start + pageSize;
      return {
        entries: all.slice(start, end),
        cursor: end < total ? end : null,
      };
    },
  };
}
