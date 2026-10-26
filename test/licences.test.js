import { describe, expect, it } from "vitest";
import { collect, isCompatible, render } from "../scripts/licences.mjs";

describe("isCompatible", () => {
  it("accepts permissive licences", () => {
    for (const id of ["MIT", "ISC", "BSD-3-Clause", "Apache-2.0", "0BSD"])
      expect(isCompatible(id), id).toBe(true);
  });

  it("needs only one choice from an OR, and all of an AND", () => {
    expect(isCompatible("(MIT OR GPL-2.0-only)")).toBe(true);
    expect(isCompatible("MIT AND Zlib")).toBe(true);
    expect(isCompatible("MIT AND SSPL-1.0")).toBe(false);
  });

  it("refuses unknown, missing and restrictive licences", () => {
    for (const id of ["", "UNKNOWN", "SEE LICENSE IN LICENSE.md", "GPL-2.0-only", "CC-BY-NC-4.0"])
      expect(isCompatible(id), id).toBe(false);
  });
});

describe("collect", () => {
  const lock = {
    packages: {
      "": { name: "root" },
      "node_modules/a": { version: "1.0.0" },
      "node_modules/b": { version: "2.0.0", dev: true },
      "node_modules/a/node_modules/c": { version: "3.1.0" },
      "node_modules/d": { version: "0.1.0", devOptional: true },
    },
  };
  const metas = /** @type {Record<string, any>} */ ({
    "node_modules/a": { license: "MIT" },
    "node_modules/a/node_modules/c": { license: { type: "ISC" } },
  });

  it("lists what ships, not development tools, with each licence", () => {
    expect(collect(lock, (path) => metas[path] ?? null)).toEqual([
      { name: "a", version: "1.0.0", licence: "MIT" },
      { name: "c", version: "3.1.0", licence: "ISC" },
    ]);
  });

  it("marks a package with no licence as unknown", () => {
    const [only] = collect(
      { packages: { "node_modules/x": { version: "1.0.0" } } },
      () => null,
    );
    expect(only.licence).toBe("UNKNOWN");
  });
});

describe("render", () => {
  it("is a table of packages plus the other material, and says it is generated", () => {
    const text = render([{ name: "a", version: "1.0.0", licence: "MIT" }]);
    expect(text).toContain("| a | 1.0.0 | MIT |");
    expect(text).toContain("Font Awesome Free icons");
    expect(text).toContain("OpenStreetMap data and tiles");
    expect(text).toContain("generated");
  });
});
