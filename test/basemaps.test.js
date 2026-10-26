import { afterEach, describe, expect, it, vi } from "vitest";
import { publicProvider, resolveTiles } from "../src/tiles/providers.js";

/**
 * Loads the basemaps as they would be for the given tiles settings.
 * @param {import("../src/tiles/providers.js").TilesConfig | undefined} tiles
 */
function withConfig(tiles) {
  const resolved = resolveTiles(tiles);
  vi.doMock("../src/config.js", () => ({
    config: {
      tiles: {
        basemap: resolved.basemap,
        style: resolved.style,
        providers: Object.fromEntries(
          Object.entries(resolved.providers).map(([id, p]) => [
            id,
            publicProvider(p),
          ]),
        ),
      },
    },
  }));
  return import("../src/map/basemaps.js");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/config.js");
});

/** @param {string} role */
const as = (role) => ({
  getToken: async () => "token",
  canUse: (/** @type {{ roles?: string[] }} */ p) =>
    p.roles?.includes(role) ?? false,
});
const councillor = as("councillor");
const member = as("member");

describe("createBasemap", () => {
  it("is OpenStreetMap, with its attribution, by default", async () => {
    const { createBasemap } = await withConfig(undefined);
    const layer = /** @type {any} */ (createBasemap("osm"));
    expect(layer._url).toContain("tile.openstreetmap.org");
    expect(layer.options.attribution).toMatch(/OpenStreetMap/);
  });

  it("falls back to OpenStreetMap for an unknown provider", async () => {
    const { createBasemap } = await withConfig(undefined);
    const layer = /** @type {any} */ (createBasemap("nowhere"));
    expect(layer.options.attribution).toMatch(/OpenStreetMap/);
  });

  it("falls back to OpenStreetMap when there is no way to sign a tile request", async () => {
    const { createBasemap } = await withConfig({ basemap: "os" });
    const layer = /** @type {any} */ (createBasemap("os"));
    expect(layer.options.attribution).toMatch(/OpenStreetMap/);
  });

  it("gives a role the provider does not list OpenStreetMap, not the proxy", async () => {
    const { createBasemap } = await withConfig({ basemap: "os" });
    const layer = /** @type {any} */ (createBasemap("os", member));
    expect(layer._url).toContain("tile.openstreetmap.org");
  });

  it("hands over to OpenStreetMap beyond the provider's last zoom, keeping both attributions", async () => {
    const { createBasemap } = await withConfig({ basemap: "os" });
    const group = /** @type {any} */ (createBasemap("os", councillor));
    const [os, osm] = group.getLayers();
    expect(os.options.maxZoom).toBe(16);
    expect(os.options.attribution).toMatch(/OS data.*Crown copyright.*\d{4}/);
    expect(osm.options.minZoom).toBe(17);
    expect(osm._url).toContain("tile.openstreetmap.org");
    expect(osm.options.attribution).toMatch(/OpenStreetMap/);
  });

  it("asks our proxy for the provider and style, never the provider itself", async () => {
    const { createBasemap } = await withConfig({
      basemap: "os",
      style: "Light_3857",
    });
    const [os] = /** @type {any} */ (createBasemap("os", councillor)).getLayers();
    expect(os._url).toBe("/tiles/os/Light_3857/{z}/{x}/{y}");
  });

  it("uses a custom direct provider straight from its own address", async () => {
    const { createBasemap } = await withConfig({
      basemap: "own",
      custom: [
        {
          id: "own",
          label: "Own",
          kind: "direct",
          urlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",
          attribution: "&copy; Example",
          minZoom: 0,
          maxZoom: 19,
          termsUrl: "https://tiles.example.org/terms",
        },
      ],
    });
    const layer = /** @type {any} */ (createBasemap("own"));
    expect(layer._url).toBe("https://tiles.example.org/{z}/{x}/{y}.png");
    expect(layer.options.attribution).toBe("&copy; Example");
  });
});

describe("a proxied layer", () => {
  const coords = /** @type {any} */ ({ x: 32768, y: 21845, z: 16 });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => vi.unstubAllGlobals());

  /** @param {object} [extra] */
  async function osLayer(extra = {}) {
    const { createBasemap } = await withConfig({ basemap: "os" });
    const [layer] = /** @type {any} */ (
      createBasemap("os", { ...councillor, ...extra })
    ).getLayers();
    layer._tileZoom = 16; // Leaflet takes the zoom from the map; there is none here.
    return layer;
  }

  it("fetches a tile from the proxy with the sign-in token, not a key", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: () => "blob:tile",
        revokeObjectURL: () => {},
      }),
    );
    const layer = await osLayer({ getToken: async () => "token-123" });
    const done = vi.fn();
    const tile = layer.createTile(coords, done);
    await settle();
    const [url, init] = /** @type {any} */ (fetchMock.mock.calls[0]);
    expect(url).toBe("/tiles/os/Road_3857/16/32768/21845");
    expect(url).not.toMatch(/key=/i);
    expect(init.headers["X-Firebase-Token"]).toBe("token-123");
    expect(init.headers.Authorization).toBeUndefined();
    expect(tile.getAttribute("src")).toBe("blob:tile");
    expect(tile.alt).toBe("");
    expect(done).toHaveBeenCalledWith(undefined, tile);
  });

  it("says so once when tiles are refused, however many fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403 })),
    );
    const onFail = vi.fn();
    const layer = await osLayer({ onFail });
    layer.createTile(coords, () => {});
    layer.createTile({ ...coords, x: 1 }, () => {});
    await settle();
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});
