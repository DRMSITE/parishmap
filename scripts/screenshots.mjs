// Takes the README screenshots into docs/screenshots/ from the local-data build and the
// made-up "Exampleton" deployment, so nothing in them is real data.
//
//   node scripts/screenshots.mjs
//
// It builds into dist-shots/ (not dist/, which Hosting deploys), and needs the Chromium that
// `npx playwright install chromium` provides. The map tiles come from OpenStreetMap, so run it
// sparingly and with a network connection.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist-shots");
const shots = resolve(root, "docs/screenshots");
const PORT = 4175;
const at = "2026-10-01T09:00:00.000Z";

// A made-up council on open moorland, so the map shows no real village or street names.
const deployment = await mkdtemp(resolve(tmpdir(), "parishmap-shots-"));
await writeFile(
  resolve(deployment, "parish.config.js"),
  `export default {
  appName: "Exampleton Parish Map",
  council: { name: "Exampleton Parish Council", area: "Exampleton", kind: "parish" },
  centre: [50.58, -3.95],
  zoom: 16,
  minZoom: 13,
  bounds: [[50.5, -4.05], [50.65, -3.85]],
  storagePrefix: "parishmap:",
  region: "europe-west2",
  tiles: { basemap: "osm" },
};
`,
);

process.env.PARISHMAP_DEPLOYMENT = deployment;
process.env.VITE_LOCAL_DATA = "true";
await build({ root, logLevel: "warn", build: { outDir, emptyOutDir: true } });
const server = await preview({
  root,
  logLevel: "warn",
  build: { outDir },
  preview: { port: PORT, strictPort: true },
});

// Written around (52.39, 0.21), then moved onto the moorland by a fixed offset.
const dLat = -1.8147;
const dLng = -4.1609;
/** @param {any} c GeoJSON coordinates: [lng, lat] or nested lists of them */
const shift = (c) =>
  Array.isArray(c[0]) ? c.map(shift) : [c[0] + dLng, c[1] + dLat];
const places = [
  {
    id: "f-green",
    lat: 52.3947,
    lng: 0.2109,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0.2085, 52.3935],
          [0.2135, 52.3935],
          [0.2135, 52.3958],
          [0.2085, 52.3958],
          [0.2085, 52.3935],
        ],
      ],
    },
    data: { title: "Village green", notes: "Open space, mown by the council." },
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "f-bench",
    lat: 52.3951,
    lng: 0.2102,
    data: { title: "Bench by the pond", notes: "Slats are loose." },
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "f-bin",
    lat: 52.3942,
    lng: 0.2121,
    data: { title: "Litter bin", notes: "" },
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "f-path",
    lat: 52.394,
    lng: 0.209,
    geometry: {
      type: "LineString",
      coordinates: [
        [0.2065, 52.3928],
        [0.2095, 52.3938],
        [0.2128, 52.3944],
        [0.2162, 52.3952],
      ],
    },
    data: { title: "Footpath to the church", notes: "" },
    createdAt: at,
    updatedAt: at,
  },
].map(({ lat, lng, geometry, ...rest }) => ({
  ...rest,
  lat: lat + dLat,
  lng: lng + dLng,
  ...(geometry && {
    geometry: { ...geometry, coordinates: shift(geometry.coordinates) },
  }),
}));

/**
 * @param {import("@playwright/test").Browser} browser
 * @param {string} name
 * @param {string} path
 * @param {{ width: number, height: number }} viewport
 */
async function shoot(browser, name, path, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ key, records }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(records));
    },
    { key: "parishmap:records", records: places },
  );
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500); // tiles settle after the network goes quiet
  await page.screenshot({ path: resolve(shots, `${name}.png`) });
  console.log(`Wrote docs/screenshots/${name}.png`);
  await context.close();
}

const browser = await chromium.launch();
try {
  await mkdir(shots, { recursive: true });
  const desktop = { width: 1280, height: 800 };
  await shoot(browser, "map", "/", desktop);
  await shoot(browser, "projects", "/projects?p=p-green", {
    width: 1280,
    height: 1150,
  });
  await shoot(browser, "points", "/list", desktop);
  await shoot(browser, "map-mobile", "/", { width: 390, height: 780 });
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
