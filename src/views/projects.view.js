// The Projects page: projects and their sub-projects as a tree, with the status, who is
// responsible and how many actions are still open. It reaches data only through
// `ctx.projects`, and `ctx.projects.can` decides which buttons are offered (the rules
// decide again on every write).

import { config } from "../config.js";
import { readableError } from "../projects/errors.js";
import {
  projectAndDescendants,
  projectHref,
  statusLabel,
} from "../projects/model.js";
import { buildTree } from "../projects/tree.js";
import { actionButton } from "../map/markers.js";
import { confirmAction } from "../ui/confirm.js";
import { createProjectDialog } from "../ui/project-dialog.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectsData} ProjectsData */
/** @typedef {import("../projects/tree.js").ProjectNode} ProjectNode */

/** @param {number} count @param {string} one @param {string} many */
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * One project and, nested beneath it, its sub-projects. Built as DOM so project content
 * is never parsed as HTML.
 * @param {ProjectNode} node
 * @param {object} context
 * @param {ProjectsData} context.data
 * @param {import("../types.js").ProjectsAccess} context.projects
 * @param {string | undefined} context.myUid
 * @returns {HTMLLIElement}
 */
function buildItem(node, { data, projects, myUid }) {
  const { project } = node;
  const can = projects.can;
  const item = document.createElement("li");
  item.className = "point-item project-item";
  item.dataset.id = project.id;

  // Headings follow the nesting, stopping at h6.
  const title = document.createElement(`h${Math.min(node.depth + 1, 6)}`);
  title.className = "point-title";
  const link = document.createElement("a");
  link.href = projectHref(project.id);
  link.textContent = project.title;
  title.append(link);
  item.append(title);

  const open = data.actions.filter(
    (a) => a.projectId === project.id && a.lane !== "done",
  ).length;
  const meta = document.createElement("p");
  meta.className = "project-meta";
  meta.textContent = [
    `Status: ${statusLabel(project.status)}`,
    `Responsible: ${project.responsibleEmail}${project.responsibleUid === myUid ? " (you)" : ""}`,
    open === 0
      ? "No open actions"
      : plural(open, "open action", "open actions"),
  ].join(". ");
  item.append(meta);

  if (project.summary) {
    const summary = document.createElement("p");
    summary.textContent = project.summary;
    item.append(summary);
  }

  const wanted = /** @type {[string, string, string?][]} */ ([]);
  if (can.canEditProject(project)) wanted.push(["Edit", "edit"]);
  if (can.canCreateProject(project) && node.depth < config.limits.projectDepth)
    wanted.push(["Add sub-project to", "add-sub"]);
  if (can.canDeleteProject()) wanted.push(["Delete", "remove", "danger"]);
  if (wanted.length) {
    const row = document.createElement("div");
    row.className = "point-actions";
    // Handled by one delegated listener on the tree (see render).
    for (const [verb, action, variant] of wanted) {
      const button = actionButton(verb, project.title, () => {}, variant);
      button.dataset.action = action;
      row.append(button);
    }
    item.append(row);
  }

  if (node.children.length) {
    const list = document.createElement("ul");
    list.className = "project-tree";
    list.append(
      ...node.children.map((c) => buildItem(c, { data, projects, myUid })),
    );
    item.append(list);
  }
  return item;
}

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  // /projects?p=<id> is one project's page; it is loaded only when wanted.
  const id = new URLSearchParams(globalThis.location.search).get("p");
  if (id && ctx.projects?.available())
    return import("./project-page.js").then((page) =>
      page.renderProjectPage(container, ctx, id),
    );

  if (!ctx.projects?.available()) {
    container.innerHTML = `
      <article class="page">
        <h1 tabindex="-1" data-heading>Projects</h1>
        <p>Projects are not available.</p>
        <p><a href="/">Back to the map</a></p>
      </article>
    `;
    return;
  }

  const projects = ctx.projects;
  container.innerHTML = `
    <article class="page page-wide">
      <h1 tabindex="-1" data-heading>Projects</h1>
      <p>
        Longer pieces of work for the ${config.council.body}. Each project has a councillor who is
        responsible for it, and can be broken into sub-projects.
      </p>
      <p><wa-button variant="brand" data-new hidden>New project</wa-button></p>
      <p class="list-summary" role="status" data-status></p>
      <p class="form-error" role="alert" data-error hidden></p>
      <ul class="project-tree" data-tree></ul>
    </article>
  `;

  const heading = /** @type {HTMLElement} */ (
    container.querySelector("[data-heading]")
  );
  const status = /** @type {HTMLElement} */ (
    container.querySelector("[data-status]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    container.querySelector("[data-error]")
  );
  const tree = /** @type {HTMLElement} */ (
    container.querySelector("[data-tree]")
  );
  const newButton = /** @type {HTMLElement} */ (
    container.querySelector("[data-new]")
  );
  newButton.hidden = !projects.can.canCreateProject();

  let active = true;
  /** Said once, ahead of the count, after a change. */
  let notice = "";
  /** @type {ProjectsData} */
  let data = { projects: [], actions: [], notes: [] };
  /** @type {Map<string, Project>} */
  const byId = new Map();

  /** @param {string} message */
  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  async function refresh() {
    try {
      const loaded = await projects?.load();
      if (!active || !loaded) return;
      data = loaded;
    } catch (error) {
      console.error("[projects] Could not load.", error);
      if (active) fail(readableError(error, "Projects could not be loaded."));
      return;
    }
    errorEl.hidden = true;
    byId.clear();
    for (const project of data.projects) byId.set(project.id, project);
    const count =
      data.projects.length === 0
        ? "There are no projects yet."
        : plural(data.projects.length, "project.", "projects.");
    status.textContent = notice ? `${notice} ${count}` : count;
    const myUid = ctx.people?.uid();
    tree.replaceChildren(
      ...buildTree(data.projects).map((node) =>
        buildItem(node, { data, projects, myUid }),
      ),
    );
  }

  const dialog = createProjectDialog(container, ctx, {
    onSaved: (project) => {
      notice = `Saved “${project.title}”.`;
      void refresh();
    },
  });

  /** @param {Project} project */
  async function removeProject(project) {
    const ids = projectAndDescendants(data.projects, project.id);
    const subs = ids.size - 1;
    const actions = data.actions.filter((a) => ids.has(a.projectId)).length;
    const notes = data.notes.filter((n) => ids.has(n.projectId)).length;
    const extra = [
      subs ? plural(subs, "sub-project", "sub-projects") : "",
      actions ? plural(actions, "action", "actions") : "",
      notes ? plural(notes, "note", "notes") : "",
    ].filter(Boolean);
    const ok = await confirmAction({
      label: "Delete project?",
      message: `Delete “${project.title}”?${
        extra.length ? ` This also deletes ${extra.join(", ")}.` : ""
      } This cannot be undone.`,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await projects?.removeProject(project.id);
      notice = `Deleted “${project.title}”.`;
    } catch (error) {
      console.error("[projects] Delete failed.", error);
      notice = "";
      fail(readableError(error, `“${project.title}” could not be deleted.`));
    }
    await refresh();
    // The item that had focus is gone; put focus somewhere sensible.
    heading.focus();
  }

  newButton.addEventListener("click", () => {
    notice = "";
    dialog.open({});
  });

  tree.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    const project = byId.get(button?.closest("li")?.dataset.id ?? "");
    if (!button || !project) return;
    notice = "";
    const action = button.getAttribute("data-action");
    if (action === "edit") dialog.open({ project });
    else if (action === "add-sub") dialog.open({ parent: project });
    else if (action === "remove") void removeProject(project);
  });

  void refresh();
  const unsubscribe = projects.subscribe(() => void refresh());

  return () => {
    active = false;
    unsubscribe();
    dialog.destroy();
  };
}
