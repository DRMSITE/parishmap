import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPopup } from "../src/map/markers.js";
import {
  loadProjectsQuietly,
  NO_PROJECTS,
  projectsForFeature,
} from "../src/projects/links.js";
import { buildProjectLinks } from "../src/projects/places.js";
import { render } from "../src/views/list.view.js";

/** @param {string} id @param {string} title @param {string[]} featureIds */
const project = (id, title, featureIds = []) =>
  /** @type {any} */ ({ id, title, featureIds });

/** @param {string} projectId @param {string[]} featureIds */
const action = (projectId, featureIds) =>
  /** @type {any} */ ({ id: `a-${projectId}`, projectId, featureIds });

describe("which projects concern a place", () => {
  const data = {
    projects: [
      project("p3", "Zebra crossing", ["f1"]),
      project("p1", "Allotments", ["f1", "f2"]),
      project("p2", "Footpaths", []),
      project("p4", "Unrelated", ["f9"]),
    ],
    actions: [action("p2", ["f1"]), action("p4", [])],
    notes: [],
  };

  it("includes projects linked directly or through one of their actions, by title", () => {
    expect(projectsForFeature(data, "f1").map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("lists a project once, even if both it and its actions link to the place", () => {
    const both = {
      projects: [project("p1", "Allotments", ["f1"])],
      actions: [action("p1", ["f1"]), { ...action("p1", ["f1"]), id: "again" }],
      notes: [],
    };
    expect(projectsForFeature(both, "f1")).toHaveLength(1);
  });

  it("finds none for a place nothing links to, and does not change its input", () => {
    const before = JSON.stringify(data);
    expect(projectsForFeature(data, "nowhere")).toEqual([]);
    projectsForFeature(data, "f1");
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("loading projects quietly", () => {
  it("gives nothing when projects are unavailable", async () => {
    expect(await loadProjectsQuietly(/** @type {any} */ ({}))).toBe(
      NO_PROJECTS,
    );
    expect(
      await loadProjectsQuietly(
        /** @type {any} */ ({ projects: { available: () => false } }),
      ),
    ).toBe(NO_PROJECTS);
  });

  it("gives what was loaded", async () => {
    const loaded = { projects: [project("p1", "A")], actions: [], notes: [] };
    const ctx = /** @type {any} */ ({
      projects: { available: () => true, load: async () => loaded },
    });
    expect(await loadProjectsQuietly(ctx)).toBe(loaded);
  });

  it("gives nothing, rather than failing, when they cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = /** @type {any} */ ({
      projects: {
        available: () => true,
        load: async () => {
          throw new Error("denied");
        },
      },
    });
    expect(await loadProjectsQuietly(ctx)).toBe(NO_PROJECTS);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("project links", () => {
  it("names each project as a link to its page", () => {
    const p = buildProjectLinks(
      [
        { id: "p1", title: "Allotments" },
        { id: "p 2", title: "Footpaths" },
      ],
      "project-meta",
    );
    expect(p?.className).toBe("project-meta");
    expect(p?.textContent).toBe("Projects: Allotments, Footpaths");
    expect(
      [...(p?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href")),
    ).toEqual(["/projects?p=p1", "/projects?p=p%202"]);
  });

  it("says Project for one, nothing for none, and never parses a title as HTML", () => {
    expect(buildProjectLinks([{ id: "p1", title: "A" }])?.textContent).toBe(
      "Project: A",
    );
    expect(buildProjectLinks([])).toBeNull();
    const tricky = buildProjectLinks([{ id: "x", title: "<b>bold</b>" }]);
    expect(tricky?.querySelector("b")).toBeNull();
    expect(tricky?.querySelector("a")?.textContent).toBe("<b>bold</b>");
  });
});

describe("the map popup", () => {
  const record = /** @type {any} */ ({
    id: "f1",
    lat: 52.39,
    lng: 0.21,
    data: { title: "Old oak" },
  });

  it("shows the extra line above the buttons, built each time it opens", () => {
    let projects = [{ id: "p1", title: "Allotments" }];
    const actions = {
      extra: () => buildProjectLinks(projects),
      edit: () => {},
    };
    const first = buildPopup(record, actions);
    const kids = [...first.children].map((c) => c.className || c.tagName);
    expect(first.textContent).toContain("Project: Allotments");
    expect(kids.indexOf("P")).toBeLessThan(kids.indexOf("point-actions"));

    projects = [];
    expect(buildPopup(record, actions).textContent).not.toContain("Project");
  });

  it("is unchanged when there is no extra", () => {
    expect(buildPopup(record, {}).querySelectorAll("p")).toHaveLength(0);
  });
});

describe("the Points page", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  /** @param {Record<string, any> | undefined} projects */
  async function pageWith(projects) {
    const features = [
      {
        id: "f1",
        lat: 52.39,
        lng: 0.21,
        data: { title: "Old oak" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "f2",
        lat: 52.4,
        lng: 0.22,
        data: { title: "Bench" },
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const cleanup = render(
      container,
      /** @type {any} */ ({
        data: { list: async () => features },
        guard: { can: () => false },
        projects,
      }),
    );
    for (let i = 0; i < 50 && !container.querySelector("li"); i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    return { container, cleanup };
  }

  it("shows, under each point, the projects that concern it", async () => {
    const data = {
      projects: [project("p1", "Allotments", ["f1"])],
      actions: [],
      notes: [],
    };
    const { container } = await pageWith({
      available: () => true,
      load: async () => data,
      subscribe: () => () => {},
    });
    const [oak, bench] = [...container.querySelectorAll("li.point-item")];
    expect(oak.textContent).toContain("Project: Allotments");
    expect(oak.querySelector("a")?.getAttribute("href")).toBe("/projects?p=p1");
    expect(bench.textContent).not.toContain("Project");
  });

  it("works as before when projects are not available", async () => {
    const { container } = await pageWith(undefined);
    expect(container.querySelectorAll("li.point-item")).toHaveLength(2);
    expect(container.textContent).not.toContain("Project");
  });

  it("stops listening to projects when the page is left", async () => {
    const unsubscribe = vi.fn();
    const { cleanup } = await pageWith({
      available: () => true,
      load: async () => NO_PROJECTS,
      subscribe: () => unsubscribe,
    });
    /** @type {() => void} */ (cleanup)();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
