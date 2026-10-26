// Turns stored projects, actions and notes into the app's records. Stored data is
// untrusted (another tab, another app on the same origin, or a document written outside
// the app can change it), so anything not well-formed gives `undefined` and is left out
// rather than breaking the views. Shared by the Firestore and local stores.

import { isValidDate, LANES, PROJECT_STATUSES } from "./model.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").ProjectNote} ProjectNote */
/** @typedef {import("../types.js").Stamps} Stamps */

/**
 * A Firestore timestamp or an ISO 8601 string (as the local store keeps), as ISO 8601.
 * @param {any} value
 * @returns {string | null} Null if it is neither.
 */
function toIso(value) {
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : typeof value === "string"
        ? new Date(value)
        : null;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : null;
}

/** @param {unknown} value @returns {value is string[]} */
const isStringList = (value) =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/**
 * The stamps every document carries, or undefined if any is missing.
 * @param {string} id
 * @param {Record<string, any>} d
 * @returns {Stamps | undefined}
 */
export function toStamps(id, d) {
  const createdAt = toIso(d.createdAt);
  const updatedAt = toIso(d.updatedAt);
  if (!createdAt || !updatedAt) return undefined;
  for (const key of [
    "createdBy",
    "createdByEmail",
    "updatedBy",
    "updatedByEmail",
  ])
    if (typeof d[key] !== "string") return undefined;
  return {
    id,
    createdBy: d.createdBy,
    createdByEmail: d.createdByEmail,
    createdAt,
    updatedAt,
    updatedBy: d.updatedBy,
    updatedByEmail: d.updatedByEmail,
  };
}

/**
 * @param {string} id
 * @param {Record<string, any>} d The stored fields.
 * @returns {Project | undefined}
 */
export function toProject(id, d) {
  const stamps = toStamps(id, d);
  if (!stamps) return undefined;
  if (typeof d.title !== "string" || !d.title) return undefined;
  if (typeof d.summary !== "string") return undefined;
  if (!PROJECT_STATUSES.some((s) => s.id === d.status)) return undefined;
  if (d.parentId !== null && typeof d.parentId !== "string") return undefined;
  if (typeof d.responsibleUid !== "string" || !d.responsibleUid)
    return undefined;
  if (typeof d.responsibleEmail !== "string") return undefined;
  if (!isStringList(d.featureIds)) return undefined;
  return {
    ...stamps,
    title: d.title,
    summary: d.summary,
    status: d.status,
    parentId: d.parentId,
    responsibleUid: d.responsibleUid,
    responsibleEmail: d.responsibleEmail,
    featureIds: d.featureIds,
  };
}

/**
 * @param {string} id
 * @param {Record<string, any>} d The stored fields.
 * @returns {ProjectAction | undefined}
 */
export function toAction(id, d) {
  const stamps = toStamps(id, d);
  if (!stamps) return undefined;
  if (typeof d.projectId !== "string" || !d.projectId) return undefined;
  if (typeof d.title !== "string" || !d.title) return undefined;
  if (typeof d.details !== "string") return undefined;
  if (!LANES.some((l) => l.id === d.lane)) return undefined;
  if (!Number.isFinite(d.order)) return undefined;
  if (!isStringList(d.featureIds)) return undefined;
  /** @type {ProjectAction} */
  const action = {
    ...stamps,
    projectId: d.projectId,
    title: d.title,
    details: d.details,
    lane: d.lane,
    order: d.order,
    featureIds: d.featureIds,
  };
  if (d.assigneeUid !== undefined || d.assigneeEmail !== undefined) {
    if (
      typeof d.assigneeUid !== "string" ||
      typeof d.assigneeEmail !== "string"
    )
      return undefined;
    action.assigneeUid = d.assigneeUid;
    action.assigneeEmail = d.assigneeEmail;
  }
  if (d.dueDate !== undefined) {
    if (!isValidDate(d.dueDate)) return undefined;
    action.dueDate = d.dueDate;
  }
  return action;
}

/**
 * @param {string} id
 * @param {Record<string, any>} d The stored fields.
 * @returns {ProjectNote | undefined}
 */
export function toNote(id, d) {
  const stamps = toStamps(id, d);
  if (!stamps) return undefined;
  if (typeof d.projectId !== "string" || !d.projectId) return undefined;
  if (typeof d.body !== "string" || !d.body) return undefined;
  /** @type {ProjectNote} */
  const note = { ...stamps, projectId: d.projectId, body: d.body };
  if (d.actionId !== undefined) {
    if (typeof d.actionId !== "string" || !d.actionId) return undefined;
    note.actionId = d.actionId;
  }
  return note;
}
