// A DataSource backed by Cloud Firestore. Drop-in replacement for the local source:
// pass it to the app in `main.js`. Security is enforced by firestore.rules; the checks
// here only give readable errors and keep stored data well-formed.
//
// One live listener holds every feature in memory. A parish map has hundreds of
// features at most, and a listener bills only for documents that change, whereas
// querying on each view would bill for every document each time.

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { config } from "../config.js";
import { parseGeometry, withGeometry } from "../util/geo.js";
import { matchesQuery } from "./query.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */
/** @typedef {import("../types.js").GeoRecordInput} GeoRecordInput */
/** @typedef {import("../types.js").DataSource} DataSource */
/** @typedef {import("firebase/firestore").Firestore} Firestore */
/** @typedef {{ uid: string, email: string }} SignedInUser */

export const COLLECTION = "features";

/**
 * Turn a Firestore error into one a person can act on, keeping the original as `cause`.
 * @param {unknown} error
 * @returns {Error}
 */
export function friendly(error) {
  const code = /** @type {{ code?: string }} */ (error)?.code;
  if (code === "permission-denied")
    return new Error("You do not have permission to do that.", {
      cause: error,
    });
  if (code === "unavailable")
    return new Error("Cannot reach the server. Check your connection.", {
      cause: error,
    });
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Convert a stored document to a record. Stored data is untrusted, so anything that is
 * not well-formed gives `undefined` and is left out rather than breaking the views.
 * @param {import("firebase/firestore").QueryDocumentSnapshot} snapshot
 * @returns {GeoRecord | undefined}
 */
function toRecord(snapshot) {
  const d = snapshot.data({ serverTimestamps: "estimate" });
  if (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90) return undefined;
  if (!Number.isFinite(d.lng) || Math.abs(d.lng) > 180) return undefined;
  if (d.data === null || typeof d.data !== "object" || Array.isArray(d.data))
    return undefined;
  if (typeof d.createdAt?.toDate !== "function") return undefined;
  if (typeof d.updatedAt?.toDate !== "function") return undefined;

  /** @type {GeoRecord} */
  const record = {
    id: snapshot.id,
    lat: d.lat,
    lng: d.lng,
    data: d.data,
    createdAt: d.createdAt.toDate().toISOString(),
    updatedAt: d.updatedAt.toDate().toISOString(),
  };
  if (typeof d.category === "string") record.category = d.category;
  if (typeof d.createdBy === "string") record.createdBy = d.createdBy;
  if (typeof d.createdByEmail === "string")
    record.createdByEmail = d.createdByEmail;
  if (d.geometry !== undefined) {
    try {
      const parsed = parseGeometry(
        JSON.parse(d.geometry),
        config.limits.vertices,
      );
      if ("error" in parsed) return undefined;
      record.geometry = parsed.geometry;
    } catch {
      return undefined;
    }
  }
  return record;
}

/**
 * Fields as stored. Firestore rejects nested arrays, so geometry is a JSON string, and
 * `undefined` is not allowed, so a cleared optional field becomes `deleteField()` on an
 * update and is left out on a create.
 * @param {Partial<GeoRecordInput>} fields
 * @param {boolean} isUpdate
 * @returns {Record<string, unknown>}
 */
function toStored(fields, isUpdate) {
  const { geometry, category, ...rest } = withGeometry(
    fields,
    config.limits.vertices,
  );
  /** @type {Record<string, unknown>} */
  const stored = { ...rest };
  for (const [key, value] of Object.entries({
    geometry: geometry && JSON.stringify(geometry),
    category,
  })) {
    if (value !== undefined) stored[key] = value;
    else if (isUpdate && key in fields) stored[key] = deleteField();
  }
  return stored;
}

/**
 * @param {object} options
 * @param {Firestore} options.db
 * @param {() => SignedInUser | null} options.getUser Who is signed in right now.
 * @returns {DataSource & { close: () => void }}
 */
export function createFirestoreSource({ db, getUser }) {
  const features = collection(db, COLLECTION);
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** Every feature the listener has delivered, refilled on each snapshot. */
  const records = new Map();
  /** @type {Promise<Map<string, GeoRecord>> | null} */
  let ready = null;
  /** @type {(() => void) | null} */
  let stop = null;

  function notify() {
    for (const listener of listeners) listener();
  }

  /** Start listening (once) and resolve with the records when the first batch arrives. */
  function start() {
    ready ??= new Promise((resolve, reject) => {
      let first = true;
      stop = onSnapshot(
        features,
        (snapshot) => {
          records.clear();
          for (const document of snapshot.docs) {
            const record = toRecord(document);
            if (record) records.set(record.id, record);
          }
          if (first) {
            first = false;
            resolve(records);
          } else {
            notify();
          }
        },
        (error) => {
          // Start afresh on the next request, for example after signing in again.
          stop?.();
          stop = null;
          ready = null;
          records.clear();
          if (first) reject(friendly(error));
          else notify();
          first = false;
        },
      );
    });
    return ready;
  }

  /** @returns {SignedInUser} */
  function requireUser() {
    const user = getUser();
    if (!user) throw new Error("You need to sign in to do that.");
    return user;
  }

  return {
    async list(query) {
      const records = await start();
      return [...records.values()]
        .filter((record) => matchesQuery(record, query))
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
    },

    async get(id) {
      return (await start()).get(id);
    },

    async create(input) {
      const user = requireUser();
      const stored = {
        ...toStored(input, false),
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        const ref = await addDoc(features, stored);
        const now = new Date().toISOString();
        return {
          ...withGeometry(input, config.limits.vertices),
          id: ref.id,
          createdBy: user.uid,
          createdByEmail: user.email,
          createdAt: now,
          updatedAt: now,
        };
      } catch (error) {
        throw friendly(error);
      }
    },

    async update(id, patch) {
      const existing = (await start()).get(id);
      if (!existing) throw new Error(`No record with id "${id}".`);
      const stored = { ...toStored(patch, true), updatedAt: serverTimestamp() };
      try {
        await updateDoc(doc(db, COLLECTION, id), stored);
      } catch (error) {
        throw friendly(error);
      }
      return {
        ...existing,
        ...withGeometry(patch, config.limits.vertices),
        id,
        updatedAt: new Date().toISOString(),
      };
    },

    async remove(id) {
      if (!(await start()).has(id)) return;
      try {
        await deleteDoc(doc(db, COLLECTION, id));
      } catch (error) {
        throw friendly(error);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Stop listening, for example on sign-out, so the server is not left refusing it. */
    close() {
      stop?.();
      stop = null;
      ready = null;
      records.clear();
    },
  };
}
