// Feature and layer flags: things that can be shown or hidden. A layer registers
// a flag and listens for changes; the flags drawer builds one switch per flag, so
// adding a "show or hide X" option needs no toolbar changes.
//
// Values persist per browser. A back end can later supply values by calling
// `load()` at start-up.

import { config } from "../config.js";

/**
 * @typedef {object} FlagDefinition
 * @property {string} id
 * @property {string} label Shown next to the switch.
 * @property {boolean} [default] Defaults to true (shown).
 * @property {string} [hint] Optional explanatory text.
 */

const STORAGE_KEY = `${config.storagePrefix}flags`;

export class Flags extends EventTarget {
  /** @type {Map<string, FlagDefinition>} */
  #definitions = new Map();
  /** @type {Record<string, boolean>} */
  #values = {};

  constructor() {
    super();
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (stored && typeof stored === "object") this.#values = stored;
    } catch {
      // Storage unavailable or corrupt: fall back to defaults.
    }
  }

  /**
   * Declare a flag. Registering the same id again keeps the first definition.
   * @param {FlagDefinition} definition
   */
  register(definition) {
    if (!this.#definitions.has(definition.id))
      this.#definitions.set(definition.id, definition);
  }

  /** @returns {FlagDefinition[]} */
  definitions() {
    return [...this.#definitions.values()];
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  get(id) {
    return this.#values[id] ?? this.#definitions.get(id)?.default ?? true;
  }

  /**
   * @param {string} id
   * @param {boolean} value
   */
  set(id, value) {
    if (this.get(id) === value) return;
    this.#values[id] = value;
    this.#persist();
    this.dispatchEvent(new CustomEvent("change", { detail: { id, value } }));
  }

  /**
   * Apply values from elsewhere, such as a back end. Each change is announced.
   * @param {Record<string, boolean>} values
   */
  load(values) {
    for (const [id, value] of Object.entries(values)) this.set(id, value);
  }

  /**
   * Run `listener` for changes to one flag. Returns an unsubscribe function.
   * @param {string} id
   * @param {(value: boolean) => void} listener
   * @returns {() => void}
   */
  watch(id, listener) {
    /** @param {Event} e */
    const handler = (e) => {
      const { id: changed, value } =
        /** @type {CustomEvent<{ id: string, value: boolean }>} */ (e).detail;
      if (changed === id) listener(value);
    };
    this.addEventListener("change", handler);
    return () => this.removeEventListener("change", handler);
  }

  #persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#values));
    } catch {
      // Not persisting is acceptable; the flag still applies for this session.
    }
  }
}
