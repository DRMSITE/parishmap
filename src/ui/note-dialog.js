// The dialog for adding and editing a note on a project, or on one of its actions. It
// reaches data only through `ctx.projects`. Which action a note is about is chosen when it
// is written and cannot be changed afterwards (firestore.rules refuses it).

import { config } from "../config.js";
import { readableError } from "../projects/errors.js";
import { validateNote } from "../projects/model.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectNote} ProjectNote */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */

/**
 * @param {HTMLElement} parent Where the dialog element is added.
 * @param {import("../types.js").AppContext} ctx
 * @param {object} [options]
 * @param {(note: ProjectNote) => void} [options.onSaved] Called after a successful save.
 */
export function createNoteDialog(parent, ctx, { onSaved } = {}) {
  const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
  dialog.setAttribute("data-note-dialog", "");
  dialog.innerHTML = `
    <form class="stack" data-form novalidate>
      <label class="field" data-about-field>
        <span class="field-label">About</span>
        <select name="about" class="field-select"></select>
      </label>
      <wa-textarea name="body" label="Note" rows="5" required
        maxlength="${config.limits.notes}"></wa-textarea>
      <p class="form-error" role="alert" data-error hidden></p>
    </form>
    <wa-button slot="footer" data-action="cancel" appearance="outlined">Cancel</wa-button>
    <wa-button slot="footer" data-action="save" variant="brand" data-save-label>Save note</wa-button>
  `;
  parent.append(dialog);

  const form = /** @type {HTMLFormElement} */ (
    dialog.querySelector("[data-form]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-error]")
  );
  const aboutField = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-about-field]")
  );
  const aboutSelect = /** @type {HTMLSelectElement} */ (
    form.querySelector('[name="about"]')
  );
  const saveButton = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-save-label]")
  );

  /** @type {Project | null} */
  let project = null;
  /** The note being edited, or null when adding. @type {ProjectNote | null} */
  let editing = null;
  let saving = false;

  /** @param {string} name */
  const field = (name) =>
    /** @type {any} */ (form.querySelector(`[name="${name}"]`));

  /** @param {string} message */
  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  /**
   * Open to add a note, or to edit one.
   * @param {{ project: Project, actions: ProjectAction[], note?: ProjectNote }} target
   */
  function open({ project: forProject, actions, note }) {
    form.reset();
    for (const el of /** @type {any[]} */ ([
      ...form.querySelectorAll("wa-textarea"),
    ]))
      el.value = "";
    project = forProject;
    editing = note ?? null;

    aboutSelect.replaceChildren();
    const whole = document.createElement("option");
    whole.value = "";
    whole.textContent = "The whole project";
    aboutSelect.append(whole);
    for (const action of actions) {
      const option = document.createElement("option");
      option.value = action.id;
      option.textContent = `Action: ${action.title}`;
      aboutSelect.append(option);
    }
    aboutSelect.value = "";
    aboutField.hidden = Boolean(editing);

    field("body").value = editing?.body ?? "";
    dialog.setAttribute("label", editing ? "Edit note" : "Add a note");
    saveButton.textContent = editing ? "Save changes" : "Save note";
    errorEl.hidden = true;
    dialog.open = true;
  }

  async function save() {
    const projects = ctx.projects;
    if (saving || !projects || !project) return;
    const body = String(field("body").value ?? "").trim();
    const actionId = aboutSelect.value;
    const problem = validateNote({ projectId: project.id, body });
    if (problem) {
      showError(problem);
      return;
    }
    saving = true;
    try {
      const saved = editing
        ? await projects.updateNote(editing.id, { body })
        : await projects.createNote({
            projectId: project.id,
            ...(actionId ? { actionId } : {}),
            body,
          });
      dialog.open = false;
      onSaved?.(saved);
    } catch (error) {
      console.error("[note-dialog] Save failed.", error);
      showError(
        readableError(error, "The note could not be saved. Try again."),
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
