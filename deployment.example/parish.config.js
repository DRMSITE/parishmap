// Everything that is particular to one council. Copy this folder to `deployment/` (which
// is git-ignored) and change the values; `npm run setup` will do that for you. The
// app refuses to start with a clear message if a value here is missing or unusable.
//
// This is plain data. Do not put keys or other secrets here: it is compiled into the
// public bundle. Firebase's web settings go in `.env` (see `.env.example`).

/** @type {import("../src/types.js").ParishConfig} */
export default {
  appName: "Exampleton Parish Map",
  council: {
    name: "Exampleton Parish Council",
    area: "Exampleton",
    // "parish", "town" or "community": used in wording such as "the parish boundary".
    kind: "parish",
    // clerkTitle: "Parish Clerk",
  },

  // Where the map opens, and the edge of the area it covers. Bounds are
  // [south-west, north-east] as [latitude, longitude]. Make them a little larger than the
  // council's area: the map cannot be panned beyond them and a point outside is refused.
  centre: [52.3947, 0.2109],
  zoom: 14,
  minZoom: 13,
  bounds: [
    [52.34, 0.02],
    [52.45, 0.4],
  ],

  // Keeps this app's data in the browser apart from other apps on the same address.
  storagePrefix: "parishmap:",

  // Only if you run a modified copy: where its source code is offered from (the AGPL asks
  // that people who use a modified version over a network can get it). Leave it out otherwise.
  // sourceUrl: "https://github.com/your-council/parishmap",

  // Where the Cloud Functions run. "europe-west2" is London. Choose before the first deploy.
  region: "europe-west2",

  // Which map people see. OpenStreetMap needs no key and is the default. To use another
  // provider (Ordnance Survey, or any tile service you have a licence for), see
  // docs/tile-providers.md: the council is responsible for following that provider's terms.
  tiles: {
    basemap: "osm",
    // basemap: "os",  // Ordnance Survey; set the key with `firebase functions:secrets:set OS_API_KEY`
  },
};
