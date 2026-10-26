import { describe, expect, it } from "vitest";
import { render } from "../src/views/about.view.js";

describe("About page", () => {
  const container = document.createElement("div");
  render(container, /** @type {any} */ ({}));
  const text = container.textContent?.replace(/\s+/g, " ") ?? "";

  it("mentions projects among what you can do", () => {
    expect(text).toContain("The Projects page follows");
    expect(text).toContain("linked to places on the map");
  });

  it("says what is recorded about people, and who can see email addresses", () => {
    expect(text).toContain("so does each project, action and note");
    expect(text).toContain(
      "can see the email addresses of the other councillors",
    );
    expect(text).toContain("Members cannot");
  });

  it("credits the maker and licence, with links that open safely, and offers the source", () => {
    expect(text).toContain("ParishMap is free software, built by DRMSITE LTD");
    expect(text).toContain("It comes with no warranty");
    const link = (/** @type {string} */ name) =>
      [...container.querySelectorAll("a")].find((a) => a.textContent === name);
    expect(link("DRMSITE LTD")?.getAttribute("href")).toBe(
      "https://drmsite.com",
    );
    expect(link("DRMSITE LTD")?.getAttribute("rel")).toBe("noopener");
    expect(link("source code")?.getAttribute("href")).toBe(
      "https://github.com/DRMSITE/parishmap",
    );
    expect(
      link("GNU Affero General Public Licence, version 3 or later"),
    ).toBeTruthy();
  });

  it("does not claim the data is kept in Europe, which depends on where the council set it up", () => {
    expect(text).not.toMatch(/European data/);
  });

  it("says where projects are stored", () => {
    expect(text).toContain("projects, actions, notes and accounts are stored");
  });
});
