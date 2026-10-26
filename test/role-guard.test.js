import { describe, expect, it } from "vitest";
import { createRoleGuard } from "../src/auth/guard.js";

/** @param {import("../src/auth/session.js").SessionState} state */
const guardFor = (state) => createRoleGuard(() => state);

const own = /** @type {any} */ ({ id: "1", createdBy: "u1" });
const others = /** @type {any} */ ({ id: "2", createdBy: "u2" });
const actions = /** @type {const} */ (["read", "create", "update", "delete"]);

/** @param {import("../src/auth/session.js").Role} role */
const ready = (role) => ({
  status: /** @type {const} */ ("ready"),
  role,
  user: { uid: "u1", email: "u1@example.org" },
});

describe("role guard", () => {
  it.each(["admin", "clerk"])("lets a %s do everything", (role) => {
    const guard = guardFor(ready(/** @type {any} */ (role)));
    for (const action of actions) {
      expect(guard.can(action, others)).toBe(true);
      expect(guard.can(action)).toBe(true);
    }
  });

  it("lets a councillor read and add, but change only their own", () => {
    const guard = guardFor(ready("councillor"));
    expect(guard.can("read", others)).toBe(true);
    expect(guard.can("create")).toBe(true);
    expect(guard.can("update", own)).toBe(true);
    expect(guard.can("delete", own)).toBe(true);
    expect(guard.can("update", others)).toBe(false);
    expect(guard.can("delete", others)).toBe(false);
  });

  it("lets a member read only", () => {
    const guard = guardFor(ready("member"));
    expect(guard.can("read", others)).toBe(true);
    expect(guard.can("create")).toBe(false);
    expect(guard.can("update", own)).toBe(false);
    expect(guard.can("delete", own)).toBe(false);
  });

  it.each([
    "loading",
    "signed-out",
    "second-factor",
    "verify-email",
    "enrol",
    "no-access",
  ])("refuses everything while the status is %s", (status) => {
    const guard = guardFor(/** @type {any} */ ({ status, role: "admin" }));
    for (const action of actions) expect(guard.can(action, own)).toBe(false);
  });

  it("follows the session as it changes", () => {
    let state = /** @type {any} */ ({ status: "signed-out" });
    const guard = createRoleGuard(() => state);
    expect(guard.can("read")).toBe(false);
    state = ready("member");
    expect(guard.can("read")).toBe(true);
  });
});
