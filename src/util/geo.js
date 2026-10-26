// Geometry helpers, adapted from Verdant Village's geo.js.

/**
 * Great-circle distance in kilometres.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting point-in-polygon test.
 * @param {number} lat
 * @param {number} lng
 * @param {{ lat: number, lng: number }[]} polygon
 * @returns {boolean}
 */
export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: yi, lng: xi } = polygon[i];
    const { lat: yj, lng: xj } = polygon[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Parse a latitude or longitude typed into a text input. Returns `null` for
 * anything that is not a finite number within range.
 * @param {string} text
 * @param {number} limit 90 for latitude, 180 for longitude.
 * @returns {number | null}
 */
export function parseCoordinate(text, limit) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

/** @param {string} text @returns {number | null} */
export const parseLat = (text) => parseCoordinate(text, 90);

/** @param {string} text @returns {number | null} */
export const parseLng = (text) => parseCoordinate(text, 180);

// GeoJSON geometry. Stored geometry is untrusted (a user, another tab or, later, the
// back end), so it is rebuilt from a whitelist rather than passed through. Positions are
// [longitude, latitude] as GeoJSON requires, the reverse of Leaflet's [lat, lng].

/** @typedef {import("../types.js").GeoJSONGeometry} GeoJSONGeometry */
/** @typedef {import("../types.js").Position} Position */

/** Rings or parts beyond this are rejected; real proposals need a handful at most. */
const MAX_PARTS = 10;

/**
 * @param {unknown} value
 * @returns {Position | null}
 */
function parsePosition(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3)
    return null;
  const [lng, lat] = value;
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  return [lng, lat]; // Any altitude is dropped.
}

/**
 * @param {unknown} value
 * @param {number} min
 * @returns {Position[] | null}
 */
function parsePositions(value, min) {
  if (!Array.isArray(value) || value.length < min) return null;
  /** @type {Position[]} */
  const positions = [];
  for (const item of value) {
    const position = parsePosition(item);
    if (!position) return null;
    positions.push(position);
  }
  return positions;
}

/**
 * @param {unknown} value
 * @returns {Position[][] | null}
 */
function parsePolygonRings(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PARTS)
    return null;
  /** @type {Position[][]} */
  const rings = [];
  for (const item of value) {
    const ring = parsePositions(item, 4);
    if (!ring) return null;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return null;
    rings.push(ring);
  }
  return rings;
}

/**
 * Count the positions in a parsed geometry.
 * @param {GeoJSONGeometry} geometry
 * @returns {number}
 */
export function countVertices(geometry) {
  switch (geometry.type) {
    case "Point":
      return 1;
    case "LineString":
      return geometry.coordinates.length;
    case "Polygon":
      return geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0);
    case "MultiPolygon":
      return geometry.coordinates.reduce(
        (sum, polygon) =>
          sum + polygon.reduce((inner, ring) => inner + ring.length, 0),
        0,
      );
  }
}

/**
 * Check and normalise a GeoJSON geometry. Only Point, LineString, Polygon and
 * MultiPolygon are accepted. Rings must be closed, coordinates in range and the total
 * number of positions within `maxVertices`. Extra members and altitudes are dropped.
 * Self-intersecting rings are not detected.
 * @param {unknown} value
 * @param {number} maxVertices
 * @returns {{ geometry: GeoJSONGeometry } | { error: string }}
 */
export function parseGeometry(value, maxVertices) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return { error: "The shape is not valid." };
  const { type, coordinates } = /** @type {Record<string, unknown>} */ (value);

  /** @type {GeoJSONGeometry | null} */
  let geometry = null;
  if (type === "Point") {
    const position = parsePosition(coordinates);
    if (position) geometry = { type, coordinates: position };
  } else if (type === "LineString") {
    const line = parsePositions(coordinates, 2);
    if (line) geometry = { type, coordinates: line };
  } else if (type === "Polygon") {
    const rings = parsePolygonRings(coordinates);
    if (rings) geometry = { type, coordinates: rings };
  } else if (type === "MultiPolygon") {
    if (Array.isArray(coordinates) && coordinates.length <= MAX_PARTS) {
      const polygons = coordinates.map(parsePolygonRings);
      if (polygons.length > 0 && polygons.every((p) => p !== null))
        geometry = {
          type,
          coordinates: /** @type {Position[][][]} */ (polygons),
        };
    }
  } else {
    return { error: "Only points, lines and areas are supported." };
  }

  if (!geometry) return { error: "The shape has invalid coordinates." };
  if (countVertices(geometry) > maxVertices)
    return { error: `The shape has more than ${maxVertices} points.` };
  return { geometry };
}

/**
 * Bounding box of a geometry.
 * @param {GeoJSONGeometry} geometry
 * @returns {{ south: number, west: number, north: number, east: number }}
 */
export function geometryBounds(geometry) {
  const box = { south: 90, west: 180, north: -90, east: -180 };
  /** @param {unknown} node */
  const visit = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number") {
      const [lng, lat] = node;
      box.south = Math.min(box.south, lat);
      box.north = Math.max(box.north, lat);
      box.west = Math.min(box.west, lng);
      box.east = Math.max(box.east, lng);
      return;
    }
    for (const child of node) visit(child);
  };
  visit(geometry.coordinates);
  return box;
}

/**
 * Signed area and centroid of a ring, treating longitude/latitude as planar. That is
 * accurate enough at parish scale for placing a marker.
 * @param {Position[]} ring
 * @returns {{ area: number, lat: number, lng: number }}
 */
function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  area /= 2;
  return { area: Math.abs(area), lng: cx / (6 * area), lat: cy / (6 * area) };
}

/**
 * A single point that stands for the geometry in lists, popups and map focus: the
 * point itself, the middle vertex of a line, or the centroid of the largest area.
 * (A centroid can fall outside a concave area; it is a handle, not a boundary.)
 * @param {GeoJSONGeometry} geometry
 * @returns {{ lat: number, lng: number }}
 */
export function representativePoint(geometry) {
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return { lat, lng };
  }
  if (geometry.type === "LineString") {
    const [lng, lat] =
      geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    return { lat, lng };
  }
  const outerRings =
    geometry.type === "Polygon"
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map((polygon) => polygon[0]);
  const largest = outerRings
    .map(ringCentroid)
    .reduce((best, candidate) =>
      candidate.area > best.area ? candidate : best,
    );
  if (largest.area > 0 && Number.isFinite(largest.lat + largest.lng))
    return { lat: largest.lat, lng: largest.lng };
  const { south, west, north, east } = geometryBounds(geometry);
  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

/**
 * Validate any `geometry` in a create or update payload and set `lat`/`lng` from it, so
 * the two can never disagree. Throws a user-readable Error for a bad shape. A payload
 * without geometry is returned unchanged.
 * @template {Record<string, unknown>} T
 * @param {T} fields
 * @param {number} maxVertices
 * @returns {T}
 */
export function withGeometry(fields, maxVertices) {
  if (fields.geometry === undefined) return fields;
  const parsed = parseGeometry(fields.geometry, maxVertices);
  if ("error" in parsed) throw new Error(parsed.error);
  return {
    ...fields,
    geometry: parsed.geometry,
    ...representativePoint(parsed.geometry),
  };
}

// Drawn and typed shapes. A line or an area is edited as a list of vertices; an area is
// closed (first position repeated) only when it becomes GeoJSON.

/**
 * What to call a geometry in the interface.
 * @param {GeoJSONGeometry | undefined} geometry
 * @returns {"point" | "line" | "area"}
 */
export function shapeKind(geometry) {
  if (!geometry || geometry.type === "Point") return "point";
  return geometry.type === "LineString" ? "line" : "area";
}

/** The fewest vertices a line or an area needs. */
export const MIN_VERTICES = { line: 2, area: 3 };

/**
 * @param {"line" | "area"} kind
 * @param {{ lat: number, lng: number }[]} vertices
 * @returns {GeoJSONGeometry}
 */
export function geometryFromVertices(kind, vertices) {
  const positions = /** @type {Position[]} */ (
    vertices.map((v) => [v.lng, v.lat])
  );
  if (kind === "line") return { type: "LineString", coordinates: positions };
  return {
    type: "Polygon",
    coordinates: [[...positions, positions[0]]],
  };
}

/**
 * The editable vertices of a line or a single-ring area, or null for anything the
 * vertex list cannot represent (an area with holes, or several areas).
 * @param {GeoJSONGeometry} geometry
 * @returns {{ lat: number, lng: number }[] | null}
 */
export function verticesFromGeometry(geometry) {
  /** @type {Position[] | undefined} */
  let positions;
  if (geometry.type === "LineString") positions = geometry.coordinates;
  else if (geometry.type === "Polygon" && geometry.coordinates.length === 1)
    positions = geometry.coordinates[0].slice(0, -1);
  return positions ? positions.map(([lng, lat]) => ({ lat, lng })) : null;
}

/**
 * One vertex per line, "latitude, longitude": the text form of a shape.
 * @param {{ lat: number, lng: number }[]} vertices
 * @returns {string}
 */
export function formatVertices(vertices) {
  return vertices
    .map((v) => `${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`)
    .join("\n");
}

/**
 * Read the text form of a shape. Blank lines are ignored, and an area may repeat its
 * first vertex at the end.
 * @param {string} text
 * @param {"line" | "area"} kind
 * @returns {{ vertices: { lat: number, lng: number }[] } | { error: string }}
 */
export function parseVertexText(text, kind) {
  /** @type {{ lat: number, lng: number }[]} */
  const vertices = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const parts = line.split(/[\s,;]+/);
    const lat = parts.length === 2 ? parseLat(parts[0]) : null;
    const lng = parts.length === 2 ? parseLng(parts[1]) : null;
    if (lat === null || lng === null)
      return {
        error: `Line ${i + 1} must be a latitude and a longitude, such as 52.3947, 0.2109.`,
      };
    vertices.push({ lat, lng });
  }
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (
    kind === "area" &&
    vertices.length > 1 &&
    first.lat === last.lat &&
    first.lng === last.lng
  )
    vertices.pop();
  const min = MIN_VERTICES[kind];
  if (vertices.length < min)
    return {
      error: `${kind === "line" ? "A line" : "An area"} needs at least ${min} points, one per line.`,
    };
  return { vertices };
}

/**
 * A short plain-text description of a shape, for popups and the Points list.
 * @param {GeoJSONGeometry | undefined} geometry
 * @returns {string} Empty for a plain point.
 */
export function describeShape(geometry) {
  const kind = shapeKind(geometry);
  if (!geometry || kind === "point") return "";
  // A ring repeats its first position to close, which a person would not count.
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates.length
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.reduce((sum, polygon) => sum + polygon.length, 0)
        : 0;
  const count = countVertices(geometry) - rings;
  return `${kind === "line" ? "Line" : "Area"} with ${count} points`;
}

/**
 * Whether a position is inside the area the map covers (see `config.map.bounds`).
 * @param {[[number, number], [number, number]]} bounds South-west then north-east, as [lat, lng].
 * @param {number} lat
 * @param {number} lng
 */
export function isWithinBounds(bounds, lat, lng) {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}
