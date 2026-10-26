import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalSource } from "../src/data/local-source.js";
import {
  allowAll,
  ForbiddenError,
  guardDataSource,
} from "../src/auth/guard.js";
import { render } from "../src/views/list.view.js";

beforeEach(() => localStorage.clear());

/** A guard that refuses the listed actions, optionally only for some records. */
function denying(
  /** @type {string[]} */ actions,
  /** @type {(record?: any) => boolean} */ applies = () => true,
) {
  return {
    can: (/** @type {string} */ action, /** @type {any} */ record) =>
      !(actions.includes(action) && applies(record)),
  };
}

describe("guardDataSource", () => {
  it("passes everything through with the default allow-all guard", async () => {
    const source = guardDataSource(createLocalSource(), allowAll);
    const created = await source.create({ lat: 1, lng: 2, data: { a: 1 } });
    expect(await source.list()).toHaveLength(1);
    expect((await source.get(created.id))?.data.a).toBe(1);
    await source.update(created.id, { data: { a: 2 } });
    await source.remove(created.id);
    expect(await source.list()).toHaveLength(0);
  });

  it("throws ForbiddenError, without touching the source, when create, update or delete is refused", async () => {
    const inner = createLocalSource();
    const existing = await inner.create({ lat: 1, lng: 2, data: {} });
    const create = vi.spyOn(inner, "create");
    const update = vi.spyOn(inner, "update");
    const remove = vi.spyOn(inner, "remove");
    const source = guardDataSource(
      inner,
      denying(["create", "update", "delete"]),
    );

    await expect(
      source.create({ lat: 0, lng: 0, data: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(source.update(existing.id, {})).rejects.toMatchObject({
      name: "ForbiddenError",
      action: "update",
      recordId: existing.id,
    });
    await expect(source.remove(existing.id)).rejects.toMatchObject({
      action: "delete",
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(await inner.list()).toHaveLength(1);
  });

  it("decides per record, and filters unreadable records out of list", async () => {
    const inner = createLocalSource();
    const mine = await inner.create({ lat: 1, lng: 1, data: { owner: "me" } });
    const theirs = await inner.create({
      lat: 2,
      lng: 2,
      data: { owner: "them" },
    });
    const source = guardDataSource(
      inner,
      denying(
        ["read", "update", "delete"],
        (record) => record?.data.owner === "them",
      ),
    );

    expect((await source.list()).map((r) => r.id)).toEqual([mine.id]);
    await expect(source.get(theirs.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(source.remove(theirs.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await source.update(mine.id, { data: { owner: "me", edited: true } });
    await source.remove(mine.id);
    expect(await inner.list()).toHaveLength(1);
  });

  it("leaves a missing record to the source to report", async () => {
    const source = guardDataSource(
      createLocalSource(),
      denying(["update", "delete"]),
    );
    await expect(source.update("nope", {})).rejects.toThrow(/No record/);
    await expect(source.remove("nope")).resolves.toBeUndefined();
  });

  it("passes subscribe through", async () => {
    const source = guardDataSource(createLocalSource(), allowAll);
    let calls = 0;
    const stop = source.subscribe?.(() => calls++);
    await source.create({ lat: 0, lng: 0, data: {} });
    stop?.();
    await source.create({ lat: 0, lng: 0, data: {} });
    expect(calls).toBe(1);
  });
});

describe("points list actions", () => {
  /** @param {any} guard */
  async function renderList(guard) {
    localStorage.clear();
    const data = createLocalSource();
    await data.create({ lat: 1, lng: 2, data: { title: "Old oak" } });
    const container = document.createElement("div");
    document.body.append(container);
    const ctx = /** @type {any} */ ({ data, guard, flags: {} });
    const cleanup = await render(container, ctx);
    await vi.waitFor(() =>
      expect(container.querySelectorAll("li")).toHaveLength(1),
    );
    return { container, cleanup };
  }

  it("offers Edit and Delete, named for the point, when allowed", async () => {
    const { container, cleanup } = await renderList(allowAll);
    const buttons = [...container.querySelectorAll(".point-actions wa-button")];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      "Edit Old oak",
      "Delete Old oak",
    ]);
    cleanup?.();
  });

  it("offers only what the guard allows", async () => {
    const editOnly = await renderList(denying(["delete"]));
    expect(
      editOnly.container.querySelector('[data-action="edit"]'),
    ).not.toBeNull();
    expect(
      editOnly.container.querySelector('[data-action="remove"]'),
    ).toBeNull();
    editOnly.cleanup?.();

    const none = await renderList(denying(["update", "delete"]));
    expect(none.container.querySelector(".point-actions")).toBeNull();
    none.cleanup?.();
  });
});
