// The points list: the same records as the map, as plain text. It gives
// screen-reader and keyboard users a first-class way to read, edit and delete what
// is on the map without needing to find and operate markers. Like the map view, it
// reaches the data only through `ctx.data`, and `ctx.guard` decides which actions
// are offered.

import { actionButton } from "../map/markers.js";
import {
  loadProjectsQuietly,
  NO_PROJECTS,
  projectsForFeature,
} from "../projects/links.js";
import { buildProjectLinks } from "../projects/places.js";
import { describeShape } from "../util/geo.js";
import { confirmDelete } from "../ui/confirm.js";
import { createPointDialog } from "../ui/point-dialog.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

/**
 * One list item for a record, built as DOM so record content is never parsed as HTML.
 * @param {GeoRecord} record
 * @param {import("../types.js").Guard} guard
 * @param {{ id: string, title: string }[]} projects The projects that concern it.
 * @returns {HTMLLIElement}
 */
function buildItem(record, guard, projects) {
  const item = document.createElement("li");
  item.className = "point-item";
  item.dataset.id = record.id;

  const label = String(record.data.title ?? "Untitled point");
  const title = document.createElement("h2");
  title.className = "point-title";
  title.textContent = label;
  item.append(title);

  if (record.data.notes) {
    const notes = document.createElement("p");
    notes.textContent = String(record.data.notes);
    item.append(notes);
  }

  const position = document.createElement("p");
  position.className = "point-position";
  const shape = describeShape(record.geometry);
  position.textContent = `${shape ? `${shape}, near latitude` : "Latitude"} ${record.lat.toFixed(5)}, longitude ${record.lng.toFixed(5)}`;
  item.append(position);

  const linked = buildProjectLinks(projects);
  if (linked) item.append(linked);

  const canEdit = guard.can("update", record);
  const canDelete = guard.can("delete", record);
  if (canEdit || canDelete) {
    const row = document.createElement("div");
    row.className = "point-actions";
    // Handled by one delegated listener on the list (see render).
    if (canEdit) {
      const edit = actionButton("Edit", label, () => {});
      edit.dataset.action = "edit";
      row.append(edit);
    }
    if (canDelete) {
      const remove = actionButton("Delete", label, () => {}, "danger");
      remove.dataset.action = "remove";
      row.append(remove);
    }
    item.append(row);
  }
  return item;
}

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  container.innerHTML = `
    <article class="page">
      <h1 tabindex="-1" data-heading>Points</h1>
      <p class="list-summary" role="status" data-summary></p>
      <ul class="point-list" data-list></ul>
      <p><a href="/">Back to the map</a> to add a point.</p>
    </article>
  `;

  const heading = /** @type {HTMLElement} */ (
    container.querySelector("[data-heading]")
  );
  const summary = /** @type {HTMLElement} */ (
    container.querySelector("[data-summary]")
  );
  const list = /** @type {HTMLElement} */ (
    container.querySelector("[data-list]")
  );
  let active = true;
  /** Said once, ahead of the count, after a delete. */
  let notice = "";
  /** @type {Map<string, GeoRecord>} */
  const byId = new Map();

  /** Every project, for showing which concern each point. */
  let projectData = NO_PROJECTS;

  async function refresh() {
    const [records, projects] = await Promise.all([
      ctx.data.list(),
      loadProjectsQuietly(ctx),
    ]);
    projectData = projects;
    if (!active) return;
    byId.clear();
    for (const record of records) byId.set(record.id, record);
    const count =
      records.length === 0
        ? "There are no points yet."
        : `${records.length} ${records.length === 1 ? "point" : "points"}.`;
    summary.textContent = notice ? `${notice} ${count}` : count;
    // Oldest first, so a new point is added at the end rather than shuffling the rest.
    const sorted = [...records].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    list.replaceChildren(
      ...sorted.map((r) =>
        buildItem(r, ctx.guard, projectsForFeature(projectData, r.id)),
      ),
    );
  }

  const pointDialog = createPointDialog(container, ctx, {
    onSaved: () => void refresh(),
  });

  /** @param {GeoRecord} record */
  async function removeRecord(record) {
    const label = String(record.data.title ?? "Untitled point");
    if (!(await confirmDelete(label))) return;
    try {
      await ctx.data.remove(record.id);
      notice = `Deleted “${label}”.`;
    } catch (error) {
      console.error("[list] Delete failed.", error);
      notice = `“${label}” could not be deleted.`;
    }
    await refresh();
    // The item that had focus is gone; put focus somewhere sensible.
    heading.focus();
  }

  list.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    const id = button?.closest("li")?.dataset.id;
    const record = id ? byId.get(id) : undefined;
    if (!button || !record) return;
    notice = "";
    if (button.getAttribute("data-action") === "edit")
      pointDialog.open({ record });
    else void removeRecord(record);
  });

  void refresh();
  const unsubscribe = ctx.data.subscribe?.(() => void refresh());
  // A project being linked or unlinked changes what each point shows.
  const unsubscribeProjects = ctx.projects?.available()
    ? ctx.projects.subscribe(() => void refresh())
    : undefined;

  return () => {
    active = false;
    unsubscribe?.();
    unsubscribeProjects?.();
    pointDialog.destroy();
  };
}
