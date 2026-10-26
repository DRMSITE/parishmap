// The other direction of a map link: which projects concern a place on the map. A project
// concerns a place if it is linked to it directly, or if one of its actions is.

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectsData} ProjectsData */

/** What the map and the Points page use when projects are unavailable or fail to load. @type {ProjectsData} */
export const NO_PROJECTS = { projects: [], actions: [], notes: [] };

/**
 * The projects that concern a map feature, in alphabetical order.
 * @param {ProjectsData} data
 * @param {string} featureId
 * @returns {Project[]}
 */
export function projectsForFeature(data, featureId) {
  const viaAction = new Set(
    data.actions
      .filter((action) => action.featureIds.includes(featureId))
      .map((action) => action.projectId),
  );
  return data.projects
    .filter(
      (project) =>
        project.featureIds.includes(featureId) || viaAction.has(project.id),
    )
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, "en-GB") || a.id.localeCompare(b.id),
    );
}

/**
 * Load every project for a view that only decorates its own content with them. A view
 * must never fail because projects did: where they are unavailable, or cannot be read,
 * there is simply nothing to show.
 * @param {import("../types.js").AppContext} ctx
 * @returns {Promise<ProjectsData>}
 */
export async function loadProjectsQuietly(ctx) {
  if (!ctx.projects?.available()) return NO_PROJECTS;
  try {
    return await ctx.projects.load();
  } catch (error) {
    console.error("[projects] Could not load them for a link.", error);
    return NO_PROJECTS;
  }
}
