// A checklist for choosing which existing map features a project or action concerns. It
// is a plain fieldset of checkboxes with a filter box, so it works with a keyboard and a
// screen reader and needs no map. The caller supplies the features (from `ctx.data`).

import { config } from "../config.js";
import { shapeKind } from "../util/geo.js";
import { REMOVED_PLACE } from "../projects/places.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

/**
 * @param {object} [options]
 * @param {number} [options.max] Most places that can be chosen.
 */
export function createFeaturePicker({ max = config.limits.featureLinks } = {}) {
  const element = document.createElement("fieldset");
  element.className = "feature-picker";
  element.innerHTML = `
    <legend>Places on the map (optional)</legend>
    <label class="field">
      <span class="field-label">Find a place</span>
      <input type="search" class="field-select" autocomplete="off" data-filter>
    </label>
    <p class="field-note" role="status" data-count></p>
    <ul class="feature-list" data-list></ul>
  `;
  const filter = /** @type {HTMLInputElement} */ (
    element.querySelector("[data-filter]")
  );
  const count = /** @type {HTMLElement} */ (
    element.querySelector("[data-count]")
  );
  const list = /** @type {HTMLElement} */ (
    element.querySelector("[data-list]")
  );

  /** @returns {HTMLInputElement[]} */
  const boxes = () =>
    [...list.querySelectorAll("input[type=checkbox]")].map(
      (box) => /** @type {HTMLInputElement} */ (box),
    );

  /** The ids ticked now, in the order they are listed. */
  function value() {
    return boxes()
      .filter((box) => box.checked)
      .map((box) => box.value);
  }

  /** Update the count, and stop further ticks once the limit is reached. */
  function update() {
    const chosen = value().length;
    const full = chosen >= max;
    for (const box of boxes()) box.disabled = full && !box.checked;
    count.textContent =
      chosen === 0
        ? "No places chosen."
        : `${chosen} ${chosen === 1 ? "place" : "places"} chosen${full ? `, which is the most (${max})` : ""}.`;
  }

  /** @param {string} id @param {string} text @param {boolean} checked */
  function addItem(id, text, checked) {
    const item = document.createElement("li");
    item.dataset.text = text.toLowerCase();
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = id;
    box.checked = checked;
    box.addEventListener("change", update);
    label.append(box, ` ${text}`);
    item.append(label);
    list.append(item);
  }

  function applyFilter() {
    const wanted = filter.value.trim().toLowerCase();
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (
      list.querySelectorAll("li")
    ))
      item.hidden = Boolean(wanted) && !item.dataset.text?.includes(wanted);
  }

  filter.addEventListener("input", applyFilter);

  /** @param {string} message */
  function showOnly(message) {
    list.replaceChildren();
    filter.value = "";
    filter.disabled = true;
    count.textContent = message;
  }

  return {
    element,
    value,
    /** Empty the list while the features are fetched. */
    loading() {
      showOnly("Loading places…");
    },
    /** The features could not be fetched; the caller keeps the existing links. */
    fail() {
      showOnly(
        "The list of places could not be loaded. Existing links are kept.",
      );
    },
    /**
     * Fill the list. Anything chosen that is not among the features has been deleted;
     * it is listed (ticked) so the person can untick it.
     * @param {GeoRecord[]} features
     * @param {string[]} chosen The ids to tick.
     */
    set(features, chosen) {
      list.replaceChildren();
      filter.value = "";
      filter.disabled = false;
      const known = new Set(features.map((f) => f.id));
      for (const id of chosen)
        if (!known.has(id)) addItem(id, `Removed: ${REMOVED_PLACE}`, true);
      const sorted = [...features].sort((a, b) =>
        String(a.data.title ?? "").localeCompare(
          String(b.data.title ?? ""),
          "en-GB",
        ),
      );
      for (const record of sorted)
        addItem(
          record.id,
          `${String(record.data.title ?? "Untitled point")} (${shapeKind(record.geometry)})`,
          chosen.includes(record.id),
        );
      update();
    },
  };
}
