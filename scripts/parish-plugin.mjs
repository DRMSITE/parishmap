// A small Vite plugin that gives the browser the council's settings WITHOUT the parts that
// belong to the server:
//
//   virtual:parish-config   the settings in deployment/parish.config.js, minus `tiles`;
//   virtual:parish-tiles    the tile providers, already checked and resolved at build time,
//                           with no upstream address and no secret name.
//
// Importing parish.config.js straight into the browser would ship every custom provider's
// upstream address and secret name with it, and importing the provider code would ship the
// built-in ones. None of that is a key, but there is no reason for a browser to know it, and
// checking at build time means a bad definition stops the build instead of the page.
// It also puts the council's name into index.html, which is static and cannot import.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { publicProvider, resolveTiles } from "../src/tiles/providers.js";
import { deploymentDir } from "./deployment-dir.mjs";

const CONFIG = "virtual:parish-config";
const TILES = "virtual:parish-tiles";

/** @param {string} text */
const escapeAttribute = (text) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The council's settings as written in deployment/parish.config.js. */
export async function loadParishConfig() {
  const { default: parish } = await import(
    pathToFileURL(resolve(deploymentDir, "parish.config.js")).href
  );
  return parish;
}

/** @param {Record<string, any>} parish */
export function publicTiles(parish) {
  const { basemap, style, providers } = resolveTiles(parish.tiles);
  return {
    basemap,
    style,
    providers: Object.fromEntries(
      Object.entries(providers).map(([id, p]) => [id, publicProvider(p)]),
    ),
  };
}

/** @param {Record<string, any>} parish */
export function parishPlugin(parish) {
  const { tiles: _tiles, ...rest } = parish;
  const tiles = publicTiles(parish); // throws, with every problem, if the settings are wrong
  const kind = parish.council?.kind ?? "parish";
  const Kind = `${kind[0].toUpperCase()}${kind.slice(1)}`;
  const clerk = parish.council?.clerkTitle ?? `${Kind} Clerk`;
  const html = {
    "%APP_NAME%": escapeAttribute(String(parish.appName ?? "ParishMap")),
    "%APP_DESCRIPTION%": escapeAttribute(
      `A private map for ${parish.council?.area ?? "your"} ${Kind} Councillors and the ${clerk}.`,
    ),
  };
  return {
    name: "parishmap-settings",
    /** @param {string} id */
    resolveId(id) {
      return id === CONFIG || id === TILES ? `\0${id}` : undefined;
    },
    /** @param {string} id */
    load(id) {
      if (id === `\0${CONFIG}`)
        return `export default ${JSON.stringify(rest)};`;
      if (id === `\0${TILES}`) return `export default ${JSON.stringify(tiles)};`;
      return undefined;
    },
    transformIndexHtml: (/** @type {string} */ page) =>
      Object.entries(html).reduce(
        (out, [token, value]) => out.replaceAll(token, value),
        page,
      ),
  };
}
