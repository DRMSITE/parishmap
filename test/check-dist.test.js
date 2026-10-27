import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (/** @type {string} */ path) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

// scripts/check-dist.mjs finds the local-data start-up in a build by this example text.
// If the text is edited in one place and not the other, the check silently stops working.
describe("check:dist's local-data needles", () => {
  const script = read("scripts/check-dist.mjs");

  it.each([
    ["Village green refresh", "src/data/local-projects.js"],
    ["me@example.org", "src/boot/local.js"],
  ])("still finds %s in %s", (needle, source) => {
    expect(script).toContain(`"${needle}"`);
    expect(read(source)).toContain(needle);
  });
});
