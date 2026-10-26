// The dialog for adding and editing an action on a project. It reaches data only through
// `ctx.projects`. Anyone who may add actions can add one, in the first lane (Ideas); only
// people who may move cards in the project (the responsible councillor, the Clerk and
// administrators) are offered a choice of lane.

import { config } from "../config.js";
import { readableError } from "../projects/errors.js";
import {
  endOfLane,
  FIRST_LANE,
  LANES,
  validateAction,
} from "../projects/model.js";
import { createFeaturePicker } from "./feature-picker.js";
import { responsibleChoices } from "./project-dialog.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").DirectoryPerson} DirectoryPerson */

/**
 * @param {HTMLElement} parent Where the dialog element is added.
 * @param {import("../types.js").AppContext} ctx
 * @param {object} [options]
 * @param {(action: ProjectAction) => void} [options.onSaved] Called after a successful save.
 */
export function createActionDialog(parent, ctx, { onSaved } = {}) {
  const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
  dialog.setAttribute("data-action-dialog", "");
  dialog.innerHTML = `
    <form class="stack" data-form novalidate>
      <wa-input name="title" label="Title" required autocomplete="off"
        maxlength="${config.limits.title}"></wa-input>
      <wa-textarea name="details" label="Details" rows="3"
        maxlength="${config.limits.notes}"></wa-textarea>
      <label class="field" data-lane-field>
        <span class="field-label">Lane</span>
        <select name="lane" class="field-select">
          ${LANES.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span class="field-label">For</span>
        <select name="assignee" class="field-select"></select>
      </label>
      <p class="field-note" data-assignee-note></p>
      <wa-input name="dueDate" type="date" label="Due date (optional)"></wa-input>
      <div data-places-field></div>
      <p class="form-error" role="alert" data-error hidden></p>
    </form>
    <wa-button slot="footer" data-action="cancel" appearance="outlined">Cancel</wa-button>
    <wa-button slot="footer" data-action="save" variant="brand" data-save-label>Save action</wa-button>
  `;
  parent.append(dialog);

  const form = /** @type {HTMLFormElement} */ (
    dialog.querySelector("[data-form]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-error]")
  );
  const note = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-assignee-note]")
  );
  const saveButton = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-save-label]")
  );
  const laneField = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-lane-field]")
  );
  const assigneeSelect = /** @type {HTMLSelectElement} */ (
    form.querySelector('[name="assignee"]')
  );

  const picker = createFeaturePicker();
  /** @type {HTMLElement} */ (
    dialog.querySelector("[data-places-field]")
  ).append(picker.element);
  /** Whether the places have been fetched; until then saving keeps the existing links. */
  let placesReady = false;
  /** Changes on every open, so a slow answer for an earlier open is ignored. */
  let placesOpen = 0;

  /** @type {Project | null} */
  let project = null;
  /** The action being edited, or null when adding. @type {ProjectAction | null} */
  let editing = null;
  let mayMove = false;
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

  /** @param {DirectoryPerson[]} people @param {string} selectedUid */
  function fillAssignee(people, selectedUid) {
    assigneeSelect.replaceChildren();
    const nobody = document.createElement("option");
    nobody.value = "";
    nobody.textContent = "Nobody in particular";
    assigneeSelect.append(nobody);
    for (const person of people) {
      const option = document.createElement("option");
      option.value = person.uid;
      option.textContent = person.email;
      option.dataset.email = person.email;
      assigneeSelect.append(option);
    }
    assigneeSelect.value = people.some((p) => p.uid === selectedUid)
      ? selectedUid
      : "";
  }

  async function loadAssignees() {
    const mine = ++openCount;
    const current = editing?.assigneeUid
      ? { uid: editing.assigneeUid, email: editing.assigneeEmail ?? "" }
      : undefined;
    assigneeSelect.disabled = true;
    note.textContent = "Loading the list of people…";
    /** @type {DirectoryPerson[]} */
    let directory = [];
    let failed = false;
    try {
      directory = (await ctx.projects?.directory()) ?? [];
    } catch (error) {
      console.error("[action-dialog] Could not load the directory.", error);
      failed = true;
    }
    if (mine !== openCount) return;
    fillAssignee(
      responsibleChoices({ directory, canName: () => true, current }),
      current?.uid ?? "",
    );
    assigneeSelect.disabled = false;
    note.textContent = failed
      ? "The list of people could not be loaded, so only the current person can be chosen."
      : "";
  }

  async function loadPlaces() {
    const mine = ++placesOpen;
    placesReady = false;
    picker.loading();
    try {
      const features = await ctx.data.list();
      if (mine !== placesOpen) return;
      picker.set(features, editing?.featureIds ?? []);
      placesReady = true;
    } catch (error) {
      console.error("[action-dialog] Could not load the places.", error);
      if (mine === placesOpen) picker.fail();
    }
  }

  /** The links to save: the ticks, or the existing ones if the list never arrived. */
  const chosenPlaces = () =>
    placesReady ? picker.value() : (editing?.featureIds ?? []);

  /**
   * Open to add an action to a project, or to edit one.
   * @param {{ project: Project, action?: ProjectAction }} target
   */
  function open(target) {
    form.reset();
    for (const el of /** @type {any[]} */ ([
      ...form.querySelectorAll("wa-input, wa-textarea"),
    ]))
      el.value = "";
    project = target.project;
    editing = target.action ?? null;
    mayMove = Boolean(ctx.projects?.can.canMoveActions(project));

    field("title").value = editing?.title ?? "";
    field("details").value = editing?.details ?? "";
    field("dueDate").value = editing?.dueDate ?? "";
    field("lane").value = editing?.lane ?? FIRST_LANE;
    laneField.hidden = !mayMove;

    dialog.setAttribute("label", editing ? "Edit action" : "Add an action");
    saveButton.textContent = editing ? "Save changes" : "Save action";
    errorEl.hidden = true;
    assigneeSelect.replaceChildren();
    void loadAssignees();
    void loadPlaces();
    dialog.open = true;
  }

  async function save() {
    const projects = ctx.projects;
    if (saving || !projects || !project) return;
    const title = String(field("title").value ?? "").trim();
    const details = String(field("details").value ?? "").trim();
    const dueDate = String(field("dueDate").value ?? "").trim();
    const lane = mayMove ? field("lane").value : (editing?.lane ?? FIRST_LANE);
    const assigneeUid = assigneeSelect.value;
    const assigneeEmail =
      assigneeSelect.selectedOptions[0]?.dataset.email ?? "";

    saving = true;
    try {
      const { actions } = await projects.load();
      const moved = editing ? lane !== editing.lane : true;
      const order = moved ? endOfLane(actions, lane) : (editing?.order ?? 1);
      /** The fields the person controls; an empty optional field is cleared. */
      const fields = {
        title,
        details,
        lane,
        order,
        assigneeUid: assigneeUid || undefined,
        assigneeEmail: assigneeUid ? assigneeEmail : undefined,
        dueDate: dueDate || undefined,
      };
      const featureIds = chosenPlaces();
      const problem = validateAction({
        ...editing,
        ...fields,
        featureIds,
        projectId: project.id,
      });
      if (problem) {
        showError(problem);
        return;
      }
      const saved = editing
        ? await projects.updateAction(editing.id, {
            title,
            details,
            assigneeUid: fields.assigneeUid,
            assigneeEmail: fields.assigneeEmail,
            dueDate: fields.dueDate,
            featureIds,
            ...(moved ? { lane, order } : {}),
          })
        : await projects.createAction({
            ...fields,
            projectId: project.id,
            featureIds,
          });
      dialog.open = false;
      onSaved?.(saved);
    } catch (error) {
      console.error("[action-dialog] Save failed.", error);
      showError(
        readableError(error, "The action could not be saved. Try again."),
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
