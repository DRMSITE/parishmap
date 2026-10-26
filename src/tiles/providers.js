// The map tile providers, as plain data and plain functions, so that the browser, the
// build scripts and the tests all read the same rules. Nothing here touches the DOM or
// Firebase, and nothing here holds a key.
//
// Two kinds of provider:
//   direct   the browser fetches tiles straight from the provider (OpenStreetMap, or a
//            server that is free to embed). No key, or a browser key restricted by referrer.
//   proxied  the browser asks our `tiles` function, which checks who is asking and fetches
//            from the provider with a key held in Secret Manager. The key never reaches the
//            browser. Use this for any provider that charges, or whose terms say the key
//            must not be public.
//
// To add a provider, give it under `tiles.custom` in deployment/parish.config.js (see
// docs/tile-providers.md). It is checked here; a bad definition stops the build.

/** Roles a council's accounts can have. */
export const ROLES = /** @type {const} */ ([
  "admin",
  "clerk",
  "councillor",
  "member",
]);

/** The longest a browser may keep a proxied tile, whatever a provider's own terms allow. */
export const MAX_CACHE_SECONDS = 7 * 24 * 60 * 60;

/** Used when a custom proxied provider does not say how long its terms let a tile be kept. */
const DEFAULT_CACHE_SECONDS = 24 * 60 * 60;

/**
 * @typedef {object} TileProvider
 * @property {string} id Lower case letters, digits and hyphens.
 * @property {string} label Shown to people, e.g. "Ordnance Survey".
 * @property {"direct" | "proxied"} kind
 * @property {string} attribution HTML. Required and always shown; `{year}` becomes this year.
 * @property {number} minZoom
 * @property {number} maxZoom The last zoom with tiles. Beyond it the map hands over to OpenStreetMap.
 * @property {string} termsUrl The provider's terms. The council is responsible for following them.
 * @property {string} [urlTemplate] direct only. `{z}`, `{x}`, `{y}`, `{s}` and `{key}`.
 * @property {string} [browserKey] direct only. A public key restricted to your site by referrer.
 * @property {string[]} [hosts] direct only. Origins for the Content Security Policy; worked out from the URL if not given.
 * @property {string} [upstream] proxied only, server only. `{style}`, `{z}`, `{x}`, `{y}` and `{key}`.
 * @property {string} [secret] proxied only, server only. Name of the Secret Manager secret holding the key.
 * @property {string[]} [styles] proxied only. The map styles the provider offers; the first is the default.
 * @property {string[]} [roles] proxied only. Who may use it (members see OpenStreetMap unless listed).
 * @property {number} [cacheSeconds] proxied only. How long a browser keeps a tile.
 * @property {number} [maxCacheSeconds] proxied only. The most the provider's terms allow.
 */

/** @type {Record<string, TileProvider>} */
const BUILT_IN = {
  // OpenStreetMap's public servers suit light use. Their usage policy forbids heavy use,
  // bulk downloading and pre-fetching; a busy council should choose another provider.
  osm: {
    id: "osm",
    label: "OpenStreetMap",
    kind: "direct",
    urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    // The Add a point dialog's own small map asks the a., b. and c. servers.
    hosts: [
      "https://tile.openstreetmap.org",
      "https://*.tile.openstreetmap.org",
    ],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    minZoom: 0,
    maxZoom: 19,
    termsUrl: "https://operations.osmfoundation.org/policies/tiles/",
  },
  // Ordnance Survey OS Maps API (raster, Web Mercator). The free plan stops at zoom 16.
  os: {
    id: "os",
    label: "Ordnance Survey",
    kind: "proxied",
    upstream:
      "https://api.os.uk/maps/raster/v1/zxy/{style}/{z}/{x}/{y}.png?key={key}",
    secret: "OS_API_KEY",
    styles: ["Road_3857", "Outdoor_3857", "Light_3857"],
    roles: ["admin", "clerk", "councillor"],
    attribution:
      "Contains OS data &copy; Crown copyright and database rights {year}",
    minZoom: 7,
    maxZoom: 16,
    cacheSeconds: MAX_CACHE_SECONDS,
    maxCacheSeconds: MAX_CACHE_SECONDS,
    termsUrl:
      "https://docs.os.uk/more-than-maps/support/legal/legal-or-support-or-os-data-hub",
  },
};

/** The only fields a council may change on a built-in provider. */
const OVERRIDABLE = ["maxZoom", "roles", "cacheSeconds"];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SECRET = /^[A-Z][A-Z0-9_]*$/;

/** @param {unknown} v */
const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * @param {unknown} v
 * @param {number} lo
 * @param {number} hi
 */
const isInt = (v, lo, hi) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * True for an https address, once the {placeholders} are filled in.
 * @param {unknown} v
 */
const isHttps = (v) => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v.replace(/\{[a-z]+\}/g, "x")).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * @param {unknown} v
 * @param {string[]} placeholders
 */
const hasAll = (v, placeholders) =>
  typeof v === "string" && placeholders.every((p) => v.includes(p));

/**
 * The origins a direct provider's tiles come from, for the Content Security Policy.
 * @param {TileProvider} provider
 * @returns {string[]}
 */
export function providerHosts(provider) {
  if (provider.kind !== "direct") return [];
  if (provider.hosts?.length) return provider.hosts;
  const url = new URL(
    String(provider.urlTemplate)
      .replace("{s}", "wildcard")
      .replace(/\{[a-z]+\}/g, "x"),
  );
  return [`https://${url.host.replace("wildcard", "*")}`];
}

/**
 * Every problem with one provider, in plain words.
 * @param {Partial<TileProvider>} p
 * @returns {string[]}
 */
export function providerProblems(p) {
  if (!isText(p.id) || !ID.test(String(p.id)))
    return [
      `a tile provider needs an id of lower case letters, digits and hyphens (got "${p.id}")`,
    ];
  /** @type {string[]} */
  const out = [];
  const who = `tile provider "${p.id}"`;
  if (!isText(p.label)) out.push(`${who}: label must be some text`);
  if (!isText(p.attribution))
    out.push(`${who}: attribution is required and is always shown`);
  if (
    !isInt(p.minZoom, 0, 22) ||
    !isInt(p.maxZoom, 0, 22) ||
    Number(p.minZoom) > Number(p.maxZoom)
  )
    out.push(
      `${who}: minZoom and maxZoom must be whole numbers from 0 to 22, minZoom first`,
    );
  if (!isHttps(p.termsUrl))
    out.push(`${who}: termsUrl must be a link (https) to the provider's terms`);

  if (p.kind === "direct") {
    if (!isHttps(p.urlTemplate) || !hasAll(p.urlTemplate, ["{z}", "{x}", "{y}"]))
      out.push(
        `${who}: urlTemplate must be an https address containing {z}, {x} and {y}`,
      );
    else if (p.urlTemplate?.includes("{key}") && !isText(p.browserKey))
      out.push(
        `${who}: urlTemplate uses {key}, so give browserKey (a public key restricted to your site by referrer), or use a proxied provider so the key stays on the server`,
      );
    if (p.upstream || p.secret)
      out.push(`${who}: upstream and secret belong to proxied providers`);
  } else if (p.kind === "proxied") {
    if (
      !isHttps(p.upstream) ||
      !hasAll(p.upstream, ["{style}", "{z}", "{x}", "{y}", "{key}"])
    )
      out.push(
        `${who}: upstream must be an https address containing {style}, {z}, {x}, {y} and {key}`,
      );
    if (!isText(p.secret) || !SECRET.test(String(p.secret)))
      out.push(
        `${who}: secret must be the name of a Secret Manager secret, such as MAPTILER_KEY`,
      );
    if (
      !Array.isArray(p.styles) ||
      !p.styles.length ||
      !p.styles.every((s) => /^[A-Za-z0-9_-]+$/.test(String(s)))
    )
      out.push(
        `${who}: styles must list at least one style name (letters, digits, _ and -)`,
      );
    if (
      !Array.isArray(p.roles) ||
      !p.roles.length ||
      !p.roles.every((r) => /** @type {readonly string[]} */ (ROLES).includes(r))
    )
      out.push(`${who}: roles must list who may use it, from ${ROLES.join(", ")}`);
    if (!isInt(p.maxCacheSeconds, 0, MAX_CACHE_SECONDS))
      out.push(
        `${who}: maxCacheSeconds must be a number of seconds up to ${MAX_CACHE_SECONDS} (7 days)`,
      );
    else if (!isInt(p.cacheSeconds, 0, Number(p.maxCacheSeconds)))
      out.push(
        `${who}: cacheSeconds must be a whole number of seconds, no more than the ${p.maxCacheSeconds} its terms allow`,
      );
    if (p.urlTemplate || p.browserKey)
      out.push(`${who}: urlTemplate and browserKey belong to direct providers`);
  } else {
    out.push(`${who}: kind must be "direct" or "proxied"`);
  }
  return out;
}

/**
 * @typedef {object} TilesConfig
 * @property {string} [basemap] What people see by default: "osm" (the default), "os" or the id of a custom provider.
 * @property {string} [style] Which style of a proxied provider; the first if not given.
 * @property {Record<string, Partial<Pick<TileProvider, "maxZoom" | "roles" | "cacheSeconds">>>} [overrides] Changes to a built-in provider.
 * @property {Partial<TileProvider>[]} [custom] Further providers.
 */

/**
 * @typedef {object} ResolvedTiles
 * @property {string} basemap Id of the preferred basemap.
 * @property {string} style
 * @property {Record<string, TileProvider>} providers Everything enabled, with server-only fields.
 */

/**
 * Works out which providers a council has enabled and checks them all. Throws one error
 * listing every problem.
 * @param {TilesConfig} [tiles]
 * @returns {ResolvedTiles}
 */
export function resolveTiles(tiles = {}) {
  /** @type {string[]} */
  const problems = [];
  const basemap = tiles.basemap ?? "osm";
  /** @type {Record<string, TileProvider>} */
  const providers = { osm: { ...BUILT_IN.osm } };
  if (basemap === "os" || tiles.overrides?.os) providers.os = { ...BUILT_IN.os };

  for (const [id, change] of Object.entries(tiles.overrides ?? {})) {
    if (!providers[id]) {
      problems.push(`overrides: "${id}" is not a built-in provider in use`);
      continue;
    }
    for (const key of Object.keys(change ?? {})) {
      if (!OVERRIDABLE.includes(key))
        problems.push(
          `overrides.${id}: only ${OVERRIDABLE.join(", ")} can be changed (not ${key})`,
        );
    }
    providers[id] = { ...providers[id], ...change };
  }

  for (const custom of tiles.custom ?? []) {
    const id = String(custom?.id);
    if (BUILT_IN[id] || providers[id]) {
      problems.push(`custom: "${id}" is already taken (use another id)`);
      continue;
    }
    const provider = /** @type {TileProvider} */ ({
      maxCacheSeconds: DEFAULT_CACHE_SECONDS,
      ...custom,
    });
    if (provider.kind === "proxied" && provider.cacheSeconds === undefined)
      provider.cacheSeconds = Math.min(
        provider.maxCacheSeconds ?? DEFAULT_CACHE_SECONDS,
        DEFAULT_CACHE_SECONDS,
      );
    providers[id] = provider;
  }

  for (const provider of Object.values(providers))
    problems.push(...providerProblems(provider));

  const preferred = providers[basemap];
  if (!preferred)
    problems.push(
      `basemap "${basemap}" is not "osm", "os" or the id of a custom provider`,
    );
  const style = tiles.style ?? preferred?.styles?.[0] ?? "";
  if (preferred?.kind === "proxied" && !preferred.styles?.includes(style))
    problems.push(
      `style "${style}" is not one of ${preferred.styles?.join(", ")}`,
    );

  if (problems.length)
    throw new Error(
      `The tiles settings are not usable:\n- ${problems.join("\n- ")}`,
    );
  return { basemap, style, providers };
}

/**
 * What the browser may know about a provider: no upstream address, no secret name.
 * @param {TileProvider} provider
 * @returns {Omit<TileProvider, "upstream" | "secret">}
 */
export function publicProvider(provider) {
  const { upstream: _upstream, secret: _secret, ...rest } = provider;
  return rest;
}

export { withYear } from "./attribution.js";
