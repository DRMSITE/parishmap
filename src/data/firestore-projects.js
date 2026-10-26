// Projects, actions and notes in Cloud Firestore. Security is enforced by firestore.rules;
// the checks here give readable errors and keep stored data well-formed.
//
// As with features, one live listener per collection holds everything in memory: a parish
// has a few dozen projects at most, and a listener bills only for documents that change.
// Stored data is untrusted, so anything not well-formed is left out rather than breaking
// the views.

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { toAction, toNote, toProject } from "../projects/convert.js";
import {
  byOrder,
  projectAndDescendants,
  projectDepth,
  validateAction,
  validateNewProject,
  validateNote,
  validateProject,
} from "../projects/model.js";
import { friendly } from "./firestore-source.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").ProjectNote} ProjectNote */
/** @typedef {import("../types.js").Stamps} Stamps */
/** @typedef {import("../types.js").ProjectsStore} ProjectsStore */
/** @typedef {import("firebase/firestore").Firestore} Firestore */
/** @typedef {{ uid: string, email: string }} SignedInUser */

export const PROJECTS = "projects";
export const ACTIONS = "actions";
export const NOTES = "notes";

/** Firestore allows 500 writes in a batch; stay well inside it. */
const BATCH_SIZE = 400;

const PROJECT_KEYS = [
  "title",
  "summary",
  "status",
  "responsibleUid",
  "responsibleEmail",
  "featureIds",
];
const ACTION_KEYS = [
  "title",
  "details",
  "lane",
  "order",
  "assigneeUid",
  "assigneeEmail",
  "dueDate",
  "featureIds",
];
const NOTE_KEYS = ["body"];

/**
 * The fields to store. Firestore rejects `undefined`, so a cleared optional field is
 * left out of a create and becomes `deleteField()` on an update. Titles and notes are
 * trimmed.
 * @param {Record<string, any>} fields
 * @param {string[]} keys The fields that may be stored.
 * @param {boolean} isUpdate
 * @returns {Record<string, unknown>}
 */
function toStored(fields, keys, isUpdate) {
  /** @type {Record<string, unknown>} */
  const stored = {};
  for (const key of keys) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value === undefined) {
      if (isUpdate) stored[key] = deleteField();
    } else {
      stored[key] =
        (key === "title" || key === "body") && typeof value === "string"
          ? value.trim()
          : value;
    }
  }
  return stored;
}

/** @param {Record<string, any>} fields @param {string[]} keys */
function tidy(fields, keys) {
  return toStored(fields, keys, false);
}

/**
 * A live listener over one collection, holding every valid document in memory.
 * @template T
 * @param {Firestore} db
 * @param {string} name
 * @param {(id: string, d: Record<string, any>) => T | undefined} convert
 * @param {() => void} notify Called when the data changes after the first batch.
 */
function watch(db, name, convert, notify) {
  /** @type {Map<string, T & { id: string }>} */
  const items = new Map();
  /** @type {Promise<void> | null} */
  let ready = null;
  /** @type {(() => void) | null} */
  let stop = null;

  return {
    items,
    /** Start listening (once); resolves when the first batch has arrived. */
    start() {
      ready ??= new Promise((resolve, reject) => {
        let first = true;
        stop = onSnapshot(
          collection(db, name),
          (snapshot) => {
            items.clear();
            for (const document of snapshot.docs) {
              const item = convert(
                document.id,
                document.data({ serverTimestamps: "estimate" }),
              );
              if (item) items.set(document.id, /** @type {any} */ (item));
            }
            if (first) {
              first = false;
              resolve();
            } else {
              notify();
            }
          },
          (error) => {
            // Start afresh on the next request, for example after signing in again.
            stop?.();
            stop = null;
            ready = null;
            items.clear();
            if (first) reject(friendly(error));
            else notify();
            first = false;
          },
        );
      });
      return ready;
    },
    close() {
      stop?.();
      stop = null;
      ready = null;
      items.clear();
    },
  };
}

/** @param {{ createdAt: string, id: string }} a @param {{ createdAt: string, id: string }} b */
const byCreated = (a, b) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * @param {object} options
 * @param {Firestore} options.db
 * @param {() => SignedInUser | null} options.getUser Who is signed in right now.
 * @returns {ProjectsStore & { close: () => void }}
 */
export function createFirestoreProjects({ db, getUser }) {
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const projects = watch(db, PROJECTS, toProject, notify);
  const actions = watch(db, ACTIONS, toAction, notify);
  const notes = watch(db, NOTES, toNote, notify);

  async function load() {
    await Promise.all([projects.start(), actions.start(), notes.start()]);
    return {
      projects: [...projects.items.values()].sort(byCreated),
      actions: [...actions.items.values()].sort(byOrder),
      notes: [...notes.items.values()].sort(byCreated),
    };
  }

  /** @returns {SignedInUser} */
  function requireUser() {
    const user = getUser();
    if (!user) throw new Error("You need to sign in to do that.");
    return user;
  }

  /** @param {SignedInUser} user */
  const createdStamps = (user) => ({
    createdBy: user.uid,
    createdByEmail: user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedByEmail: user.email,
  });

  /** @param {SignedInUser} user */
  const touchedStamps = (user) => ({
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedByEmail: user.email,
  });

  /**
   * The stamps for a record just written, as the listener will soon report them.
   * @param {string} id
   * @param {SignedInUser} user
   * @returns {Stamps}
   */
  function returnedStamps(id, user) {
    const now = new Date().toISOString();
    return {
      id,
      createdBy: user.uid,
      createdByEmail: user.email,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.uid,
      updatedByEmail: user.email,
    };
  }

  /**
   * The existing record with this id, or an Error saying it has gone.
   * @template {{ id: string }} T
   * @param {Map<string, T>} items
   * @param {string} id
   * @returns {T}
   */
  function existing(items, id) {
    const found = items.get(id);
    if (!found) throw new Error("That no longer exists.");
    return found;
  }

  /**
   * @param {Promise<unknown>} write
   * @returns {Promise<void>}
   */
  async function attempt(write) {
    try {
      await write;
    } catch (error) {
      throw friendly(error);
    }
  }

  return {
    load,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async createProject(input) {
      const user = requireUser();
      const { projects: all } = await load();
      const problem = validateNewProject(input, all);
      if (problem) throw new Error(problem);
      const stored = {
        ...tidy(input, PROJECT_KEYS),
        parentId: input.parentId ?? null,
        ...createdStamps(user),
      };
      /** @type {import("firebase/firestore").DocumentReference | undefined} */
      let ref;
      await attempt(
        addDoc(collection(db, PROJECTS), stored).then((r) => {
          ref = r;
        }),
      );
      return {
        ...input,
        parentId: input.parentId ?? null,
        ...returnedStamps(/** @type {any} */ (ref).id, user),
      };
    },

    async updateProject(id, patch) {
      const user = requireUser();
      await load();
      const current = existing(projects.items, id);
      const merged = { ...current, ...patch };
      const problem = validateProject(merged);
      if (problem) throw new Error(problem);
      await attempt(
        updateDoc(doc(db, PROJECTS, id), {
          ...toStored(patch, PROJECT_KEYS, true),
          ...touchedStamps(user),
        }),
      );
      return {
        ...merged,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      };
    },

    async removeProject(id) {
      requireUser();
      const all = await load();
      if (!projects.items.has(id)) return;
      const ids = projectAndDescendants(all.projects, id);
      // Actions and notes first and projects last, deepest first, so a failure part-way
      // leaves a project that can be deleted again rather than orphans nobody can see.
      const refs = [
        ...all.actions
          .filter((a) => ids.has(a.projectId))
          .map((a) => doc(db, ACTIONS, a.id)),
        ...all.notes
          .filter((n) => ids.has(n.projectId))
          .map((n) => doc(db, NOTES, n.id)),
        ...[...ids]
          .sort(
            (a, b) =>
              projectDepth(all.projects, b) - projectDepth(all.projects, a),
          )
          .map((pid) => doc(db, PROJECTS, pid)),
      ];
      for (let i = 0; i < refs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
        await attempt(batch.commit());
      }
    },

    async createAction(input) {
      const user = requireUser();
      const { projects: all } = await load();
      if (!all.some((p) => p.id === input.projectId))
        throw new Error("That project no longer exists.");
      const problem = validateAction(input);
      if (problem) throw new Error(problem);
      const stored = {
        ...tidy(input, ACTION_KEYS),
        projectId: input.projectId,
        ...createdStamps(user),
      };
      /** @type {import("firebase/firestore").DocumentReference | undefined} */
      let ref;
      await attempt(
        addDoc(collection(db, ACTIONS), stored).then((r) => {
          ref = r;
        }),
      );
      return { ...input, ...returnedStamps(/** @type {any} */ (ref).id, user) };
    },

    async updateAction(id, patch) {
      const user = requireUser();
      await load();
      const current = existing(actions.items, id);
      const merged = { ...current, ...patch };
      // An explicit undefined clears an optional field.
      for (const [key, value] of Object.entries(patch))
        if (value === undefined) delete (/** @type {any} */ (merged)[key]);
      const problem = validateAction(merged);
      if (problem) throw new Error(problem);
      await attempt(
        updateDoc(doc(db, ACTIONS, id), {
          ...toStored(patch, ACTION_KEYS, true),
          ...touchedStamps(user),
        }),
      );
      return {
        ...merged,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      };
    },

    async removeAction(id) {
      requireUser();
      await load();
      if (!actions.items.has(id)) return;
      await attempt(deleteDoc(doc(db, ACTIONS, id)));
    },

    async createNote(input) {
      const user = requireUser();
      const { projects: all } = await load();
      if (!all.some((p) => p.id === input.projectId))
        throw new Error("That project no longer exists.");
      const problem = validateNote(input);
      if (problem) throw new Error(problem);
      const stored = {
        ...tidy(input, NOTE_KEYS),
        projectId: input.projectId,
        ...(input.actionId ? { actionId: input.actionId } : {}),
        ...createdStamps(user),
      };
      /** @type {import("firebase/firestore").DocumentReference | undefined} */
      let ref;
      await attempt(
        addDoc(collection(db, NOTES), stored).then((r) => {
          ref = r;
        }),
      );
      return { ...input, ...returnedStamps(/** @type {any} */ (ref).id, user) };
    },

    async updateNote(id, patch) {
      const user = requireUser();
      await load();
      const current = existing(notes.items, id);
      const merged = { ...current, ...patch };
      const problem = validateNote(merged);
      if (problem) throw new Error(problem);
      await attempt(
        updateDoc(doc(db, NOTES, id), {
          ...toStored(patch, NOTE_KEYS, true),
          ...touchedStamps(user),
        }),
      );
      return {
        ...merged,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      };
    },

    async removeNote(id) {
      requireUser();
      await load();
      if (!notes.items.has(id)) return;
      await attempt(deleteDoc(doc(db, NOTES, id)));
    },

    /** Stop listening, for example on sign-out, so the server is not left refusing them. */
    close() {
      projects.close();
      actions.close();
      notes.close();
    },
  };
}
