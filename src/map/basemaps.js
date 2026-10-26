// Basemaps, built from the tile providers a council has enabled (src/tiles/providers.js,
// chosen in deployment/parish.config.js). Following the idea in Verdant Village's
// basemap.js: a basemap is an id that resolves to a layer, and anything unavailable
// degrades to OpenStreetMap, whose attribution stays visible wherever it is used.
//
// Rules this file keeps, because the providers' terms depend on them:
//   - attribution is part of every layer and cannot be switched off;
//   - tiles are only ever fetched while a map is showing them: no pre-fetching, no
//     offline copies, no service worker (a provider's terms usually forbid bulk storage).

import L from "leaflet";
import { config } from "../config.js";
import { withYear } from "../tiles/attribution.js";
import { createProxiedLayer } from "./proxied-layer.js";

/**
 * What a basemap needs to be built for this person.
 * @typedef {object} BasemapOptions
 * @property {() => Promise<string>} [getToken] Present only if the person may use proxied tiles.
 * @property {(provider: { roles?: string[] }) => boolean} [canUse] Whether their role is one the provider allows.
 * @property {() => void} [onFail] Called once if proxied tiles cannot be loaded.
 */

const providers = () => config.tiles.providers;

/**
 * @param {Pick<import("../tiles/providers.js").TileProvider, "urlTemplate" | "browserKey" | "minZoom" | "maxZoom" | "attribution">} provider
 * @param {L.TileLayerOptions} [extra]
 */
function directLayer(provider, extra) {
  const url = String(provider.urlTemplate).replace(
    "{key}",
    encodeURIComponent(provider.browserKey ?? ""),
  );
  return L.tileLayer(url, {
    minZoom: provider.minZoom,
    maxZoom: provider.maxZoom,
    attribution: withYear(provider.attribution),
    ...extra,
  });
}

/** @param {L.TileLayerOptions} [extra] */
const osmLayer = (extra) => directLayer(providers().osm, extra);

/**
 * Whether this person can be given the provider's tiles at all.
 * @param {import("../tiles/providers.js").TileProvider} provider
 * @param {BasemapOptions} [options]
 */
export function canShow(provider, options) {
  if (provider.kind === "direct") return true;
  return Boolean(options?.getToken && options.canUse?.(provider));
}

/**
 * @param {string} id A provider id; unknown or unavailable ids give OpenStreetMap.
 * @param {BasemapOptions} [options]
 * @returns {L.Layer}
 */
export function createBasemap(id, options) {
  const provider = providers()[id];
  if (!provider || provider.id === "osm" || !canShow(provider, options))
    return osmLayer();

  const layer =
    provider.kind === "direct"
      ? directLayer(provider)
      : createProxiedLayer({
          provider,
          style: config.tiles.style || provider.styles?.[0] || "",
          getToken: /** @type {() => Promise<string>} */ (options?.getToken),
          onFail: options?.onFail,
        });
  // Each layer hides itself outside its zoom range, so zooming in past the provider's last
  // level hands over to OpenStreetMap.
  if (provider.maxZoom >= providers().osm.maxZoom) return layer;
  return L.layerGroup([layer, osmLayer({ minZoom: provider.maxZoom + 1 })]);
}
