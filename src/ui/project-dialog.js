// The dialog for adding and editing a project or sub-project. It reaches data only
// through `ctx.projects`, which asks the guard before every write.
//
// The "responsible" person is chosen from the directory (everyone who can take part).
// Only the Clerk and administrators may choose anyone; a councillor adding a sub-project
// to their own project becomes responsible for it, so they are offered only themselves.

import { readableError } from "../projects/errors.js";
import { PROJECT_STATUSES, validateProject } from "../projects/model.js";
import { config } from "../config.js";
import { createFeaturePicker } from "./feature-picker.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").DirectoryPerson} DirectoryPerson */

/**
 * The people who can be offered as responsible, in email order. The person who is
 * responsible now is always included, even if they have since left the directory, so
 * saving other changes does not silently reassign the project.
 * @param {object} options
 * @param {DirectoryPerson[]} options.directory
 * @param {(uid: string) => boolean} options.canName Whether the signed-in person may
 *   make this person responsible.
 * @param {DirectoryPerson} [options.current]
 * @returns {DirectoryPerson[]}
 */
export function responsibleChoices({ directory, canName, current }) {
  const choices = directory.filter((p) => canName(p.uid));
  if (current?.uid && !choices.some((p) => p.uid === current.uid))
    choices.push(current);
  return choices.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * @param {HTMLElement} parent Where the dialog element is added.
 * @param {import("../types.js").AppContext} ctx
 * @param {object} [options]
 * @param {(project: Project) => void} [options.onSaved] Called after a successful save.
 */
export function createProjectDialog(parent, ctx, { onSaved } = {}) {
  const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
  dialog.setAttribute("data-project-dialog", "");
  dialog.innerHTML = `
    <form class="stack" data-form novalidate>
      <wa-input name="title" label="Title" required autocomplete="off"
        maxlength="${config.limits.title}"></wa-input>
      <wa-textarea name="summary" label="Summary" rows="3"
        maxlength="${config.limits.notes}"></wa-textarea>
      <label class="field">
        <span class="field-label">Status</span>
        <select name="status" class="field-select">
          ${PROJECT_STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Responsible</span>
        <select name="responsible" class="field-select"></select>
      </label>
      <p class="field-note" data-responsible-note></p>
      <div data-places-field></div>
      <p class="form-error" role="alert" data-error hidden></p>
    </form>
    <wa-button slot="footer" data-action="cancel" appearance="outlined">Cancel</wa-button>
    <wa-button slot="footer" data-action="save" variant="brand" data-save-label>Save project</wa-button>
  `;
  parent.append(dialog);

  const form = /** @type {HTMLFormElement} */ (
    dialog.querySelector("[data-form]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-error]")
  );
  const note = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-responsible-note]")
  );
  const saveButton = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-save-label]")
  );
  const responsibleSelect = /** @type {HTMLSelectElement} */ (
    form.querySelector('[name="responsible"]')
  );

  const picker = createFeaturePicker();
  /** @type {HTMLElement} */ (
    dialog.querySelector("[data-places-field]")
  ).append(picker.element);
  /** Whether the places have been fetched; until then saving keeps the existing links. */
  let placesReady = false;
  /** Changes on every open, so a slow answer for an earlier open is ignored. */
  let placesOpen = 0;

  /** The project being edited, or null when adding. @type {Project | null} */
  let editing = null;
  /** The project a new sub-project goes under, or null. @type {Project | null} */
  let parentProject = null;
  let saving = false;
  /** Changes on every open, so a slow directory answer for an earlier open is ignored. */
  let openCount = 0;

  /** @param {string} name */
  const field = (name) =>
    /** @type {any} */ (form.querySelector(`[name="${name}"]`));

  /** @param {string} message */
  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  /**
   * @param {DirectoryPerson[]} people
   * @param {string} selectedUid
   */
  function fillResponsible(people, selectedUid) {
    responsibleSelect.replaceChildren();
    if (!selectedUid || !people.some((p) => p.uid === selectedUid)) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a person";
      responsibleSelect.append(placeholder);
    }
    for (const person of people) {
      const option = document.createElement("option");
      option.value = person.uid;
      option.textContent = person.email;
      option.dataset.email = person.email;
      responsibleSelect.append(option);
    }
    responsibleSelect.value = people.some((p) => p.uid === selectedUid)
      ? selectedUid
      : "";
  }

  /** Who is responsible now, or by default: the project's own lead, else the parent's. */
  function currentResponsible() {
    const source = editing ?? parentProject;
    return source
      ? { uid: source.responsibleUid, email: source.responsibleEmail }
      : undefined;
  }

  async function loadResponsible() {
    const mine = ++openCount;
    const current = currentResponsible();
    // Only the Clerk and administrators choose; anyone else keeps the current person
    // (editing) or becomes responsible themselves (a sub-project of their own project).
    const manager = Boolean(ctx.projects?.can.canReassignProject());
    responsibleSelect.disabled = true;
    note.textContent = "Loading the list of people…";
    /** @type {DirectoryPerson[]} */
    let directory = [];
    let failed = false;
    try {
      directory = (await ctx.projects?.directory()) ?? [];
    } catch (error) {
      console.error("[project-dialog] Could not load the directory.", error);
      failed = true;
    }
    if (mine !== openCount) return;
    const choices = responsibleChoices({
      directory,
      canName: manager
        ? (uid) => ctx.projects?.can.canNameResponsible(uid) ?? false
        : (uid) => uid === current?.uid,
      current,
    });
    const only = choices.length === 1 ? choices[0].uid : "";
    fillResponsible(choices, current?.uid ?? only);
    responsibleSelect.disabled = !manager;
    if (failed)
      note.textContent =
        "The list of people could not be loaded, so only the current person can be chosen.";
    else if (!manager && editing)
      note.textContent = "Only the Clerk or an administrator can change this.";
    else if (!manager)
      note.textContent = "You will be responsible for this sub-project.";
    else note.textContent = "";
  }

  async function loadPlaces() {
    const mine = ++placesOpen;
    placesReady = false;
    picker.loading();
    const chosen = editing?.featureIds ?? [];
    try {
      const features = await ctx.data.list();
      if (mine !== placesOpen) return;
      picker.set(features, chosen);
      placesReady = true;
    } catch (error) {
      console.error("[project-dialog] Could not load the places.", error);
      if (mine === placesOpen) picker.fail();
    }
  }

  /** The links to save: the ticks, or the existing ones if the list never arrived. */
  const chosenPlaces = () =>
    placesReady ? picker.value() : (editing?.featureIds ?? []);

  /**
   * Open to add a project (under `parent`, for a sub-project) or to edit one.
   * @param {{ project: Project } | { parent?: Project }} target
   */
  function open(target) {
    form.reset();
    for (const el of /** @type {any[]} */ ([
      ...form.querySelectorAll("wa-input, wa-textarea"),
    ]))
      el.value = "";
    editing = "project" in target ? target.project : null;
    parentProject = "parent" in target ? (target.parent ?? null) : null;

    field("title").value = editing?.title ?? "";
    field("summary").value = editing?.summary ?? "";
    field("status").value = editing?.status ?? "planning";

    dialog.setAttribute(
      "label",
      editing
        ? "Edit project"
        : parentProject
          ? `Add a sub-project to ${parentProject.title}`
          : "Add a project",
    );
    saveButton.textContent = editing ? "Save changes" : "Save project";
    errorEl.hidden = true;
    responsibleSelect.replaceChildren();
    void loadResponsible();
    void loadPlaces();
    dialog.open = true;
  }

  async function save() {
    if (saving) return;
    const projects = ctx.projects;
    if (!projects) return;
    const title = String(field("title").value ?? "").trim();
    const summary = String(field("summary").value ?? "").trim();
    const status = /** @type {Project["status"]} */ (field("status").value);
    const chosen = responsibleSelect.selectedOptions[0];
    const responsibleUid = responsibleSelect.value;
    const responsibleEmail = chosen?.dataset.email ?? "";

    const problem = validateProject({
      title,
      summary,
      status,
      parentId: parentProject?.id ?? null,
      responsibleUid,
      responsibleEmail,
      featureIds: chosenPlaces(),
    });
    if (problem) {
      showError(problem);
      return;
    }

    saving = true;
    try {
      const reassigned = editing && responsibleUid !== editing.responsibleUid;
      const saved = editing
        ? await projects.updateProject(editing.id, {
            title,
            summary,
            status,
            featureIds: chosenPlaces(),
            ...(reassigned ? { responsibleUid, responsibleEmail } : {}),
          })
        : await projects.createProject({
            title,
            summary,
            status,
            parentId: parentProject?.id ?? null,
            responsibleUid,
            responsibleEmail,
            featureIds: chosenPlaces(),
          });
      dialog.open = false;
      onSaved?.(saved);
    } catch (error) {
      console.error("[project-dialog] Save failed.", error);
      showError(
        readableError(error, "The project could not be saved. Try again."),
      );
    } finally {
      saving = false;
    }
  }

  dialog
    .querySelector('[data-action="cancel"]')
    ?.addEventListener("click", () => {
      dialog.open = false;
    });
  dialog
    .querySelector('[data-action="save"]')
    ?.addEventListener("click", () => void save());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });

  return {
    open,
    destroy() {
      dialog.remove();
    },
  };
}
