import { describe, expect, it } from "vitest";
import example from "../deployment.example/parish.config.js";
import { parishPlugin, publicTiles } from "../scripts/parish-plugin.mjs";

describe("publicTiles", () => {
  it("accepts the example deployment, which uses OpenStreetMap", () => {
    const tiles = publicTiles(example);
    expect(tiles.basemap).toBe("osm");
    expect(Object.keys(tiles.providers)).toEqual(["osm"]);
  });

  it("stops the build, listing every problem, if the tiles settings are wrong", () => {
    expect(() =>
      publicTiles({ ...example, tiles: { basemap: "nowhere", style: "x" } }),
    ).toThrow(/basemap "nowhere"/);
  });

  it("gives the browser no upstream address and no secret name", () => {
    const tiles = publicTiles({ ...example, tiles: { basemap: "os" } });
    expect(JSON.stringify(tiles)).not.toMatch(/OS_API_KEY|api\.os\.uk/);
    expect(tiles.providers.os.label).toBe("Ordnance Survey");
  });
});

describe("parishPlugin", () => {
  const plugin = /** @type {any} */ (
    parishPlugin({
      ...example,
      tiles: {
        basemap: "mine",
        custom: [
          {
            id: "mine",
            label: "Mine",
            kind: "proxied",
            upstream: "https://tiles.secret.example/{style}/{z}/{x}/{y}?k={key}",
            secret: "MINE_KEY",
            styles: ["plain"],
            roles: ["admin"],
            attribution: "&copy; Mine",
            minZoom: 0,
            maxZoom: 18,
            termsUrl: "https://terms.example.org/mine",
          },
        ],
      },
    })
  );

  it("serves the settings without the tiles section", () => {
    const id = plugin.resolveId("virtual:parish-config");
    const code = plugin.load(id);
    expect(code).toContain("Exampleton Parish Council");
    expect(code).not.toContain("tiles.secret.example");
    expect(code).not.toContain("MINE_KEY");
  });

  it("serves the tiles with nothing that belongs to the server", () => {
    const id = plugin.resolveId("virtual:parish-tiles");
    const code = plugin.load(id);
    expect(code).toContain("&copy; Mine");
    expect(code).not.toContain("tiles.secret.example");
    expect(code).not.toContain("MINE_KEY");
  });

  it("leaves other modules alone", () => {
    expect(plugin.resolveId("./something.js")).toBeUndefined();
    expect(plugin.load("./something.js")).toBeUndefined();
  });

  it("puts the council's name into the page, escaped", () => {
    const html = plugin.transformIndexHtml(
      '<title>%APP_NAME%</title><meta content="%APP_DESCRIPTION%">',
    );
    expect(html).toContain("<title>Exampleton Parish Map</title>");
    expect(html).toContain(
      'content="A private map for Exampleton Parish Councillors and the Parish Clerk."',
    );
    const rough = /** @type {any} */ (
      parishPlugin({ ...example, appName: 'A "<b>" map' })
    );
    expect(rough.transformIndexHtml("%APP_NAME%")).toBe(
      "A &quot;&lt;b>&quot; map",
    );
  });
});
