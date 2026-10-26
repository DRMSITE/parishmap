# Architecture

Anyone changing the code needs to know where a decision is made before they change it, because in this project the browser is never the place. [`AGENTS.md`](../AGENTS.md) holds the working rules (it is read by AI coding tools too), and this page explains the shape.

## At a glance

The project is small on purpose, with a plain browser app in front of a handful of Firebase services.

- **The browser app** is vanilla JavaScript (ES modules) checked with JSDoc types and `tsc`, and built with Vite. It uses Leaflet for the map, Web Awesome (free) for components and a small history-API router, with no UI framework.
- **The back end** is Firebase. Authentication (Identity Platform) handles sign-in and the second factor, Firestore holds the data, Cloud Functions (Admin SDK) provide the people API and the tile proxy, and Hosting serves the site.
- **The security boundary is the server side**, meaning `firestore.rules` and the functions. Nothing in the browser is trusted, because anyone can open the developer tools and change what it does.

```
Browser                                   Firebase (your project)
 views ─ ctx.data ─ guard ─ Firestore source ───────▶ Firestore  ◀── firestore.rules decide
        ctx.projects ─ project guard ─ Firestore ───▶
        ctx.people ───── /api/people ───────────────▶ api function  (Admin SDK: users, roles, audit)
        basemap ──────── /tiles/<provider>/… ───────▶ tiles function (checks role, adds the key)
        sign-in ──────── Firebase Auth SDK ─────────▶ Authentication (+ TOTP second factor)
```

## Start-up

The app has two ways of starting, and only one of them may ever be deployed. `src/main.js` chooses a start-up. `src/boot/secure.js` is the real one: the sign-in gate, then the Firestore data sources wrapped by the role guards, then the router. `src/boot/local.js` is for development and the Playwright tests only (`VITE_LOCAL_DATA=true`), with no sign-in and data in `localStorage`. A normal build must not contain the local start-up, and `npm run check:dist` checks that it does not.

Both build a context (`AppContext` in `src/types.js`) and pass it to every view. `render(container, ctx)` may return a cleanup function (the map view destroys its map).

## Data

Views never touch storage directly, so that every read and write passes through one place where it can be checked. Stored data is reached only through the context.

- `ctx.data` is a `DataSource` (list, get, create, update, remove, subscribe) for points, lines and areas. `ctx.projects` is a `ProjectsStore` for projects, actions and notes.
- Both are wrapped (`guardDataSource`, `guardProjects`) so that a refused action throws `ForbiddenError` before it reaches Firestore, and views ask `ctx.guard.can(…)` before showing Add, Edit or Delete.
- **These guards are a convenience.** `firestore.rules` makes the same decision on every request, so the two must be kept in step: roles in `session.js`, the guards, the rules.
- Firestore cannot store nested arrays, so geometry is stored as a JSON string and checked by `parseGeometry` on write and on read. Stored data is untrusted, and `src/projects/convert.js` drops anything malformed.

## Projects

Projects touch most of the application, so their code is kept in one folder that both data sources and the views share. `src/projects/` covers lanes, statuses and limits (`model.js`), converting stored data (`convert.js`), the actions board (`board.js`), the project tree, links to places, and wording. Positions on the board are numbers placed between neighbours, and ties sort by creation time then id. Moving a card has two routes that must stay equivalent: the "Move to" list with Move up/down buttons (keyboard, touch, screen reader) and drag and drop (mouse).

Firestore has no cascade delete, so `removeProject` deletes in batches.

## Map tiles

Tile providers are the one place where a secret key meets a public site. See [tile-providers.md](tile-providers.md) for what the code guarantees. In outline:

- `src/tiles/providers.js` holds the provider rules as plain data. It is used by Node (the build plugin, `scripts/generate-config.mjs`, `scripts/check-dist.mjs`) and tests, **never by browser code**, so that server-only fields do not reach the site.
- `scripts/parish-plugin.mjs` is a Vite plugin that checks the council's settings at build time and serves the browser `virtual:parish-config` and `virtual:parish-tiles`.
- `src/map/basemaps.js` builds Leaflet layers, and `src/map/proxied-layer.js` fetches keyed tiles through the tile function with the person's token.
- `functions/tiles-handler.js` is the proxy's decision-making, written as a plain function so that it can be unit tested.

## Configuration and generated files

Council-specific settings live in `deployment/` (see [configuration.md](configuration.md)). `npm run generate` writes `firebase.json` (from `firebase.template.json`) and `functions/tiles.config.json`. `npm run build`, `test:rules` and `test:e2e` run it first, so a stale generated file is unlikely, though it is worth remembering that those two files are output and not the place to edit.

## Tests

There are three layers of test, each aimed at a different kind of mistake.

| Where | What | Run |
| --- | --- | --- |
| `test/` | Unit tests (Vitest, jsdom) | `npm test` |
| `test-rules/` | Security rules and the Firestore sources, against the emulator | `npm run test:rules` |
| `e2e/` | Playwright with axe accessibility checks, on production builds | `npm run test:e2e` |

`e2e/csp.spec.js` applies the real Content Security Policy to the page and fails on any violation while the main screens and dialogs are used. Add to it when you add a screen that loads something new, so that the policy is checked against the new screen as well.

## Adding to it

Most extensions follow one of four patterns.

**A page.** Create `src/views/thing.view.js` exporting `render(container, ctx)`. Add
`{ path: "/thing", title: "Thing", load: () => import("./views/thing.view.js") }` to
`src/routes.js` and a link in the `<nav slot="navigation">` list in `index.html`.

**A show/hide option.** Call `ctx.flags.register({ id, label })` in the view and watch it with `ctx.flags.watch(id, callback)`. A switch appears under **Options** automatically.

**A role or a permission.** Change `firestore.rules`, the guard and the tests together, since a change to one alone leaves the others disagreeing ([roles-and-permissions.md](roles-and-permissions.md)).

**A map provider.** Add it in `deployment/parish.config.js`; see [tile-providers.md](tile-providers.md). A built-in one goes in `src/tiles/providers.js` with tests.

## Conventions

The conventions are few. Use 2-space indentation and double quotes (Biome), and write UK English in comments, docs and text. Reach for semantic HTML before ARIA, and never put record content into `innerHTML`. Accessibility (WCAG 2.2 AA) is a requirement, not a finishing touch, and the Points page is the text alternative to the map, so keep it equivalent.
