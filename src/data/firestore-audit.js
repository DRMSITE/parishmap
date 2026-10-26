// Reads the audit log (who invited, changed or disabled whom). The `api` function writes
// it; only admins can read it (firestore.rules), and nobody can change it from here.
// Stored data is untrusted, so anything not well-formed is left out rather than
// breaking the page.

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";

/** @typedef {import("../types.js").AuditEntry} AuditEntry */

export const AUDIT_COLLECTION = "auditLog";
export const PAGE_SIZE = 50;

/** @param {unknown} value @returns {string} */
const text = (value) => (typeof value === "string" ? value.slice(0, 300) : "");

/**
 * @param {string} id
 * @param {Record<string, any>} d The stored fields.
 * @returns {AuditEntry | undefined}
 */
export function toEntry(id, d) {
  if (typeof d.action !== "string" || !d.action) return undefined;
  const when = typeof d.at?.toDate === "function" ? d.at.toDate() : null;
  return {
    id,
    action: text(d.action),
    byEmail: text(d.byEmail),
    targetEmail: text(d.targetEmail),
    detail: text(d.detail),
    at:
      when instanceof Date && !Number.isNaN(when.getTime())
        ? when.toISOString()
        : null,
  };
}

/**
 * @param {import("firebase/firestore").Firestore} db
 * @returns {Pick<import("../types.js").AuditAccess, "list">}
 */
export function createFirestoreAudit(db) {
  return {
    async list(cursor) {
      /** @type {import("firebase/firestore").QueryConstraint[]} */
      const constraints = [orderBy("at", "desc")];
      if (cursor)
        constraints.push(
          startAfter(
            /** @type {import("firebase/firestore").QueryDocumentSnapshot} */ (
              cursor
            ),
          ),
        );
      constraints.push(limit(PAGE_SIZE));
      let snapshot;
      try {
        snapshot = await getDocs(
          query(collection(db, AUDIT_COLLECTION), ...constraints),
        );
      } catch (error) {
        throw /** @type {{ code?: string }} */ (error)?.code ===
          "permission-denied"
          ? new Error("Only administrators can see the activity.", {
              cause: error,
            })
          : new Error("Could not load the activity. Try again.", {
              cause: error,
            });
      }
      const entries = snapshot.docs
        .map((doc) => toEntry(doc.id, doc.data()))
        .filter((entry) => entry !== undefined);
      // A full page may be followed by more; a short one is the end.
      const last = snapshot.docs.at(-1);
      return {
        entries,
        cursor: snapshot.size === PAGE_SIZE && last ? last : null,
      };
    },
  };
}
