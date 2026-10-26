// Writes the two files that depend on a council's settings, so that choosing a different
// map provider or region cannot leave anything out of step:
//
//   firebase.json              from firebase.template.json: the function region in the
//                              rewrites, and the tile servers allowed by the Content
//                              Security Policy (the policy is a hard allow-list, so a
//                              provider the policy does not name would silently show no map);
//   functions/tiles.config.json  what the tile function may fetch, from where, with which
//                              secret, for whom, and the area it will serve.
//
// Run it with `npm run generate`. `npm run build` runs it first. It also checks the
// settings (the same checks as src/config.js) and stops with a plain message if they are
// wrong, before anything is built or deployed.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { providerHosts, resolveTiles } from "../src/tiles/providers.js";
import { deploymentDir } from "./deployment-dir.mjs";

const root = resolve(import.meta.dirname, "..");

/** The region used if the council does not set one: London, near most UK councils. */
export const DEFAULT_REGION = "europe-west2";

/**
 * @param {string} template The text of firebase.template.json.
 * @param {{ region: string, tileHosts: string[] }} values
 */
export function buildHosting(template, { region, tileHosts }) {
  if (!/^[a-z]+-[a-z]+\d+$/.test(region))
    throw new Error(`region "${region}" does not look like "europe-west2".`);
  for (const host of tileHosts)
    if (!/^https:\/\/[A-Za-z0-9*.-]+$/.test(host))
      throw new Error(`"${host}" is not a usable tile server origin.`);
  const text = template
    .replaceAll("%REGION%", region)
    .replace("%TILE_HOSTS%", tileHosts.join(" "));
  JSON.parse(text); // fail here, not in the Firebase CLI
  return text;
}

/**
 * What the tile function needs and no more: only proxied providers, and for each only the
 * fields it uses.
 * @param {{ region?: string, bounds: [[number, number], [number, number]], minZoom: number, tiles?: import("../src/tiles/providers.js").TilesConfig }} parish
 */
export function buildFunctionsSettings(parish) {
  const { providers } = resolveTiles(parish.tiles);
  return {
    region: parish.region ?? DEFAULT_REGION,
    bounds: parish.bounds,
    minZoom: parish.minZoom,
    providers: Object.fromEntries(
      Object.values(providers)
        .filter((p) => p.kind === "proxied")
        .map((p) => [
          p.id,
          {
            id: p.id,
            upstream: p.upstream,
            secret: p.secret,
            styles: p.styles,
            roles: p.roles,
            minZoom: p.minZoom,
            maxZoom: p.maxZoom,
            cacheSeconds: p.cacheSeconds,
          },
        ]),
    ),
  };
}

/** The tile servers the Content Security Policy must allow: every direct provider's. */
export function tileHostsFor(
  /** @type {import("../src/tiles/providers.js").TilesConfig | undefined} */ tiles,
) {
  const { providers } = resolveTiles(tiles);
  return [
    ...new Set(
      Object.values(providers).flatMap((p) => providerHosts(p)),
    ),
  ];
}

async function main() {
  const { default: parish } = await import(
    pathToFileURL(resolve(deploymentDir, "parish.config.js")).href
  );
  const region = parish.region ?? DEFAULT_REGION;
  const template = readFileSync(resolve(root, "firebase.template.json"), "utf8");
  writeFileSync(
    resolve(root, "firebase.json"),
    buildHosting(template, { region, tileHosts: tileHostsFor(parish.tiles) }),
  );
  const settings = buildFunctionsSettings(parish);
  writeFileSync(
    resolve(root, "functions/tiles.config.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  const proxied = Object.keys(settings.providers);
  console.log(
    `Wrote firebase.json and functions/tiles.config.json (region ${region}; proxied tiles: ${proxied.join(", ") || "none"}).`,
  );
  for (const p of Object.values(settings.providers))
    console.log(
      `  Set the key once with: firebase functions:secrets:set ${p.secret}`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
