// Draws a record on the map: a marker for a point, and for a line or an area the shape
// as well as a marker at its representative point. The marker is the keyboard-reachable
// handle (Leaflet's SVG paths cannot take focus) and carries the title.

import L from "leaflet";
import { buildPopup, createMarker } from "./markers.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

const SHAPE_STYLE = { color: "#0b4a9e", weight: 3, fillOpacity: 0.2 };

/**
 * @param {GeoRecord} record
 * @param {import("./markers.js").PopupActions} [actions]
 * @returns {L.Layer}
 */
export function createRecordLayer(record, actions) {
  const marker = createMarker(record, actions);
  const { geometry } = record;
  if (!geometry || geometry.type === "Point") return marker;
  const shape = L.geoJSON(geometry, { style: SHAPE_STYLE }).bindPopup(() =>
    buildPopup(record, actions),
  );
  return L.layerGroup([shape, marker]);
}
