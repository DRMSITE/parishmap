// Drawing a line or an area by adding vertices one at a time. It draws only a preview on
// the map; the view turns the finished vertices into a record. Vertices can be added by
// clicking or tapping, or at the middle of the map with `addAtCentre`, which a keyboard
// user can reach by panning with the arrow keys.

import L from "leaflet";
import { MIN_VERTICES } from "../util/geo.js";

/**
 * @typedef {object} Drawing
 * @property {(latlng: L.LatLng) => boolean} add Adds a vertex; false when the limit is reached.
 * @property {() => boolean} addAtCentre As `add`, at the middle of the map.
 * @property {() => void} undo Removes the last vertex.
 * @property {() => { lat: number, lng: number }[]} vertices
 * @property {() => void} stop Removes the preview and gives the map back.
 */

const STYLE = { color: "#b3261e", weight: 3, dashArray: "6 6" };

/**
 * @param {L.Map} map
 * @param {"line" | "area"} kind
 * @param {object} options
 * @param {number} options.maxVertices
 * @param {(count: number) => void} options.onChange Called after every add or undo.
 * @returns {Drawing}
 */
export function startDrawing(map, kind, { maxVertices, onChange }) {
  /** @type {L.LatLng[]} */
  const points = [];
  const preview =
    kind === "area"
      ? L.polygon([], { ...STYLE, fillOpacity: 0.15, interactive: false })
      : L.polyline([], { ...STYLE, interactive: false });
  const dots = L.layerGroup();
  preview.addTo(map);
  dots.addTo(map);

  // A double click would zoom the map as well as add two vertices.
  const hadDoubleClickZoom = map.doubleClickZoom.enabled();
  map.doubleClickZoom.disable();
  map.getContainer().classList.add("is-picking");

  /** @param {L.LatLng} latlng */
  function add(latlng) {
    if (points.length >= maxVertices) return false;
    points.push(latlng);
    redraw();
    return true;
  }

  function redraw() {
    preview.setLatLngs(points);
    dots.clearLayers();
    // The first vertex is larger, so the start of an area is clear without colour.
    points.forEach((p, i) => {
      dots.addLayer(
        L.circleMarker(p, {
          radius: i === 0 ? 8 : 5,
          color: "#000",
          weight: 2,
          fillColor: "#fff",
          fillOpacity: 1,
          interactive: false,
        }),
      );
    });
    onChange(points.length);
  }

  /** @param {L.LeafletMouseEvent} e */
  const onClick = (e) => {
    add(e.latlng);
  };
  map.on("click", onClick);

  return {
    add,
    addAtCentre: () => add(map.getCenter()),
    undo() {
      points.pop();
      redraw();
    },
    vertices: () => points.map(({ lat, lng }) => ({ lat, lng })),
    stop() {
      map.off("click", onClick);
      preview.remove();
      dots.remove();
      map.getContainer().classList.remove("is-picking");
      if (hadDoubleClickZoom) map.doubleClickZoom.enable();
    },
  };
}

/**
 * Whether a drawing has enough vertices to finish.
 * @param {"line" | "area"} kind
 * @param {number} count
 */
export const canFinish = (kind, count) => count >= MIN_VERTICES[kind];
