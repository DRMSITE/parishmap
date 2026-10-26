import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectGuard,
  guardProjects,
} from "../src/auth/project-guard.js";
import { createLocalProjects } from "../src/data/local-projects.js";
import { buildBoard, movedMessage } from "../src/projects/board.js";
import { formatDueDate, isOverdue, today } from "../src/projects/format.js";
import {
  endOfLane,
  orderAfterShift,
  orderAtIndex,
  projectHref,
} from "../src/projects/model.js";
import { render } from "../src/views/projects.view.js";

beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, "", "/projects?p=p-green");
});

/** @param {string} id @param {string} lane @param {number} order */
const action = (id, lane, order) =>
  /** @type {any} */ ({
    id,
    lane,
    order,
    title: `Action ${id}`,
    details: "",
    createdBy: "author",
    createdAt: `2026-01-0${order}`,
    featureIds: [],
  });

describe("ordering cards", () => {
  const lane = [
    action("a", "agreed", 1),
    action("b", "agreed", 2),
    action("c", "agreed", 3),
  ];

  it("puts a card at the end of a lane, or alone in an empty one", () => {
    expect(endOfLane([...lane, action("x", "done", 9)], "agreed")).toBe(4);
    expect(endOfLane(lane, "blocked")).toBe(1);
  });

  it("puts a dropped card between its neighbours", () => {
    expect(orderAtIndex(lane, 0)).toBe(0);
    expect(orderAtIndex(lane, 1)).toBe(1.5);
    expect(orderAtIndex(lane, 3)).toBe(4);
    expect(orderAtIndex([], 0)).toBe(1);
  });

  it("moves a card one place up or down, and refuses at the ends", () => {
    expect(orderAfterShift(lane, "c", -1)).toBe(1.5);
    expect(orderAfterShift(lane, "a", 1)).toBe(2.5);
    expect(orderAfterShift(lane, "b", 1)).toBe(4);
    expect(orderAfterShift(lane, "a", -1)).toBeNull();
    expect(orderAfterShift(lane, "c", 1)).toBeNull();
    expect(orderAfterShift(lane, "missing", 1)).toBeNull();
  });

  it("sorts the lane the way the order says after a shift", () => {
    const order = orderAfterShift(lane, "c", -1);
    const sorted = [...lane.slice(0, 2), { ...lane[2], order }].sort(
      (x, y) => x.order - y.order,
    );
    expect(sorted.map((a) => a.id)).toEqual(["a", "c", "b"]);
  });
});

describe("showing dates", () => {
  it("writes a due date as a calendar date whatever the time zone", () => {
    expect(formatDueDate("2026-12-01")).toBe("1 Dec 2026");
    expect(formatDueDate("2027-01-31")).toBe("31 Jan 2027");
  });

  it("uses the viewer's own calendar for today", () => {
    expect(today(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(today(new Date(2026, 0, 31, 0, 0))).toBe("2026-01-31");
  });

  it("calls an action late only if it has a past date and is not done", () => {
    expect(
      isOverdue({ dueDate: "2026-10-01", lane: "agreed" }, "2026-10-02"),
    ).toBe(true);
    expect(
      isOverdue({ dueDate: "2026-10-02", lane: "agreed" }, "2026-10-02"),
    ).toBe(false);
    expect(
      isOverdue({ dueDate: "2026-10-01", lane: "done" }, "2026-10-02"),
    ).toBe(false);
    expect(isOverdue({ lane: "agreed" }, "2026-10-02")).toBe(false);
  });

  it("names a project's page in the query string", () => {
    expect(projectHref("p-green")).toBe("/projects?p=p-green");
    expect(projectHref("a b&c")).toBe("/projects?p=a%20b%26c");
  });

  it("says what happened to a card", () => {
    expect(movedMessage("Quote", "blocked", "move")).toBe(
      "Moved “Quote” to Blocked.",
    );
    expect(movedMessage("Quote", "agreed", "drag")).toBe(
      "Moved “Quote” to Agreed.",
    );
    expect(movedMessage("Quote", "agreed", "up")).toBe(
      "Moved “Quote” up in Agreed.",
    );
  });
});

describe("the board", () => {
  const project = /** @type {any} */ ({ id: "p1", responsibleUid: "lead" });
  const actions = [
    action("a", "ideas", 1),
    action("b", "agreed", 1),
    action("c", "agreed", 2),
  ];

  /** @param {string} role @param {string} uid */
  function boardFor(role, uid) {
    const can = createProjectGuard(
      () =>
        /** @type {any} */ ({
          status: "ready",
          role,
          user: { uid, email: `${uid}@x.org` },
        }),
    );
    const handlers = { move: vi.fn(), edit: vi.fn(), remove: vi.fn() };
    return { board: buildBoard(actions, { project, can, handlers }), handlers };
  }

  /** @param {HTMLElement} board @param {string} id */
  const controls = (board, id) =>
    [
      ...(board
        .querySelector(`li[data-id="${id}"]`)
        ?.querySelectorAll("[data-control]") ?? []),
    ].map((c) => c.getAttribute("data-control"));

  it("has a list for each lane, with a count, in order", () => {
    const { board } = boardFor("member", "m");
    expect([...board.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(
      ["Ideas (1)", "Agreed (2)", "In progress (0)", "Blocked (0)", "Done (0)"],
    );
    expect(board.querySelectorAll("section[aria-labelledby]")).toHaveLength(5);
    expect(board.querySelectorAll(".lane-empty")).toHaveLength(3);
  });

  it("gives the responsible councillor every control, and makes cards draggable", () => {
    const { board } = boardFor("councillor", "lead");
    expect(controls(board, "b")).toEqual(["move", "down", "edit", "remove"]);
    expect(controls(board, "c")).toEqual(["move", "up", "edit", "remove"]);
    expect(controls(board, "a")).toEqual(["move", "edit", "remove"]);
    expect(
      board.querySelector('li[data-id="a"]')?.getAttribute("draggable"),
    ).toBe("true");
  });

  it("gives a contributor Edit and Delete on their own card only, and no way to move it", () => {
    const { board } = boardFor("councillor", "author");
    expect(controls(board, "a")).toEqual(["edit", "remove"]);
    expect(board.querySelector("select")).toBeNull();
    expect(board.querySelector('[draggable="true"]')).toBeNull();

    const other = boardFor("councillor", "someone").board;
    expect(other.querySelectorAll("[data-control]")).toHaveLength(0);
  });

  it("gives a member nothing to change", () => {
    const { board } = boardFor("member", "m");
    expect(board.querySelectorAll("[data-control]")).toHaveLength(0);
    expect(board.querySelectorAll("li.action-card")).toHaveLength(3);
  });

  it("names the Move list for the card, to a screen reader", () => {
    const { board } = boardFor("admin", "boss");
    const label = board.querySelector('li[data-id="a"] label .field-label');
    expect(label?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Move Action a to",
    );
    expect(label?.querySelector(".visually-hidden")?.textContent?.trim()).toBe(
      "Action a",
    );
  });

  it("moves a card to the end of the lane chosen", () => {
    const { board, handlers } = boardFor("admin", "boss");
    const select = /** @type {HTMLSelectElement} */ (
      board.querySelector('li[data-id="a"] select')
    );
    expect(select.value).toBe("ideas");
    select.value = "agreed";
    select.dispatchEvent(new Event("change"));
    expect(handlers.move).toHaveBeenCalledWith(actions[0], "agreed", 3, "move");

    select.value = "ideas"; // chosen back to where it is: nothing to do
    handlers.move.mockClear();
    select.dispatchEvent(new Event("change"));
    expect(handlers.move).not.toHaveBeenCalled();
  });

  it("moves a card up or down within its lane", () => {
    const { board, handlers } = boardFor("admin", "boss");
    board
      .querySelector('li[data-id="c"] [data-control="up"]')
      ?.dispatchEvent(new Event("click"));
    expect(handlers.move).toHaveBeenCalledWith(actions[2], "agreed", 0, "up");
    board
      .querySelector('li[data-id="b"] [data-control="down"]')
      ?.dispatchEvent(new Event("click"));
    expect(handlers.move).toHaveBeenCalledWith(actions[1], "agreed", 3, "down");
  });

  it("passes the card to edit and delete", () => {
    const { board, handlers } = boardFor("admin", "boss");
    board
      .querySelector('li[data-id="b"] [data-control="edit"]')
      ?.dispatchEvent(new Event("click"));
    board
      .querySelector('li[data-id="b"] [data-control="remove"]')
      ?.dispatchEvent(new Event("click"));
    expect(handlers.edit).toHaveBeenCalledWith(actions[1]);
    expect(handlers.remove).toHaveBeenCalledWith(actions[1]);
  });

  it("shows who an action is for, when it is due, and never parses content as HTML", () => {
    const tricky = {
      ...action("t", "agreed", 5),
      title: "<img src=x onerror=alert(1)>",
      details: "<b>bold</b>",
      assigneeEmail: "alex@example.org",
      dueDate: "2020-01-01",
    };
    const { board } = boardFor("member", "m");
    const can = createProjectGuard(
      () =>
        /** @type {any} */ ({
          status: "ready",
          role: "member",
          user: { uid: "m", email: "m@x" },
        }),
    );
    const built = buildBoard([tricky], {
      project,
      can,
      handlers: /** @type {any} */ ({}),
    });
    expect(built.querySelector("img")).toBeNull();
    expect(built.querySelector(".action-title")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(built.querySelector(".action-meta")?.textContent).toBe(
      "For: alex@example.org. Due: 1 Jan 2020 (overdue)",
    );
    expect(built.querySelector(".action-details")?.textContent).toBe(
      "<b>bold</b>",
    );
    expect(board).toBeTruthy();
  });
});

/**
 * Render the project page for a person with a role, on the example data: "Village green
 * refresh" led by alex, with three actions and one note by alex.
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
  // The map features a project can link to: an oak (a point) and a field (an area).
  const features = [
    {
      id: "f-oak",
      lat: 52.39,
      lng: 0.21,
      data: { title: "Old oak" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const data = { list: async () => features, subscribe: () => () => {} };
  const cleanup = await render(
    container,
    /** @type {any} */ ({ projects, data, people: { uid: () => uid } }),
  );
  for (
    let i = 0;
    i < 50 && container.querySelector("[data-sections][hidden]");
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  return { container, store, cleanup: /** @type {() => void} */ (cleanup) };
}

const text = (/** @type {HTMLElement} */ c, /** @type {string} */ s) =>
  c.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim();

describe("the project page", () => {
  it("is shown for /projects?p=<id>, with breadcrumbs, details and the lanes", async () => {
    const { container } = await pageFor("admin", "me");
    expect(text(container, "h1")).toBe("Village green refresh");
    expect(text(container, "[data-meta]")).toContain(
      "Status: Active. Responsible: alex@example.org.",
    );
    expect(
      [...container.querySelectorAll(".crumbs li")].map((li) => li.textContent),
    ).toEqual(["Projects", "Village green refresh"]);
    expect(
      container.querySelector('.crumbs [aria-current="page"]')?.textContent,
    ).toBe("Village green refresh");
    expect(container.querySelectorAll(".lane")).toHaveLength(5);
    expect(container.querySelectorAll("li.action-card")).toHaveLength(3);
    expect(text(container, "[data-subs] a")).toBe("New benches");
  });

  it("names the places a project and its actions are linked to", async () => {
    const { container, store } = await pageFor("admin", "me");
    const [first] = (await store.load()).actions;
    await store.updateProject("p-green", { featureIds: ["f-oak", "gone"] });
    await store.updateAction(first.id, { featureIds: ["f-oak"] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const places = container.querySelector("[data-places] p");
    expect(places?.textContent).toBe(
      "Places: Old oak, a place that has been removed from the map",
    );
    expect(places?.querySelector("a")?.getAttribute("href")).toBe(
      "/?place=f-oak",
    );
    const card = container.querySelector(
      `li.action-card[data-id="${first.id}"]`,
    );
    expect(card?.textContent).toContain("Place: Old oak");
    expect(card?.querySelector("a")?.getAttribute("href")).toBe(
      "/?place=f-oak",
    );
  });

  it("shows no places line when nothing is linked", async () => {
    const { container } = await pageFor("admin", "me");
    expect(container.querySelector("[data-places]")?.childElementCount).toBe(0);
  });

  it("shows a sub-project with a trail back through its parent", async () => {
    history.replaceState({}, "", "/projects?p=p-benches");
    const { container } = await pageFor("admin", "me");
    expect(text(container, "h1")).toBe("New benches");
    expect(
      [...container.querySelectorAll(".crumbs li")].map((li) => li.textContent),
    ).toEqual(["Projects", "Village green refresh", "New benches"]);
    expect(
      container.querySelector(".crumbs a[href='/projects?p=p-green']"),
    ).not.toBeNull();
    expect(text(container, "[data-subs]")).toBe("No sub-projects.");
  });

  it("says so when the project does not exist", async () => {
    history.replaceState({}, "", "/projects?p=nope");
    const { container } = await pageFor("admin", "me");
    expect(
      container.querySelector("[data-missing]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      container.querySelector("[data-sections]")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(text(container, "h1")).toBe("Project not found");
  });

  it("lists the notes, newest first, saying what each is about", async () => {
    const { container, store } = await pageFor("admin", "me");
    const action = (await store.load()).actions[0];
    await store.createNote({
      projectId: "p-green",
      actionId: action.id,
      body: "Quote chased",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const notes = [...container.querySelectorAll(".note-item")];
    expect(notes).toHaveLength(2);
    expect(notes[0].querySelector(".note-body")?.textContent).toBe(
      "Quote chased",
    );
    expect(notes[0].textContent).toContain(`About the action: ${action.title}`);
    expect(notes[1].querySelector(".note-body")?.textContent).toBe(
      "Discussed at the October meeting; no objections.",
    );
  });

  it("offers the responsible councillor everything on their project", async () => {
    const { container } = await pageFor("councillor", "alex");
    const buttons = [
      ...container.querySelectorAll("[data-project-actions] [data-action]"),
    ].map((b) => b.getAttribute("data-action"));
    expect(buttons).toEqual(["edit", "add-sub"]);
    expect(
      container.querySelector("[data-add-action]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      container.querySelector("[data-add-note]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      container.querySelectorAll("select[data-control='move']"),
    ).toHaveLength(3);
  });

  it("lets another councillor contribute but not run the project or move cards", async () => {
    const { container, store } = await pageFor("councillor", "bo");
    expect(
      container.querySelectorAll("[data-project-actions] [data-action]"),
    ).toHaveLength(0);
    expect(
      container.querySelector("[data-add-action]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      container.querySelector("[data-add-note]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(container.querySelectorAll("[data-control]")).toHaveLength(0);
    // Someone else's note has no buttons either.
    expect(
      container.querySelectorAll(".note-item .point-actions"),
    ).toHaveLength(0);

    await store.createAction({
      projectId: "p-green",
      title: "Bo's idea",
      details: "",
      lane: "ideas",
      order: 5,
      featureIds: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Their own idea can be edited or deleted, but still not moved.
    const mine = [...container.querySelectorAll("li.action-card")].find(
      (card) =>
        card.querySelector(".action-title")?.textContent === "Bo's idea",
    );
    expect(mine).toBeDefined();
    expect(
      [...(mine?.querySelectorAll("[data-control]") ?? [])].map((c) =>
        c.getAttribute("data-control"),
      ),
    ).toEqual(["edit", "remove"]);
    expect(container.querySelectorAll("[data-control='move']")).toHaveLength(0);
  });

  it("offers a member nothing to add or change", async () => {
    const { container } = await pageFor("member", "mo");
    expect(
      container.querySelector("[data-add-action]")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      container.querySelector("[data-add-note]")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      container.querySelectorAll(
        "[data-control], [data-project-actions] [data-action], .note-item [data-action]",
      ),
    ).toHaveLength(0);
    expect(container.querySelectorAll("li.action-card")).toHaveLength(3);
  });

  it("stops listening when the page is left", async () => {
    const { container, store, cleanup } = await pageFor("admin", "me");
    cleanup();
    await store.createNote({ projectId: "p-green", body: "Later" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container.querySelectorAll(".note-item")).toHaveLength(1);
  });
});
