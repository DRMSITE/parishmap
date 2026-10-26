// Whether this deployment has a boundary file, kept apart from boundary.js so that a page
// which only needs to know (About, the map's Options) does not load Leaflet to find out.
// A glob rather than an import, so that a deployment without the file still builds.

/** Loaders for `deployment/boundary.geojson`; empty if the deployment has none. */
export const boundaryFiles = import.meta.glob("@deployment/boundary.geojson", {
  query: "?raw",
  import: "default",
});

/** True if this deployment has a boundary file. */
export const hasBoundary = Object.keys(boundaryFiles).length > 0;
