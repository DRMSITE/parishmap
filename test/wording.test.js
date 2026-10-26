import { describe, expect, it } from "vitest";
import { publicTiles } from "../scripts/parish-plugin.mjs";
import example from "../deployment.example/parish.config.js";
import { describeChosenMap, rolesPhrase } from "../src/tiles/wording.js";

describe("rolesPhrase", () => {
  it("names the roles in a sentence, with the Clerk by title", () => {
    expect(
      rolesPhrase(["admin", "clerk", "councillor"], "Parish Clerk"),
    ).toBe("Councillors, the Parish Clerk and administrators");
    expect(rolesPhrase(["admin"], "Town Clerk")).toBe("Administrators");
    expect(rolesPhrase([], "Parish Clerk")).toBe("Nobody");
  });
});

describe("describeChosenMap", () => {
  it("says nothing special for OpenStreetMap", () => {
    expect(describeChosenMap(publicTiles(example), "Parish Clerk")).toBeNull();
  });

  it("describes a proxied provider by who may see it, and where it stops", () => {
    const chosen = describeChosenMap(
      publicTiles({ ...example, tiles: { basemap: "os" } }),
      "Parish Clerk",
    );
    expect(chosen).toMatchObject({
      label: "Ordnance Survey",
      who: "Councillors, the Parish Clerk and administrators",
      proxied: true,
      maxZoom: 16,
      memberSees: false,
      councillorSees: true,
    });
    expect(chosen?.attribution).toMatch(/Crown copyright.*\d{4}/);
  });
});
