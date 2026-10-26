import { describe, expect, it, vi } from "vitest";
import {
  assignableRoles,
  canManage,
  handlePeopleRequest,
} from "../functions/people-handler.js";

/** @param {string} uid @param {string | null} role @param {object} [more] */
const person = (uid, role, more = {}) => ({
  uid,
  email: `${uid}@example.org`,
  role,
  disabled: false,
  emailVerified: true,
  authenticators: 1,
  lastSignIn: null,
  ...more,
});

const people = [
  person("boss", "admin"),
  person("boss2", "admin"),
  person("clerk1", "clerk"),
  person("clerk2", "clerk"),
  person("cllr", "councillor"),
  person("mem", "member"),
  person("stray", null),
];

/** A stand-in for the Admin SDK calls, with the signed-in caller described by `role`. */
function setup(role = "admin", { uid = "boss", secondFactor = true } = {}) {
  let list = people.map((p) => ({ ...p }));
  const deps = {
    verifyToken: vi.fn(async (/** @type {string} */ t) => {
      if (t !== "good") throw new Error("bad token");
      return {
        uid,
        email: `${uid}@example.org`,
        role,
        firebase: secondFactor ? { sign_in_second_factor: "totp" } : {},
      };
    }),
    listPeople: vi.fn(async () => list),
    getPerson: vi.fn(
      async (/** @type {string} */ id) =>
        list.find((p) => p.uid === id) ?? null,
    ),
    findByEmail: vi.fn(
      async (/** @type {string} */ email) =>
        list.find((p) => p.email === email) ?? null,
    ),
    createPerson: vi.fn(async (/** @type {string} */ email) => {
      const made = person("new1", null, { email, emailVerified: false });
      list = [...list, made];
      return made;
    }),
    setRole: vi.fn(async () => {}),
    setDisabled: vi.fn(async () => {}),
    resetAuthenticators: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
  };
  /** @param {Record<string, unknown>} body @param {Partial<{ method: string, idToken: string | undefined }>} [over] */
  const call = (body, over = {}) =>
    handlePeopleRequest(
      { method: "POST", idToken: "good", body, ...over },
      deps,
    );
  return { deps, call, setList: (/** @type {any} */ l) => (list = l) };
}

describe("who may call the API", () => {
  it("refuses anything but POST", async () => {
    const { call } = setup();
    expect((await call({ action: "list" }, { method: "GET" })).status).toBe(
      405,
    );
  });

  it("refuses a missing, malformed or invalid token", async () => {
    const { call, deps } = setup();
    expect(
      (await call({ action: "list" }, { idToken: undefined })).status,
    ).toBe(401);
    expect((await call({ action: "list" }, { idToken: "a b" })).status).toBe(
      401,
    );
    expect((await call({ action: "list" }, { idToken: "nope" })).status).toBe(
      401,
    );
    expect(deps.listPeople).not.toHaveBeenCalled();
  });

  it("refuses a sign-in without the second factor", async () => {
    const { call } = setup("admin", { secondFactor: false });
    expect((await call({ action: "list" })).status).toBe(401);
  });

  it.each(["councillor", "member", ""])("refuses the role %j", async (role) => {
    const { call, deps } = setup(role);
    expect((await call({ action: "list" })).status).toBe(403);
    expect(deps.listPeople).not.toHaveBeenCalled();
  });

  it.each(["admin", "clerk"])("lets %s list people", async (role) => {
    const { call } = setup(role, { uid: role === "admin" ? "boss" : "clerk1" });
    const result = await call({ action: "list" });
    expect(result.status).toBe(200);
    expect(/** @type {any} */ (result.body).people).toHaveLength(people.length);
  });

  it("answers an unknown action with 400", async () => {
    const { call } = setup();
    expect((await call({ action: "explode" })).status).toBe(400);
    expect((await call(/** @type {any} */ (null))).status).toBe(400);
  });
});

describe("the directory", () => {
  it.each(["admin", "clerk", "councillor"])(
    "lets a %s see it",
    async (role) => {
      const { call } = setup(role, { uid: "someone" });
      const result = await call({ action: "directory" });
      expect(result.status).toBe(200);
      expect(/** @type {any} */ (result.body).people).toEqual([
        { uid: "boss", email: "boss@example.org" },
        { uid: "boss2", email: "boss2@example.org" },
        { uid: "clerk1", email: "clerk1@example.org" },
        { uid: "clerk2", email: "clerk2@example.org" },
        { uid: "cllr", email: "cllr@example.org" },
      ]);
    },
  );

  it.each(["member", ""])("refuses the role %j", async (role) => {
    const { call, deps } = setup(role);
    expect((await call({ action: "directory" })).status).toBe(403);
    expect(deps.listPeople).not.toHaveBeenCalled();
  });

  it("needs a token and the second factor, like every other action", async () => {
    const { call } = setup("councillor", { secondFactor: false });
    expect((await call({ action: "directory" })).status).toBe(401);
    expect(
      (await call({ action: "directory" }, { idToken: undefined })).status,
    ).toBe(401);
    expect(
      (await call({ action: "directory" }, { method: "GET" })).status,
    ).toBe(405);
  });

  it("leaves out disabled accounts, members and people with no role", async () => {
    const { call, setList } = setup("councillor");
    setList([
      person("cllr", "councillor"),
      person("gone", "councillor", { disabled: true }),
      person("mem", "member"),
      person("stray", null),
    ]);
    const result = await call({ action: "directory" });
    expect(/** @type {any} */ (result.body).people).toEqual([
      { uid: "cllr", email: "cllr@example.org" },
    ]);
  });

  it("returns nothing but an id and an email for each person", async () => {
    const { call } = setup("councillor");
    const result = await call({ action: "directory" });
    for (const entry of /** @type {any} */ (result.body).people) {
      expect(Object.keys(entry).sort()).toEqual(["email", "uid"]);
    }
  });

  it("does not open the other actions to a councillor", async () => {
    const { call, deps } = setup("councillor");
    for (const action of ["list", "invite", "setRole", "setDisabled"]) {
      expect((await call({ action })).status).toBe(403);
    }
    expect(deps.listPeople).not.toHaveBeenCalled();
    expect(deps.createPerson).not.toHaveBeenCalled();
    expect(deps.setRole).not.toHaveBeenCalled();
  });
});

describe("the role rules", () => {
  it("lets an admin assign anything and a clerk only councillor or member", () => {
    expect(assignableRoles("admin")).toEqual([
      "admin",
      "clerk",
      "councillor",
      "member",
    ]);
    expect(assignableRoles("clerk")).toEqual(["councillor", "member"]);
  });

  it("lets a clerk manage only the lower roles and people with no role", () => {
    expect(canManage("clerk", "councillor")).toBe(true);
    expect(canManage("clerk", "member")).toBe(true);
    expect(canManage("clerk", null)).toBe(true);
    expect(canManage("clerk", "clerk")).toBe(false);
    expect(canManage("clerk", "admin")).toBe(false);
    expect(canManage("admin", "admin")).toBe(true);
  });
});

describe("invite", () => {
  it("creates the account, gives the role and writes the audit entry", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    const result = await call({
      action: "invite",
      email: "  New.Person@Example.org ",
      role: "councillor",
    });
    expect(result.status).toBe(200);
    expect(deps.createPerson).toHaveBeenCalledWith("new.person@example.org");
    expect(deps.setRole).toHaveBeenCalledWith("new1", "councillor");
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invite",
        by: "clerk1",
        targetEmail: "new.person@example.org",
        detail: "councillor",
      }),
    );
  });

  it("stops a clerk inviting an admin or a clerk", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    for (const role of ["admin", "clerk", "owner", ""]) {
      const result = await call({ action: "invite", email: "a@b.org", role });
      expect(result.status).toBe(403);
    }
    expect(deps.createPerson).not.toHaveBeenCalled();
  });

  it("lets an admin invite a clerk", async () => {
    const { call } = setup("admin");
    expect(
      (await call({ action: "invite", email: "c@b.org", role: "clerk" }))
        .status,
    ).toBe(200);
  });

  it("rejects a bad email and an address that already has an account", async () => {
    const { call, deps } = setup();
    expect(
      (await call({ action: "invite", email: "nope", role: "member" })).status,
    ).toBe(400);
    expect(
      (
        await call({
          action: "invite",
          email: "x".repeat(250) + "@b.org",
          role: "member",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call({
          action: "invite",
          email: "cllr@example.org",
          role: "member",
        })
      ).status,
    ).toBe(409);
    expect(deps.createPerson).not.toHaveBeenCalled();
  });
});

describe("changing someone's role", () => {
  it("applies it and audits it", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    const result = await call({
      action: "setRole",
      uid: "cllr",
      role: "member",
    });
    expect(result.status).toBe(200);
    expect(deps.setRole).toHaveBeenCalledWith("cllr", "member");
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "setRole",
        detail: "councillor -> member",
      }),
    );
  });

  it("stops a clerk touching an admin or another clerk, or promoting anyone", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    expect(
      (await call({ action: "setRole", uid: "boss", role: "member" })).status,
    ).toBe(403);
    expect(
      (await call({ action: "setRole", uid: "clerk2", role: "member" })).status,
    ).toBe(403);
    expect(
      (await call({ action: "setRole", uid: "cllr", role: "clerk" })).status,
    ).toBe(403);
    expect(
      (await call({ action: "setRole", uid: "cllr", role: "admin" })).status,
    ).toBe(403);
    expect(deps.setRole).not.toHaveBeenCalled();
  });

  it("never lets anyone change their own account", async () => {
    const { call, deps } = setup("admin");
    for (const action of ["setRole", "setDisabled", "resetAuthenticators"]) {
      const result = await call({
        action,
        uid: "boss",
        role: "member",
        disabled: true,
      });
      expect(result.status).toBe(403);
    }
    expect(deps.setRole).not.toHaveBeenCalled();
    expect(deps.setDisabled).not.toHaveBeenCalled();
    expect(deps.resetAuthenticators).not.toHaveBeenCalled();
  });

  it("rejects an unknown role, a bad id and a person who is gone", async () => {
    const { call } = setup();
    expect(
      (await call({ action: "setRole", uid: "cllr", role: "owner" })).status,
    ).toBe(403);
    expect(
      (await call({ action: "setRole", uid: "../x", role: "member" })).status,
    ).toBe(400);
    expect(
      (await call({ action: "setRole", uid: "ghost", role: "member" })).status,
    ).toBe(404);
  });
});

describe("disabling and authenticator resets", () => {
  it("disables and enables a person", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    expect(
      (await call({ action: "setDisabled", uid: "mem", disabled: true }))
        .status,
    ).toBe(200);
    expect(deps.setDisabled).toHaveBeenCalledWith("mem", true);
    expect(
      (await call({ action: "setDisabled", uid: "mem", disabled: false }))
        .status,
    ).toBe(200);
    expect(deps.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "enable" }),
    );
  });

  it("needs a real boolean", async () => {
    const { call } = setup();
    expect(
      (await call({ action: "setDisabled", uid: "mem", disabled: "yes" }))
        .status,
    ).toBe(400);
  });

  it("resets authenticators, but a clerk cannot reset an admin's", async () => {
    const { call, deps } = setup("clerk", { uid: "clerk1" });
    expect(
      (await call({ action: "resetAuthenticators", uid: "cllr" })).status,
    ).toBe(200);
    expect(deps.resetAuthenticators).toHaveBeenCalledWith("cllr");
    expect(
      (await call({ action: "resetAuthenticators", uid: "boss" })).status,
    ).toBe(403);
    expect(deps.resetAuthenticators).toHaveBeenCalledTimes(1);
  });
});
