import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../src/auth/guard.js";
import {
  createProjectGuard,
  guardProjects,
} from "../src/auth/project-guard.js";

/** @param {string | undefined} role @param {string} [uid] */
const guardFor = (role, uid = "u1") =>
  createProjectGuard(
    () =>
      /** @type {any} */ ({
        status: "ready",
        role,
        user: { uid, email: `${uid}@example.org` },
      }),
  );

// "lead" is responsible for the project; "author" wrote the action and note.
const project = /** @type {any} */ ({ id: "p1", responsibleUid: "lead" });
const action = /** @type {any} */ ({
  id: "a1",
  projectId: "p1",
  createdBy: "author",
  lane: "ideas",
  order: 1,
});
const note = /** @type {any} */ ({
  id: "n1",
  projectId: "p1",
  createdBy: "author",
});

describe("the project guard", () => {
  it.each(["admin", "clerk"])("lets a %s do everything", (role) => {
    const g = guardFor(role, "boss");
    expect(g.canCreateProject()).toBe(true);
    expect(g.canCreateProject(project)).toBe(true);
    expect(g.canEditProject(project)).toBe(true);
    expect(g.canReassignProject()).toBe(true);
    expect(g.canNameResponsible("anyone")).toBe(true);
    expect(g.canDeleteProject()).toBe(true);
    expect(g.canAddAction(project)).toBe(true);
    expect(g.canMoveActions(project)).toBe(true);
    expect(g.canEditAction(action, project)).toBe(true);
    expect(g.canDeleteAction(action, project)).toBe(true);
    expect(g.canAddNote()).toBe(true);
    expect(g.canEditNote(note)).toBe(true);
    expect(g.canDeleteNote(note)).toBe(true);
  });

  describe("the responsible councillor", () => {
    const g = guardFor("councillor", "lead");

    it("runs their own project", () => {
      expect(g.canEditProject(project)).toBe(true);
      expect(g.canMoveActions(project)).toBe(true);
      expect(g.canEditAction(action, project)).toBe(true);
      expect(g.canDeleteAction(action, project)).toBe(true);
    });

    it("may add a sub-project, but only responsible for it themselves", () => {
      expect(g.canCreateProject(project)).toBe(true);
      expect(g.canNameResponsible("lead")).toBe(true);
      expect(g.canNameResponsible("someone")).toBe(false);
    });

    it("cannot make a top-level project, reassign or delete", () => {
      expect(g.canCreateProject()).toBe(false);
      expect(g.canReassignProject()).toBe(false);
      expect(g.canDeleteProject()).toBe(false);
    });

    it("has no say over a project run by someone else", () => {
      const other = /** @type {any} */ ({ id: "p2", responsibleUid: "other" });
      expect(g.canEditProject(other)).toBe(false);
      expect(g.canMoveActions(other)).toBe(false);
      expect(g.canCreateProject(other)).toBe(false);
    });

    it("edits only their own notes", () => {
      expect(g.canEditNote(note)).toBe(false);
      expect(g.canEditNote({ ...note, createdBy: "lead" })).toBe(true);
    });
  });

  describe("another councillor", () => {
    const g = guardFor("councillor", "author");

    it("contributes actions and notes", () => {
      expect(g.canAddAction(project)).toBe(true);
      expect(g.canAddNote()).toBe(true);
    });

    it("edits and deletes their own contributions only", () => {
      expect(g.canEditAction(action, project)).toBe(true);
      expect(g.canDeleteAction(action, project)).toBe(true);
      expect(g.canEditAction({ ...action, createdBy: "x" }, project)).toBe(
        false,
      );
      expect(g.canEditNote(note)).toBe(true);
      expect(g.canDeleteNote({ ...note, createdBy: "x" })).toBe(false);
    });

    it("cannot move actions or touch the project", () => {
      expect(g.canMoveActions(project)).toBe(false);
      expect(g.canEditProject(project)).toBe(false);
      expect(g.canCreateProject()).toBe(false);
      expect(g.canCreateProject(project)).toBe(false);
    });
  });

  it("lets a member read only", () => {
    const g = guardFor("member", "author");
    expect(g.canCreateProject()).toBe(false);
    expect(g.canAddAction(project)).toBe(false);
    expect(g.canAddNote()).toBe(false);
    expect(g.canEditAction(action, project)).toBe(false);
    expect(g.canEditNote(note)).toBe(false);
    expect(g.canMoveActions(project)).toBe(false);
  });

  it.each([
    "loading",
    "signed-out",
    "second-factor",
    "verify-email",
    "no-access",
  ])("refuses everything while the status is %s", (status) => {
    const g = createProjectGuard(
      () =>
        /** @type {any} */ ({
          status,
          role: "admin",
          user: { uid: "boss", email: "boss@example.org" },
        }),
    );
    expect(g.canCreateProject()).toBe(false);
    expect(g.canEditProject(project)).toBe(false);
    expect(g.canAddAction(project)).toBe(false);
    expect(g.canAddNote()).toBe(false);
    expect(g.canDeleteProject()).toBe(false);
  });

  it("refuses a role it does not know", () => {
    expect(guardFor("superuser").canAddAction(project)).toBe(false);
  });
});

/** A store holding one project, action and note, recording each write. */
function fakeStore() {
  return {
    load: vi.fn(async () => ({
      projects: [project],
      actions: [action],
      notes: [note],
    })),
    subscribe: vi.fn(() => () => {}),
    createProject: vi.fn(async (/** @type {any} */ i) => i),
    updateProject: vi.fn(
      async (/** @type {any} */ _id, /** @type {any} */ p) => p,
    ),
    removeProject: vi.fn(async () => {}),
    createAction: vi.fn(async (/** @type {any} */ i) => i),
    updateAction: vi.fn(
      async (/** @type {any} */ _id, /** @type {any} */ p) => p,
    ),
    removeAction: vi.fn(async () => {}),
    createNote: vi.fn(async (/** @type {any} */ i) => i),
    updateNote: vi.fn(
      async (/** @type {any} */ _id, /** @type {any} */ p) => p,
    ),
    removeNote: vi.fn(async () => {}),
  };
}

/** @type {import("../src/types.js").ProjectInput} */
const newProject = {
  title: "New",
  summary: "",
  status: "planning",
  parentId: null,
  responsibleUid: "lead",
  responsibleEmail: "lead@example.org",
  featureIds: [],
};

describe("a guarded store", () => {
  /** @param {string} role @param {string} uid */
  const setup = (role, uid) => {
    const store = fakeStore();
    return {
      store,
      guarded: guardProjects(/** @type {any} */ (store), guardFor(role, uid)),
    };
  };

  it("passes reads straight through", async () => {
    const { guarded, store } = setup("member", "m1");
    expect((await guarded.load()).projects).toHaveLength(1);
    expect(typeof guarded.subscribe(() => {})).toBe("function");
    expect(store.load).toHaveBeenCalled();
  });

  it("refuses without touching the store, with a ForbiddenError", async () => {
    const { guarded, store } = setup("councillor", "author");
    await expect(
      guarded.createProject(/** @type {any} */ (newProject)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      guarded.updateAction("a1", { lane: "done" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(guarded.removeProject("p1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(store.createProject).not.toHaveBeenCalled();
    expect(store.updateAction).not.toHaveBeenCalled();
    expect(store.removeProject).not.toHaveBeenCalled();
  });

  it("lets a contributor add an idea, and edit it, but not place or move it", async () => {
    const { guarded, store } = setup("councillor", "author");
    const base = {
      projectId: "p1",
      title: "x",
      details: "",
      order: 1,
      featureIds: [],
    };
    await guarded.createAction({ ...base, lane: "ideas" });
    expect(store.createAction).toHaveBeenCalledTimes(1);
    await expect(
      guarded.createAction({ ...base, lane: "agreed" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await guarded.updateAction("a1", {
      title: "Edited",
      lane: "ideas",
      order: 1,
    });
    expect(store.updateAction).toHaveBeenCalledTimes(1);
    await expect(
      guarded.updateAction("a1", { order: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets the responsible councillor move actions and add a sub-project", async () => {
    const { guarded, store } = setup("councillor", "lead");
    await guarded.updateAction("a1", { lane: "in-progress", order: 2 });
    expect(store.updateAction).toHaveBeenCalledTimes(1);
    await guarded.createProject({
      ...newProject,
      parentId: "p1",
    });
    expect(store.createProject).toHaveBeenCalledTimes(1);
  });

  it("stops the responsible councillor naming someone else, or reassigning", async () => {
    const { guarded } = setup("councillor", "lead");
    await expect(
      guarded.createProject({
        ...newProject,
        parentId: "p1",
        responsibleUid: "someone",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      guarded.updateProject("p1", { responsibleUid: "someone" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reports a sub-project of a project that has gone, and an action for one", async () => {
    const { guarded } = setup("admin", "boss");
    await expect(
      guarded.createProject({ ...newProject, parentId: "gone" }),
    ).rejects.toThrow(/no longer exists/);
    await expect(
      guarded.createAction({
        projectId: "gone",
        title: "x",
        details: "",
        lane: "ideas",
        order: 1,
        featureIds: [],
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("leaves a missing record to the store to report", async () => {
    const { guarded, store } = setup("councillor", "author");
    await guarded.updateNote("missing", { body: "x" });
    await guarded.removeAction("missing");
    expect(store.updateNote).toHaveBeenCalledTimes(1);
    expect(store.removeAction).toHaveBeenCalledTimes(1);
  });

  it("lets only the author, an admin or the clerk change a note", async () => {
    const author = setup("councillor", "author");
    await author.guarded.updateNote("n1", { body: "Edited" });
    await author.guarded.removeNote("n1");
    expect(author.store.updateNote).toHaveBeenCalledTimes(1);
    expect(author.store.removeNote).toHaveBeenCalledTimes(1);

    const lead = setup("councillor", "lead");
    await expect(
      lead.guarded.updateNote("n1", { body: "Edited" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(lead.guarded.removeNote("n1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const clerk = setup("clerk", "boss");
    await clerk.guarded.removeNote("n1");
    expect(clerk.store.removeNote).toHaveBeenCalledTimes(1);
  });
});
