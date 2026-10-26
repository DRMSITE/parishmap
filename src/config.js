// Settings in one place. What differs from one council to the next comes from
// `deployment/parish.config.js` (or `deployment.example/` until you make one) and is
// checked here; the rest are defaults for the code. Change these rather than hunting
// through the code.

import deployment from "virtual:parish-config";
import tiles from "virtual:parish-tiles";
import { product } from "./branding.js";

const KINDS = /** @type {const} */ (["parish", "town", "community"]);

/** @param {unknown} value */
const isText = (value) => typeof value === "string" && value.trim() !== "";

/** @param {unknown} value */
const isHttps = (value) => {
  try {
    return new URL(String(value)).protocol === "https:";
  } catch {
    return false;
  }
};

/** @param {unknown} value */
const isLatLng = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  Math.abs(value[0]) <= 90 &&
  Math.abs(value[1]) <= 180;

/**
 * Checks the council's settings and fills in what can be worked out. Every problem is
 * reported at once, so a council fixes its file in one go rather than one error at a time.
 * @param {unknown} raw The default export of `parish.config.js`.
 * @returns {import("./types.js").ParishConfig & { council: { clerkTitle: string } }}
 */
export function checkParishConfig(raw) {
  /** @type {string[]} */
  const problems = [];
  const given = /** @type {Record<string, any>} */ (
    raw && typeof raw === "object" ? raw : {}
  );
  const council = given.council ?? {};

  if (!isText(given.appName)) problems.push("appName must be some text.");
  if (!isText(council.name)) problems.push("council.name must be some text.");
  if (!isText(council.area)) problems.push("council.area must be some text.");
  if (!KINDS.includes(council.kind))
    problems.push(`council.kind must be one of: ${KINDS.join(", ")}.`);
  if (council.clerkTitle !== undefined && !isText(council.clerkTitle))
    problems.push("council.clerkTitle, if given, must be some text.");
  if (!isLatLng(given.centre))
    problems.push("centre must be [latitude, longitude].");
  if (!Number.isFinite(given.zoom)) problems.push("zoom must be a number.");
  if (!Number.isFinite(given.minZoom))
    problems.push("minZoom must be a number.");
  if (!isText(given.storagePrefix))
    problems.push('storagePrefix must be some text, such as "exampleton-map:".');

  const b = given.bounds;
  const boundsOk =
    Array.isArray(b) && b.length === 2 && isLatLng(b[0]) && isLatLng(b[1]);
  if (!boundsOk) {
    problems.push(
      "bounds must be [[south, west], [north, east]] as latitudes and longitudes.",
    );
  } else if (b[0][0] >= b[1][0] || b[0][1] >= b[1][1]) {
    problems.push("bounds: the south-west corner must be south and west of the north-east.");
  }
  if (boundsOk && isLatLng(given.centre)) {
    const [lat, lng] = given.centre;
    if (lat < b[0][0] || lat > b[1][0] || lng < b[0][1] || lng > b[1][1])
      problems.push("centre must be inside bounds.");
  }

  if (given.sourceUrl !== undefined && !isHttps(given.sourceUrl))
    problems.push("sourceUrl, if given, must be an https address.");
  if (
    given.region !== undefined &&
    !/^[a-z]+-[a-z]+\d+$/.test(String(given.region))
  )
    problems.push('region must look like "europe-west2".');

  if (problems.length) {
    throw new Error(
      `deployment/parish.config.js is not usable:\n- ${problems.join("\n- ")}`,
    );
  }

  const clerkTitle =
    council.clerkTitle ??
    `${council.kind[0].toUpperCase()}${council.kind.slice(1)} Clerk`;
  return /** @type {any} */ ({ ...given, council: { ...council, clerkTitle } });
}

const parish = checkParishConfig(deployment);
const { kind, area, clerkTitle } = parish.council;
const kindCapitalised = `${kind[0].toUpperCase()}${kind.slice(1)}`;

export const config = {
  appName: parish.appName,
  /** Where this copy's source code is offered from (see branding.js). */
  sourceUrl: parish.sourceUrl ?? product.sourceUrl,
  /** The council, and the words the screens use for it ("parish", "Parish Clerk"). */
  council: {
    name: parish.council.name,
    area,
    kind,
    clerkTitle,
    /** "Exampleton Parish Councillors", for sentences about who the map is for. */
    councillors: `${area} ${kindCapitalised} Councillors`,
    /** "Parish Council", for sentences about the body itself. */
    body: `${kindCapitalised} Council`,
  },
  /**
   * The address Firebase sends invitation and password emails from. It is the project's
   * own domain, so people can recognise it in their spam folder.
   */
  senderAddress: `noreply@${import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com"}`,
  map: {
    centre: parish.centre,
    zoom: parish.zoom,
    // Zoomed out no further than this, and not panned beyond `bounds`, so the map is not
    // used to explore the rest of the country.
    minZoom: parish.minZoom,
    bounds: parish.bounds,
    maxZoom: 19,
    /** Zoom used when focusing on a single point. */
    focusZoom: 16,
  },
  /**
   * Which tiles people see, checked and resolved when the app was built (see
   * scripts/parish-plugin.mjs). `providers` is what the browser may know (no upstream
   * address, no secret name); `basemap` is the one shown by default. OpenStreetMap is
   * always there as the fallback.
   */
  tiles,
  /**
   * Longest text the point form accepts, and most positions in one drawn shape.
   * A back end should enforce the same limits. `featureLinks` is the most map features
   * one project or action may link to (firestore.rules checks it too). `projectDepth`
   * is how many levels of projects there may be (1 is a project with no sub-projects);
   * only the app enforces it.
   */
  limits: {
    title: 120,
    notes: 2000,
    vertices: 500,
    featureLinks: 20,
    projectDepth: 3,
  },
  /** localStorage key prefix, so several apps on one origin do not collide. */
  storagePrefix: parish.storagePrefix,
};
