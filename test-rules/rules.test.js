import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, seedFeature, userContext } from "./helpers.js";

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

/**
 * A feature as the app would write it.
 * @param {string} uid
 * @param {Record<string, unknown>} [overrides]
 */
const newFeature = (uid, overrides = {}) => ({
  lat: 52.39,
  lng: 0.21,
  data: { title: "New bench", notes: "By the green" },
  createdBy: uid,
  createdByEmail: `${uid}@example.org`,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

/** @param {ReturnType<typeof userContext>} context @param {string} id */
const ref = (context, id) => doc(context.firestore(), "features", id);

describe("reading", () => {
  beforeEach(() => seedFeature(env, "f1", "someone"));

  it.each(["admin", "clerk", "councillor", "member"])(
    "lets a %s with a second factor read",
    async (role) => {
      const user = userContext(env, "u1", { role });
      await assertSucceeds(getDoc(ref(user, "f1")));
      await assertSucceeds(getDocs(collection(user.firestore(), "features")));
    },
  );

  it("refuses a signed-in user with no role", async () => {
    const user = userContext(env, "u1");
    await assertFails(getDoc(ref(user, "f1")));
  });

  it("refuses a user whose role is not recognised", async () => {
    const user = userContext(env, "u1", { role: "superuser" });
    await assertFails(getDoc(ref(user, "f1")));
  });

  it("refuses a user who has not used a second factor", async () => {
    const user = userContext(env, "u1", { role: "admin", mfa: false });
    await assertFails(getDoc(ref(user, "f1")));
  });

  it("refuses anyone not signed in", async () => {
    const anon = env.unauthenticatedContext();
    await assertFails(getDoc(ref(anon, "f1")));
  });

  it("refuses every other collection, even for an admin", async () => {
    const admin = userContext(env, "u1", { role: "admin" });
    await assertFails(getDoc(doc(admin.firestore(), "users", "u1")));
    await assertFails(
      setDoc(doc(admin.firestore(), "users", "u1"), { role: "admin" }),
    );
  });
});

describe("creating", () => {
  it.each(["admin", "clerk", "councillor"])(
    "lets a %s create",
    async (role) => {
      const user = userContext(env, "u1", { role });
      await assertSucceeds(setDoc(ref(user, "n1"), newFeature("u1")));
    },
  );

  it("lets a feature carry a category and geometry string", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertSucceeds(
      setDoc(
        ref(user, "n1"),
        newFeature("u1", {
          category: "parking",
          geometry: JSON.stringify({
            type: "Point",
            coordinates: [0.21, 52.39],
          }),
        }),
      ),
    );
  });

  it("refuses a member", async () => {
    const user = userContext(env, "u1", { role: "member" });
    await assertFails(setDoc(ref(user, "n1"), newFeature("u1")));
  });

  it("refuses a councillor without a second factor", async () => {
    const user = userContext(env, "u1", { role: "councillor", mfa: false });
    await assertFails(setDoc(ref(user, "n1"), newFeature("u1")));
  });

  it("refuses anyone not signed in", async () => {
    const anon = env.unauthenticatedContext();
    await assertFails(setDoc(ref(anon, "n1"), newFeature("u1")));
  });

  describe.each([
    ["a forged author", { createdBy: "someone-else" }],
    ["a forged email", { createdByEmail: "clerk@example.org" }],
    ["a back-dated creation time", { createdAt: new Date("2020-01-01") }],
    ["a back-dated update time", { updatedAt: new Date("2020-01-01") }],
    ["an extra field", { approved: true }],
    ["latitude out of range", { lat: 91 }],
    ["longitude out of range", { lng: -181 }],
    ["a text latitude", { lat: "52.39" }],
    ["no title", { data: { notes: "x" } }],
    ["an empty title", { data: { title: "" } }],
    ["a title over 120 characters", { data: { title: "x".repeat(121) } }],
    [
      "notes over 2000 characters",
      { data: { title: "t", notes: "x".repeat(2001) } },
    ],
    ["an unknown data field", { data: { title: "t", role: "admin" } }],
    ["geometry that is not a string", { geometry: { type: "Point" } }],
    ["geometry over the size limit", { geometry: "x".repeat(60001) }],
    ["an over-long category", { category: "x".repeat(61) }],
  ])("refuses %s", (_name, overrides) => {
    it("as a councillor", async () => {
      const user = userContext(env, "u1", { role: "councillor" });
      await assertFails(setDoc(ref(user, "n1"), newFeature("u1", overrides)));
    });
  });
});

describe("updating", () => {
  beforeEach(async () => {
    await seedFeature(env, "mine", "u1");
    await seedFeature(env, "theirs", "u2");
  });

  /** @param {string} uid */
  const patch = (uid) => ({
    "data.title": "Edited",
    updatedAt: serverTimestamp(),
    createdBy: uid,
  });

  it("lets a councillor edit their own feature", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertSucceeds(
      updateDoc(ref(user, "mine"), {
        "data.title": "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("refuses a councillor editing someone else's feature", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "theirs"), {
        "data.title": "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it.each(["clerk", "admin"])(
    "lets a %s edit anyone's feature",
    async (role) => {
      const user = userContext(env, "boss", { role });
      await assertSucceeds(
        updateDoc(ref(user, "theirs"), {
          "data.title": "Edited",
          updatedAt: serverTimestamp(),
        }),
      );
    },
  );

  it("refuses a member", async () => {
    const user = userContext(env, "u1", { role: "member" });
    await assertFails(
      updateDoc(ref(user, "mine"), {
        "data.title": "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("refuses changing the author, even for an admin", async () => {
    const user = userContext(env, "boss", { role: "admin" });
    await assertFails(updateDoc(ref(user, "theirs"), { ...patch("boss") }));
  });

  it("refuses a councillor taking over a feature", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(updateDoc(ref(user, "theirs"), { ...patch("u1") }));
  });

  it("refuses an update that does not set the update time to now", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "mine"), {
        "data.title": "Edited",
        updatedAt: new Date("2020-01-01"),
      }),
    );
  });

  it("refuses an edit that breaks the data rules", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(
      updateDoc(ref(user, "mine"), {
        "data.title": "x".repeat(121),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("refuses an update without a second factor", async () => {
    const user = userContext(env, "boss", { role: "admin", mfa: false });
    await assertFails(
      updateDoc(ref(user, "mine"), {
        "data.title": "Edited",
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe("deleting", () => {
  beforeEach(async () => {
    await seedFeature(env, "mine", "u1");
    await seedFeature(env, "theirs", "u2");
  });

  it("lets a councillor delete their own feature", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertSucceeds(deleteDoc(ref(user, "mine")));
  });

  it("refuses a councillor deleting someone else's feature", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(deleteDoc(ref(user, "theirs")));
  });

  it.each(["clerk", "admin"])(
    "lets a %s delete anyone's feature",
    async (role) => {
      const user = userContext(env, "boss", { role });
      await assertSucceeds(deleteDoc(ref(user, "theirs")));
    },
  );

  it("refuses a member", async () => {
    const user = userContext(env, "u1", { role: "member" });
    await assertFails(deleteDoc(ref(user, "mine")));
  });

  it("refuses anyone not signed in", async () => {
    await assertFails(deleteDoc(ref(env.unauthenticatedContext(), "mine")));
  });

  it("leaves the feature in place when refused", async () => {
    const user = userContext(env, "u1", { role: "councillor" });
    await assertFails(deleteDoc(ref(user, "theirs")));
    const admin = userContext(env, "boss", { role: "admin" });
    expect((await getDoc(ref(admin, "theirs"))).exists()).toBe(true);
  });
});

describe("the audit log", () => {
  /** @param {ReturnType<typeof userContext>} context */
  const entry = (context) => doc(context.firestore(), "auditLog", "e1");

  beforeEach(() =>
    env.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), "auditLog", "e1"), {
        action: "invite",
        by: "boss",
      }),
    ),
  );

  it("lets an admin with a second factor read it", async () => {
    await assertSucceeds(
      getDoc(entry(userContext(env, "boss", { role: "admin" }))),
    );
  });

  it.each(["clerk", "councillor", "member"])("refuses a %s", async (role) => {
    await assertFails(getDoc(entry(userContext(env, "u1", { role }))));
  });

  it("refuses an admin without a second factor, and anyone signed out", async () => {
    await assertFails(
      getDoc(entry(userContext(env, "boss", { role: "admin", mfa: false }))),
    );
    await assertFails(getDoc(entry(env.unauthenticatedContext())));
  });

  it("refuses every client write, even from an admin", async () => {
    const admin = userContext(env, "boss", { role: "admin" });
    await assertFails(
      setDoc(doc(admin.firestore(), "auditLog", "e2"), { action: "x" }),
    );
    await assertFails(updateDoc(entry(admin), { action: "changed" }));
    await assertFails(deleteDoc(entry(admin)));
  });
});
