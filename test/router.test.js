import { describe, expect, it } from "vitest";
import { isInternalNavigation, stripBase } from "../src/router/router.js";

describe("stripBase", () => {
  it("returns the path unchanged for the root base", () => {
    expect(stripBase("/about", "/")).toBe("/about");
  });
  it("removes a sub-path base", () => {
    expect(stripBase("/maps/about", "/maps/")).toBe("/about");
    expect(stripBase("/maps", "/maps/")).toBe("/");
    expect(stripBase("/maps/", "/maps/")).toBe("/");
  });
  it("ignores trailing slashes", () => {
    expect(stripBase("/about/", "/")).toBe("/about");
  });
});

describe("isInternalNavigation", () => {
  const origin = "http://localhost";
  /** @param {string} href @param {Partial<MouseEventInit>} [init] @param {Record<string, string>} [attrs] */
  function check(href, init = {}, attrs = {}) {
    const link = document.createElement("a");
    link.href = href;
    for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
    const event = new MouseEvent("click", {
      button: 0,
      cancelable: true,
      ...init,
    });
    return isInternalNavigation(event, link, origin);
  }

  it("handles plain same-origin links", () => {
    expect(check("http://localhost/about")).toBe(true);
  });
  it("leaves external links to the browser", () => {
    expect(check("https://example.com/")).toBe(false);
  });
  it("leaves modified clicks, new-tab links and downloads to the browser", () => {
    expect(check("http://localhost/about", { ctrlKey: true })).toBe(false);
    expect(check("http://localhost/about", { metaKey: true })).toBe(false);
    expect(check("http://localhost/about", {}, { target: "_blank" })).toBe(
      false,
    );
    expect(check("http://localhost/file.csv", {}, { download: "" })).toBe(
      false,
    );
  });
});
