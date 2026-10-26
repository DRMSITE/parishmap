import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maker, product } from "../src/branding.js";

describe("the maker's credit", () => {
  const page = readFileSync("index.html", "utf8");

  it("is in the navigation footer, as a real link that opens safely", () => {
    const nav = page.slice(page.indexOf("<nav"), page.indexOf("</nav>"));
    expect(nav).toContain(
      '<p class="credit">ParishMap, built by <a href="https://drmsite.com" rel="noopener">DRMSITE LTD</a></p>',
    );
  });

  it("agrees with the single source of the maker's details", () => {
    expect(maker).toEqual({ name: "DRMSITE LTD", url: "https://drmsite.com" });
    expect(page).toContain(maker.url);
    expect(page).toContain(maker.name);
  });

  it("names the licence and the public source", () => {
    expect(product.licence).toMatch(/Affero/);
    expect(product.licenceUrl).toMatch(/^https:\/\/www\.gnu\.org\//);
    expect(product.sourceUrl).toBe("https://github.com/DRMSITE/parishmap");
  });
});
