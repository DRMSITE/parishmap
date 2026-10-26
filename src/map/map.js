// Creates a Leaflet map that is safe to build inside a container that may be hidden
// or still laying out. See the vault note "Leaflet in Hidden Containers": a map
// initialised at zero size never draws tiles correctly, so we wait for real
// dimensions and keep the map in step with its container afterwards.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { config } from "../config.js";
import { createBasemap } from "./basemaps.js";

/**
 * @typedef {object} MapHandle
 * @property {Promise<L.Map>} ready Resolves once the map exists.
 * @property {(id: string, options?: import("./basemaps.js").BasemapOptions) => void} setBasemap
 *   Swaps the base map; does nothing before the map exists.
 * @property {() => void} destroy Stops observers and removes the map.
 */

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {[number, number]} [options.centre]
 * @param {number} [options.zoom]
 * @param {string} [options.basemap]
 * @param {import("./basemaps.js").BasemapOptions} [options.basemapOptions]
 * @returns {MapHandle}
 */
export function createMap(container, options = {}) {
  /** @type {L.Map | undefined} */
  let map;
  /** @type {L.Layer | undefined} */
  let base;
  /** @type {ResizeObserver | undefined} */
  let observer;
  let frame = 0;
  let destroyed = false;

  const hasSize = () => container.offsetWidth > 0 && container.offsetHeight > 0;

  /** @type {Promise<L.Map>} */
  const ready = new Promise((resolve) => {
    function init() {
      if (destroyed || map) return;
      // Respect the reduced-motion preference: no animated zoom, fade or marker motion.
      const animate = !globalThis.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map = L.map(container, {
        minZoom: config.map.minZoom,
        maxZoom: config.map.maxZoom,
        maxBounds: config.map.bounds,
        // A hard edge rather than a springy one, so the limit is easy to feel.
        maxBoundsViscosity: 1,
        zoomAnimation: animate,
        fadeAnimation: animate,
        markerZoomAnimation: animate,
      }).setView(
        options.centre ?? config.map.centre,
        options.zoom ?? config.map.zoom,
      );
      base = createBasemap(
        options.basemap ?? "osm",
        options.basemapOptions,
      ).addTo(map);
      resolve(map);
    }

    // Defer past the first layout pass, then initialise as soon as there is a size.
    frame = requestAnimationFrame(() => {
      if (hasSize()) init();
    });
    observer = new ResizeObserver(() => {
      if (!map) {
        if (hasSize()) init();
      } else {
        // Tab reveals, window resizes and drawer changes all land here.
        map.invalidateSize();
      }
    });
    observer.observe(container);
  });

  return {
    ready,
    setBasemap(id, basemapOptions) {
      if (!map) return;
      base?.remove();
      base = createBasemap(id, basemapOptions).addTo(map);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      map?.remove();
      map = undefined;
    },
  };
}
