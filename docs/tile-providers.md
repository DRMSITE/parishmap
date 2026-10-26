# Map tile providers

A map is only as useful as the tiles behind it, and the tiles come from someone else's servers, on someone else's terms. ParishMap shows **OpenStreetMap** by default, which needs no account and no key. A council can instead (or as well) use **Ordnance Survey** or any other tile service it has a licence for.

> **You are responsible for following the terms of the provider you choose**, including what they
> say about attribution, usage limits, caching and who may see the map. ParishMap enforces some
> sensible limits in code (below), but it cannot read your licence for you, and nothing here is
> legal advice.

## Choosing

The choice is a single setting, made in `deployment/parish.config.js` under `tiles`:

```js
tiles: {
  basemap: "osm",   // "osm" (default), "os", or the id of a custom provider
},
```

Whoever is allowed the chosen map sees it, with a switch under **Options** to fall back to OpenStreetMap. Everyone else sees OpenStreetMap. If the chosen map cannot load, or stops at a zoom level, the map hands over to OpenStreetMap and says so.

After changing it, run `npm run generate` (or just `npm run build`). That rewrites `firebase.json` (so the Content Security Policy allows the right tile servers) and `functions/tiles.config.json` (what the tile function may fetch), and checks your settings. I chose to let a mistake stop the build with a plain message listing every problem, because a half-working map is harder to diagnose after deployment than before it.

## The built-in providers

Two providers are built in, and they differ mainly in who may see them and what they cost to run.

| Provider | Key | Browser talks to | Who sees it | Zoom | Caching in the browser |
|---|---|---|---|---|---|
| `osm` OpenStreetMap | none | OpenStreetMap directly | everyone | to 19 | OpenStreetMap's own headers |
| `os` Ordnance Survey (OS Maps API, raster) | yes, kept in Secret Manager | our tile function only | admin, clerk, councillor | 7 to 16 on the free plan | up to 7 days |

### OpenStreetMap

OpenStreetMap's public tile servers suit **light use** only. Their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) forbids heavy use, bulk downloading and pre-fetching, and requires attribution. A small council's private map is normally well within that. If you expect many users, however, choose another provider or run your own tile server. ParishMap never pre-fetches or stores OpenStreetMap tiles, and its attribution cannot be switched off.

### Ordnance Survey

Ordnance Survey needs a key, and a key is something that must never reach a browser. The set-up is therefore a little longer than for OpenStreetMap.

1. Register at the [OS Data Hub](https://osdatahub.os.uk/), create a project and add the **OS Maps
   API**. The free plan stops at zoom 16; if you have a premium plan, raise it with an override
   (below).
2. Put the key in Secret Manager, and nowhere else: not in a file, not in a chat and not in the browser bundle.

   ```bash
   firebase functions:secrets:set OS_API_KEY --project <your-project-id>
   ```
3. Set `tiles: { basemap: "os" }`, run `npm run build`, then deploy functions and hosting.

OS's [terms](https://docs.os.uk/more-than-maps/support/legal/legal-or-support-or-os-data-hub) depend on your plan, including what may be cached and where the map may be shown, so it is worth reading them before you go live. The browser keeps OS tiles for up to 7 days, which saves requests against your quota but might be more than your terms allow. If your terms say less, lower it:

```js
tiles: {
  basemap: "os",
  style: "Light_3857",                  // Road_3857 (default), Outdoor_3857 or Light_3857
  overrides: { os: { cacheSeconds: 3600, maxZoom: 20 } },
},
```

Only `maxZoom`, `roles` and `cacheSeconds` can be changed on a built-in provider.

## Another provider

Sometimes neither built-in provider fits, perhaps because the council already pays for another service. Add it under `custom`. It is either **proxied** (the key stays on our server) or **direct** (the browser fetches tiles itself), and the choice depends on whether the key can safely be seen.

**Proxied.** Use this for any service that charges or whose key must not be public, since the key is then added by the server and the browser never holds it:

```js
tiles: {
  basemap: "maptiler",
  custom: [
    {
      id: "maptiler",
      label: "MapTiler",
      kind: "proxied",
      upstream: "https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={key}",
      secret: "MAPTILER_KEY",             // firebase functions:secrets:set MAPTILER_KEY
      styles: ["streets-v2"],             // the first is the default
      roles: ["admin", "clerk", "councillor"],   // add "member" to show everyone
      attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap contributors',
      minZoom: 0,
      maxZoom: 18,
      termsUrl: "https://www.maptiler.com/terms/",
      maxCacheSeconds: 86400,             // the most their terms let you keep a tile (never over 7 days)
      cacheSeconds: 86400,
    },
  ],
},
```

**Direct.** Use this only for a server that is free to embed, or a key restricted by referrer to your site, because a browser key can be seen by anyone who views the page:

```js
{
  id: "own",
  label: "Our own tiles",
  kind: "direct",
  urlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",   // may use {s} and {key}
  // browserKey: "…",                    // needed if the address uses {key}
  attribution: "&copy; Example",
  minZoom: 0,
  maxZoom: 17,
  termsUrl: "https://tiles.example.org/terms",
},
```

The check refuses a definition with no attribution, no link to the terms, an upstream address that is not `https`, a cache longer than its stated limit (or 7 days), or an unknown role. Each of those is a mistake that would otherwise surface only after the map was live.

## What the code guards

A proxy that adds a secret key is exactly the sort of thing that can be misused, so the tile function is deliberately narrow. The points below say what it does and why.

- **The key never reaches a browser** for a proxied provider. The browser asks our `tiles` function with the person's sign-in token, and the function adds the key. The upstream address and the secret's name are not in the browser bundle either, and `npm run check:dist` looks for them.
- **The tile function is not an open proxy.** It fetches only from addresses in its own deployed settings, never from the request, and builds each address from validated numbers, so a crafted request cannot point it somewhere else.
- **Only the right people can use it.** It checks the sign-in (including the authenticator code) and the provider's list of roles on every request, so hiding a switch is not the only protection.
- **Only your area is served.** It refuses tiles outside the area your map covers (`bounds`) and outside the provider's zoom range, so a signed-in person cannot use it to download the rest of the country.
- **Caching is deliberately short and private.** Proxied tiles are sent `private` with a browser lifetime no longer than the provider's stated limit, never longer than 7 days. They are never cacheable by the Hosting CDN, which would serve them without a sign-in check.
- **There is no pre-fetching, no offline copy and no service worker** for third-party tiles. Tiles are only fetched while someone is looking at them.
- **Attribution is part of every layer** and cannot be hidden. When the map hands over to OpenStreetMap at the end of a provider's zoom range, both attributions are shown.
- **The Content Security Policy is generated from your provider list**, so it allows exactly the tile servers you use and no others.

## What it does not do

None of this is a licence check, and it is not a usage meter either. Three limits are worth knowing about.

- It does not limit how many tiles one person may request, beyond a cap on how many function instances run at once (`maxInstances` in `functions/index.js`). Watch your provider's quota and set a budget alert.
- It does not check that your plan's licence allows what you are doing.
- One basemap is offered at a time (with OpenStreetMap as the fallback). A switcher between several is not built.
