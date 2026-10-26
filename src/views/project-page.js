// One project: who is responsible, its sub-projects, the actions board and the notes.
// Reached from the Projects page as /projects?p=<id>. Like the list, it reaches data only
// through `ctx.projects`, and `ctx.projects.can` decides which buttons and controls are
// offered (the rules decide again on every write).

import { config } from "../config.js";
import { actionButton } from "../map/markers.js";
import { buildBoard, movedMessage } from "../projects/board.js";
import { buildPlaces } from "../projects/places.js";
import { readableError } from "../projects/errors.js";
import { formatWhen } from "../projects/format.js";
import { projectDepth, projectHref, statusLabel } from "../projects/model.js";
import { createActionDialog } from "../ui/action-dialog.js";
import { confirmAction } from "../ui/confirm.js";
import { createNoteDialog } from "../ui/note-dialog.js";
import { createProjectDialog } from "../ui/project-dialog.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").ProjectNote} ProjectNote */
/** @typedef {import("../types.js").ProjectsData} ProjectsData */

/**
 * @param {string} text
 * @param {string} [className]
 */
function paragraph(text, className) {
  const p = document.createElement("p");
  if (className) p.className = className;
  p.textContent = text;
  return p;
}

/**
 * @param {HTMLElement} container
 * @param {import("../types.js").AppContext} ctx
 * @param {string} id The project to show.
 * @returns {() => void} Cleanup.
 */
export function renderProjectPage(container, ctx, id) {
  const projects = /** @type {import("../types.js").ProjectsAccess} */ (
    ctx.projects
  );
  const can = projects.can;

  container.innerHTML = `
    <article class="page page-board">
      <nav aria-label="Breadcrumb"><ol class="crumbs" data-crumbs></ol></nav>
      <h1 tabindex="-1" data-heading>Project</h1>
      <p class="list-summary" role="status" data-status></p>
      <p class="form-error" role="alert" data-error hidden></p>
      <p data-missing hidden>
        This project no longer exists. <a href="/projects">Back to the projects</a>.
      </p>
      <div data-sections hidden>
        <p class="project-meta" data-meta></p>
        <p data-summary></p>
        <div data-places></div>
        <div class="point-actions" data-project-actions></div>

        <section aria-labelledby="subs-heading">
          <h2 id="subs-heading">Sub-projects</h2>
          <ul class="project-tree" data-subs></ul>
        </section>

        <section aria-labelledby="actions-heading">
          <h2 id="actions-heading">Actions</h2>
          <p><wa-button variant="brand" data-add-action hidden>Add action</wa-button></p>
          <div class="board-scroll" tabindex="0" role="region" aria-label="Actions board" data-board></div>
        </section>

        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading">Notes</h2>
          <p><wa-button variant="brand" data-add-note hidden>Add note</wa-button></p>
          <ul class="project-tree" data-notes></ul>
        </section>
      </div>
    </article>
  `;

  /** @param {string} selector */
  const el = (selector) =>
    /** @type {HTMLElement} */ (container.querySelector(selector));
  const heading = el("[data-heading]");
  const status = el("[data-status]");
  const errorEl = el("[data-error]");
  const missing = el("[data-missing]");
  const sections = el("[data-sections]");
  const crumbs = el("[data-crumbs]");

  let active = true;
  /** The latest data, for the dialogs and handlers. @type {ProjectsData} */
  let data = { projects: [], actions: [], notes: [] };
  /** @type {Project | undefined} */
  let project;
  /** Every map feature by id, for naming linked places. @type {Map<string, import("../types.js").GeoRecord>} */
  let features = new Map();
  /** Said once, after a change. */
  let notice = "";

  /** @param {string} message */
  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function renderCrumbs() {
    const chain = [];
    for (
      let p = project;
      p;
      p = data.projects.find((x) => x.id === p?.parentId)
    )
      chain.unshift(p);
    const items = [
      { label: "Projects", href: "/projects" },
      ...chain.map((p) => ({ label: p.title, href: projectHref(p.id) })),
    ];
    crumbs.replaceChildren(
      ...items.map((item, i) => {
        const li = document.createElement("li");
        if (i === items.length - 1) {
          li.textContent = item.label;
          li.setAttribute("aria-current", "page");
        } else {
          const a = document.createElement("a");
          a.href = item.href;
          a.textContent = item.label;
          li.append(a);
        }
        return li;
      }),
    );
  }

  function renderHeader() {
    if (!project) return;
    heading.textContent = project.title;
    const myUid = ctx.people?.uid();
    el("[data-meta]").textContent = [
      `Status: ${statusLabel(project.status)}`,
      `Responsible: ${project.responsibleEmail}${project.responsibleUid === myUid ? " (you)" : ""}`,
      `Started by ${project.createdByEmail} on ${formatWhen(project.createdAt)}`,
    ].join(". ");
    el("[data-summary]").textContent = project.summary;
    el("[data-summary]").hidden = !project.summary;
    const places = buildPlaces(project.featureIds, features, "project-meta");
    el("[data-places]").replaceChildren(...(places ? [places] : []));

    const buttons = [];
    if (can.canEditProject(project)) buttons.push(["Edit project", "edit"]);
    if (
      can.canCreateProject(project) &&
      projectDepth(data.projects, project.id) < config.limits.projectDepth
    )
      buttons.push(["Add sub-project", "add-sub"]);
    el("[data-project-actions]").replaceChildren(
      ...buttons.map(([label, action]) => {
        const button = document.createElement("wa-button");
        button.setAttribute("size", "s");
        button.setAttribute("appearance", "outlined");
        button.dataset.action = action;
        button.textContent = label;
        return button;
      }),
    );
  }

  function renderSubs() {
    if (!project) return;
    const children = data.projects
      .filter((p) => p.parentId === project?.id)
      .sort(
        (a, b) =>
          a.title.localeCompare(b.title, "en-GB") || a.id.localeCompare(b.id),
      );
    const list = el("[data-subs]");
    if (children.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lane-empty";
      empty.textContent = "No sub-projects.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...children.map((child) => {
        const li = document.createElement("li");
        li.className = "point-item project-item";
        const link = document.createElement("a");
        link.href = projectHref(child.id);
        link.textContent = child.title;
        const title = document.createElement("h3");
        title.className = "point-title";
        title.append(link);
        li.append(
          title,
          paragraph(
            `Status: ${statusLabel(child.status)}. Responsible: ${child.responsibleEmail}`,
            "project-meta",
          ),
        );
        return li;
      }),
    );
  }

  function renderBoard() {
    if (!project) return;
    const mine = data.actions.filter((a) => a.projectId === project?.id);
    el("[data-add-action]").hidden = !can.canAddAction(project);
    el("[data-board]").replaceChildren(
      buildBoard(mine, {
        project,
        can,
        handlers: { move, edit: editAction, remove: removeAction },
        features,
      }),
    );
  }

  function renderNotes() {
    if (!project) return;
    el("[data-add-note]").hidden = !can.canAddNote();
    const titles = new Map(data.actions.map((a) => [a.id, a.title]));
    const mine = data.notes
      .filter((n) => n.projectId === project?.id)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    const list = el("[data-notes]");
    if (mine.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lane-empty";
      empty.textContent = "No notes yet.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...mine.map((note) => {
        const li = document.createElement("li");
        li.className = "point-item note-item";
        li.dataset.id = note.id;
        li.append(
          paragraph(
            `${note.createdByEmail}, ${formatWhen(note.createdAt)}${note.updatedAt === note.createdAt ? "" : " (edited)"}`,
            "project-meta",
          ),
        );
        if (note.actionId)
          li.append(
            paragraph(
              titles.has(note.actionId)
                ? `About the action: ${titles.get(note.actionId)}`
                : "About an action that has been deleted",
              "project-meta",
            ),
          );
        li.append(paragraph(note.body, "note-body"));
        const buttons = [];
        if (can.canEditNote(note)) buttons.push(["Edit", "edit-note"]);
        if (can.canDeleteNote(note))
          buttons.push(["Delete", "remove-note", "danger"]);
        if (buttons.length) {
          const row = document.createElement("div");
          row.className = "point-actions";
          for (const [verb, action, variant] of buttons) {
            const button = actionButton(
              verb,
              `note by ${note.createdByEmail}`,
              () => {},
              variant,
            );
            button.dataset.action = action;
            row.append(button);
          }
          li.append(row);
        }
        return li;
      }),
    );
  }

  /**
   * The card control that has focus, so it can be given focus again once the board has
   * been rebuilt (a re-render replaces every element).
   * @returns {{ id: string, control: string } | null}
   */
  function focusedControl() {
    const active = document.activeElement;
    const card = active?.closest("li.action-card[data-id]");
    const control = active?.getAttribute("data-control");
    return card instanceof HTMLElement && control && container.contains(card)
      ? { id: card.dataset.id ?? "", control }
      : null;
  }

  /** @param {{ id: string, control: string } | null} kept */
  function restoreFocus(kept) {
    if (!kept) return;
    const card = container.querySelector(
      `li.action-card[data-id="${CSS.escape(kept.id)}"]`,
    );
    // If the control has gone (the top card has no "up" button), use the Move list.
    const target =
      card?.querySelector(`[data-control="${kept.control}"]`) ??
      card?.querySelector('[data-control="move"]') ??
      card;
    /** @type {HTMLElement | null} */ (target)?.focus();
  }

  async function refresh() {
    try {
      const loaded = await projects.load();
      if (!active) return;
      data = loaded;
    } catch (error) {
      console.error("[project] Could not load.", error);
      if (active)
        fail(readableError(error, "The project could not be loaded."));
      return;
    }
    errorEl.hidden = true;
    try {
      features = new Map((await ctx.data.list()).map((f) => [f.id, f]));
    } catch (error) {
      // Keep the last list we had: the links still work without fresh titles.
      console.error("[project] Could not load the map features.", error);
    }
    if (!active) return;
    project = data.projects.find((p) => p.id === id);
    missing.hidden = Boolean(project);
    sections.hidden = !project;
    if (!project) {
      heading.textContent = "Project not found";
      crumbs.replaceChildren();
      return;
    }
    status.textContent = notice;
    const kept = focusedControl();
    renderCrumbs();
    renderHeader();
    renderSubs();
    renderBoard();
    renderNotes();
    restoreFocus(kept);
  }

  const projectDialog = createProjectDialog(container, ctx, {
    onSaved: (saved) => {
      notice = `Saved “${saved.title}”.`;
      void refresh();
    },
  });
  const actionDialog = createActionDialog(container, ctx, {
    onSaved: (saved) => {
      notice = `Saved “${saved.title}”.`;
      void refresh();
    },
  });
  const noteDialog = createNoteDialog(container, ctx, {
    onSaved: () => {
      notice = "Saved the note.";
      void refresh();
    },
  });

  /**
   * @param {ProjectAction} action
   * @param {string} lane
   * @param {number} order
   * @param {"move" | "up" | "down" | "drag"} how
   */
  async function move(action, lane, order, how) {
    notice = "";
    try {
      await projects.updateAction(action.id, { lane, order });
      notice = movedMessage(action.title, lane, how);
    } catch (error) {
      console.error("[project] Move failed.", error);
      fail(readableError(error, `“${action.title}” could not be moved.`));
    }
    await refresh();
  }

  /** @param {ProjectAction} action */
  function editAction(action) {
    if (project) actionDialog.open({ project, action });
  }

  /** @param {ProjectAction} action */
  async function removeAction(action) {
    const ok = await confirmAction({
      label: "Delete action?",
      message: `Delete “${action.title}”? Notes about it stay on the project. This cannot be undone.`,
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await projects.removeAction(action.id);
      notice = `Deleted “${action.title}”.`;
    } catch (error) {
      console.error("[project] Delete failed.", error);
      notice = "";
      fail(readableError(error, `“${action.title}” could not be deleted.`));
    }
    await refresh();
    heading.focus();
  }

  /** @param {ProjectNote} note */
  async function removeNote(note) {
    const ok = await confirmAction({
      label: "Delete note?",
      message: "Delete this note? This cannot be undone.",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await projects.removeNote(note.id);
      notice = "Deleted the note.";
    } catch (error) {
      console.error("[project] Delete failed.", error);
      notice = "";
      fail(readableError(error, "The note could not be deleted."));
    }
    await refresh();
    heading.focus();
  }

  el("[data-project-actions]").addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!button || !project) return;
    notice = "";
    if (button.getAttribute("data-action") === "edit")
      projectDialog.open({ project });
    else projectDialog.open({ parent: project });
  });

  el("[data-add-action]").addEventListener("click", () => {
    notice = "";
    if (project) actionDialog.open({ project });
  });

  el("[data-add-note]").addEventListener("click", () => {
    notice = "";
    if (project)
      noteDialog.open({
        project,
        actions: data.actions.filter((a) => a.projectId === project?.id),
      });
  });

  el("[data-notes]").addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    const note = data.notes.find(
      (n) => n.id === button?.closest("li")?.dataset.id,
    );
    if (!button || !note || !project) return;
    notice = "";
    if (button.getAttribute("data-action") === "edit-note")
      noteDialog.open({ project, actions: [], note });
    else void removeNote(note);
  });

  void refresh();
  const unsubscribe = projects.subscribe(() => void refresh());
  // Places are renamed or deleted on the map, so keep their titles current.
  const unsubscribeFeatures = ctx.data.subscribe?.(() => void refresh());

  return () => {
    active = false;
    unsubscribe();
    unsubscribeFeatures?.();
    projectDialog.destroy();
    actionDialog.destroy();
    noteDialog.destroy();
  };
}
