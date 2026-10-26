// The parts of `npm run setup` that need no keyboard, so they can be tested: working out
// sensible defaults from what a council types, and building the files it writes.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const KINDS = ["parish", "town", "community"];

/**
 * "Exampleton Parish Council" gives the place and the kind of council.
 * @param {string} name
 * @returns {{ area: string, kind: "parish" | "town" | "community" | null }}
 */
export function deriveCouncil(name) {
  const text = name.trim().replace(/\s+/g, " ");
  const full = /^(.+?)\s+(Parish|Town|Community)\s+Council$/i.exec(text);
  if (full)
    return {
      area: full[1],
      kind: /** @type {"parish" | "town" | "community"} */ (
        full[2].toLowerCase()
      ),
    };
  const plain = /^(.+?)\s+Council$/i.exec(text);
  return { area: plain ? plain[1] : text, kind: null };
}

/** @param {string} value */
export function isKind(value) {
  return KINDS.includes(value);
}

/**
 * A short key for browser storage, e.g. "exampleton-map:".
 * @param {string} area
 */
export function storagePrefixFor(area) {
  const slug = area
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "parish"}-map:`;
}

/**
 * The edge of the map: a box around the centre, a given distance each way.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {[[number, number], [number, number]]}
 */
export function boundsFromCentre(lat, lng, radiusKm) {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  /** @param {number} n */
  const r = (n) => Math.round(n * 1000) / 1000;
  return [
    [r(lat - dLat), r(lng - dLng)],
    [r(lat + dLat), r(lng + dLng)],
  ];
}

/** Firebase project ids: 6 to 30 characters, lower case letters, digits and hyphens. */
export const isProjectId = (/** @type {string} */ id) =>
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id);

const FIREBASE_KEYS = /** @type {const} */ ([
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
]);

/**
 * Reads the six values out of the snippet the Firebase console shows for a web app, however
 * it was copied (JavaScript or JSON, with or without the `const firebaseConfig =`).
 * @param {string} text
 */
export function parseFirebaseSnippet(text) {
  /** @type {Record<string, string>} */
  const found = {};
  for (const key of FIREBASE_KEYS) {
    const match = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`).exec(
      text,
    );
    if (match) found[key] = match[1];
  }
  const missing = FIREBASE_KEYS.filter((k) => !found[k]);
  if (missing.length)
    throw new Error(
      `That does not look like the Firebase web app settings: missing ${missing.join(", ")}.`,
    );
  return /** @type {Record<(typeof FIREBASE_KEYS)[number], string>} */ (found);
}

/**
 * @typedef {object} Answers
 * @property {string} councilName
 * @property {string} area
 * @property {"parish" | "town" | "community"} kind
 * @property {string} [clerkTitle]
 * @property {number} lat
 * @property {number} lng
 * @property {number} radiusKm
 * @property {string} projectId
 * @property {string} region
 * @property {Record<string, string>} [firebase] The web app settings, if known.
 */

/** @param {unknown} value */
const quote = (value) => JSON.stringify(value);

/**
 * The text of deployment/parish.config.js.
 * @param {Answers} a
 */
export function buildParishConfig(a) {
  const Kind = `${a.kind[0].toUpperCase()}${a.kind.slice(1)}`;
  const [[s, w], [n, e]] = boundsFromCentre(a.lat, a.lng, a.radiusKm);
  return `// ${a.councilName}: everything particular to this council. Written by \`npm run setup\`;
// edit it freely. It is plain data and is compiled into the public site, so keep keys and
// other secrets out of it. See deployment.example/parish.config.js for the explanations.

/** @type {import("../src/types.js").ParishConfig} */
export default {
  appName: ${quote(`${a.area} ${Kind} Map`)},
  council: {
    name: ${quote(a.councilName)},
    area: ${quote(a.area)},
    kind: ${quote(a.kind)},${
      a.clerkTitle ? `\n    clerkTitle: ${quote(a.clerkTitle)},` : ""
    }
  },

  centre: [${a.lat}, ${a.lng}],
  zoom: 14,
  minZoom: 13,
  bounds: [
    [${s}, ${w}],
    [${n}, ${e}],
  ],

  storagePrefix: ${quote(storagePrefixFor(a.area))},
  region: ${quote(a.region)},

  // OpenStreetMap needs no key. To use Ordnance Survey or another provider, see
  // docs/tile-providers.md.
  tiles: {
    basemap: "osm",
  },
};
`;
}

/**
 * The text of .env: the Firebase web settings, which identify the project and grant nothing.
 * @param {Answers} a
 */
export function buildEnv(a) {
  const f = a.firebase ?? {};
  return `# Written by \`npm run setup\`. These identify your Firebase project; they do not grant
# access. Never put a secret in a VITE_* variable: it is compiled into the public site.
VITE_FIREBASE_API_KEY=${f.apiKey ?? ""}
VITE_FIREBASE_AUTH_DOMAIN=${f.authDomain ?? `${a.projectId}.firebaseapp.com`}
VITE_FIREBASE_PROJECT_ID=${a.projectId}
VITE_FIREBASE_STORAGE_BUCKET=${f.storageBucket ?? `${a.projectId}.firebasestorage.app`}
VITE_FIREBASE_MESSAGING_SENDER_ID=${f.messagingSenderId ?? ""}
VITE_FIREBASE_APP_ID=${f.appId ?? ""}
`;
}

/**
 * The files to write, as paths relative to the project folder.
 * @param {Answers} a
 * @returns {{ path: string, content: string }[]}
 */
export function planFiles(a) {
  return [
    { path: "deployment/parish.config.js", content: buildParishConfig(a) },
    { path: ".env", content: buildEnv(a) },
    {
      path: ".firebaserc",
      content: `${JSON.stringify({ projects: { default: a.projectId } }, null, 2)}\n`,
    },
  ];
}

/**
 * Writes the plan under `dir`, refusing to replace a file that is already there unless asked.
 * @param {{ path: string, content: string }[]} plan
 * @param {string} dir
 * @param {{ force?: boolean }} [options]
 * @returns {string[]} The paths written.
 */
export function writePlan(plan, dir, { force = false } = {}) {
  const existing = plan.filter((f) => existsSync(resolve(dir, f.path)));
  if (existing.length && !force)
    throw new Error(
      `Not overwriting ${existing.map((f) => f.path).join(", ")}. Move or delete ${existing.length === 1 ? "it" : "them"}, or run again with --force.`,
    );
  for (const file of plan) {
    const target = resolve(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  return plan.map((f) => f.path);
}

/**
 * What to do next, once the files are written.
 * @param {Answers} a
 */
export function nextSteps(a) {
  const needsWebApp = !a.firebase;
  return [
    ...(needsWebApp
      ? [
          "Register a web app in the Firebase console (Project settings > General > Your apps) and copy its six settings into .env.",
        ]
      : []),
    "Follow docs/firebase-setup.md for the console steps (billing plan, Authentication, Firestore location).",
    "Check what the scripts will change:  npm run configure-auth    (add --yes to apply)",
    "Deploy the security rules:  firebase deploy --only firestore:rules",
    "Build, then deploy:  npm run build && firebase deploy --only functions,hosting",
    "Create your own account (console: Authentication > Users > Add user), then make it the first administrator:  node scripts/set-role.mjs <your-email> admin --yes",
    `Optional: put your ${a.kind} boundary in deployment/boundary.geojson (one GeoJSON Polygon).`,
  ];
}
