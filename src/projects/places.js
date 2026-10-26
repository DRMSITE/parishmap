// Showing the map features a project or action is linked to. A feature that has since
// been deleted is shown as removed rather than hidden, so the link is never silently lost.

import { placeHref, projectHref } from "./model.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

/** What a deleted place is called. */
export const REMOVED_PLACE = "a place that has been removed from the map";

/**
 * A line such as "Projects: Tree survey, Village green refresh", each a link to the
 * project, for a place on the map or in the Points list.
 * @param {{ id: string, title: string }[]} projects
 * @param {string} [className]
 * @returns {HTMLParagraphElement | null} Null when there are none.
 */
export function buildProjectLinks(projects, className) {
  if (projects.length === 0) return null;
  const p = document.createElement("p");
  if (className) p.className = className;
  p.append(projects.length === 1 ? "Project: " : "Projects: ");
  projects.forEach((project, i) => {
    if (i > 0) p.append(", ");
    const link = document.createElement("a");
    link.href = projectHref(project.id);
    link.textContent = project.title;
    p.append(link);
  });
  return p;
}

/**
 * A line such as "Places: Old oak, Village green", each place a link to the map.
 * Built as DOM so titles are never parsed as HTML.
 * @param {string[]} featureIds
 * @param {Map<string, GeoRecord>} features Every feature, by id.
 * @param {string} [className]
 * @returns {HTMLParagraphElement | null} Null when there are no links.
 */
export function buildPlaces(featureIds, features, className) {
  if (featureIds.length === 0) return null;
  const p = document.createElement("p");
  if (className) p.className = className;
  p.append(featureIds.length === 1 ? "Place: " : "Places: ");
  featureIds.forEach((id, i) => {
    if (i > 0) p.append(", ");
    const record = features.get(id);
    if (!record) {
      p.append(REMOVED_PLACE);
      return;
    }
    const link = document.createElement("a");
    link.href = placeHref(id);
    link.textContent = String(record.data.title ?? "Untitled point");
    p.append(link);
  });
  return p;
}
