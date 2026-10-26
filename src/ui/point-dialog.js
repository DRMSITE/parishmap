// The dialog for adding and editing a point, line or area, shared by the map and the
// Points list. A line or an area has no pin: its points are a list of coordinates in a
// text box, which is also how a keyboard user reads and corrects a shape.
// It reaches data only through `ctx.data`.
//
// wc-location-field has its own Leaflet map, so it is created only once the dialog is
// open and has a size, and removed again when the dialog closes. The Latitude and
// Longitude inputs stay the source of truth for saving.

import { ForbiddenError } from "../auth/guard.js";
import { config } from "../config.js";
import {
  formatVertices,
  isWithinBounds,
  geometryFromVertices,
  parseGeometry,
  parseLat,
  parseLng,
  parseVertexText,
  representativePoint,
  shapeKind,
  verticesFromGeometry,
} from "../util/geo.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

/** Anything outside `config.map.bounds` could never be panned to on the map. */
const OUTSIDE_AREA =
  "Every position must be inside the area this map covers, around the area it is set up for.";

/**
 * @param {HTMLElement} parent Where the dialog element is added.
 * @param {import("../types.js").AppContext} ctx
 * @param {object} [options]
 * @param {(record: GeoRecord) => void} [options.onSaved] Called after a successful save.
 */
export function createPointDialog(parent, ctx, { onSaved } = {}) {
  const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
  dialog.setAttribute("data-point-dialog", "");
  dialog.innerHTML = `
    <form class="stack" data-form novalidate>
      <wa-input name="title" label="Title" required autocomplete="off"
        maxlength="${config.limits.title}"></wa-input>
      <wa-textarea name="notes" label="Notes" rows="3"
        maxlength="${config.limits.notes}"></wa-textarea>
      <div class="stack" data-point-fields>
        <div data-location></div>
        <wa-input name="lat" label="Latitude" inputmode="decimal" autocomplete="off"
          hint="Between -90 and 90"></wa-input>
        <wa-input name="lng" label="Longitude" inputmode="decimal" autocomplete="off"
          hint="Between -180 and 180"></wa-input>
      </div>
      <div class="stack" data-shape-fields hidden>
        <wa-textarea name="vertices" label="Points on the shape" rows="8"
          spellcheck="false"
          hint="One point per line: latitude, longitude. An area is closed for you."></wa-textarea>
        <p data-shape-note hidden>This shape is too complex to edit as text. You can change its title and notes.</p>
      </div>
      <p class="form-error" role="alert" data-error hidden></p>
    </form>
    <wa-button slot="footer" data-action="cancel" appearance="outlined">Cancel</wa-button>
    <wa-button slot="footer" data-action="save" variant="brand" data-save-label>Save point</wa-button>
  `;
  parent.append(dialog);

  const form = /** @type {HTMLFormElement} */ (
    dialog.querySelector("[data-form]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-error]")
  );
  const locationHost = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-location]")
  );
  const saveButton = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-save-label]")
  );

  const pointFields = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-point-fields]")
  );
  const shapeFields = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-shape-fields]")
  );
  const shapeNote = /** @type {HTMLElement} */ (
    dialog.querySelector("[data-shape-note]")
  );

  /** The record being edited, or null when adding. @type {GeoRecord | null} */
  let editing = null;
  /**
   * Set when the dialog is for a line or an area; null for a point. `editable` is false
   * for a shape the text box cannot represent (holes, several areas).
   * @type {{ kind: "line" | "area", editable: boolean } | null}
   */
  let shape = null;

  /** @param {string} name */
  const field = (name) =>
    /** @type {any} */ (form.querySelector(`[name="${name}"]`));

  /** @param {string} message */
  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  /**
   * Open to add a point at a position, to add a line or an area just drawn, or to edit
   * an existing record.
   * @param {{ lat: number, lng: number }
   *   | { record: GeoRecord }
   *   | { kind: "line" | "area", vertices: { lat: number, lng: number }[] }} target
   */
  function open(target) {
    form.reset();
    for (const el of /** @type {any[]} */ ([
      ...form.querySelectorAll("[name]"),
    ]))
      el.value = "";
    editing = "record" in target ? target.record : null;

    const kind = "kind" in target ? target.kind : shapeKind(editing?.geometry);
    shape = kind === "point" ? null : { kind, editable: true };
    /** @type {{ lat: number, lng: number }[] | null} */
    let vertices = "vertices" in target ? target.vertices : null;
    if (editing?.geometry && shape) {
      vertices = verticesFromGeometry(editing.geometry);
      shape.editable = vertices !== null;
    }

    if (editing) {
      field("title").value = String(editing.data.title ?? "");
      field("notes").value = String(editing.data.notes ?? "");
    }
    pointFields.hidden = shape !== null;
    shapeFields.hidden = shape === null;
    shapeNote.hidden = shape?.editable !== false;
    field("vertices").disabled = shape?.editable === false;
    if (shape) {
      field("vertices").value = vertices ? formatVertices(vertices) : "";
    } else {
      const position = "record" in target ? target.record : target;
      if ("lat" in position) {
        field("lat").value = position.lat.toFixed(6);
        field("lng").value = position.lng.toFixed(6);
      }
    }

    const noun = shape ? shape.kind : "point";
    dialog.setAttribute(
      "label",
      editing
        ? `Edit ${noun}`
        : noun === "point"
          ? "Add a point"
          : `Add ${noun === "area" ? "an" : "a"} ${noun}`,
    );
    saveButton.textContent = editing ? "Save changes" : `Save ${noun}`;
    errorEl.hidden = true;
    dialog.open = true;
  }

  /** @returns {[number, number]} The position currently in the inputs, or the default centre. */
  function currentPosition() {
    const lat = parseLat(String(field("lat").value ?? ""));
    const lng = parseLng(String(field("lng").value ?? ""));
    return lat === null || lng === null ? config.map.centre : [lat, lng];
  }

  async function mountLocationField() {
    // Leaflet must be loaded first, so the component reuses it instead of fetching its own.
    await import("../map/leaflet-assets.js");
    // Side-effect import that registers the element; the package ships no types.
    // @ts-expect-error TS7016
    await import("@annoyingmouse/wc-location-field");
    // The dialog may have been closed while the module loaded.
    if (!dialog.open || shape) return;
    const [lat, lng] = currentPosition();
    const el = /** @type {any} */ (document.createElement("wc-location-field"));
    el.setAttribute("label", "Search for a place, or drag the pin");
    el.setAttribute("show-map", "");
    el.setAttribute("center-lat", String(lat));
    el.setAttribute("center-lng", String(lng));
    // Fires on a map click, a pin drag or a chosen search result.
    el.addEventListener("location-change", (/** @type {Event} */ event) => {
      const detail = /** @type {CustomEvent} */ (event).detail;
      if (typeof detail?.lat !== "number" || typeof detail?.lng !== "number")
        return;
      field("lat").value = detail.lat.toFixed(6);
      field("lng").value = detail.lng.toFixed(6);
    });
    locationHost.replaceChildren(el);
    el.prefill({ lat, lng });
  }

  // Typed coordinates move the pin. prefill() does not emit location-change, so
  // this cannot loop back into the inputs.
  function syncPinFromInputs() {
    const lat = parseLat(String(field("lat").value ?? ""));
    const lng = parseLng(String(field("lng").value ?? ""));
    if (lat === null || lng === null) return;
    /** @type {any} */ (locationHost.firstElementChild)?.prefill?.({
      lat,
      lng,
    });
  }

  async function save() {
    const title = String(field("title").value ?? "").trim();
    const notes = String(field("notes").value ?? "").trim();
    const problems = [];
    if (!title) problems.push("Enter a title.");
    if (title.length > config.limits.title)
      problems.push(
        `Title must be ${config.limits.title} characters or fewer.`,
      );
    if (notes.length > config.limits.notes)
      problems.push(
        `Notes must be ${config.limits.notes} characters or fewer.`,
      );

    /** @type {Record<string, unknown>} What is saved besides the title and notes. */
    let where = {};
    if (shape?.editable) {
      const parsed = parseVertexText(
        String(field("vertices").value ?? ""),
        shape.kind,
      );
      if ("error" in parsed) problems.push(parsed.error);
      else if (
        !parsed.vertices.every((v) =>
          isWithinBounds(config.map.bounds, v.lat, v.lng),
        )
      )
        problems.push(OUTSIDE_AREA);
      else {
        const checked = parseGeometry(
          geometryFromVertices(shape.kind, parsed.vertices),
          config.limits.vertices,
        );
        if ("error" in checked) problems.push(checked.error);
        else
          where = {
            geometry: checked.geometry,
            ...representativePoint(checked.geometry),
          };
      }
    } else if (!shape) {
      const lat = parseLat(String(field("lat").value ?? ""));
      const lng = parseLng(String(field("lng").value ?? ""));
      if (lat === null)
        problems.push("Latitude must be a number between -90 and 90.");
      if (lng === null)
        problems.push("Longitude must be a number between -180 and 180.");
      if (
        lat !== null &&
        lng !== null &&
        !isWithinBounds(config.map.bounds, lat, lng)
      )
        problems.push(OUTSIDE_AREA);
      where = { lat, lng };
      // A record stored as a GeoJSON point keeps its geometry in step with the pin.
      if (editing?.geometry?.type === "Point" && lat !== null && lng !== null)
        where.geometry = { type: "Point", coordinates: [lng, lat] };
    }
    if (problems.length) {
      showError(problems.join(" "));
      return;
    }
    try {
      // An edit keeps any other keys an application has put in `data`.
      const saved = editing
        ? await ctx.data.update(editing.id, {
            ...where,
            data: { ...editing.data, title, notes },
          })
        : await ctx.data.create({
            .../** @type {{ lat: number, lng: number }} */ (where),
            data: { title, notes },
          });
      dialog.open = false;
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof ForbiddenError)
        showError("You do not have permission to do that.");
      else {
        console.error("[point-dialog] Save failed.", error);
        showError(
          `The ${shape?.kind ?? "point"} could not be saved. Try again.`,
        );
      }
    }
  }

  dialog.addEventListener("wa-after-show", (/** @type {Event} */ event) => {
    if (event.target === dialog && !shape) void mountLocationField();
  });
  dialog.addEventListener("wa-after-hide", (/** @type {Event} */ event) => {
    if (event.target === dialog) locationHost.replaceChildren();
  });
  field("lat").addEventListener("change", syncPinFromInputs);
  field("lng").addEventListener("change", syncPinFromInputs);
  dialog
    .querySelector('[data-action="cancel"]')
    ?.addEventListener("click", () => {
      dialog.open = false;
    });
  dialog
    .querySelector('[data-action="save"]')
    ?.addEventListener("click", () => void save());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void save();
  });

  return {
    open,
    destroy() {
      dialog.remove();
    },
  };
}
