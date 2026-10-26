import { describe, expect, it } from "vitest";
import { toAction, toNote, toProject } from "../src/projects/convert.js";

/** A stand-in for a Firestore timestamp. @param {string} iso */
const timestamp = (iso) => ({ toDate: () => new Date(iso) });

const stamps = {
  createdBy: "u1",
  createdByEmail: "u1@example.org",
  createdAt: timestamp("2026-01-01T00:00:00Z"),
  updatedAt: timestamp("2026-01-02T00:00:00Z"),
  updatedBy: "u2",
  updatedByEmail: "u2@example.org",
};

const project = {
  title: "Village green",
  summary: "",
  status: "active",
  parentId: null,
  responsibleUid: "u1",
  responsibleEmail: "u1@example.org",
  featureIds: ["f1"],
  ...stamps,
};

const action = {
  projectId: "p1",
  title: "Get a quote",
  details: "",
  lane: "agreed",
  order: 1.5,
  featureIds: [],
  ...stamps,
};

const note = { projectId: "p1", body: "Spoke to them", ...stamps };

describe("reading a stored project", () => {
  it("turns timestamps into ISO strings and keeps the stamps", () => {
    expect(toProject("p1", project)).toEqual({
      ...project,
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("accepts ISO strings too, as the local store keeps them", () => {
    const local = {
      ...project,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    expect(toProject("p1", local)?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it.each([
    ["no title", { title: "" }],
    ["an unknown status", { status: "finished" }],
    ["a missing parent field", { parentId: undefined }],
    ["nobody responsible", { responsibleUid: "" }],
    ["linked features that are not strings", { featureIds: [1] }],
    ["no creation time", { createdAt: undefined }],
    ["a creation time that is not a date", { createdAt: "yesterday" }],
    ["no updater", { updatedBy: undefined }],
  ])("leaves out a project with %s", (_name, more) => {
    expect(toProject("p1", { ...project, ...more })).toBeUndefined();
  });
});

describe("reading a stored action", () => {
  it("keeps an assignee and due date when present", () => {
    const withBoth = {
      ...action,
      assigneeUid: "u3",
      assigneeEmail: "u3@example.org",
      dueDate: "2026-12-01",
    };
    expect(toAction("a1", withBoth)).toMatchObject({
      id: "a1",
      lane: "agreed",
      order: 1.5,
      assigneeUid: "u3",
      assigneeEmail: "u3@example.org",
      dueDate: "2026-12-01",
    });
    expect(toAction("a1", action)).not.toHaveProperty("assigneeUid");
    expect(toAction("a1", action)).not.toHaveProperty("dueDate");
  });

  it.each([
    ["no project", { projectId: "" }],
    ["an unknown lane", { lane: "someday" }],
    ["an order that is not a number", { order: "1" }],
    ["an assignee with no email", { assigneeUid: "u3" }],
    ["a bad due date", { dueDate: "soon" }],
    ["no linked features list", { featureIds: undefined }],
  ])("leaves out an action with %s", (_name, more) => {
    expect(toAction("a1", { ...action, ...more })).toBeUndefined();
  });
});

describe("reading a stored note", () => {
  it("keeps the action it belongs to, if any", () => {
    expect(toNote("n1", note)).toMatchObject({
      id: "n1",
      body: "Spoke to them",
    });
    expect(toNote("n1", { ...note, actionId: "a1" })?.actionId).toBe("a1");
  });

  it.each([
    ["no body", { body: "" }],
    ["no project", { projectId: undefined }],
    ["an empty action id", { actionId: "" }],
  ])("leaves out a note with %s", (_name, more) => {
    expect(toNote("n1", { ...note, ...more })).toBeUndefined();
  });
});
