// Projects as a tree: top-level projects, each with the sub-projects beneath it.

/** @typedef {import("../types.js").Project} Project */

/**
 * @typedef {object} ProjectNode
 * @property {Project} project
 * @property {number} depth 1 for a top-level project.
 * @property {ProjectNode[]} children
 */

/**
 * Arrange projects into a tree, siblings in alphabetical order so the page does not
 * reshuffle as projects are added. A project whose parent cannot be found (for example
 * one just deleted by someone else) is shown at the top rather than lost.
 * @param {Project[]} projects
 * @returns {ProjectNode[]}
 */
export function buildTree(projects) {
  const known = new Set(projects.map((p) => p.id));
  /** @type {Map<string | null, Project[]>} */
  const byParent = new Map();
  for (const project of projects) {
    const key =
      project.parentId && known.has(project.parentId) ? project.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), project]);
  }

  /**
   * @param {string | null} parent
   * @param {number} depth
   * @returns {ProjectNode[]}
   */
  const nodes = (parent, depth) =>
    [...(byParent.get(parent) ?? [])]
      .sort(
        (a, b) =>
          a.title.localeCompare(b.title, "en-GB") || a.id.localeCompare(b.id),
      )
      .map((project) => ({
        project,
        depth,
        children: nodes(project.id, depth + 1),
      }));

  return nodes(null, 1);
}
