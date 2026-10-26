import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalSource } from "../src/data/local-source.js";
import { Flags } from "../src/state/flags.js";
import {
  haversineKm,
  parseLat,
  parseLng,
  pointInPolygon,
} from "../src/util/geo.js";

beforeEach(() => localStorage.clear());

describe("local data source", () => {
  it("creates, lists, updates and removes records", async () => {
    const source = createLocalSource();
    const created = await source.create({
      lat: 52.2,
      lng: 0.1,
      data: { title: "A" },
    });
    expect(created.id).toBeTruthy();
    expect(await source.list()).toHaveLength(1);

    const updated = await source.update(created.id, { data: { title: "B" } });
    expect(updated.data.title).toBe("B");
    expect(updated.createdAt).toBe(created.createdAt);

    await source.remove(created.id);
    expect(await source.get(created.id)).toBeUndefined();
  });

  it("persists across instances", async () => {
    await createLocalSource().create({ lat: 1, lng: 2, data: {} });
    expect(await createLocalSource().list()).toHaveLength(1);
  });

  it("filters by category and bounds", async () => {
    const source = createLocalSource();
    await source.create({ lat: 10, lng: 10, category: "a", data: {} });
    await source.create({ lat: 50, lng: 50, category: "b", data: {} });
    expect(await source.list({ category: "a" })).toHaveLength(1);
    const inBounds = await source.list({
      bounds: { south: 0, west: 0, north: 20, east: 20 },
    });
    expect(inBounds).toHaveLength(1);
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const source = createLocalSource();
    let calls = 0;
    const stop = source.subscribe?.(() => calls++);
    await source.create({ lat: 0, lng: 0, data: {} });
    stop?.();
    await source.create({ lat: 0, lng: 0, data: {} });
    expect(calls).toBe(1);
  });

  it("ignores malformed stored records instead of breaking the views", async () => {
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
        good,
        { ...good, id: "s", lat: "1" },
        { ...good, id: "r", lat: 95 },
        { ...good, id: "d", data: null },
        { ...good, id: "c", createdAt: 5 },
        null,
        "x",
      ]),
    );
    const records = await createLocalSource().list();
    expect(records.map((r) => r.id)).toEqual(["g"]);
  });

  it("keeps records another tab saved", async () => {
    const tabA = createLocalSource();
    const tabB = createLocalSource();
    await tabA.create({ lat: 1, lng: 1, data: { title: "A" } });
    await tabB.create({ lat: 2, lng: 2, data: { title: "B" } });
    expect(await createLocalSource().list()).toHaveLength(2);
    expect(await tabA.list()).toHaveLength(1); // refreshed on the next change or storage event
  });

  it("reloads and notifies when another tab writes", async () => {
    const source = createLocalSource();
    let calls = 0;
    const stop = source.subscribe?.(() => calls++);
    await createLocalSource().create({ lat: 1, lng: 1, data: {} });
    globalThis.dispatchEvent(
      new StorageEvent("storage", { key: "parishmap:records" }),
    );
    expect(calls).toBe(1);
    expect(await source.list()).toHaveLength(1);
    stop?.();
  });

  it("reports a full store and does not keep the unsaved record", async () => {
    const source = createLocalSource();
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    await expect(source.create({ lat: 1, lng: 1, data: {} })).rejects.toThrow(
      /storage is full/i,
    );
    spy.mockRestore();
    expect(await source.list()).toHaveLength(0);
  });

  it("rejects updating a missing record", async () => {
    await expect(createLocalSource().update("nope", {})).rejects.toThrow();
  });
});

describe("flags", () => {
  it("defaults to shown and applies the registered default", () => {
    const flags = new Flags();
    flags.register({ id: "a", label: "A" });
    flags.register({ id: "b", label: "B", default: false });
    expect(flags.get("a")).toBe(true);
    expect(flags.get("b")).toBe(false);
  });

  it("emits changes for the watched flag only and persists", () => {
    const flags = new Flags();
    flags.register({ id: "a", label: "A" });
    /** @type {boolean[]} */
    const seen = [];
    flags.watch("a", (v) => seen.push(v));
    flags.set("a", false);
    flags.set("other", false);
    flags.set("a", false);
    expect(seen).toEqual([false]);
    expect(new Flags().get("a")).toBe(false);
  });
});

describe("geo helpers", () => {
  it("parses coordinates and rejects bad input", () => {
    expect(parseLat(" 52.2 ")).toBe(52.2);
    expect(parseLat("91")).toBeNull();
    expect(parseLng("-180")).toBe(-180);
    expect(parseLng("abc")).toBeNull();
    expect(parseLat("")).toBeNull();
  });

  it("measures distance", () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
    expect(haversineKm(51.5, -0.12, 48.85, 2.35)).toBeGreaterThan(330);
  });

  it("tests point in polygon", () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });
});
