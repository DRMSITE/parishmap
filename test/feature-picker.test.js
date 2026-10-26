import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { placeHref } from "../src/projects/model.js";
import { buildPlaces, REMOVED_PLACE } from "../src/projects/places.js";
import { createFeaturePicker } from "../src/ui/feature-picker.js";

/** @param {string} id @param {string} title @param {object} [more] */
const feature = (id, title, more = {}) =>
  /** @type {any} */ ({ id, lat: 52.39, lng: 0.21, data: { title }, ...more });

const features = [
  feature("f2", "Village green"),
  feature("f1", "Old oak"),
  feature("f3", "Footpath 7", {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  }),
];

/** @param {ReturnType<typeof createFeaturePicker>} picker */
const labels = (picker) =>
  [...picker.element.querySelectorAll("li")].map((li) =>
    li.textContent?.trim(),
  );

/** @param {ReturnType<typeof createFeaturePicker>} picker */
const boxes = (picker) =>
  /** @type {HTMLInputElement[]} */ ([
    ...picker.element.querySelectorAll("input[type=checkbox]"),
  ]);

/** @param {ReturnType<typeof createFeaturePicker>} picker */
const filterBox = (picker) =>
  /** @type {HTMLInputElement} */ (
    picker.element.querySelector("[data-filter]")
  );

/** @param {ReturnType<typeof createFeaturePicker>} picker */
const countText = (picker) =>
  picker.element.querySelector("[data-count]")?.textContent;

describe("the places picker", () => {
  it("lists the features by title with their kind, and ticks the chosen ones", () => {
    const picker = createFeaturePicker();
    picker.set(features, ["f2"]);
    expect(labels(picker)).toEqual([
      "Footpath 7 (area)",
      "Old oak (point)",
      "Village green (point)",
    ]);
    expect(picker.value()).toEqual(["f2"]);
    expect(countText(picker)).toBe("1 place chosen.");
  });

  it("is a fieldset with a legend, a labelled filter and labelled checkboxes", () => {
    const picker = createFeaturePicker();
    picker.set(features, []);
    expect(picker.element.tagName).toBe("FIELDSET");
    expect(picker.element.querySelector("legend")?.textContent).toContain(
      "Places on the map",
    );
    expect(
      picker.element.querySelector("label input[type=search]"),
    ).not.toBeNull();
    for (const box of boxes(picker))
      expect(box.closest("label")).not.toBeNull();
    expect(
      picker.element.querySelector("[data-count]")?.getAttribute("role"),
    ).toBe("status");
  });

  it("filters the list without losing what was ticked", () => {
    const picker = createFeaturePicker();
    picker.set(features, ["f2"]);
    filterBox(picker).value = "oak";
    filterBox(picker).dispatchEvent(new Event("input"));
    const shown = [...picker.element.querySelectorAll("li")]
      .filter((li) => !li.hidden)
      .map((li) => li.textContent?.trim());
    expect(shown).toEqual(["Old oak (point)"]);
    expect(picker.value()).toEqual(["f2"]);

    filterBox(picker).value = "";
    filterBox(picker).dispatchEvent(new Event("input"));
    expect(
      [...picker.element.querySelectorAll("li")].some((li) => li.hidden),
    ).toBe(false);
  });

  it("reports the choice as ticked, in list order", () => {
    const picker = createFeaturePicker();
    picker.set(features, []);
    for (const box of boxes(picker)) {
      box.checked = true;
      box.dispatchEvent(new Event("change"));
    }
    expect(picker.value()).toEqual(["f3", "f1", "f2"]);
    expect(countText(picker)).toBe("3 places chosen.");
  });

  it("stops at the limit, leaving the ticked ones free to untick", () => {
    const many = Array.from(
      { length: config.limits.featureLinks + 2 },
      (_, i) => feature(`f${i}`, `Place ${String(i).padStart(2, "0")}`),
    );
    const picker = createFeaturePicker();
    picker.set(
      many,
      many.slice(0, config.limits.featureLinks).map((f) => f.id),
    );
    const all = boxes(picker);
    expect(all.filter((b) => b.checked)).toHaveLength(
      config.limits.featureLinks,
    );
    expect(all.filter((b) => b.disabled)).toHaveLength(2);
    expect(all.every((b) => !b.checked || !b.disabled)).toBe(true);
    expect(countText(picker)).toContain(
      `the most (${config.limits.featureLinks})`,
    );

    all[0].checked = false;
    all[0].dispatchEvent(new Event("change"));
    expect(all.filter((b) => b.disabled)).toHaveLength(0);
  });

  it("keeps a link to a deleted place, ticked, so it can be removed", () => {
    const picker = createFeaturePicker();
    picker.set(features, ["gone", "f1"]);
    expect(labels(picker)[0]).toBe(`Removed: ${REMOVED_PLACE}`);
    expect(picker.value()).toEqual(["gone", "f1"]);
    const gone = /** @type {HTMLInputElement} */ (
      picker.element.querySelector("input[value=gone]")
    );
    gone.checked = false;
    gone.dispatchEvent(new Event("change"));
    expect(picker.value()).toEqual(["f1"]);
  });

  it("never parses a title as HTML", () => {
    const picker = createFeaturePicker();
    picker.set([feature("x", "<img src=x onerror=alert(1)>")], []);
    expect(picker.element.querySelector("img")).toBeNull();
    expect(labels(picker)[0]).toBe("<img src=x onerror=alert(1)> (point)");
  });

  it("shows loading and failure instead of a list, with nothing to tick", () => {
    const picker = createFeaturePicker();
    picker.loading();
    expect(countText(picker)).toBe("Loading places…");
    expect(picker.value()).toEqual([]);
    picker.fail();
    expect(countText(picker)).toContain("Existing links are kept");
    expect(filterBox(picker).disabled).toBe(true);
    picker.set(features, []);
    expect(filterBox(picker).disabled).toBe(false);
  });
});

describe("linked places", () => {
  const byId = new Map(features.map((f) => [f.id, f]));

  it("names each place as a link to the map", () => {
    const p = buildPlaces(["f1", "f2"], byId, "project-meta");
    expect(p?.className).toBe("project-meta");
    expect(p?.textContent).toBe("Places: Old oak, Village green");
    expect(
      [...(p?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href")),
    ).toEqual(["/?place=f1", "/?place=f2"]);
  });

  it("says Place for one, shows a deleted place as removed, and nothing for none", () => {
    expect(buildPlaces(["f1"], byId)?.textContent).toBe("Place: Old oak");
    const mixed = buildPlaces(["f1", "gone"], byId);
    expect(mixed?.textContent).toBe(`Places: Old oak, ${REMOVED_PLACE}`);
    expect(mixed?.querySelectorAll("a")).toHaveLength(1);
    expect(buildPlaces([], byId)).toBeNull();
  });

  it("never parses a title as HTML", () => {
    const tricky = new Map([["x", feature("x", "<b>bold</b>")]]);
    const p = buildPlaces(["x"], tricky);
    expect(p?.querySelector("b")).toBeNull();
    expect(p?.querySelector("a")?.textContent).toBe("<b>bold</b>");
  });

  it("builds the map link from the id, escaped", () => {
    expect(placeHref("f1")).toBe("/?place=f1");
    expect(placeHref("a b&c")).toBe("/?place=a%20b%26c");
  });
});
