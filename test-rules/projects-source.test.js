import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createFirestoreProjects } from "../src/data/firestore-projects.js";
import { createTestEnv, userContext } from "./helpers.js";

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
  for (const store of opened) store.close();
  opened = [];
});

/**
 * A store for a user with the given role, as the app would build it.
 * @param {string} uid
 * @param {string} role
 */
function storeFor(uid, role) {
  const context = userContext(env, uid, { role });
  const store = createFirestoreProjects({
    db: /** @type {any} */ (context.firestore()),
    getUser: () => ({ uid, email: `${uid}@example.org` }),
  });
  opened.push(store);
  return store;
}

const projectInput = (/** @type {object} */ more = {}) => ({
  title: "Village green",
  summary: "Refresh the green",
  status: /** @type {const} */ ("planning"),
  parentId: null,
  responsibleUid: "lead",
  responsibleEmail: "lead@example.org",
  featureIds: ["f1"],
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

describe("projects", () => {
  it("lets the clerk create one, which every role then sees with its stamps", async () => {
    const made = await storeFor("boss", "clerk").createProject(projectInput());
    expect(made).toMatchObject({ createdBy: "boss", updatedBy: "boss" });

    for (const role of ["admin", "councillor", "member"]) {
      const { projects } = await storeFor("u1", role).load();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        id: made.id,
        title: "Village green",
        parentId: null,
        responsibleUid: "lead",
        featureIds: ["f1"],
        createdBy: "boss",
        createdByEmail: "boss@example.org",
      });
      expect(projects[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("refuses a councillor creating a top-level project, in words", async () => {
    await expect(
      storeFor("u1", "councillor").createProject(projectInput()),
    ).rejects.toThrow("You do not have permission to do that.");
  });

  it("lets the responsible councillor edit it and add a sub-project", async () => {
    const top = await storeFor("boss", "clerk").createProject(projectInput());
    const lead = storeFor("lead", "councillor");
    const edited = await lead.updateProject(top.id, {
      title: "Renamed",
      status: "active",
      featureIds: [],
    });
    expect(edited.title).toBe("Renamed");

    const sub = await lead.createProject(
      projectInput({ parentId: top.id, title: "Benches" }),
    );
    const { projects } = await lead.load();
    expect(projects.map((p) => p.id).sort()).toEqual([top.id, sub.id].sort());
    expect(projects.find((p) => p.id === top.id)).toMatchObject({
      title: "Renamed",
      updatedBy: "lead",
      createdBy: "boss",
    });
  });

  it("refuses another councillor editing it, and the lead handing it over", async () => {
    const top = await storeFor("boss", "clerk").createProject(projectInput());
    await expect(
      storeFor("other", "councillor").updateProject(top.id, { title: "No" }),
    ).rejects.toThrow("permission");
    await expect(
      storeFor("lead", "councillor").updateProject(top.id, {
        responsibleUid: "other",
        responsibleEmail: "other@example.org",
      }),
    ).rejects.toThrow("permission");
    await storeFor("boss", "clerk").updateProject(top.id, {
      responsibleUid: "other",
      responsibleEmail: "other@example.org",
    });
  });

  it("deletes a project with everything beneath it, for the clerk only", async () => {
    const clerk = storeFor("boss", "clerk");
    const top = await clerk.createProject(projectInput());
    const sub = await storeFor("lead", "councillor").createProject(
      projectInput({ parentId: top.id }),
    );
    await clerk.createAction(actionInput(top.id));
    await clerk.createAction(actionInput(sub.id));
    await clerk.createNote({ projectId: sub.id, body: "Note" });
    const keep = await clerk.createProject(projectInput({ title: "Keep" }));
    await clerk.createAction(actionInput(keep.id));

    await expect(
      storeFor("lead", "councillor").removeProject(top.id),
    ).rejects.toThrow("permission");

    await clerk.removeProject(top.id);
    const left = await storeFor("u1", "member").load();
    expect(left.projects.map((p) => p.id)).toEqual([keep.id]);
    expect(left.actions).toHaveLength(1);
    expect(left.notes).toEqual([]);
  });
});

describe("actions", () => {
  /** @type {string} */
  let projectId;
  beforeEach(async () => {
    projectId = (await storeFor("boss", "clerk").createProject(projectInput()))
      .id;
  });

  it("lets any councillor contribute an idea, with an assignee and date", async () => {
    const made = await storeFor("author", "councillor").createAction(
      actionInput(projectId, {
        assigneeUid: "other",
        assigneeEmail: "other@example.org",
        dueDate: "2026-12-01",
      }),
    );
    const { actions } = await storeFor("u1", "member").load();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: made.id,
      lane: "ideas",
      createdBy: "author",
      assigneeUid: "other",
      dueDate: "2026-12-01",
    });
  });

  it("refuses a members, and a councillor starting outside the Ideas lane", async () => {
    await expect(
      storeFor("m", "member").createAction(actionInput(projectId)),
    ).rejects.toThrow("permission");
    await expect(
      storeFor("author", "councillor").createAction(
        actionInput(projectId, { lane: "agreed" }),
      ),
    ).rejects.toThrow("permission");
  });

  it("lets only the responsible councillor, the clerk or an admin move a card", async () => {
    const author = storeFor("author", "councillor");
    const made = await author.createAction(actionInput(projectId));

    await expect(
      author.updateAction(made.id, { lane: "agreed", order: 2 }),
    ).rejects.toThrow("permission");
    await expect(
      storeFor("other", "councillor").updateAction(made.id, { lane: "agreed" }),
    ).rejects.toThrow("permission");

    for (const [uid, role, lane] of [
      ["lead", "councillor", "agreed"],
      ["boss", "clerk", "in-progress"],
      ["root", "admin", "done"],
    ]) {
      const moved = await storeFor(uid, role).updateAction(made.id, {
        lane,
        order: 3,
      });
      expect(moved.lane).toBe(lane);
    }
    const [stored] = (await storeFor("u1", "member").load()).actions;
    expect(stored).toMatchObject({
      lane: "done",
      order: 3,
      createdBy: "author",
      updatedBy: "root",
    });
  });

  it("lets the author edit the text, then clear the assignee and date", async () => {
    const author = storeFor("author", "councillor");
    const made = await author.createAction(
      actionInput(projectId, {
        assigneeUid: "other",
        assigneeEmail: "other@example.org",
        dueDate: "2026-12-01",
      }),
    );
    await author.updateAction(made.id, { title: "Edited", details: "More" });
    await author.updateAction(made.id, {
      assigneeUid: undefined,
      assigneeEmail: undefined,
      dueDate: undefined,
    });
    const [stored] = (await storeFor("u1", "member").load()).actions;
    expect(stored).toMatchObject({ title: "Edited", details: "More" });
    expect(stored).not.toHaveProperty("assigneeUid");
    expect(stored).not.toHaveProperty("assigneeEmail");
    expect(stored).not.toHaveProperty("dueDate");
  });

  it("lets the author, the lead and the clerk delete, and no one else", async () => {
    const author = storeFor("author", "councillor");
    const made = await author.createAction(actionInput(projectId));
    await expect(
      storeFor("other", "councillor").removeAction(made.id),
    ).rejects.toThrow("permission");
    await storeFor("lead", "councillor").removeAction(made.id);
    // A fresh store, since the author's own listener may not have caught up yet.
    expect((await storeFor("u1", "member").load()).actions).toEqual([]);
  });

  it("puts equal positions in the same order for everyone", async () => {
    const author = storeFor("author", "councillor");
    await author.createAction(actionInput(projectId, { title: "first" }));
    await author.createAction(actionInput(projectId, { title: "second" }));
    const seenBy = async (/** @type {string} */ uid) =>
      (await storeFor(uid, "member").load()).actions.map((a) => a.id);
    const one = await seenBy("m1");
    expect(one).toHaveLength(2);
    expect(await seenBy("m2")).toEqual(one);
  });
});

describe("notes", () => {
  /** @type {string} */
  let projectId;
  beforeEach(async () => {
    projectId = (await storeFor("boss", "clerk").createProject(projectInput()))
      .id;
  });

  it("lets a councillor add, edit and delete their own", async () => {
    const author = storeFor("author", "councillor");
    const made = await author.createNote({ projectId, body: "  First  " });
    await author.updateNote(made.id, { body: "Edited" });
    const [stored] = (await storeFor("u1", "member").load()).notes;
    expect(stored).toMatchObject({ body: "Edited", createdBy: "author" });
    await author.removeNote(made.id);
    expect((await author.load()).notes).toEqual([]);
  });

  it("refuses a member, and another councillor changing it, but not the clerk", async () => {
    const author = storeFor("author", "councillor");
    const made = await author.createNote({ projectId, body: "Mine" });
    await expect(
      storeFor("m", "member").createNote({ projectId, body: "x" }),
    ).rejects.toThrow("permission");
    await expect(
      storeFor("lead", "councillor").updateNote(made.id, { body: "No" }),
    ).rejects.toThrow("permission");
    await storeFor("boss", "clerk").updateNote(made.id, { body: "Tidied" });
  });

  it("keeps a note on an action", async () => {
    const author = storeFor("author", "councillor");
    const action = await author.createAction(actionInput(projectId));
    await author.createNote({
      projectId,
      actionId: action.id,
      body: "Quote in",
    });
    const [stored] = (await author.load()).notes;
    expect(stored.actionId).toBe(action.id);
  });
});

describe("live updates", () => {
  it("tells a listener when someone else changes something", async () => {
    const watcher = storeFor("u1", "member");
    await watcher.load();
    let calls = 0;
    watcher.subscribe(() => calls++);

    await storeFor("boss", "clerk").createProject(projectInput());
    await expect.poll(() => calls, { timeout: 5000 }).toBeGreaterThan(0);
    expect((await watcher.load()).projects).toHaveLength(1);
  });
});
