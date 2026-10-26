// The decision-making for the tile proxy, kept apart from Firebase so it can be tested on
// its own (see test/tiles-handler.test.js). The proxy exists so that a provider's key stays
// in Secret Manager and never reaches a browser, and so that tiles are only given to the
// people the council chose.
//
// What it refuses, in this order:
//   - anything but GET;
//   - a missing, invalid, expired or revoked sign-in, or one without the authenticator;
//   - a provider that is not in this deployment's own list (never an address from the
//     request: the upstream address comes only from the deployed settings), and a style
//     that provider does not offer;
//   - a role the provider does not allow (members get OpenStreetMap, which is not proxied);
//   - a tile that is not a plain z/x/y, outside the provider's zoom range, or outside
//     the area the council's map covers, so that a signed-in person cannot use the proxy to
//     download the rest of the country.

/**
 * @typedef {object} ProxiedProvider
 * @property {string} id
 * @property {string} upstream Address template: {style}, {z}, {x}, {y} and {key}.
 * @property {string} secret Name of the secret holding the key.
 * @property {string[]} styles
 * @property {string[]} roles
 * @property {number} minZoom
 * @property {number} maxZoom
 * @property {number} cacheSeconds How long a browser may keep a tile.
 */

/**
 * @typedef {object} TilesSettings
 * @property {Record<string, ProxiedProvider>} providers Only the proxied providers in use.
 * @property {[[number, number], [number, number]]} bounds [south-west, north-east] as [lat, lng].
 * @property {number} minZoom The furthest the map zooms out.
 */

/**
 * @typedef {object} TileRequest
 * @property {string} method
 * @property {string} path Request path; only the last five segments are used.
 * @property {string | undefined} idToken The Firebase ID token, from the X-Firebase-Token
 *   header. It is not sent as Authorization: Cloud Run would try to validate a
 *   Google-signed token there itself and refuse it before this code runs.
 */

/**
 * @typedef {object} TileDeps
 * @property {(idToken: string) => Promise<Record<string, any>>} verifyToken
 *   Resolves to the decoded token, or rejects if it is invalid, expired or revoked.
 * @property {(secretName: string) => string} secretValue The key for a provider.
 * @property {(url: string) => Promise<{ status: number, contentType: string, body: ArrayBuffer }>} fetchUrl
 */

/**
 * @typedef {object} TileResponse
 * @property {number} status
 * @property {Record<string, string>} headers
 * @property {ArrayBuffer | string} body
 */

/**
 * @param {number} status
 * @param {string} message
 * @returns {TileResponse}
 */
function refuse(status, message) {
  return {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: message,
  };
}

/** @param {number} z @param {number} x */
const tileLng = (z, x) => (x / 2 ** z) * 360 - 180;

/** @param {number} z @param {number} y */
function tileLat(z, y) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/**
 * Whether a tile overlaps the area the map covers, allowing a tile's width of slack
 * because the map asks for tiles a little beyond its edge.
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @param {[[number, number], [number, number]]} bounds
 */
export function tileTouchesBounds(z, x, y, bounds) {
  const [[south, west], [north, east]] = bounds;
  const tileWest = tileLng(z, x);
  const tileEast = tileLng(z, x + 1);
  const tileNorth = tileLat(z, y);
  const tileSouth = tileLat(z, y + 1);
  const slackLng = tileEast - tileWest;
  const slackLat = tileNorth - tileSouth;
  return (
    tileEast >= west - slackLng &&
    tileWest <= east + slackLng &&
    tileNorth >= south - slackLat &&
    tileSouth <= north + slackLat
  );
}

/**
 * Pick the provider, style and tile out of a path such as
 * /tiles/os/Road_3857/16/32768/21845. Only checks the shape; whether the provider exists
 * and may be used is decided by the caller.
 * @param {string} path
 * @returns {{ provider: string, style: string, z: number, x: number, y: number } | null}
 */
export function parseTilePath(path) {
  const parts = path.split("?")[0].split("/").filter(Boolean).slice(-5);
  if (parts.length !== 5) return null;
  const [provider, style, zText, xText, yText] = parts;
  if (!/^[a-z0-9-]{1,40}$/.test(provider)) return null;
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(style)) return null;
  if (![zText, xText, yText].every((p) => /^\d{1,8}$/.test(p))) return null;
  const z = Number(zText);
  const x = Number(xText);
  const y = Number(yText);
  if (z > 22 || x >= 2 ** z || y >= 2 ** z) return null;
  return { provider, style, z, x, y };
}

/**
 * @param {TileRequest} request
 * @param {TileDeps} deps
 * @param {TilesSettings} settings
 * @returns {Promise<TileResponse>}
 */
export async function handleTileRequest(request, deps, settings) {
  if (request.method !== "GET") return refuse(405, "Method not allowed.");

  if (!request.idToken || /\s/.test(request.idToken))
    return refuse(401, "Sign in to see this map.");

  /** @type {Record<string, any>} */
  let token;
  try {
    token = await deps.verifyToken(request.idToken);
  } catch {
    return refuse(401, "Sign in to see this map.");
  }
  // The second factor must have been used for this sign-in, as firestore.rules requires.
  if (!token.firebase?.sign_in_second_factor)
    return refuse(401, "Sign in with your authenticator code.");

  const tile = parseTilePath(request.path);
  if (!tile) return refuse(400, "Not a valid tile.");

  // An own-property check: a provider called "constructor" must not be found.
  const provider = Object.hasOwn(settings.providers, tile.provider)
    ? settings.providers[tile.provider]
    : undefined;
  if (!provider || !provider.styles.includes(tile.style))
    return refuse(404, "No such map.");
  if (!provider.roles.includes(token.role))
    return refuse(403, `The ${provider.id} map is not available to your role.`);

  const { z, x, y } = tile;
  if (z < Math.max(provider.minZoom, settings.minZoom) || z > provider.maxZoom)
    return refuse(400, "That zoom level is not available.");
  if (!tileTouchesBounds(z, x, y, settings.bounds))
    return refuse(400, "That tile is outside the area this map covers.");

  // The address is built only from the deployed template and the checked values above.
  const url = provider.upstream
    .replace("{style}", tile.style)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{key}", encodeURIComponent(deps.secretValue(provider.secret)));

  let upstream;
  try {
    upstream = await deps.fetchUrl(url);
  } catch {
    // The error is not passed on: it can contain the address, and so the key.
    return refuse(502, "The map service could not be reached.");
  }
  if (upstream.status === 404) return refuse(404, "No tile here.");
  if (upstream.status !== 200)
    return refuse(502, "The map service refused the request.");
  if (!upstream.contentType.startsWith("image/"))
    return refuse(502, "The map service sent something unexpected.");

  return {
    status: 200,
    headers: {
      "Content-Type": upstream.contentType,
      // Per person (it is behind sign-in), so never shared: `private` keeps it out of
      // shared caches such as the Hosting CDN, which would serve tiles without a sign-in.
      // How long a browser may keep it is the provider's own limit from its terms.
      "Cache-Control":
        provider.cacheSeconds > 0
          ? `private, max-age=${provider.cacheSeconds}`
          : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
    body: upstream.body,
  };
}
