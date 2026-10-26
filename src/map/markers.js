// Turns records into Leaflet markers. Markers use L.divIcon (as Verdant Village
// does) so there are no image files for the bundler to break.

import L from "leaflet";
import { describeShape } from "../util/geo.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

/**
 * The actions a popup offers. A button appears only for an action that is supplied,
 * so the caller decides (through the guard) what is available.
 * @typedef {object} PopupActions
 * @property {() => void} [edit]
 * @property {() => void} [remove]
 * @property {() => HTMLElement | null} [extra] More to show above the buttons, such as
 *   the projects that concern the place. Called each time the popup opens, so it is current.
 */

/**
 * A button named for its point ("Edit Old oak"), so several are distinguishable.
 * @param {string} verb
 * @param {string} pointTitle
 * @param {() => void} onClick
 * @param {string} [variant]
 * @returns {HTMLElement}
 */
export function actionButton(verb, pointTitle, onClick, variant) {
  const button = document.createElement("wa-button");
  button.setAttribute("size", "xs");
  button.setAttribute("appearance", "outlined");
  if (variant) button.setAttribute("variant", variant);
  button.append(verb);
  const name = document.createElement("span");
  name.className = "visually-hidden";
  name.textContent = ` ${pointTitle}`;
  button.append(name);
  button.addEventListener("click", onClick);
  return button;
}

/**
 * The popup for a record, built as DOM so record content is never parsed as HTML.
 * @param {GeoRecord} record
 * @param {PopupActions} [actions]
 * @returns {HTMLElement}
 */
export function buildPopup(record, actions = {}) {
  const root = document.createElement("div");
  root.className = "point-popup";
  const title = document.createElement("strong");
  title.textContent = String(record.data.title ?? "Untitled point");
  root.append(title);
  if (record.data.notes) {
    const notes = document.createElement("p");
    notes.textContent = String(record.data.notes);
    root.append(notes);
  }
  const position = document.createElement("small");
  position.textContent =
    describeShape(record.geometry) ||
    `${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`;
  root.append(position);
  const extra = actions.extra?.();
  if (extra) root.append(extra);
  if (actions.edit || actions.remove) {
    const row = document.createElement("div");
    row.className = "point-actions";
    const label = String(record.data.title ?? "Untitled point");
    if (actions.edit) row.append(actionButton("Edit", label, actions.edit));
    if (actions.remove)
      row.append(actionButton("Delete", label, actions.remove, "danger"));
    root.append(row);
  }
  return root;
}

/**
 * @param {GeoRecord} record
 * @param {PopupActions} [actions]
 * @returns {L.Marker}
 */
export function createMarker(record, actions) {
  // Leaflet assigns these as properties (not HTML), so no escaping is needed.
  const label = String(record.data.title ?? "Point");
  const icon = L.divIcon({
    className: "map-pin",
    html: `<span class="map-pin-dot" aria-hidden="true"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  // `title` gives the marker an accessible name and a tooltip.
  return L.marker([record.lat, record.lng], {
    icon,
    title: label,
    alt: label,
  }).bindPopup(() => buildPopup(record, actions));
}
