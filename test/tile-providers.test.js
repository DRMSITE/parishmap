import { describe, expect, it } from "vitest";
import {
  MAX_CACHE_SECONDS,
  providerHosts,
  publicProvider,
  resolveTiles,
  withYear,
} from "../src/tiles/providers.js";

/** @typedef {Partial<import("../src/tiles/providers.js").TileProvider>} Provider */

/** @param {Provider} [extra] @returns {Provider} */
const proxied = (extra = {}) => ({
  id: "maptiler",
  label: "MapTiler",
  kind: /** @type {const} */ ("proxied"),
  upstream: "https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={key}",
  secret: "MAPTILER_KEY",
  styles: ["streets-v2"],
  roles: ["admin", "clerk", "councillor", "member"],
  attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
  minZoom: 0,
  maxZoom: 18,
  termsUrl: "https://www.maptiler.com/terms/",
  ...extra,
});

/** @param {Provider} [extra] @returns {Provider} */
const direct = (extra = {}) => ({
  id: "own",
  label: "Our own tiles",
  kind: /** @type {const} */ ("direct"),
  urlTemplate: "https://{s}.tiles.example.org/{z}/{x}/{y}.png",
  attribution: "&copy; Example",
  minZoom: 0,
  maxZoom: 17,
  termsUrl: "https://tiles.example.org/terms",
  ...extra,
});

describe("resolveTiles", () => {
  it("defaults to OpenStreetMap alone, with no key anywhere", () => {
    const { basemap, providers } = resolveTiles();
    expect(basemap).toBe("osm");
    expect(Object.keys(providers)).toEqual(["osm"]);
    expect(providers.osm.kind).toBe("direct");
    expect(providers.osm.attribution).toMatch(/OpenStreetMap/);
  });

  it("adds Ordnance Survey only when it is chosen, as a proxied provider", () => {
    const { providers, style } = resolveTiles({ basemap: "os" });
    expect(providers.os.kind).toBe("proxied");
    expect(providers.os.secret).toBe("OS_API_KEY");
    expect(providers.os.maxZoom).toBe(16);
    expect(style).toBe("Road_3857");
    expect(resolveTiles({ basemap: "os", style: "Light_3857" }).style).toBe(
      "Light_3857",
    );
  });

  it("accepts custom providers of either kind", () => {
    const { providers } = resolveTiles({
      basemap: "maptiler",
      custom: [proxied(), direct()],
    });
    expect(Object.keys(providers)).toEqual(["osm", "maptiler", "own"]);
    // A custom proxied provider that says nothing gets the cautious day, not a week.
    expect(providers.maptiler.cacheSeconds).toBe(86400);
  });

  it("lets a council change only the zoom limit, roles and cache of a built-in", () => {
    const { providers } = resolveTiles({
      basemap: "os",
      overrides: { os: { maxZoom: 20, roles: ["admin"] } },
    });
    expect(providers.os.maxZoom).toBe(20);
    expect(providers.os.roles).toEqual(["admin"]);
    expect(() =>
      resolveTiles({
        basemap: "os",
        overrides: { os: /** @type {any} */ ({ upstream: "https://evil.example/{z}" }) },
      }),
    ).toThrow(/only maxZoom, roles, cacheSeconds/);
  });

  it("reports every problem at once, in plain words", () => {
    expect(() =>
      resolveTiles({
        basemap: "nowhere",
        custom: [
          proxied({
            attribution: "",
            upstream: "http://insecure.example/{z}",
            secret: "lower",
            roles: ["boss"],
            cacheSeconds: MAX_CACHE_SECONDS + 1,
            maxCacheSeconds: MAX_CACHE_SECONDS,
            termsUrl: "",
          }),
        ],
      }),
    ).toThrow(
      /attribution is required[\s\S]*termsUrl[\s\S]*upstream must be an https[\s\S]*secret must be[\s\S]*roles must list[\s\S]*cacheSeconds[\s\S]*basemap "nowhere"/,
    );
  });

  it("will not let a browser-side provider carry a server key, or need one it lacks", () => {
    expect(() =>
      resolveTiles({
        custom: [
          direct({
            urlTemplate: "https://t.example.org/{z}/{x}/{y}.png?key={key}",
          }),
        ],
      }),
    ).toThrow(/browserKey/);
    expect(() =>
      resolveTiles({ custom: [direct({ secret: "SOME_KEY" })] }),
    ).toThrow(/belong to proxied/);
    expect(() =>
      resolveTiles({ custom: [proxied({ browserKey: "abc" })] }),
    ).toThrow(/belong to direct/);
  });

  it("refuses a proxied cache longer than the hard limit, however its terms read", () => {
    expect(() =>
      resolveTiles({
        custom: [
          proxied({
            maxCacheSeconds: MAX_CACHE_SECONDS + 1,
            cacheSeconds: MAX_CACHE_SECONDS + 1,
          }),
        ],
      }),
    ).toThrow(/maxCacheSeconds/);
  });

  it("refuses a duplicate or reserved id, and a style the provider lacks", () => {
    expect(() => resolveTiles({ custom: [direct({ id: "osm" })] })).toThrow(
      /already taken/,
    );
    expect(() =>
      resolveTiles({ basemap: "maptiler", style: "nope", custom: [proxied()] }),
    ).toThrow(/style "nope"/);
  });
});

describe("providerHosts", () => {
  it("works out the origin for the Content Security Policy from the address", () => {
    const { providers } = resolveTiles({ custom: [direct()] });
    expect(providerHosts(providers.own)).toEqual([
      "https://*.tiles.example.org",
    ]);
  });

  it("keeps OpenStreetMap's a., b. and c. servers allowed for the small map in the dialog", () => {
    const { providers } = resolveTiles();
    expect(providerHosts(providers.osm)).toContain(
      "https://*.tile.openstreetmap.org",
    );
  });

  it("has none for a proxied provider: the browser only talks to us", () => {
    const { providers } = resolveTiles({ custom: [proxied()] });
    expect(providerHosts(providers.maptiler)).toEqual([]);
  });
});

describe("publicProvider", () => {
  it("leaves out the upstream address and the secret's name", () => {
    const { providers } = resolveTiles({ basemap: "os" });
    const open = publicProvider(providers.os);
    expect(open).not.toHaveProperty("upstream");
    expect(open).not.toHaveProperty("secret");
    expect(JSON.stringify(open)).not.toMatch(/OS_API_KEY|api\.os\.uk/);
    expect(open.label).toBe("Ordnance Survey");
  });
});

describe("withYear", () => {
  it("puts this year in an attribution that asks for it", () => {
    expect(withYear("OS data {year}", 2031)).toBe("OS data 2031");
    expect(withYear("no year here", 2031)).toBe("no year here");
  });
});
