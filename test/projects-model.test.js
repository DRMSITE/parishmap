import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import {
  actionsInLane,
  isValidDate,
  orderBetween,
  projectAndDescendants,
  projectDepth,
  validateAction,
  validateNewProject,
  validateNote,
  validateProject,
} from "../src/projects/model.js";

const project = (/** @type {object} */ more = {}) => ({
  title: "Village green",
  summary: "",
  status: /** @type {const} */ ("planning"),
  parentId: null,
  responsibleUid: "u1",
  responsibleEmail: "u1@example.org",
  featureIds: [],
  ...more,
});

const action = (/** @type {object} */ more = {}) => ({
  projectId: "p1",
  title: "Get a quote",
  details: "",
  lane: "ideas",
  order: 1,
  featureIds: [],
  ...more,
});

/** @param {string} id @param {string | null} parentId */
const stored = (id, parentId) => ({
  ...project({ parentId }),
  id,
  createdBy: "u1",
  createdByEmail: "u1@example.org",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "u1",
  updatedByEmail: "u1@example.org",
});

describe("validating a project", () => {
  it("accepts a well-formed project", () => {
    expect(validateProject(project())).toBeNull();
  });

  it.each([
    ["no title", { title: "  " }],
    ["a long title", { title: "x".repeat(config.limits.title + 1) }],
    ["a long summary", { summary: "x".repeat(config.limits.notes + 1) }],
    ["an unknown status", { status: "finished" }],
    ["nobody responsible", { responsibleUid: "" }],
    [
      "too many linked features",
      {
        featureIds: Array(config.limits.featureLinks + 1).fill("f"),
      },
    ],
    ["linked features that are not a list", { featureIds: "f1" }],
  ])("refuses %s, with a sentence to show", (_name, more) => {
    const problem = validateProject(/** @type {any} */ (project(more)));
    expect(problem).toEqual(expect.any(String));
    expect(problem?.endsWith(".")).toBe(true);
  });
});

describe("nesting projects", () => {
  const all = [stored("a", null), stored("b", "a"), stored("c", "b")];

  it("counts levels from one at the top", () => {
    expect(projectDepth(all, "a")).toBe(1);
    expect(projectDepth(all, "c")).toBe(3);
    expect(projectDepth(all, "missing")).toBe(0);
  });

  it("does not hang on a loop of parents", () => {
    const loop = [stored("a", "b"), stored("b", "a")];
    expect(projectDepth(loop, "a")).toBe(2);
  });

  it("allows a sub-project below the depth limit and refuses one beyond it", () => {
    expect(
      validateNewProject(project({ parentId: "b" }), all.slice(0, 2)),
    ).toBeNull();
    expect(validateNewProject(project({ parentId: "c" }), all)).toMatch(
      /levels deep/,
    );
  });

  it("refuses a sub-project of a project that has gone", () => {
    expect(validateNewProject(project({ parentId: "nope" }), all)).toMatch(
      /no longer exists/,
    );
  });

  it("collects a project and everything beneath it", () => {
    const withSibling = [...all, stored("d", null), stored("e", "d")];
    expect([...projectAndDescendants(withSibling, "a")].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect([...projectAndDescendants(withSibling, "e")]).toEqual(["e"]);
  });
});

describe("validating an action", () => {
  it("accepts a well-formed action, with or without an assignee and date", () => {
    expect(validateAction(action())).toBeNull();
    expect(
      validateAction(
        action({
          assigneeUid: "u2",
          assigneeEmail: "u2@example.org",
          dueDate: "2026-12-01",
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ["no project", { projectId: "" }],
    ["no title", { title: "" }],
    ["long details", { details: "x".repeat(config.limits.notes + 1) }],
    ["an unknown lane", { lane: "someday" }],
    ["an order that is not a number", { order: Number.NaN }],
    ["an assignee with no email", { assigneeUid: "u2" }],
    ["an email with no assignee", { assigneeEmail: "u2@example.org" }],
    ["a badly formed date", { dueDate: "1 Dec" }],
    ["a date that does not exist", { dueDate: "2026-02-31" }],
  ])("refuses %s", (_name, more) => {
    expect(validateAction(/** @type {any} */ (action(more)))).toEqual(
      expect.any(String),
    );
  });

  it("knows a real date from an impossible one", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2027-13-01")).toBe(false);
    expect(isValidDate(20271201)).toBe(false);
  });
});

describe("validating a note", () => {
  it("needs a project and some text within the limit", () => {
    expect(validateNote({ projectId: "p1", body: "Spoke to them" })).toBeNull();
    expect(validateNote({ projectId: "", body: "x" })).toEqual(
      expect.any(String),
    );
    expect(validateNote({ projectId: "p1", body: "  " })).toEqual(
      expect.any(String),
    );
    expect(
      validateNote({
        projectId: "p1",
        body: "x".repeat(config.limits.notes + 1),
      }),
    ).toEqual(expect.any(String));
  });
});

describe("ordering the board", () => {
  it("places a card between its neighbours, or at either end", () => {
    expect(orderBetween(undefined, undefined)).toBe(1);
    expect(orderBetween(undefined, 3)).toBe(2);
    expect(orderBetween(3, undefined)).toBe(4);
    expect(orderBetween(1, 2)).toBe(1.5);
  });

  it("lists one lane in order, breaking ties the same way every time", () => {
    const a = (
      /** @type {string} */ id,
      /** @type {number} */ order,
      at = "1",
    ) => /** @type {any} */ ({ id, lane: "agreed", order, createdAt: at });
    const lane = actionsInLane(
      [
        a("late", 2),
        a("tie-b", 1, "2"),
        a("tie-a", 1, "1"),
        { ...a("other", 0), lane: "done" },
      ],
      "agreed",
    );
    expect(lane.map((x) => x.id)).toEqual(["tie-a", "tie-b", "late"]);
  });
});
