// Filtering shared by every DataSource, so they all answer a GeoQuery the same way.

import { geometryBounds } from "../util/geo.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */
/** @typedef {import("../types.js").GeoQuery} GeoQuery */

/**
 * @param {GeoRecord} record
 * @param {GeoQuery} [query]
 * @returns {boolean}
 */
export function matchesQuery(record, query) {
  if (query?.category !== undefined && record.category !== query.category)
    return false;
  const b = query?.bounds;
  if (!b) return true;
  // A shape matches when its bounding box overlaps the query, so a large area is
  // found even when its representative point lies outside the view.
  const own = record.geometry
    ? geometryBounds(record.geometry)
    : {
        south: record.lat,
        north: record.lat,
        west: record.lng,
        east: record.lng,
      };
  return !(
    own.north < b.south ||
    own.south > b.north ||
    own.east < b.west ||
    own.west > b.east
  );
}
