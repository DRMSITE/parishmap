// Projects, actions and notes kept in this browser, for the local, sign-in-free start-up
// (development and the end-to-end tests only). It behaves like the Firestore store, and
// starts with a small example so there is something to look at. Who may do what is
// decided by the guard, not here.

import { config } from "../config.js";
import { toAction, toNote, toProject } from "../projects/convert.js";
import {
  byOrder,
  projectAndDescendants,
  validateAction,
  validateNewProject,
  validateNote,
  validateProject,
} from "../projects/model.js";

/** @typedef {import("../types.js").ProjectsStore} ProjectsStore */
/** @typedef {import("../types.js").Stamps} Stamps */

const STORAGE_KEY = `${config.storagePrefix}projects`;

/** Matches the person the local start-up signs in as (see local-people.js). */
const ME = { uid: "me", email: "me@example.org" };

/**
 * @param {string} id
 * @param {string} uid
 * @param {string} at
 * @returns {Stamps}
 */
const seeded = (id, uid, at) => ({
  id,
  createdBy: uid,
  createdByEmail: `${uid}@example.org`,
  createdAt: at,
  updatedAt: at,
  updatedBy: uid,
  updatedByEmail: `${uid}@example.org`,
});

function seedData() {
  const at = "2026-10-01T09:00:00.000Z";
  return {
    projects: [
      {
        ...seeded("p-green", "me", at),
        title: "Village green refresh",
        summary: "New benches, a litter bin and a tidy-up of the paths.",
        status: "active",
        parentId: null,
        responsibleUid: "alex",
        responsibleEmail: "alex@example.org",
        featureIds: [],
      },
      {
        ...seeded("p-benches", "alex", at),
        title: "New benches",
        summary: "Choose, price and install two benches.",
        status: "planning",
        parentId: "p-green",
        responsibleUid: "alex",
        responsibleEmail: "alex@example.org",
        featureIds: [],
      },
    ],
    actions: [
      {
        ...seeded("a-quotes", "alex", at),
        projectId: "p-green",
        title: "Get two quotes for the benches",
        details: "",
        lane: "ideas",
        order: 1,
        featureIds: [],
      },
      {
        ...seeded("a-budget", "alex", at),
        projectId: "p-green",
        title: "Agree the budget",
        details: "Check what is left in the grounds budget.",
        lane: "agreed",
        order: 1,
        assigneeUid: "clerk",
        assigneeEmail: "clerk@example.org",
        dueDate: "2026-11-15",
        featureIds: [],
      },
      {
        ...seeded("a-survey", "alex", at),
        projectId: "p-green",
        title: "Survey the paths",
        details: "",
        lane: "in-progress",
        order: 1,
        featureIds: [],
      },
    ],
    notes: [
      {
        ...seeded("n-start", "alex", at),
        projectId: "p-green",
        body: "Discussed at the October meeting; no objections.",
      },
    ],
  };
}

/** @typedef {ReturnType<typeof seedData>} Snapshot */

/**
 * @param {object} [options]
 * @param {{ uid: string, email: string }} [options.user] Who writes are attributed to.
 * @returns {ProjectsStore}
 */
export function createLocalProjects({ user = ME } = {}) {
  const projects = new Map();
  const actions = new Map();
  const notes = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /** @param {Map<string, any>} map @param {any[]} list @param {typeof toProject | typeof toAction | typeof toNote} convert */
  function fill(map, list, convert) {
    map.clear();
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const record =
        item && typeof item.id === "string"
          ? convert(item.id, item)
          : undefined;
      if (record) map.set(record.id, record);
    }
  }

  /** @param {any} stored */
  function fillAll(stored) {
    fill(projects, stored?.projects, toProject);
    fill(actions, stored?.actions, toAction);
    fill(notes, stored?.notes, toNote);
  }

  function snapshot() {
    return {
      projects: [...projects.values()],
      actions: [...actions.values()],
      notes: [...notes.values()],
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError")
        throw new Error("Browser storage is full.");
      // Storage unavailable (private browsing): carry on in memory.
    }
  }

  /**
   * Replace memory with what is in storage. Other tabs share the key, so this runs before
   * every change and when another tab writes. A browser with nothing stored yet gets the
   * example; unreadable storage leaves memory as it is.
   */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        fillAll(seedData());
        persist();
      } else {
        fillAll(JSON.parse(raw));
      }
    } catch {
      // Storage unavailable or corrupt: keep what we have.
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  /** @param {StorageEvent} event */
  function onStorage(event) {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    load();
    notify();
  }

  /**
   * Apply a change, undoing it if storage refuses it.
   * @template T
   * @param {() => T} change
   * @returns {T}
   */
  function commit(change) {
    load();
    const backup = structuredClone(snapshot());
    const result = change();
    try {
      persist();
    } catch (error) {
      fillAll(backup);
      throw error;
    }
    notify();
    return result;
  }

  const stampNew = () => {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.uid,
      updatedByEmail: user.email,
    };
  };

  const stampTouched = () => ({
    updatedAt: new Date().toISOString(),
    updatedBy: user.uid,
    updatedByEmail: user.email,
  });

  /**
   * @template T
   * @param {Map<string, T>} map
   * @param {string} id
   * @returns {T}
   */
  function existing(map, id) {
    const found = map.get(id);
    if (!found) throw new Error("That no longer exists.");
    return found;
  }

  /**
   * Apply a patch; an explicit undefined clears an optional field.
   * @template {Record<string, any>} T
   * @param {T} current
   * @param {Record<string, any>} patch
   * @returns {T}
   */
  function applyPatch(current, patch) {
    const merged = { ...current, ...patch };
    for (const [key, value] of Object.entries(patch))
      if (value === undefined) delete merged[key];
    return merged;
  }

  load();

  return {
    async load() {
      load();
      return {
        projects: [...projects.values()].sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
        actions: [...actions.values()].sort(byOrder),
        notes: [...notes.values()].sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
      };
    },

    subscribe(listener) {
      if (listeners.size === 0)
        globalThis.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0)
          globalThis.removeEventListener("storage", onStorage);
      };
    },

    async createProject(input) {
      load();
      const problem = validateNewProject(input, [...projects.values()]);
      if (problem) throw new Error(problem);
      const record = {
        title: input.title.trim(),
        summary: input.summary,
        status: input.status,
        parentId: input.parentId ?? null,
        responsibleUid: input.responsibleUid,
        responsibleEmail: input.responsibleEmail,
        featureIds: [...input.featureIds],
        ...stampNew(),
      };
      return commit(() => {
        projects.set(record.id, record);
        return record;
      });
    },

    async updateProject(id, patch) {
      load();
      const merged = applyPatch(existing(projects, id), patch);
      const problem = validateProject(merged);
      if (problem) throw new Error(problem);
      const record = {
        ...merged,
        title: merged.title.trim(),
        ...stampTouched(),
      };
      return commit(() => {
        projects.set(id, record);
        return record;
      });
    },

    async removeProject(id) {
      load();
      if (!projects.has(id)) return;
      const ids = projectAndDescendants([...projects.values()], id);
      commit(() => {
        for (const [key, a] of actions)
          if (ids.has(a.projectId)) actions.delete(key);
        for (const [key, n] of notes)
          if (ids.has(n.projectId)) notes.delete(key);
        for (const pid of ids) projects.delete(pid);
      });
    },

    async createAction(input) {
      load();
      if (!projects.has(input.projectId))
        throw new Error("That project no longer exists.");
      const problem = validateAction(input);
      if (problem) throw new Error(problem);
      const record = {
        ...input,
        title: input.title.trim(),
        featureIds: [...input.featureIds],
        ...stampNew(),
      };
      for (const key of /** @type {(keyof typeof record)[]} */ (
        Object.keys(record)
      ))
        if (record[key] === undefined) delete record[key];
      return commit(() => {
        actions.set(record.id, record);
        return record;
      });
    },

    async updateAction(id, patch) {
      load();
      const merged = applyPatch(existing(actions, id), patch);
      const problem = validateAction(merged);
      if (problem) throw new Error(problem);
      const record = {
        ...merged,
        title: merged.title.trim(),
        ...stampTouched(),
      };
      return commit(() => {
        actions.set(id, record);
        return record;
      });
    },

    async removeAction(id) {
      load();
      if (!actions.has(id)) return;
      commit(() => actions.delete(id));
    },

    async createNote(input) {
      load();
      if (!projects.has(input.projectId))
        throw new Error("That project no longer exists.");
      const problem = validateNote(input);
      if (problem) throw new Error(problem);
      const record = {
        projectId: input.projectId,
        ...(input.actionId ? { actionId: input.actionId } : {}),
        body: input.body.trim(),
        ...stampNew(),
      };
      return commit(() => {
        notes.set(record.id, record);
        return record;
      });
    },

    async updateNote(id, patch) {
      load();
      const merged = { ...existing(notes, id), ...patch };
      const problem = validateNote(merged);
      if (problem) throw new Error(problem);
      const record = {
        ...merged,
        body: merged.body.trim(),
        ...stampTouched(),
      };
      return commit(() => {
        notes.set(id, record);
        return record;
      });
    },

    async removeNote(id) {
      load();
      if (!notes.has(id)) return;
      commit(() => notes.delete(id));
    },
  };
}
