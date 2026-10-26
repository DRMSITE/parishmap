// What projects, actions and notes are, shared by both data sources, the guard and the
// views: the lanes and statuses, the limits, and the checks that give a readable message
// before anything is sent. firestore.rules makes the same decisions again.

import { config } from "../config.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectInput} ProjectInput */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").ActionInput} ActionInput */
/** @typedef {import("../types.js").ProjectNote} ProjectNote */
/** @typedef {import("../types.js").NoteInput} NoteInput */

/**
 * Where a project's own page is. The route table has no path parameters, so the project
 * is named in the query string.
 * @param {string} id
 */
export const projectHref = (id) => `/projects?p=${encodeURIComponent(id)}`;

/**
 * Where a place on the map is shown: the map page, which frames it and opens its popup.
 * @param {string} id The id of a record in `ctx.data`.
 */
export const placeHref = (id) => `/?place=${encodeURIComponent(id)}`;

/** The board's lanes, left to right. Keep in step with firestore.rules. */
export const LANES = [
  { id: "ideas", label: "Ideas" },
  { id: "agreed", label: "Agreed" },
  { id: "in-progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

/** Where an action starts: anyone may add to it. */
export const FIRST_LANE = "ideas";

/** Keep in step with firestore.rules. */
export const PROJECT_STATUSES = [
  { id: "planning", label: "Planning" },
  { id: "active", label: "Active" },
  { id: "on-hold", label: "On hold" },
  { id: "complete", label: "Complete" },
];

/** @param {string} id */
export const laneLabel = (id) => LANES.find((l) => l.id === id)?.label ?? id;

/** @param {string} id */
export const statusLabel = (id) =>
  PROJECT_STATUSES.find((s) => s.id === id)?.label ?? id;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} value */
const isText = (value) => typeof value === "string";

/**
 * @param {unknown} title
 * @returns {string | null}
 */
function checkTitle(title) {
  if (!isText(title) || title.trim() === "") return "Enter a title.";
  if (title.length > config.limits.title)
    return `Keep the title to ${config.limits.title} characters or fewer.`;
  return null;
}

/**
 * @param {unknown} text
 * @param {string} what For example "summary".
 * @returns {string | null}
 */
function checkLongText(text, what) {
  if (text !== undefined && !isText(text)) return `The ${what} must be text.`;
  if (isText(text) && text.length > config.limits.notes)
    return `Keep the ${what} to ${config.limits.notes} characters or fewer.`;
  return null;
}

/**
 * @param {unknown} ids
 * @returns {string | null}
 */
function checkFeatureIds(ids) {
  if (!Array.isArray(ids) || !ids.every(isText))
    return "Linked map features must be a list.";
  if (ids.length > config.limits.featureLinks)
    return `Link to at most ${config.limits.featureLinks} map features.`;
  return null;
}

/**
 * The first problem with a project, as a sentence for the person, or null.
 * @param {ProjectInput} input
 * @returns {string | null}
 */
export function validateProject(input) {
  return (
    checkTitle(input.title) ??
    checkLongText(input.summary, "summary") ??
    (PROJECT_STATUSES.some((s) => s.id === input.status)
      ? null
      : "Choose a status.") ??
    (input.responsibleUid ? null : "Choose who is responsible.") ??
    checkFeatureIds(input.featureIds)
  );
}

/**
 * As `validateProject`, and checks that a new sub-project is not nested too deeply.
 * @param {ProjectInput} input
 * @param {Project[]} projects Every existing project.
 * @returns {string | null}
 */
export function validateNewProject(input, projects) {
  const problem = validateProject(input);
  if (problem) return problem;
  if (input.parentId) {
    if (!projects.some((p) => p.id === input.parentId))
      return "That project no longer exists.";
    if (projectDepth(projects, input.parentId) >= config.limits.projectDepth)
      return `Projects can only go ${config.limits.projectDepth} levels deep.`;
  }
  return null;
}

/**
 * @param {ActionInput} input
 * @returns {string | null}
 */
export function validateAction(input) {
  if (!input.projectId) return "Choose a project.";
  const problem =
    checkTitle(input.title) ?? checkLongText(input.details, "details");
  if (problem) return problem;
  if (!LANES.some((l) => l.id === input.lane)) return "Choose a lane.";
  if (!Number.isFinite(input.order)) return "The position is not valid.";
  if (Boolean(input.assigneeUid) !== Boolean(input.assigneeEmail))
    return "Choose who the action is for.";
  if (input.dueDate !== undefined && !isValidDate(input.dueDate))
    return "Enter the due date as day, month and year.";
  return checkFeatureIds(input.featureIds);
}

/**
 * @param {NoteInput} input
 * @returns {string | null}
 */
export function validateNote(input) {
  if (!input.projectId) return "Choose a project.";
  if (!isText(input.body) || input.body.trim() === "") return "Write a note.";
  return checkLongText(input.body, "note");
}

/**
 * A date as stored: year-month-day, and a real day.
 * @param {unknown} value
 */
export function isValidDate(value) {
  if (!isText(value) || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * How many levels down a project is: 1 for a top-level project. A broken loop of
 * parents (which the rules prevent) ends the count rather than hanging.
 * @param {Project[]} projects
 * @param {string} id
 */
export function projectDepth(projects, id) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const seen = new Set();
  let depth = 0;
  /** @type {string | null | undefined} */
  let current = id;
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    depth++;
    current = byId.get(current)?.parentId;
  }
  return depth;
}

/**
 * A project and everything beneath it.
 * @param {Project[]} projects
 * @param {string} id
 * @returns {Set<string>}
 */
export function projectAndDescendants(projects, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of projects)
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id);
        grew = true;
      }
  }
  return ids;
}

/**
 * The actions in one lane, in board order.
 * @param {ProjectAction[]} actions
 * @param {string} lane
 */
export function actionsInLane(actions, lane) {
  return actions.filter((a) => a.lane === lane).sort(byOrder);
}

/**
 * Board order: by position, then oldest first so equal positions (two people moving at
 * once) always sort the same way.
 * @param {ProjectAction} a
 * @param {ProjectAction} b
 */
export function byOrder(a, b) {
  return (
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * A position between two neighbours, so a card can be dropped without renumbering the
 * rest. Pass undefined for "nothing before" or "nothing after".
 * @param {number | undefined} before
 * @param {number | undefined} after
 */
export function orderBetween(before, after) {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return /** @type {number} */ (after) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/**
 * The position at the end of a lane, for a card moved there by choosing a lane.
 * @param {ProjectAction[]} actions Every action (any lane).
 * @param {string} lane
 */
export function endOfLane(actions, lane) {
  return orderBetween(actionsInLane(actions, lane).at(-1)?.order, undefined);
}

/**
 * The position for a card dropped at `index` among the other cards in a lane.
 * @param {ProjectAction[]} others The lane's cards in board order, without the one being moved.
 * @param {number} index Where it goes: 0 is the top, `others.length` the end.
 */
export function orderAtIndex(others, index) {
  return orderBetween(others[index - 1]?.order, others[index]?.order);
}

/**
 * The position for a card moved one place up or down within its lane, or null if it
 * is already at that end.
 * @param {ProjectAction[]} lane The lane's cards in board order.
 * @param {string} id The card to move.
 * @param {-1 | 1} step -1 for up, 1 for down.
 */
export function orderAfterShift(lane, id, step) {
  const from = lane.findIndex((a) => a.id === id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= lane.length) return null;
  return orderAtIndex(
    lane.filter((a) => a.id !== id),
    to,
  );
}
