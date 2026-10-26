import { beforeEach, describe, expect, it } from "vitest";
import {
  createProjectGuard,
  guardProjects,
} from "../src/auth/project-guard.js";
import { config } from "../src/config.js";
import { createLocalProjects } from "../src/data/local-projects.js";
import { buildTree } from "../src/projects/tree.js";
import { responsibleChoices } from "../src/ui/project-dialog.js";
import { render } from "../src/views/projects.view.js";

beforeEach(() => localStorage.clear());

/**
 * Render the page for a person with a role, on the example data (a "Village green
 * refresh" led by alex, with a "New benches" sub-project).
 * @param {string} role
 * @param {string} uid
 */
async function pageFor(role, uid) {
  const user = { uid, email: `${uid}@example.org` };
  const store = createLocalProjects({ user });
  const guard = createProjectGuard(
    () => /** @type {any} */ ({ status: "ready", role, user }),
  );
  const projects = {
    available: () => true,
    can: guard,
    directory: async () => [],
    ...guardProjects(store, guard),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const ctx = /** @type {any} */ ({ projects, people: { uid: () => uid } });
  const cleanup = render(container, ctx);
  await expectItems(container);
  return { container, store, cleanup };
}

/** @param {HTMLElement} container */
async function expectItems(container) {
  for (let i = 0; i < 50 && !container.querySelector("li"); i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(container.querySelector("li")).not.toBeNull();
}

/**
 * The buttons on one project, as "verb" values.
 * @param {HTMLElement} container
 * @param {string} id
 */
const buttons = (container, id) =>
  [
    ...(
      container
        .querySelector(`li[data-id="${id}"]`)
        ?.querySelector(":scope > .point-actions") ??
      document.createElement("div")
    ).querySelectorAll("[data-action]"),
  ].map((b) => b.getAttribute("data-action"));

describe("the Projects page", () => {
  it("shows projects nested, with status, responsible person and open actions", async () => {
    const { container } = await pageFor("admin", "me");
    const green = container.querySelector('li[data-id="p-green"]');
    const benches = green?.querySelector('li[data-id="p-benches"]');
    expect(green?.querySelector(":scope > h2")?.textContent).toBe(
      "Village green refresh",
    );
    expect(benches?.querySelector(":scope > h3")?.textContent).toBe(
      "New benches",
    );
    expect(green?.querySelector(":scope > .project-meta")?.textContent).toBe(
      "Status: Active. Responsible: alex@example.org. 3 open actions",
    );
    expect(
      benches?.querySelector(":scope > .project-meta")?.textContent,
    ).toContain("No open actions");
    expect(container.querySelector("[data-status]")?.textContent).toBe(
      "2 projects.",
    );
  });

  it("marks the signed-in person as responsible", async () => {
    const { container } = await pageFor("councillor", "alex");
    expect(container.querySelector(".project-meta")?.textContent).toContain(
      "alex@example.org (you)",
    );
  });

  it("offers an administrator everything", async () => {
    const { container } = await pageFor("admin", "me");
    expect(container.querySelector("[data-new]")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(buttons(container, "p-green")).toEqual([
      "edit",
      "add-sub",
      "remove",
    ]);
    expect(buttons(container, "p-benches")).toEqual([
      "edit",
      "add-sub",
      "remove",
    ]);
  });

  it("offers the responsible councillor their own projects, but not New project or Delete", async () => {
    const { container } = await pageFor("councillor", "alex");
    expect(container.querySelector("[data-new]")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(buttons(container, "p-green")).toEqual(["edit", "add-sub"]);
    expect(buttons(container, "p-benches")).toEqual(["edit", "add-sub"]);
  });

  it.each([
    ["another councillor", "councillor"],
    ["a member", "member"],
  ])("offers %s nothing to change", async (_who, role) => {
    const { container } = await pageFor(role, "someone");
    expect(container.querySelector("[data-new]")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(container.querySelectorAll(".point-actions")).toHaveLength(0);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("stops offering sub-projects at the deepest level", async () => {
    const { container, store } = await pageFor("admin", "me");
    let parentId = "p-benches";
    for (let depth = 3; depth <= config.limits.projectDepth; depth++) {
      parentId = (
        await store.createProject({
          title: `Level ${depth}`,
          summary: "",
          status: "planning",
          parentId,
          responsibleUid: "alex",
          responsibleEmail: "alex@example.org",
          featureIds: [],
        })
      ).id;
    }
    for (let i = 0; i < 50 && container.querySelectorAll("li").length < 3; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(buttons(container, parentId)).toEqual(["edit", "remove"]);
    expect(buttons(container, "p-benches")).toContain("add-sub");
  });

  it("shows a message instead when projects are not available", () => {
    const container = document.createElement("div");
    render(container, /** @type {any} */ ({}));
    expect(container.querySelector("h1")?.textContent).toBe("Projects");
    expect(container.textContent).toContain("not available");
  });

  it("stops listening when the page is left", async () => {
    const { container, store, cleanup } = await pageFor("admin", "me");
    /** @type {() => void} */ (cleanup)();
    await store.createProject({
      title: "Later",
      summary: "",
      status: "planning",
      parentId: null,
      responsibleUid: "alex",
      responsibleEmail: "alex@example.org",
      featureIds: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
});

describe("arranging projects in a tree", () => {
  /** @param {string} id @param {string | null} parentId @param {string} title */
  const project = (id, parentId, title) =>
    /** @type {any} */ ({ id, parentId, title });

  it("nests sub-projects and sorts siblings by title", () => {
    const tree = buildTree([
      project("c", "a", "Zebra path"),
      project("b", "a", "Apple tree"),
      project("a", null, "Green"),
      project("d", null, "Allotments"),
    ]);
    expect(tree.map((n) => n.project.id)).toEqual(["d", "a"]);
    expect(tree[1].children.map((n) => n.project.id)).toEqual(["b", "c"]);
    expect(tree[1].children[0].depth).toBe(2);
  });

  it("shows a project whose parent has gone at the top", () => {
    const tree = buildTree([project("x", "gone", "Orphan")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(1);
  });
});

describe("choosing who is responsible", () => {
  const people = [
    { uid: "b", email: "b@example.org" },
    { uid: "a", email: "a@example.org" },
  ];

  it("lists those the signed-in person may name, in email order", () => {
    expect(
      responsibleChoices({ directory: people, canName: () => true }).map(
        (p) => p.uid,
      ),
    ).toEqual(["a", "b"]);
    expect(
      responsibleChoices({
        directory: people,
        canName: (uid) => uid === "b",
      }).map((p) => p.uid),
    ).toEqual(["b"]);
  });

  it("always includes the current person, even if no longer in the directory", () => {
    const current = { uid: "gone", email: "gone@example.org" };
    expect(
      responsibleChoices({
        directory: people,
        canName: () => true,
        current,
      }).map((p) => p.uid),
    ).toEqual(["a", "b", "gone"]);
    expect(
      responsibleChoices({ directory: [], canName: () => false, current }),
    ).toEqual([current]);
  });

  it("does not list the current person twice", () => {
    expect(
      responsibleChoices({
        directory: people,
        canName: () => true,
        current: people[0],
      }),
    ).toHaveLength(2);
  });
});
