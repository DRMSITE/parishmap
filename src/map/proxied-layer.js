// Tiles from a provider that needs a key, fetched through our own tile proxy
// (functions/index.js). The browser never holds the provider's key: each tile is fetched
// with the person's sign-in token in a header, which an <img> cannot send, so the tile is
// fetched as a blob and shown from an object URL.

import L from "leaflet";
import { withYear } from "../tiles/attribution.js";

/**
 * @typedef {object} ProxiedLayerOptions
 * @property {Omit<import("../tiles/providers.js").TileProvider, "upstream" | "secret">} provider
 * @property {string} style One of the provider's styles.
 * @property {() => Promise<string>} getToken A current ID token.
 * @property {() => void} [onFail] Called once, the first time a tile cannot be loaded.
 */

class ProxiedTileLayer extends L.TileLayer {
  /**
   * @param {ProxiedLayerOptions} options
   */
  constructor({ provider, style, getToken, onFail }) {
    super(`/tiles/${provider.id}/${style}/{z}/{x}/{y}`, {
      minZoom: provider.minZoom,
      maxZoom: provider.maxZoom,
      attribution: withYear(provider.attribution),
    });
    this.getToken = getToken;
    this.onFail = onFail;
    this.failed = false;
    /** @type {WeakMap<HTMLImageElement, AbortController>} */
    this.requests = new WeakMap();
    this.on("tileunload", (/** @type {any} */ e) => {
      this.requests.get(e.tile)?.abort();
      if (e.tile.src.startsWith("blob:")) URL.revokeObjectURL(e.tile.src);
    });
  }

  /**
   * @param {L.Coords} coords
   * @param {L.DoneCallback} done
   * @returns {HTMLElement}
   */
  createTile(coords, done) {
    const tile = document.createElement("img");
    // Map tiles are decoration for the page; the map region carries the name.
    tile.alt = "";
    tile.setAttribute("role", "presentation");
    const controller = new AbortController();
    this.requests.set(tile, controller);
    void this.load(coords, tile, controller.signal).then(
      () => done(undefined, tile),
      (error) => {
        if (controller.signal.aborted) return;
        done(error, tile);
        if (!this.failed) {
          this.failed = true;
          this.onFail?.();
        }
      },
    );
    return tile;
  }

  /**
   * @param {L.Coords} coords
   * @param {HTMLImageElement} tile
   * @param {AbortSignal} signal
   */
  async load(coords, tile, signal) {
    const token = await this.getToken();
    const response = await fetch(this.getTileUrl(coords), {
      // Not Authorization: Cloud Run would try to validate a Firebase token there itself.
      headers: { "X-Firebase-Token": token },
      signal,
    });
    if (!response.ok)
      throw new Error(`Tile request failed (${response.status}).`);
    tile.src = URL.createObjectURL(await response.blob());
  }
}

/**
 * @param {ProxiedLayerOptions} options
 * @returns {L.TileLayer}
 */
export function createProxiedLayer(options) {
  return new ProxiedTileLayer(options);
}
