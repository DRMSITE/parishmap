import { describe, expect, it, vi } from "vitest";
import { toEntry } from "../src/data/firestore-audit.js";
import { describeEntry, render } from "../src/views/activity.view.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const stamp = (/** @type {string} */ iso) => ({ toDate: () => new Date(iso) });

describe("reading stored entries", () => {
  it("turns a stored entry into plain values", () => {
    expect(
      toEntry("e1", {
        action: "setRole",
        byEmail: "a@b.org",
        targetEmail: "c@d.org",
        detail: "member -> clerk",
        at: stamp("2026-10-21T09:30:00Z"),
        by: "uid1",
      }),
    ).toEqual({
      id: "e1",
      action: "setRole",
      byEmail: "a@b.org",
      targetEmail: "c@d.org",
      detail: "member -> clerk",
      at: "2026-10-21T09:30:00.000Z",
    });
  });

  it("leaves out an entry with no action, and tolerates odd fields", () => {
    expect(toEntry("e2", { byEmail: "a@b.org" })).toBeUndefined();
    expect(toEntry("e3", { action: 5 })).toBeUndefined();
    expect(
      toEntry("e4", { action: "invite", byEmail: 7, at: "yesterday" }),
    ).toEqual({
      id: "e4",
      action: "invite",
      byEmail: "",
      targetEmail: "",
      detail: "",
      at: null,
    });
  });

  it("cuts very long text", () => {
    const entry = toEntry("e5", { action: "invite", detail: "x".repeat(5000) });
    expect(entry?.detail).toHaveLength(300);
  });
});

describe("describing an action", () => {
  /** @param {string} action @param {string} detail */
  const say = (action, detail = "") =>
    describeEntry({
      id: "x",
      action,
      detail,
      byEmail: "",
      targetEmail: "",
      at: null,
    });

  it("uses plain words", () => {
    expect(say("invite", "councillor")).toEqual({
      what: "Invited",
      detail: "as Councillor",
    });
    expect(say("setRole", "member -> clerk")).toEqual({
      what: "Changed role",
      detail: "Member to Clerk",
    });
    expect(say("setRole", "none -> member").detail).toBe("No role to Member");
    expect(say("disable").what).toBe("Disabled");
    expect(say("enable").what).toBe("Enabled");
    expect(say("resetAuthenticators").what).toBe("Reset authenticator");
  });

  it("shows an action it does not know as it is", () => {
    expect(say("somethingNew", "detail")).toEqual({
      what: "somethingNew",
      detail: "detail",
    });
  });
});

/** @param {import("../src/types.js").AuditAccess | undefined} audit */
function show(audit) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const cleanup = render(container, /** @type {any} */ ({ audit }));
  return { container, cleanup };
}

const entry = (/** @type {number} */ n) => ({
  id: `e${n}`,
  action: "disable",
  byEmail: "boss@example.org",
  targetEmail: `p${n}@example.org`,
  detail: "",
  at: "2026-10-21T09:30:00.000Z",
});

describe("the Activity page", () => {
  it.each([undefined, { available: () => false, list: vi.fn() }])(
    "refuses anyone but an administrator, and reads nothing",
    (audit) => {
      const { container } = show(/** @type {any} */ (audit));
      expect(container.textContent).toContain("Only administrators");
      if (audit) expect(audit.list).not.toHaveBeenCalled();
    },
  );

  it("shows the entries, then loads the next page", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ entries: [entry(1), entry(2)], cursor: "next" })
      .mockResolvedValueOnce({ entries: [entry(3)], cursor: null });
    const { container } = show({ available: () => true, list });
    await settle();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    const more = /** @type {HTMLElement} */ (
      container.querySelector("[data-more]")
    );
    expect(more.hidden).toBe(false);
    expect(container.querySelector("[data-status]")?.textContent).toContain(
      "2 entries shown, and there are older ones",
    );

    more.click();
    await settle();
    expect(list).toHaveBeenLastCalledWith("next");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(more.hidden).toBe(true);
    expect(container.querySelector("tbody")?.textContent).toContain(
      "p3@example.org",
    );
  });

  it("says when nothing has been recorded", async () => {
    const { container } = show({
      available: () => true,
      list: async () => ({ entries: [], cursor: null }),
    });
    await settle();
    expect(container.querySelector("[data-status]")?.textContent).toContain(
      "Nothing has been recorded",
    );
  });

  it("shows a failure instead of an empty table", async () => {
    const { container } = show({
      available: () => true,
      list: async () => {
        throw new Error("Could not load the activity. Try again.");
      },
    });
    await settle();
    const error = /** @type {HTMLElement} */ (
      container.querySelector("[data-error]")
    );
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("Could not load");
  });

  it("puts record text in cells as text, never as markup", async () => {
    const { container } = show({
      available: () => true,
      list: async () => ({
        entries: [{ ...entry(1), targetEmail: "<img src=x onerror=alert(1)>" }],
        cursor: null,
      }),
    });
    await settle();
    expect(container.querySelector("tbody img")).toBeNull();
    expect(container.querySelector("tbody")?.textContent).toContain("<img");
  });
});
