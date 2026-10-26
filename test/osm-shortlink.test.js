import { describe, expect, it } from "vitest";
import { decodeShortLink } from "../scripts/osm-shortlink.mjs";

describe("OpenStreetMap short links", () => {
  it("decodes a link to a position near the example parish", () => {
    const place = decodeShortLink("https://osm.org/go/0ERIKkwnZ--?layers=N&m=");
    expect(place?.lat).toBeCloseTo(52.39, 1);
    expect(place?.lng).toBeCloseTo(0.2, 1);
    expect(place?.zoom).toBeGreaterThan(10);
  });

  it("accepts the bare code, with or without trailing dashes and spaces", () => {
    const a = decodeShortLink("0ERIKkwnZ--");
    const b = decodeShortLink(" https://osm.org/go/0ERIKkwnZ--?layers=N&m= ");
    expect(a).toEqual(b);
  });

  it("gives the same position for the same code with a different zoom marker", () => {
    const a = decodeShortLink("0ERIKkwnZ");
    const b = decodeShortLink("0ERIKkwnZ--");
    expect(b?.lat).toBeCloseTo(a?.lat ?? 0, 3);
    expect(b?.lng).toBeCloseTo(a?.lng ?? 0, 3);
  });

  it("refuses something that is not a short link", () => {
    expect(decodeShortLink("")).toBeNull();
    expect(decodeShortLink("https://example.org/not a link!")).toBeNull();
    expect(decodeShortLink("--")).toBeNull();
  });
});
