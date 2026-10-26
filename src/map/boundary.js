// The council boundary: a fixed outline, not a record. `deployment/boundary.geojson` is
// optional; if it is missing there is no outline. When present it is a single closed
// Polygon, loaded on demand (so it is a separate chunk) and checked like any other
// geometry. It exceeds the drawn-shape vertex cap on purpose; it is not user input, so it
// has its own, higher limit.

import L from "leaflet";
import { parseGeometry } from "../util/geo.js";
import { boundaryFiles } from "./boundary-file.js";

const MAX_BOUNDARY_VERTICES = 2000;

/**
 * @returns {Promise<L.GeoJSON | null>} null if there is no file or it is unusable.
 */
export async function createBoundaryLayer() {
  const load = Object.values(boundaryFiles)[0];
  if (!load) return null;
  const text = /** @type {string} */ (await load());
  let parsed;
  try {
    parsed = parseGeometry(JSON.parse(text), MAX_BOUNDARY_VERTICES);
  } catch {
    return null;
  }
  if ("error" in parsed) {
    console.error("[boundary]", parsed.error);
    return null;
  }
  return L.geoJSON(parsed.geometry, {
    interactive: false,
    style: { color: "#1d1d1d", weight: 3, dashArray: "2 8", fill: false },
  });
}
