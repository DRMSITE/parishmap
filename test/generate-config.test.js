import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import example from "../deployment.example/parish.config.js";
import {
  buildFunctionsSettings,
  buildHosting,
  tileHostsFor,
} from "../scripts/generate-config.mjs";

const template = readFileSync("firebase.template.json", "utf8");

describe("buildHosting", () => {
  const out = JSON.parse(
    buildHosting(template, {
      region: "europe-west2",
      tileHosts: [
        "https://tile.openstreetmap.org",
        "https://*.tiles.example.org",
      ],
    }),
  );
  const csp = out.hosting.headers
    .find((/** @type {any} */ h) => h.source === "**")
    .headers.find((/** @type {any} */ h) => h.key === "Content-Security-Policy")
    .value;

  it("puts the region into the function rewrites", () => {
    const regions = out.hosting.rewrites
      .filter((/** @type {any} */ r) => r.function)
      .map((/** @type {any} */ r) => r.function.region);
    expect(regions).toEqual(["europe-west2", "europe-west2"]);
  });

  it("allows exactly the tile servers given, and nothing else, for images", () => {
    expect(csp).toMatch(
      /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org https:\/\/\*\.tiles\.example\.org;/,
    );
    expect(csp).not.toContain("%");
    expect(csp).toContain("default-src 'none'");
  });

  it("refuses a region or host that is not usable", () => {
    expect(() =>
      buildHosting(template, { region: "mars", tileHosts: [] }),
    ).toThrow(/region/);
    expect(() =>
      buildHosting(template, {
        region: "europe-west2",
        tileHosts: ["https://ok.example; script-src *"],
      }),
    ).toThrow(/not a usable tile server/);
  });
});

describe("tileHostsFor", () => {
  it("is just OpenStreetMap by default, and includes a custom direct provider", () => {
    expect(tileHostsFor(undefined)).toEqual([
      "https://tile.openstreetmap.org",
      "https://*.tile.openstreetmap.org",
    ]);
    expect(
      tileHostsFor({
        custom: [
          {
            id: "own",
            label: "Own",
            kind: "direct",
            urlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",
            attribution: "x",
            minZoom: 0,
            maxZoom: 17,
            termsUrl: "https://tiles.example.org/terms",
          },
        ],
      }),
    ).toContain("https://tiles.example.org");
  });

  it("adds nothing for a proxied provider: the browser only talks to us", () => {
    expect(tileHostsFor({ basemap: "os" })).toEqual(tileHostsFor(undefined));
  });
});

describe("buildFunctionsSettings", () => {
  it("has no providers when only OpenStreetMap is used", () => {
    const settings = buildFunctionsSettings(example);
    expect(settings.providers).toEqual({});
    expect(settings.region).toBe("europe-west2");
    expect(settings.bounds).toEqual(example.bounds);
  });

  it("lists only what the function needs for a proxied provider", () => {
    const settings = buildFunctionsSettings({
      ...example,
      tiles: { basemap: "os" },
    });
    expect(Object.keys(settings.providers)).toEqual(["os"]);
    expect(Object.keys(settings.providers.os).sort()).toEqual(
      [
        "cacheSeconds",
        "id",
        "maxZoom",
        "minZoom",
        "roles",
        "secret",
        "styles",
        "upstream",
      ].sort(),
    );
  });
});
