# Configuration

A public repository cannot hold the particulars of one council, so everything specific to yours lives in a few files outside it. None is committed to the public
repository, so you can keep them in a private fork or keep them to yourself.

| What | Where | Made by |
| --- | --- | --- |
| The council's name, map area, tiles and region | `deployment/parish.config.js` | `npm run setup` |
| The council boundary (optional) | `deployment/boundary.geojson` | you |
| Firebase's web settings | `.env` | `npm run setup` |
| Which Firebase project to deploy to | `.firebaserc` | `npm run setup` or `firebase use` |

If `deployment/` does not exist, the code, the tests and the build use `deployment.example/`, a
made-up "Exampleton". That is why a fresh clone builds.

The settings are checked when you build. A mistake stops the build with a list of every problem in
plain words, so you can fix them in one go rather than discovering them one at a time.

## `deployment/parish.config.js`

This file sets the council's name, where the map opens and how far it may wander. It is plain data, and it is compiled into the public site, so **never put a key or other secret in it**.

```js
export default {
  appName: "Exampleton Parish Map",       // header, sign-in screen, page title
  council: {
    name: "Exampleton Parish Council",
    area: "Exampleton",                   // as used in sentences: "the map covers Exampleton"
    kind: "parish",                       // "parish", "town" or "community"
    // clerkTitle: "Parish Clerk",        // defaults to "Parish Clerk", "Town Clerk" or "Community Clerk"
  },

  centre: [52.3947, 0.2109],              // where the map opens: [latitude, longitude]
  zoom: 14,                               // starting zoom
  minZoom: 13,                            // furthest out the map may be zoomed
  bounds: [[52.34, 0.02], [52.45, 0.4]],  // [south-west, north-east]

  storagePrefix: "exampleton-map:",       // keeps browser storage apart from other sites
  // sourceUrl: "https://..."            // only if you run a modified copy: where its source is offered from
  region: "europe-west2",                 // where the Cloud Functions run
  tiles: { basemap: "osm" },              // see tile-providers.md
};
```

### Map area

Without a limit, a signed-in person could pan across the whole country and a point could be placed in the wrong county. `bounds` is the edge of the world as far as this map is concerned, and it does three things:

- the map cannot be panned beyond it;
- a point or shape outside it is refused in the Add point dialog;
- the tile function refuses tiles outside it, so a signed-in person cannot use it to download
  the rest of the country.

I would make it a little larger than your area, so that nothing near the edge is awkward to reach, and `centre` must be inside it. The database rules do not know
the bounds (they accept any valid latitude and longitude), so this is a convenience and a guard on
tile use, not a data-protection boundary.

`minZoom` stops the map zooming out to a view of the whole country. It is easiest to choose by looking at the map
at several zoom levels; 13 shows a typical parish.

### Region

The region is where the Cloud Functions (the people and tile services) run. `europe-west2` is London. Set it
before your first deploy and keep it, because changing it later creates new functions in the new region and
leaves the old ones behind. It does not have to match your Firestore location, but matching them
is quicker.

### Tiles

OpenStreetMap is the default. See [tile-providers.md](tile-providers.md) to use Ordnance Survey or
another provider, including how keys, caching and attribution are handled.

## `deployment/boundary.geojson`

A council usually knows where its edge is, and the map can show it. The file is optional. It holds one GeoJSON `Polygon`, with up to 2,000 points, drawn as a dotted outline with its own
show/hide switch under **Options**. Without the file there is no outline and no switch, and the
About page does not mention one.

A boundary is a fixed layer, not a record: it is not editable in the app and is not stored in the
database. Get one from your district council, from OpenStreetMap, or by drawing it in a tool such
as [geojson.io](https://geojson.io), and keep it to a sensible number of points. Check that your
source's licence lets you use it this way, since not every boundary dataset does.

## `.env`

The browser has to be told which Firebase project it belongs to, and `.env` holds those six web-app settings, as `VITE_FIREBASE_*` variables. They identify your project and
grant nothing, but anything in a `VITE_*` variable is compiled into the public site, so **never put
a secret in one**. Restrict the browser API key by HTTP referrer in the Google Cloud console.

| Variable | Notes |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID` | From the Firebase console: Project settings, Your apps |
| `VITE_FUNCTIONS_REGION` | Optional. Overrides `region` for the development server's proxy only |
| `VITE_BASE_URL` | Optional. Serve the site from a sub-path, such as `/maps/` |
| `VITE_LOCAL_DATA` | **Development and tests only.** Skips sign-in. Never set it for a real build |

## Limits you can change in code

Some limits are not per-council settings, and they live in `src/config.js` instead: the longest title (120) and
notes (2,000), the most points in a drawn shape (500), the most places one project or action may
link to (20) and the project depth (3). If you change one that the database also checks, change
`firestore.rules` to match and run `npm run test:rules`, because otherwise the app and the database will disagree about what is allowed.

## Generated files

Two files are written from your settings rather than by hand. `npm run generate` (also run by `npm run build`) writes them, and **you should not edit
them**: edit `firebase.template.json` or your settings and run it again, since a hand edit is overwritten the next time.

- `firebase.json`: hosting rewrites for your region, and a Content Security Policy that allows
  exactly the tile servers you use.
- `functions/tiles.config.json`: what the tile function may fetch, with which secret, for whom, and
  for what area.
