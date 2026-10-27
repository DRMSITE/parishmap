import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestEnv,
  seedAction,
  seedNote,
  seedProject,
  userContext,
} from "./helpers.js";

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

/** @typedef {ReturnType<typeof userContext>} Context */

/**
 * @param {Context} context
 * @param {string} name
 * @param {string} id
 */
const ref = (context, name, id) => doc(context.firestore(), name, id);

/** The stamps on a new document written by `uid`. @param {string} uid */
const created = (uid) => ({
  createdBy: uid,
  createdByEmail: `${uid}@example.org`,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByEmail: `${uid}@example.org`,
});

/** The fields an edit by `uid` must set. @param {string} uid */
const touched = (uid) => ({
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByEmail: `${uid}@example.org`,
});

/**
 * @param {string} uid
 * @param {Record<string, unknown>} [overrides]
 */
const newProject = (uid, overrides = {}) => ({
  title: "Village green",
  summary: "Improve the green",
  status: "planning",
  parentId: null,
  responsibleUid: "lead",
  responsibleEmail: "lead@example.org",
  featureIds: [],
  ...created(uid),
  ...overrides,
});

/**
 * @param {string} uid
 * @param {Record<string, unknown>} [overrides]
 */
const newAction = (uid, overrides = {}) => ({
  projectId: "p1",
  title: "Get a quote",
  details: "Two quotes if possible",
  lane: "ideas",
  order: 1,
  featureIds: [],
  ...created(uid),
  ...overrides,
});

/**
 * @param {string} uid
 * @param {Record<string, unknown>} [overrides]
 */
const newNote = (uid, overrides = {}) => ({
  projectId: "p1",
  body: "Spoke to the contractor",
  ...created(uid),
  ...overrides,
});

// "lead" is the responsible councillor of project p1 in every test below.
beforeEach(() => seedProject(env, "p1", "lead"));

describe("reading", () => {
  beforeEach(async () => {
    await seedAction(env, "a1", "p1", "other");
    await seedNote(env, "n1", "p1", "other");
  });

  it.each(["admin", "clerk", "councillor", "member"])(
    "lets a %s with a second factor read everything",
    async (role) => {
      const user = userContext(env, "u1", { role });
      for (const name of ["projects", "actions", "notes"]) {
        await assertSucceeds(getDocs(collection(user.firestore(), name)));
      }
      await assertSucceeds(getDoc(ref(user, "projects", "p1")));
    },
  );

  it("refuses no role, no second factor and signed out", async () => {
    await assertFails(getDoc(ref(userContext(env, "u1"), "projects", "p1")));
    await assertFails(
      getDoc(
        ref(
          userContext(env, "u1", { role: "admin", mfa: false }),
          "actions",
          "a1",
        ),
      ),
    );
    await assertFails(getDoc(ref(env.unauthenticatedContext(), "notes", "n1")));
  });
});

describe("creating a project", () => {
  it.each(["admin", "clerk"])(
    "lets a %s create a top-level one",
    async (role) => {
      const user = userContext(env, "boss", { role });
      await assertSucceeds(
        setDoc(ref(user, "projects", "new"), newProject("boss")),
      );
    },
  );

  it.each(["councillor", "member"])(
    "refuses a %s creating a top-level one",
    async (role) => {
      const user = userContext(env, "u1", { role });
      await assertFails(setDoc(ref(user, "projects", "new"), newProject("u1")));
    },
  );

  it("refuses a clerk without a second factor", async () => {
    const user = userContext(env, "boss", { role: "clerk", mfa: false });
    await assertFails(setDoc(ref(user, "projects", "new"), newProject("boss")));
  });

  describe("a sub-project", () => {
    const sub = (/** @type {string} */ uid, overrides = {}) =>
      newProject(uid, {
        parentId: "p1",
        responsibleUid: uid,
        responsibleEmail: `${uid}@example.org`,
        ...overrides,
      });

    it("lets the responsible councillor add one, taking charge of it", async () => {
      const user = userContext(env, "lead", { role: "councillor" });
      await assertSucceeds(setDoc(ref(user, "projects", "s1"), sub("lead")));
    });

    it("refuses another councillor", async () => {
      const user = userContext(env, "u2", { role: "councillor" });
      await assertFails(setDoc(ref(user, "projects", "s1"), sub("u2")));
    });

    it("refuses the responsible councillor naming someone else", async () => {
      const user = userContext(env, "lead", { role: "councillor" });
      await assertFails(
        setDoc(
          ref(user, "projects", "s1"),
          sub("lead", {
            responsibleUid: "u2",
            responsibleEmail: "u2@example.org",
          }),
        ),
      );
    });

    it("refuses the responsible councillor using someone else's email", async () => {
      const user = userContext(env, "lead", { role: "councillor" });
      await assertFails(
        setDoc(
          ref(user, "projects", "s1"),
          sub("lead", { responsibleEmail: "u2@example.org" }),
        ),
      );
    });

    it("refuses a parent that does not exist", async () => {
      const user = userContext(env, "lead", { role: "councillor" });
      await assertFails(
        setDoc(ref(user, "projects", "s1"), sub("lead", { parentId: "nope" })),
      );
    });

    it("lets a clerk add one for any parent and any councillor", async () => {
      const user = userContext(env, "boss", { role: "clerk" });
      await assertSucceeds(
        setDoc(
          ref(user, "projects", "s1"),
          sub("boss", { responsibleUid: "u2" }),
        ),
      );
    });
  });

  describe.each([
    ["a forged author", { createdBy: "someone" }],
    ["a forged email", { createdByEmail: "x@example.org" }],
    ["a back-dated update time", { updatedAt: new Date("2020-01-01") }],
    ["a forged updater", { updatedBy: "someone" }],
    ["an extra field", { approved: true }],
    ["an unknown status", { status: "finished" }],
    ["an empty title", { title: "" }],
    ["a title over 120 characters", { title: "x".repeat(121) }],
    ["a summary over 2000 characters", { summary: "x".repeat(2001) }],
    ["more than 20 linked features", { featureIds: Array(21).fill("f") }],
    ["linked features that are not a list", { featureIds: "f1" }],
    ["no responsible person", { responsibleUid: "" }],
  ])("refuses %s", (_name, overrides) => {
    it("from a clerk", async () => {
      const user = userContext(env, "boss", { role: "clerk" });
      await assertFails(
        setDoc(ref(user, "projects", "new"), newProject("boss", overrides)),
      );
    });
  });
});

describe("updating a project", () => {
  it("lets the responsible councillor edit it", async () => {
    const user = userContext(env, "lead", { role: "councillor" });
    await assertSucceeds(
      updateDoc(ref(user, "projects", "p1"), {
        title: "Edited",
        status: "on-hold",
        featureIds: ["f1", "f2"],
        ...touched("lead"),
      }),
    );
  });

  it("refuses another councillor", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        title: "Edited",
        ...touched("u2"),
      }),
    );
  });

  it("refuses a member", async () => {
    const user = userContext(env, "lead", { role: "member" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        title: "Edited",
        ...touched("lead"),
      }),
    );
  });

  it.each(["admin", "clerk"])(
    "lets a %s edit and reassign it",
    async (role) => {
      const user = userContext(env, "boss", { role });
      await assertSucceeds(
        updateDoc(ref(user, "projects", "p1"), {
          responsibleUid: "u2",
          responsibleEmail: "u2@example.org",
          ...touched("boss"),
        }),
      );
    },
  );

  it("refuses the responsible councillor handing it to someone else", async () => {
    const user = userContext(env, "lead", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        responsibleUid: "u2",
        responsibleEmail: "u2@example.org",
        ...touched("lead"),
      }),
    );
  });

  it("refuses moving a project under another, even for an admin", async () => {
    await seedProject(env, "p2", "lead");
    const user = userContext(env, "boss", { role: "admin" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        parentId: "p2",
        ...touched("boss"),
      }),
    );
  });

  it("refuses an edit that does not stamp the editor and time", async () => {
    const user = userContext(env, "lead", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), { title: "Edited" }),
    );
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        title: "Edited",
        ...touched("lead"),
        updatedBy: "u2",
      }),
    );
  });

  it("refuses changing who created it", async () => {
    const user = userContext(env, "boss", { role: "admin" });
    await assertFails(
      updateDoc(ref(user, "projects", "p1"), {
        createdBy: "someone-else",
        ...touched("boss"),
      }),
    );
  });
});

describe("deleting a project", () => {
  it.each(["admin", "clerk"])("lets a %s", async (role) => {
    await assertSucceeds(
      deleteDoc(ref(userContext(env, "boss", { role }), "projects", "p1")),
    );
  });

  it("refuses the responsible councillor and everyone else", async () => {
    for (const [uid, role] of [
      ["lead", "councillor"],
      ["u2", "councillor"],
      ["u3", "member"],
    ]) {
      await assertFails(
        deleteDoc(ref(userContext(env, uid, { role }), "projects", "p1")),
      );
    }
  });
});

describe("creating an action", () => {
  it.each(["admin", "clerk", "councillor"])(
    "lets a %s add an idea",
    async (role) => {
      const user = userContext(env, "u2", { role });
      await assertSucceeds(
        setDoc(ref(user, "actions", "new"), newAction("u2")),
      );
    },
  );

  it("refuses a member", async () => {
    const user = userContext(env, "u2", { role: "member" });
    await assertFails(setDoc(ref(user, "actions", "new"), newAction("u2")));
  });

  it("refuses a councillor who does not manage the project placing it in another lane", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      setDoc(ref(user, "actions", "new"), newAction("u2", { lane: "agreed" })),
    );
  });

  it.each([
    ["the responsible councillor", "lead", "councillor"],
    ["a clerk", "boss", "clerk"],
  ])("lets %s place it in any lane", async (_who, uid, role) => {
    const user = userContext(env, uid, { role });
    await assertSucceeds(
      setDoc(ref(user, "actions", "new"), newAction(uid, { lane: "blocked" })),
    );
  });

  it("lets an action be assigned, and dated", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertSucceeds(
      setDoc(
        ref(user, "actions", "new"),
        newAction("u2", {
          assigneeUid: "u3",
          assigneeEmail: "u3@example.org",
          dueDate: "2026-12-01",
        }),
      ),
    );
  });

  it("refuses an action for a project that does not exist", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      setDoc(
        ref(user, "actions", "new"),
        newAction("u2", { projectId: "nope" }),
      ),
    );
  });

  describe.each([
    ["a forged author", { createdBy: "someone" }],
    ["a back-dated creation time", { createdAt: new Date("2020-01-01") }],
    ["an extra field", { done: true }],
    ["an unknown lane", { lane: "someday" }],
    ["a text order", { order: "1" }],
    ["an empty title", { title: "" }],
    ["a title over 120 characters", { title: "x".repeat(121) }],
    ["details over 2000 characters", { details: "x".repeat(2001) }],
    ["an assignee with no email", { assigneeUid: "u3" }],
    ["an email with no assignee", { assigneeEmail: "u3@example.org" }],
    ["a badly formed due date", { dueDate: "1 Dec" }],
    ["a due date of the right length but wrong shape", { dueDate: "not-a-date" }],
    ["more than 20 linked features", { featureIds: Array(21).fill("f") }],
  ])("refuses %s", (_name, overrides) => {
    it("as a councillor", async () => {
      const user = userContext(env, "u2", { role: "councillor" });
      await assertFails(
        setDoc(ref(user, "actions", "new"), newAction("u2", overrides)),
      );
    });
  });
});

describe("updating an action", () => {
  beforeEach(() => seedAction(env, "a1", "p1", "u2"));

  const edit = { title: "Edited", details: "More detail" };

  it("lets the author edit its content", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertSucceeds(
      updateDoc(ref(user, "actions", "a1"), { ...edit, ...touched("u2") }),
    );
  });

  it("lets the author assign it, and clear the assignment", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertSucceeds(
      updateDoc(ref(user, "actions", "a1"), {
        assigneeUid: "u3",
        assigneeEmail: "u3@example.org",
        ...touched("u2"),
      }),
    );
    await assertSucceeds(
      updateDoc(ref(user, "actions", "a1"), {
        assigneeUid: deleteField(),
        assigneeEmail: deleteField(),
        ...touched("u2"),
      }),
    );
  });

  it("refuses another councillor editing it", async () => {
    const user = userContext(env, "u3", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), { ...edit, ...touched("u3") }),
    );
  });

  it("refuses the person it is assigned to editing it", async () => {
    await seedAction(env, "a2", "p1", "u2", {
      assigneeUid: "u3",
      assigneeEmail: "u3@example.org",
    });
    const user = userContext(env, "u3", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "actions", "a2"), { ...edit, ...touched("u3") }),
    );
  });

  it("refuses a member", async () => {
    const user = userContext(env, "u2", { role: "member" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), { ...edit, ...touched("u2") }),
    );
  });

  it.each([
    ["the responsible councillor", "lead", "councillor"],
    ["a clerk", "boss", "clerk"],
    ["an admin", "root", "admin"],
  ])("lets %s edit and move anyone's action", async (_who, uid, role) => {
    const user = userContext(env, uid, { role });
    await assertSucceeds(
      updateDoc(ref(user, "actions", "a1"), {
        ...edit,
        lane: "in-progress",
        order: 2.5,
        ...touched(uid),
      }),
    );
  });

  it("refuses the author moving their own action to another lane", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), {
        lane: "done",
        ...touched("u2"),
      }),
    );
  });

  it("refuses the author reordering their own action within a lane", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), { order: 0.5, ...touched("u2") }),
    );
  });

  it("refuses a councillor who manages a different project", async () => {
    await seedProject(env, "p2", "lead2");
    const user = userContext(env, "lead2", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), {
        lane: "done",
        ...touched("lead2"),
      }),
    );
  });

  it("refuses moving an action to another project, even for an admin", async () => {
    await seedProject(env, "p2", "lead");
    const user = userContext(env, "root", { role: "admin" });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), {
        projectId: "p2",
        ...touched("root"),
      }),
    );
  });

  it("refuses an update that does not stamp the editor and time", async () => {
    const user = userContext(env, "lead", { role: "councillor" });
    await assertFails(updateDoc(ref(user, "actions", "a1"), { ...edit }));
  });

  it("refuses a move without a second factor", async () => {
    const user = userContext(env, "lead", { role: "councillor", mfa: false });
    await assertFails(
      updateDoc(ref(user, "actions", "a1"), {
        lane: "done",
        ...touched("lead"),
      }),
    );
  });
});

describe("deleting an action", () => {
  beforeEach(() => seedAction(env, "a1", "p1", "u2"));

  it.each([
    ["its author", "u2", "councillor"],
    ["the responsible councillor", "lead", "councillor"],
    ["a clerk", "boss", "clerk"],
    ["an admin", "root", "admin"],
  ])("lets %s", async (_who, uid, role) => {
    await assertSucceeds(
      deleteDoc(ref(userContext(env, uid, { role }), "actions", "a1")),
    );
  });

  it("refuses another councillor, a member and anyone signed out", async () => {
    await assertFails(
      deleteDoc(
        ref(userContext(env, "u3", { role: "councillor" }), "actions", "a1"),
      ),
    );
    await assertFails(
      deleteDoc(
        ref(userContext(env, "u2", { role: "member" }), "actions", "a1"),
      ),
    );
    await assertFails(
      deleteDoc(ref(env.unauthenticatedContext(), "actions", "a1")),
    );
  });

  it("leaves a clerk able to clear the actions of a deleted project", async () => {
    const clerk = userContext(env, "boss", { role: "clerk" });
    await assertSucceeds(deleteDoc(ref(clerk, "projects", "p1")));
    await assertSucceeds(deleteDoc(ref(clerk, "actions", "a1")));
    expect((await getDoc(ref(clerk, "actions", "a1"))).exists()).toBe(false);
  });
});

describe("notes", () => {
  it.each(["admin", "clerk", "councillor"])(
    "lets a %s add one",
    async (role) => {
      const user = userContext(env, "u2", { role });
      await assertSucceeds(setDoc(ref(user, "notes", "new"), newNote("u2")));
    },
  );

  it("lets a note belong to an action", async () => {
    const user = userContext(env, "u2", { role: "councillor" });
    await assertSucceeds(
      setDoc(ref(user, "notes", "new"), newNote("u2", { actionId: "a1" })),
    );
  });

  it("refuses a member, a missing project, an empty or over-long body", async () => {
    const member = userContext(env, "u2", { role: "member" });
    await assertFails(setDoc(ref(member, "notes", "new"), newNote("u2")));
    const user = userContext(env, "u2", { role: "councillor" });
    await assertFails(
      setDoc(ref(user, "notes", "new"), newNote("u2", { projectId: "nope" })),
    );
    await assertFails(
      setDoc(ref(user, "notes", "new"), newNote("u2", { body: "" })),
    );
    await assertFails(
      setDoc(
        ref(user, "notes", "new"),
        newNote("u2", { body: "x".repeat(2001) }),
      ),
    );
    await assertFails(
      setDoc(ref(user, "notes", "new"), newNote("someone-else")),
    );
  });

  describe("changing one", () => {
    beforeEach(() => seedNote(env, "n1", "p1", "u2"));

    it("lets the author edit and delete it", async () => {
      const user = userContext(env, "u2", { role: "councillor" });
      await assertSucceeds(
        updateDoc(ref(user, "notes", "n1"), {
          body: "Edited",
          ...touched("u2"),
        }),
      );
      await assertSucceeds(deleteDoc(ref(user, "notes", "n1")));
    });

    it("refuses another councillor, even the responsible one", async () => {
      const user = userContext(env, "lead", { role: "councillor" });
      await assertFails(
        updateDoc(ref(user, "notes", "n1"), {
          body: "Edited",
          ...touched("lead"),
        }),
      );
      await assertFails(deleteDoc(ref(user, "notes", "n1")));
    });

    it.each(["admin", "clerk"])(
      "lets a %s edit and delete any",
      async (role) => {
        const user = userContext(env, "boss", { role });
        await assertSucceeds(
          updateDoc(ref(user, "notes", "n1"), {
            body: "Edited",
            ...touched("boss"),
          }),
        );
        await assertSucceeds(deleteDoc(ref(user, "notes", "n1")));
      },
    );

    it("refuses moving a note to another project", async () => {
      await seedProject(env, "p2", "lead");
      const user = userContext(env, "u2", { role: "councillor" });
      await assertFails(
        updateDoc(ref(user, "notes", "n1"), {
          projectId: "p2",
          ...touched("u2"),
        }),
      );
    });
  });
});
