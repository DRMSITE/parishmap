// Small DOM helpers, adapted from Verdant Village's dom-utils.js.

/**
 * Bind a handler to an element that must exist. A missing element logs a named
 * error rather than failing silently or throwing a cryptic null error.
 * @param {ParentNode | null | undefined} root
 * @param {string} selector
 * @param {string} event
 * @param {(event: Event) => void} handler
 * @returns {Element | null}
 */
export function on(root, selector, event, handler) {
  const el = root?.querySelector(selector) ?? null;
  if (!el) {
    console.error(
      `[on] No element matches "${selector}"; "${event}" handler not bound.`,
    );
    return null;
  }
  el.addEventListener(event, handler);
  return el;
}

/**
 * As `on`, for elements that legitimately may be absent. Stays silent.
 * @param {ParentNode | null | undefined} root
 * @param {string} selector
 * @param {string} event
 * @param {(event: Event) => void} handler
 * @returns {Element | null}
 */
export function onOptional(root, selector, event, handler) {
  const el = root?.querySelector(selector) ?? null;
  el?.addEventListener(event, handler);
  return el;
}

/**
 * One listener on a stable root, for elements that are added and removed later.
 * @param {HTMLElement | Document} root
 * @param {string} selector
 * @param {string} event
 * @param {(event: Event, match: Element) => void} handler
 */
export function delegate(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const match =
      e.target instanceof Element ? e.target.closest(selector) : null;
    if (match && root.contains(match)) handler(e, match);
  });
}

const ESCAPES = /** @type {Record<string, string>} */ ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * Escape text before interpolating it into an innerHTML template. Safe for
 * element content and for quoted attribute values.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
