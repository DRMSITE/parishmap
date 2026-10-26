import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createFirestoreSource } from "../src/data/firestore-source.js";
import { createTestEnv, seedFeature, userContext } from "./helpers.js";

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;
/** @type {{ close: () => void }[]} */
let opened = [];

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());
afterEach(() => {
  for (const source of opened) source.close();
  opened = [];
});

/**
 * A data source for a user with the given role, as the app would build it.
 * @param {string} uid
 * @param {string} [role]
 */
function sourceFor(uid, role) {
  const context = userContext(env, uid, { role });
  const source = createFirestoreSource({
    db: /** @type {any} */ (context.firestore()),
    getUser: () => ({ uid, email: `${uid}@example.org` }),
  });
  opened.push(source);
  return source;
}

/** @type {import("../src/types.js").GeoJSONGeometry} */
const parish = {
  type: "Polygon",
  coordinates: [
    [
      [0.2, 52.39],
      [0.2, 52.4],
      [0.22, 52.4],
      [0.22, 52.39],
      [0.2, 52.39],
    ],
  ],
};

describe("creating and listing", () => {
  it("stores a point and lists it with its author", async () => {
    const source = sourceFor("u1", "councillor");
    const created = await source.create({
      lat: 52.39,
      lng: 0.21,
      data: { title: "Bench", notes: "By the green" },
    });
    expect(created.createdBy).toBe("u1");

    const [only] = await source.list();
    expect(only).toMatchObject({
      id: created.id,
      lat: 52.39,
      lng: 0.21,
      createdBy: "u1",
      createdByEmail: "u1@example.org",
      data: { title: "Bench", notes: "By the green" },
    });
    expect(only.geometry).toBeUndefined();
    expect(Number.isNaN(Date.parse(only.createdAt))).toBe(false);
  });

  it("round-trips an area and derives lat/lng from it", async () => {
    const source = sourceFor("u1", "councillor");
    await source.create({
      lat: 0,
      lng: 0,
      geometry: parish,
      category: "development",
      data: { title: "Proposed field" },
    });
    const [area] = await source.list();
    expect(area.geometry).toEqual(parish);
    expect(area.category).toBe("development");
    expect(area.lat).toBeCloseTo(52.395);
    expect(area.lng).toBeCloseTo(0.21);
  });

  it("refuses an invalid shape before sending it", async () => {
    const source = sourceFor("u1", "councillor");
    await expect(
      source.create({
        lat: 0,
        lng: 0,
        geometry: /** @type {any} */ ({ type: "Point", coordinates: [0, 99] }),
        data: { title: "x" },
      }),
    ).rejects.toThrow(/invalid coordinates/);
    expect(await source.list()).toHaveLength(0);
  });

  it("asks someone who is not signed in to sign in", async () => {
    const context = userContext(env, "u1", { role: "councillor" });
    const source = createFirestoreSource({
      db: /** @type {any} */ (context.firestore()),
      getUser: () => null,
    });
    opened.push(source);
    await expect(
      source.create({ lat: 1, lng: 1, data: { title: "x" } }),
    ).rejects.toThrow(/sign in/i);
  });

  it("gives a member a readable refusal when they try to add", async () => {
    const source = sourceFor("u1", "member");
    await expect(
      source.create({ lat: 1, lng: 1, data: { title: "x" } }),
    ).rejects.toThrow("You do not have permission to do that.");
  });

  it("sorts by creation time", async () => {
    await seedFeature(env, "b", "u9", {
      createdAt: new Date("2026-02-01"),
      updatedAt: new Date("2026-02-01"),
    });
    await seedFeature(env, "a", "u9", {
      createdAt: new Date("2026-03-01"),
      updatedAt: new Date("2026-03-01"),
    });
    const ids = (await sourceFor("u1", "member").list()).map((r) => r.id);
    expect(ids).toEqual(["b", "a"]);
  });

  it("filters by category and bounds", async () => {
    await seedFeature(env, "near", "u9", { category: "a" });
    await seedFeature(env, "far", "u9", { category: "b", lat: 10, lng: 10 });
    const source = sourceFor("u1", "member");
    expect((await source.list({ category: "b" })).map((r) => r.id)).toEqual([
      "far",
    ]);
    const ids = (
      await source.list({
        bounds: { south: 52, west: 0, north: 53, east: 1 },
      })
    ).map((r) => r.id);
    expect(ids).toEqual(["near"]);
  });
});

describe("reading without access", () => {
  it("rejects the first read for a user with no role", async () => {
    await expect(sourceFor("u1").list()).rejects.toThrow(
      "You do not have permission to do that.",
    );
  });

  it("leaves out stored records that are malformed", async () => {
    await seedFeature(env, "good", "u9");
    await seedFeature(env, "badshape", "u9", {
      geometry: JSON.stringify({ type: "Point", coordinates: [0, 99] }),
    });
    await seedFeature(env, "notjson", "u9", { geometry: "{oops" });
    const ids = (await sourceFor("u1", "member").list()).map((r) => r.id);
    expect(ids).toEqual(["good"]);
  });
});

describe("updating and removing", () => {
  it("lets a councillor edit their own feature and keeps the rest", async () => {
    const source = sourceFor("u1", "councillor");
    const created = await source.create({
      lat: 52.39,
      lng: 0.21,
      category: "x",
      data: { title: "Before" },
    });
    const createdAt = (await source.get(created.id))?.createdAt;
    const updated = await source.update(created.id, {
      data: { title: "After" },
    });
    expect(updated).toMatchObject({
      id: created.id,
      category: "x",
      data: { title: "After" },
    });
    const stored = await source.get(created.id);
    expect(stored?.data.title).toBe("After");
    expect(stored?.createdAt).toBe(createdAt);
  });

  it("can turn a point into an area, and clear the category", async () => {
    const source = sourceFor("u1", "councillor");
    const created = await source.create({
      lat: 1,
      lng: 1,
      category: "x",
      data: { title: "t" },
    });
    await source.update(created.id, { geometry: parish, category: undefined });
    const stored = await source.get(created.id);
    expect(stored?.geometry?.type).toBe("Polygon");
    expect(stored?.category).toBeUndefined();
  });

  it("refuses a councillor editing or deleting someone else's feature", async () => {
    await seedFeature(env, "theirs", "u2");
    const source = sourceFor("u1", "councillor");
    await expect(
      source.update("theirs", { data: { title: "Mine now" } }),
    ).rejects.toThrow("You do not have permission to do that.");
    await expect(source.remove("theirs")).rejects.toThrow(
      "You do not have permission to do that.",
    );
    // Firestore shows a write at once and takes it back when the server refuses, so the
    // feature reappears a moment later (and subscribers are told).
    await expect.poll(() => source.get("theirs")).toBeDefined();
  });

  it("lets a clerk edit and delete anyone's feature", async () => {
    await seedFeature(env, "theirs", "u2");
    const clerk = sourceFor("clerk1", "clerk");
    await clerk.update("theirs", { data: { title: "Tidied" } });
    expect((await clerk.get("theirs"))?.data.title).toBe("Tidied");
    await clerk.remove("theirs");
    expect(await clerk.get("theirs")).toBeUndefined();
  });

  it("rejects updating a missing record and ignores removing one", async () => {
    const source = sourceFor("u1", "councillor");
    await expect(
      source.update("nope", { data: { title: "x" } }),
    ).rejects.toThrow(/No record/);
    await expect(source.remove("nope")).resolves.toBeUndefined();
  });
});

describe("live updates", () => {
  it("notifies when someone else changes a feature", async () => {
    const mine = sourceFor("u1", "member");
    await mine.list(); // Starts the listener.
    let calls = 0;
    const stop = mine.subscribe?.(() => calls++);

    await sourceFor("u2", "councillor").create({
      lat: 52.39,
      lng: 0.21,
      data: { title: "From elsewhere" },
    });
    await expect.poll(() => calls).toBeGreaterThan(0);
    expect(await mine.list()).toHaveLength(1);

    stop?.();
    const before = calls;
    await sourceFor("u2", "councillor").create({
      lat: 1,
      lng: 1,
      data: { title: "Later" },
    });
    await expect.poll(async () => (await mine.list()).length).toBe(2);
    expect(calls).toBe(before);
  });
});
