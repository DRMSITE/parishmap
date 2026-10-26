import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { createLocalProjects } from "../src/data/local-projects.js";

const KEY = `${config.storagePrefix}projects`;
const user = { uid: "me", email: "me@example.org" };

beforeEach(() => localStorage.clear());

/** A store that starts empty, so a test sees only what it makes. */
function emptyStore() {
  localStorage.setItem(
    KEY,
    JSON.stringify({ projects: [], actions: [], notes: [] }),
  );
  return createLocalProjects({ user });
}

const projectInput = (/** @type {object} */ more = {}) => ({
  title: "  Village green  ",
  summary: "",
  status: /** @type {const} */ ("planning"),
  parentId: null,
  responsibleUid: "alex",
  responsibleEmail: "alex@example.org",
  featureIds: [],
  ...more,
});

const actionInput = (/** @type {string} */ projectId, more = {}) => ({
  projectId,
  title: "Get a quote",
  details: "",
  lane: "ideas",
  order: 1,
  featureIds: [],
  ...more,
});

describe("a browser with nothing stored", () => {
  it("starts with a small example, and keeps it", async () => {
    const first = await createLocalProjects({ user }).load();
    expect(first.projects.length).toBeGreaterThan(0);
    expect(first.actions.length).toBeGreaterThan(0);
    expect(first.projects.some((p) => p.parentId)).toBe(true);
    const again = await createLocalProjects({ user }).load();
    expect(again.projects.map((p) => p.id)).toEqual(
      first.projects.map((p) => p.id),
    );
  });

  it("does not bring the example back once everything is deleted", async () => {
    const store = createLocalProjects({ user });
    for (const p of (await store.load()).projects.filter((p) => !p.parentId))
      await store.removeProject(p.id);
    expect((await createLocalProjects({ user }).load()).projects).toEqual([]);
  });
});

describe("projects", () => {
  it("creates one, trimmed and stamped with the writer", async () => {
    const store = emptyStore();
    const made = await store.createProject(projectInput());
    expect(made).toMatchObject({
      title: "Village green",
      parentId: null,
      createdBy: "me",
      createdByEmail: "me@example.org",
      updatedBy: "me",
    });
    expect((await store.load()).projects).toEqual([made]);
  });

  it("refuses a bad one with a readable message", async () => {
    const store = emptyStore();
    await expect(
      store.createProject(projectInput({ title: " " })),
    ).rejects.toThrow("Enter a title.");
    expect((await store.load()).projects).toEqual([]);
  });

  it("refuses nesting beyond the depth limit", async () => {
    const store = emptyStore();
    let parentId = null;
    for (let level = 1; level <= config.limits.projectDepth; level++) {
      parentId = (await store.createProject(projectInput({ parentId }))).id;
    }
    await expect(
      store.createProject(projectInput({ parentId })),
    ).rejects.toThrow(/levels deep/);
  });

  it("updates one, restamping the editor but not the author", async () => {
    const store = emptyStore();
    const made = await store.createProject(projectInput());
    const changed = await store.updateProject(made.id, {
      title: "Renamed",
      status: "active",
    });
    expect(changed).toMatchObject({
      title: "Renamed",
      status: "active",
      createdBy: made.createdBy,
      createdAt: made.createdAt,
      updatedBy: "me",
    });
    await expect(store.updateProject(made.id, { title: "" })).rejects.toThrow(
      "Enter a title.",
    );
    await expect(store.updateProject("gone", { title: "x" })).rejects.toThrow(
      /no longer exists/,
    );
  });

  it("removes a project with its sub-projects, actions and notes, and nothing else", async () => {
    const store = emptyStore();
    const top = await store.createProject(projectInput());
    const sub = await store.createProject(projectInput({ parentId: top.id }));
    const other = await store.createProject(projectInput({ title: "Other" }));
    await store.createAction(actionInput(top.id));
    await store.createAction(actionInput(sub.id));
    const kept = await store.createAction(actionInput(other.id));
    await store.createNote({ projectId: sub.id, body: "gone with it" });
    const keptNote = await store.createNote({
      projectId: other.id,
      body: "stays",
    });

    await store.removeProject(top.id);

    const left = await store.load();
    expect(left.projects.map((p) => p.id)).toEqual([other.id]);
    expect(left.actions.map((a) => a.id)).toEqual([kept.id]);
    expect(left.notes.map((n) => n.id)).toEqual([keptNote.id]);
  });
});

describe("actions", () => {
  it("creates, edits and moves one", async () => {
    const store = emptyStore();
    const project = await store.createProject(projectInput());
    const made = await store.createAction(actionInput(project.id));
    expect(made).toMatchObject({ lane: "ideas", createdBy: "me" });

    const moved = await store.updateAction(made.id, {
      lane: "in-progress",
      order: 2.5,
    });
    expect(moved).toMatchObject({ lane: "in-progress", order: 2.5 });
    expect((await store.load()).actions[0].lane).toBe("in-progress");
  });

  it("assigns and clears an assignee and due date", async () => {
    const store = emptyStore();
    const project = await store.createProject(projectInput());
    const made = await store.createAction(actionInput(project.id));
    const assigned = await store.updateAction(made.id, {
      assigneeUid: "alex",
      assigneeEmail: "alex@example.org",
      dueDate: "2026-12-01",
    });
    expect(assigned).toMatchObject({
      assigneeUid: "alex",
      dueDate: "2026-12-01",
    });

    const cleared = await store.updateAction(made.id, {
      assigneeUid: undefined,
      assigneeEmail: undefined,
      dueDate: undefined,
    });
    expect(cleared).not.toHaveProperty("assigneeUid");
    expect(cleared).not.toHaveProperty("dueDate");
    const [stored] = (await store.load()).actions;
    expect(stored).not.toHaveProperty("assigneeEmail");
  });

  it("refuses an action for a missing project, and a half-given assignee", async () => {
    const store = emptyStore();
    await expect(store.createAction(actionInput("gone"))).rejects.toThrow(
      /no longer exists/,
    );
    const project = await store.createProject(projectInput());
    await expect(
      store.createAction(actionInput(project.id, { assigneeUid: "alex" })),
    ).rejects.toThrow("Choose who the action is for.");
  });

  it("lists a lane in board order", async () => {
    const store = emptyStore();
    const project = await store.createProject(projectInput());
    await store.createAction(
      actionInput(project.id, { title: "second", order: 2 }),
    );
    await store.createAction(
      actionInput(project.id, { title: "first", order: 1 }),
    );
    expect((await store.load()).actions.map((a) => a.title)).toEqual([
      "first",
      "second",
    ]);
  });

  it("removes one", async () => {
    const store = emptyStore();
    const project = await store.createProject(projectInput());
    const made = await store.createAction(actionInput(project.id));
    await store.removeAction(made.id);
    await store.removeAction("never-existed");
    expect((await store.load()).actions).toEqual([]);
  });
});

describe("notes", () => {
  it("adds one to a project or to an action, edits and removes it", async () => {
    const store = emptyStore();
    const project = await store.createProject(projectInput());
    const action = await store.createAction(actionInput(project.id));
    const onProject = await store.createNote({
      projectId: project.id,
      body: "  Spoke to them ",
    });
    const onAction = await store.createNote({
      projectId: project.id,
      actionId: action.id,
      body: "Quote received",
    });
    expect(onProject.body).toBe("Spoke to them");
    expect(onProject).not.toHaveProperty("actionId");
    expect(onAction.actionId).toBe(action.id);

    const edited = await store.updateNote(onProject.id, { body: "Edited" });
    expect(edited.body).toBe("Edited");
    await expect(store.updateNote(onProject.id, { body: " " })).rejects.toThrow(
      "Write a note.",
    );

    await store.removeNote(onAction.id);
    expect((await store.load()).notes.map((n) => n.id)).toEqual([onProject.id]);
  });

  it("refuses a note on a missing project", async () => {
    await expect(
      emptyStore().createNote({ projectId: "gone", body: "x" }),
    ).rejects.toThrow(/no longer exists/);
  });
});

describe("shared storage", () => {
  it("tells subscribers about every change, until they unsubscribe", async () => {
    const store = emptyStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const made = await store.createProject(projectInput());
    await store.updateProject(made.id, { title: "Renamed" });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    await store.removeProject(made.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("sees what another tab wrote, and does not overwrite it", async () => {
    const mine = emptyStore();
    const theirs = createLocalProjects({ user });
    await theirs.createProject(projectInput({ title: "Theirs" }));
    await mine.createProject(projectInput({ title: "Mine" }));
    expect((await mine.load()).projects.map((p) => p.title).sort()).toEqual([
      "Mine",
      "Theirs",
    ]);
  });

  it("leaves out stored records that are not well-formed", async () => {
    const store = emptyStore();
    const good = await store.createProject(projectInput());
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    stored.projects.push({ id: "bad", title: "" }, "nonsense", null);
    stored.actions = "not a list";
    localStorage.setItem(KEY, JSON.stringify(stored));
    const loaded = await createLocalProjects({ user }).load();
    expect(loaded.projects.map((p) => p.id)).toEqual([good.id]);
    expect(loaded.actions).toEqual([]);
  });

  it("carries on in memory if storage is corrupt", async () => {
    localStorage.setItem(KEY, "{not json");
    const store = createLocalProjects({ user });
    const made = await store.createProject(projectInput());
    expect(made.title).toBe("Village green");
  });

  it("undoes a change if storage is full", async () => {
    const store = emptyStore();
    await store.createProject(projectInput({ title: "Kept" }));
    const full = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    await expect(
      store.createProject(projectInput({ title: "Lost" })),
    ).rejects.toThrow("Browser storage is full.");
    full.mockRestore();
    expect((await store.load()).projects.map((p) => p.title)).toEqual(["Kept"]);
  });
});
