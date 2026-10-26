import { beforeEach, describe, expect, it } from "vitest";
import { createLocalSource } from "../src/data/local-source.js";
import {
  describeShape,
  formatVertices,
  geometryBounds,
  geometryFromVertices,
  isWithinBounds,
  parseGeometry,
  parseVertexText,
  representativePoint,
  shapeKind,
  verticesFromGeometry,
  withGeometry,
} from "../src/util/geo.js";

beforeEach(() => localStorage.clear());

const square = /** @type {any} */ ({
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ],
  ],
});

describe("parseGeometry", () => {
  it("accepts each supported type", () => {
    expect(
      parseGeometry({ type: "Point", coordinates: [0.2, 52.4] }, 500),
    ).toEqual({
      geometry: { type: "Point", coordinates: [0.2, 52.4] },
    });
    expect(
      parseGeometry(
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        500,
      ),
    ).toHaveProperty("geometry");
    expect(parseGeometry(square, 500)).toHaveProperty("geometry");
    expect(
      parseGeometry(
        { type: "MultiPolygon", coordinates: [square.coordinates] },
        500,
      ),
    ).toHaveProperty("geometry");
  });

  it("drops altitude and unknown members", () => {
    const result = parseGeometry(
      { type: "Point", coordinates: [1, 2, 99], extra: "x" },
      500,
    );
    expect(result).toEqual({
      geometry: { type: "Point", coordinates: [1, 2] },
    });
  });

  it.each([
    ["null", null],
    ["a string", "Point"],
    ["an unsupported type", { type: "GeometryCollection", geometries: [] }],
    ["a missing type", { coordinates: [0, 0] }],
    ["latitude out of range", { type: "Point", coordinates: [0, 91] }],
    ["longitude out of range", { type: "Point", coordinates: [181, 0] }],
    ["non-numeric coordinates", { type: "Point", coordinates: ["0", "0"] }],
    ["NaN", { type: "Point", coordinates: [Number.NaN, 0] }],
    ["a one-point line", { type: "LineString", coordinates: [[0, 0]] }],
    [
      "an unclosed ring",
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
          ],
        ],
      },
    ],
    [
      "a ring with too few points",
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    ],
    ["an empty multipolygon", { type: "MultiPolygon", coordinates: [] }],
  ])("rejects %s", (_name, value) => {
    expect(parseGeometry(value, 500)).toHaveProperty("error");
  });

  it("rejects shapes over the vertex limit", () => {
    expect(parseGeometry(square, 4)).toEqual({
      error: "The shape has more than 4 points.",
    });
    expect(parseGeometry(square, 5)).toHaveProperty("geometry");
  });

  it("accepts a detailed council boundary within a sensible limit", () => {
    const boundary = detailedBoundary(700);
    const result = parseGeometry(boundary, 1000);
    expect(result).toHaveProperty("geometry");
    // The boundary is a fixed layer, not a user shape, so it exceeds the drawing cap.
    expect(parseGeometry(boundary, 500)).toHaveProperty("error");
  });
});

describe("geometry helpers", () => {
  it("finds bounds", () => {
    expect(geometryBounds(square)).toEqual({
      south: 0,
      west: 0,
      north: 10,
      east: 10,
    });
  });

  it("gives a representative point for each type", () => {
    expect(representativePoint({ type: "Point", coordinates: [3, 4] })).toEqual(
      {
        lat: 4,
        lng: 3,
      },
    );
    expect(
      representativePoint({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      }),
    ).toEqual({ lat: 1, lng: 1 });
    const centre = representativePoint(square);
    expect(centre.lat).toBeCloseTo(5);
    expect(centre.lng).toBeCloseTo(5);
  });

  it("uses the largest part of a multipolygon", () => {
    const small = [
      [
        [20, 20],
        [20, 21],
        [21, 21],
        [21, 20],
        [20, 20],
      ],
    ];
    const centre = representativePoint({
      type: "MultiPolygon",
      coordinates: [small, square.coordinates],
    });
    expect(centre.lat).toBeCloseTo(5);
  });

  it("falls back to the bounds centre for a zero-area ring", () => {
    const flat = /** @type {any} */ ({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [4, 4],
          [0, 0],
        ],
      ],
    });
    expect(representativePoint(flat)).toEqual({ lat: 2, lng: 2 });
  });

  it("withGeometry sets lat/lng from the shape and rejects bad shapes", () => {
    const result = withGeometry(
      /** @type {any} */ ({ lat: 0, lng: 0, geometry: square }),
      500,
    );
    expect(result.lat).toBeCloseTo(5);
    expect(() => withGeometry({ geometry: { type: "Point" } }, 500)).toThrow(
      /invalid coordinates/,
    );
    expect(withGeometry({ lat: 1, lng: 2 }, 500)).toEqual({ lat: 1, lng: 2 });
  });
});

describe("local source with geometry", () => {
  it("stores a shape and derives lat/lng", async () => {
    const source = createLocalSource();
    const created = await source.create({
      lat: 0,
      lng: 0,
      geometry: /** @type {any} */ (square),
      data: { title: "Field" },
    });
    expect(created.lat).toBeCloseTo(5);
    expect((await source.get(created.id))?.geometry?.type).toBe("Polygon");
  });

  it("refuses an invalid shape without storing it", async () => {
    const source = createLocalSource();
    await expect(
      source.create({
        lat: 0,
        lng: 0,
        geometry: /** @type {any} */ ({ type: "Point", coordinates: [0, 99] }),
        data: {},
      }),
    ).rejects.toThrow();
    expect(await source.list()).toHaveLength(0);
  });

  it("recomputes lat/lng when the shape is updated", async () => {
    const source = createLocalSource();
    const created = await source.create({ lat: 1, lng: 1, data: {} });
    const updated = await source.update(created.id, {
      geometry: { type: "Point", coordinates: [7, 8] },
    });
    expect(updated).toMatchObject({ lat: 8, lng: 7 });
  });

  it("matches a large area whose centre is outside the queried bounds", async () => {
    const source = createLocalSource();
    await source.create({
      lat: 0,
      lng: 0,
      geometry: /** @type {any} */ (square),
      data: {},
    });
    const view = { south: 8, west: 8, north: 20, east: 20 };
    expect(await source.list({ bounds: view })).toHaveLength(1);
    expect(
      await source.list({
        bounds: { south: 30, west: 30, north: 40, east: 40 },
      }),
    ).toHaveLength(0);
  });

  it("drops stored records with invalid geometry", async () => {
    const good = {
      id: "g",
      lat: 1,
      lng: 2,
      data: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem(
      "parishmap:records",
      JSON.stringify([
        { ...good, geometry: { type: "Point", coordinates: [2, 1] } },
        {
          ...good,
          id: "bad",
          geometry: { type: "Point", coordinates: [2, 999] },
        },
        { ...good, id: "none", geometry: null },
      ]),
    );
    const ids = (await createLocalSource().list()).map((r) => r.id);
    expect(ids).toEqual(["g"]);
  });
});

describe("vertex text", () => {
  const triangle = [
    { lat: 52.39, lng: 0.2 },
    { lat: 52.4, lng: 0.21 },
    { lat: 52.39, lng: 0.22 },
  ];

  it("round-trips an area through text and GeoJSON", () => {
    const text = formatVertices(triangle);
    expect(text.split("\n")).toHaveLength(3);
    const parsed = parseVertexText(text, "area");
    expect(parsed).toEqual({ vertices: triangle });
    const geometry = geometryFromVertices("area", triangle);
    expect(geometry.type).toBe("Polygon");
    // The ring is closed for the caller, and reading it back drops the closing point.
    expect(/** @type {any} */ (geometry).coordinates[0]).toHaveLength(4);
    expect(verticesFromGeometry(geometry)).toEqual(triangle);
    expect(parseGeometry(geometry, 500)).toHaveProperty("geometry");
  });

  it("builds a line and reads it back", () => {
    const geometry = geometryFromVertices("line", triangle.slice(0, 2));
    expect(geometry.type).toBe("LineString");
    expect(verticesFromGeometry(geometry)).toEqual(triangle.slice(0, 2));
  });

  it("accepts commas, spaces, blank lines and a repeated first point", () => {
    const text = "52.39 0.2\n\n52.4,0.21\r\n52.39; 0.22\n52.39, 0.2\n";
    expect(parseVertexText(text, "area")).toEqual({ vertices: triangle });
  });

  it("names the line that is wrong", () => {
    expect(parseVertexText("52.39, 0.2\nnonsense", "line")).toEqual({
      error:
        "Line 2 must be a latitude and a longitude, such as 52.3947, 0.2109.",
    });
    expect(parseVertexText("95, 0.2\n52, 0.2", "line")).toHaveProperty("error");
    expect(parseVertexText("52, 0.2, 7\n52, 0.2", "line")).toHaveProperty(
      "error",
    );
  });

  it("insists on enough points", () => {
    expect(parseVertexText("52.39, 0.2", "line")).toHaveProperty("error");
    expect(parseVertexText("52.39, 0.2\n52.4, 0.2", "area")).toHaveProperty(
      "error",
    );
    expect(parseVertexText("", "area")).toHaveProperty("error");
  });

  it("cannot edit an area with a hole or several areas as text", () => {
    const hole = /** @type {any} */ ({
      type: "Polygon",
      coordinates: [square.coordinates[0], square.coordinates[0]],
    });
    expect(verticesFromGeometry(hole)).toBeNull();
    expect(
      verticesFromGeometry({ type: "Point", coordinates: [0, 0] }),
    ).toBeNull();
  });
});

describe("describeShape and shapeKind", () => {
  it("describes lines and areas, and says nothing for a point", () => {
    expect(shapeKind(undefined)).toBe("point");
    expect(shapeKind({ type: "Point", coordinates: [0, 0] })).toBe("point");
    expect(describeShape(square)).toBe("Area with 4 points");
    expect(shapeKind(square)).toBe("area");
    const line = geometryFromVertices("line", [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ]);
    expect(describeShape(line)).toBe("Line with 2 points");
    expect(describeShape(undefined)).toBe("");
  });
});

describe("isWithinBounds", () => {
  const bounds = /** @type {[[number, number], [number, number]]} */ ([
    [52.34, 0.02],
    [52.45, 0.4],
  ]);

  it("accepts positions inside, including the edges", () => {
    expect(isWithinBounds(bounds, 52.39, 0.21)).toBe(true);
    expect(isWithinBounds(bounds, 52.34, 0.02)).toBe(true);
    expect(isWithinBounds(bounds, 52.45, 0.4)).toBe(true);
  });

  it("refuses positions outside on any side", () => {
    expect(isWithinBounds(bounds, 52.33, 0.21)).toBe(false);
    expect(isWithinBounds(bounds, 52.46, 0.21)).toBe(false);
    expect(isWithinBounds(bounds, 52.39, 0.01)).toBe(false);
    expect(isWithinBounds(bounds, 52.39, 0.41)).toBe(false);
    expect(isWithinBounds(bounds, 51.5, -0.12)).toBe(false);
  });
});

/**
 * A closed ring of distinct points: more than a drawn shape may have, as a real boundary does.
 * @param {number} count
 */
function detailedBoundary(count) {
  const ring = Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return [0.21 + 0.05 * Math.cos(angle), 52.39 + 0.03 * Math.sin(angle)];
  });
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
}
