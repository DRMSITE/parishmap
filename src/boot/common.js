// Start-up pieces shared by both ways of running the app (see main.js).

import { config } from "../config.js";
import { createRouter } from "../router/router.js";
import { notFound, routes } from "../routes.js";

/**
 * @param {object} options
 * @param {HTMLElement} options.outlet
 * @param {HTMLElement} options.announcer
 * @param {import("../types.js").AppContext} options.context
 */
export function createAppRouter({ outlet, announcer, context }) {
  const router = createRouter({
    outlet,
    announcer,
    routes,
    notFound,
    appName: config.appName,
    context,
  });

  // On a phone the navigation is a drawer; close it once a link has been followed.
  globalThis.addEventListener("popstate", () => {
    /** @type {any} */ (document.querySelector("wa-page"))?.hideNavigation?.();
  });
  return router;
}

/**
 * Show the links that only some people may use. They stay hidden otherwise; the pages and
 * the back end refuse anyone else too.
 * @param {{ people: boolean, audit: boolean }} allowed
 */
export function showRoleLinks({ people, audit }) {
  const toggle = (
    /** @type {string} */ selector,
    /** @type {boolean} */ on,
  ) => {
    const link = /** @type {HTMLElement | null} */ (
      document.querySelector(selector)
    );
    if (link) link.hidden = !on;
  };
  toggle("[data-people-link]", people);
  toggle("[data-audit-link]", audit);
}

/**
 * Show or hide the navigation and the signed-in bar. They stay hidden until the person
 * is allowed to use the app, so the sign-in screens are not cluttered with links that
 * would lead nowhere.
 * @param {boolean} visible
 */
export function showChrome(visible) {
  const elements = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-chrome]")
  );
  for (const el of elements) el.hidden = !visible;
}
