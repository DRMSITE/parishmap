import { describe, expect, it, vi } from "vitest";
import {
  handleTileRequest,
  parseTilePath,
  tileTouchesBounds,
} from "../functions/tiles-handler.js";

const PNG = new Uint8Array([137, 80, 78, 71]).buffer;

const bounds = /** @type {[[number, number], [number, number]]} */ ([
  [52.34, 0.02],
  [52.45, 0.4],
]);

/**
 * The tile containing a position at a zoom, as Leaflet numbers them.
 * @param {number} lat
 * @param {number} lng
 * @param {number} z
 */
function tileAt(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

const inside = tileAt(52.3947, 0.2109, 16);
const path = `/tiles/os/Road_3857/16/${inside.x}/${inside.y}`;

const settings = {
  minZoom: 13,
  bounds,
  providers: {
    os: {
      id: "os",
      upstream:
        "https://api.os.uk/maps/raster/v1/zxy/{style}/{z}/{x}/{y}.png?key={key}",
      secret: "OS_API_KEY",
      styles: ["Road_3857", "Light_3857"],
      roles: ["admin", "clerk", "councillor"],
      minZoom: 7,
      maxZoom: 16,
      cacheSeconds: 604800,
    },
    onlyadmins: {
      id: "onlyadmins",
      upstream: "https://tiles.example.org/{style}/{z}/{x}/{y}.png?k={key}",
      secret: "EXAMPLE_KEY",
      styles: ["plain"],
      roles: ["admin"],
      minZoom: 0,
      maxZoom: 18,
      cacheSeconds: 0,
    },
  },
};

/** @param {Record<string, any>} [claims] */
function deps(
  claims = { role: "councillor", firebase: { sign_in_second_factor: "totp" } },
) {
  return {
    verifyToken: vi.fn(async () => claims),
    secretValue: vi.fn(() => "SECRET&KEY"),
    fetchUrl: vi.fn(async () => ({
      status: 200,
      contentType: "image/png",
      body: PNG,
    })),
  };
}

/** @param {Partial<Parameters<typeof handleTileRequest>[0]>} [overrides] */
const request = (overrides = {}) => ({
  method: "GET",
  path,
  idToken: "abc.def",
  ...overrides,
});

describe("parseTilePath", () => {
  it("reads the provider, style and tile from the end of the path", () => {
    expect(parseTilePath("/tiles/os/Road_3857/16/32768/21845")).toEqual({
      provider: "os",
      style: "Road_3857",
      z: 16,
      x: 32768,
      y: 21845,
    });
  });

  it("rejects anything that is not a plain tile", () => {
    for (const bad of [
      "/tiles/os/Road_3857/16/32768",
      "/tiles/os/Road_3857/23/0/0",
      "/tiles/os/Road_3857/2/4/0",
      "/tiles/os/Road_3857/2/0/-1",
      "/tiles/os/Road_3857/2/0/1.5",
      "/tiles/os/Road_3857/../../x",
      "/tiles/OS/Road_3857/2/0/0",
      "/tiles/os/Road.3857/2/0/0",
      "",
    ])
      expect(parseTilePath(bad), bad).toBeNull();
  });
});

describe("tileTouchesBounds", () => {
  it("accepts tiles over the area, and one tile of slack beyond it", () => {
    expect(tileTouchesBounds(16, inside.x, inside.y, bounds)).toBe(true);
    const west = tileAt(52.4, 0.02, 16);
    expect(tileTouchesBounds(16, west.x - 1, west.y, bounds)).toBe(true);
  });

  it("refuses tiles elsewhere", () => {
    const london = tileAt(51.5, -0.12, 16);
    expect(tileTouchesBounds(16, london.x, london.y, bounds)).toBe(false);
    const north = tileAt(53.5, 0.21, 13);
    expect(tileTouchesBounds(13, north.x, north.y, bounds)).toBe(false);
  });
});

describe("handleTileRequest", () => {
  it("serves a tile to a role the provider allows, with its own cache limit", async () => {
    for (const role of ["councillor", "clerk", "admin"]) {
      const d = deps({ role, firebase: { sign_in_second_factor: "totp" } });
      const response = await handleTileRequest(request(), d, settings);
      expect(response.status).toBe(200);
      expect(response.headers["Content-Type"]).toBe("image/png");
      expect(response.headers["Cache-Control"]).toBe("private, max-age=604800");
      expect(response.body).toBe(PNG);
    }
  });

  it("builds the upstream address only from the deployed template and the key", async () => {
    const d = deps();
    await handleTileRequest(request(), d, settings);
    expect(d.secretValue).toHaveBeenCalledWith("OS_API_KEY");
    expect(d.fetchUrl).toHaveBeenCalledWith(
      `https://api.os.uk/maps/raster/v1/zxy/Road_3857/16/${inside.x}/${inside.y}.png?key=SECRET%26KEY`,
    );
  });

  it("never sends the key or the upstream address to the browser", async () => {
    const d = deps();
    const ok = await handleTileRequest(request(), d, settings);
    expect(JSON.stringify(ok.headers)).not.toMatch(/SECRET|api\.os\.uk/);
    d.fetchUrl.mockRejectedValue(new Error("https://api.os.uk/...?key=SECRET"));
    const failed = await handleTileRequest(request(), d, settings);
    expect(failed.status).toBe(502);
    expect(String(failed.body)).not.toMatch(/SECRET|api\.os\.uk/);
  });

  it("says no-store when a provider's terms allow no browser caching", async () => {
    const d = deps({
      role: "admin",
      firebase: { sign_in_second_factor: "totp" },
    });
    const response = await handleTileRequest(
      request({ path: `/tiles/onlyadmins/plain/16/${inside.x}/${inside.y}` }),
      d,
      settings,
    );
    expect(response.headers["Cache-Control"]).toBe("private, no-store");
  });

  it("refuses a role the provider does not list, and never contacts the provider", async () => {
    for (const role of ["member", undefined]) {
      const d = deps({ role, firebase: { sign_in_second_factor: "totp" } });
      const response = await handleTileRequest(request(), d, settings);
      expect(response.status).toBe(403);
      expect(d.fetchUrl).not.toHaveBeenCalled();
    }
    const d = deps();
    const response = await handleTileRequest(
      request({ path: `/tiles/onlyadmins/plain/16/${inside.x}/${inside.y}` }),
      d,
      settings,
    );
    expect(response.status).toBe(403);
  });

  it("refuses a missing or malformed token with 401", async () => {
    for (const idToken of [undefined, "", "a b"]) {
      const d = deps();
      const response = await handleTileRequest(
        request({ idToken }),
        d,
        settings,
      );
      expect(response.status, String(idToken)).toBe(401);
      expect(d.verifyToken).not.toHaveBeenCalled();
      expect(d.fetchUrl).not.toHaveBeenCalled();
    }
  });

  it("refuses an invalid, expired or revoked token with 401", async () => {
    const d = deps();
    d.verifyToken.mockRejectedValue(new Error("auth/id-token-revoked"));
    expect((await handleTileRequest(request(), d, settings)).status).toBe(401);
    expect(d.fetchUrl).not.toHaveBeenCalled();
  });

  it("refuses a sign-in that did not use the authenticator", async () => {
    const d = deps({
      role: "admin",
      firebase: { sign_in_provider: "password" },
    });
    expect((await handleTileRequest(request(), d, settings)).status).toBe(401);
    expect(d.fetchUrl).not.toHaveBeenCalled();
  });

  it("allows only GET", async () => {
    const d = deps();
    const response = await handleTileRequest(
      request({ method: "POST" }),
      d,
      settings,
    );
    expect(response.status).toBe(405);
    expect(d.verifyToken).not.toHaveBeenCalled();
  });

  it("is not an open proxy: unknown providers and styles are refused", async () => {
    for (const bad of [
      `/tiles/evil/Road_3857/16/${inside.x}/${inside.y}`,
      `/tiles/constructor/Road_3857/16/${inside.x}/${inside.y}`,
      `/tiles/os/Leisure_27700/16/${inside.x}/${inside.y}`,
    ]) {
      const d = deps();
      const response = await handleTileRequest(
        request({ path: bad }),
        d,
        settings,
      );
      expect(response.status, bad).toBe(404);
      expect(d.fetchUrl).not.toHaveBeenCalled();
    }
  });

  it("refuses tiles outside the zoom range or the area the map covers", async () => {
    const london = tileAt(51.5, -0.12, 16);
    const high = tileAt(52.3947, 0.2109, 17);
    const low = tileAt(52.3947, 0.2109, 12);
    for (const bad of [
      `/tiles/os/Road_3857/16/${london.x}/${london.y}`,
      `/tiles/os/Road_3857/17/${high.x}/${high.y}`,
      `/tiles/os/Road_3857/12/${low.x}/${low.y}`,
    ]) {
      const d = deps();
      const response = await handleTileRequest(
        request({ path: bad }),
        d,
        settings,
      );
      expect(response.status, bad).toBe(400);
      expect(d.fetchUrl).not.toHaveBeenCalled();
    }
  });

  it("turns upstream failures into 502 without passing their body on", async () => {
    const d = deps();
    d.fetchUrl.mockResolvedValue({
      status: 401,
      contentType: "application/json",
      body: new ArrayBuffer(0),
    });
    expect((await handleTileRequest(request(), d, settings)).status).toBe(502);
  });

  it("passes on a missing tile as 404, and refuses a reply that is not an image", async () => {
    const d = deps();
    d.fetchUrl.mockResolvedValue({
      status: 404,
      contentType: "text/plain",
      body: new ArrayBuffer(0),
    });
    expect((await handleTileRequest(request(), d, settings)).status).toBe(404);
    d.fetchUrl.mockResolvedValue({
      status: 200,
      contentType: "text/html",
      body: new ArrayBuffer(0),
    });
    expect((await handleTileRequest(request(), d, settings)).status).toBe(502);
  });
});
