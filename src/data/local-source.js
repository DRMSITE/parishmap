// The default DataSource: records live in memory and are mirrored to localStorage,
// so the app works with no back end. Replace it with your own implementation of
// the DataSource typedef (see types.js) and swap it in `main.js`.

import { config } from "../config.js";
import { parseGeometry, withGeometry } from "../util/geo.js";
import { matchesQuery } from "./query.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */
/** @typedef {import("../types.js").DataSource} DataSource */

const STORAGE_KEY = `${config.storagePrefix}records`;

/** @returns {DataSource} */
export function createLocalSource() {
  /** @type {Map<string, GeoRecord>} */
  const records = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /**
   * Stored data is untrusted: another tab, another app on the same origin or the user
   * can change it. A malformed record would throw in the views and break them on every
   * visit, so anything that is not a well-formed record is dropped.
   * @param {any} r
   * @returns {r is GeoRecord}
   */
  function isRecord(r) {
    return (
      r !== null &&
      typeof r === "object" &&
      typeof r.id === "string" &&
      typeof r.createdAt === "string" &&
      typeof r.updatedAt === "string" &&
      Number.isFinite(r.lat) &&
      Math.abs(r.lat) <= 90 &&
      Number.isFinite(r.lng) &&
      Math.abs(r.lng) <= 180 &&
      r.data !== null &&
      typeof r.data === "object" &&
      !Array.isArray(r.data) &&
      (r.geometry === undefined ||
        "geometry" in parseGeometry(r.geometry, config.limits.vertices))
    );
  }

  /**
   * Replace the in-memory records with what is in storage. Other tabs share the same
   * key, so this runs before every change and when another tab writes; otherwise a
   * save here would overwrite their records. Unreadable storage leaves memory as it is.
   */
  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      records.clear();
      if (Array.isArray(stored))
        for (const r of stored) if (isRecord(r)) records.set(r.id, r);
    } catch {
      // Storage unavailable or corrupt: keep what we have.
    }
  }

  /** @param {unknown} error */
  const isQuotaError = (error) =>
    error instanceof DOMException && error.name === "QuotaExceededError";

  /**
   * Write the records. A full store is reported to the caller, so a save is never
   * claimed for data that was not kept; storage that is merely unavailable (private
   * browsing) falls back to working in memory.
   */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...records.values()]));
    } catch (error) {
      if (isQuotaError(error)) throw new Error("Browser storage is full.");
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
   * @param {() => void} undo
   * @returns {T}
   */
  function commit(change, undo) {
    load();
    const result = change();
    try {
      persist();
    } catch (error) {
      undo();
      throw error;
    }
    notify();
    return result;
  }

  load();

  return {
    async list(query) {
      return [...records.values()].filter((r) => matchesQuery(r, query));
    },
    async get(id) {
      return records.get(id);
    },
    async create(input) {
      const now = new Date().toISOString();
      const record = {
        ...withGeometry(input, config.limits.vertices),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      return commit(
        () => {
          records.set(record.id, record);
          return record;
        },
        () => records.delete(record.id),
      );
    },
    async update(id, patch) {
      load();
      const existing = records.get(id);
      if (!existing) throw new Error(`No record with id "${id}".`);
      const record = {
        ...existing,
        ...withGeometry(patch, config.limits.vertices),
        id,
        updatedAt: new Date().toISOString(),
      };
      return commit(
        () => {
          records.set(id, record);
          return record;
        },
        () => records.set(id, existing),
      );
    },
    async remove(id) {
      load();
      const existing = records.get(id);
      if (!existing) return;
      commit(
        () => records.delete(id),
        () => records.set(id, existing),
      );
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
  };
}
