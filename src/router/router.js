// A small history-API router, adapted from Verdant Village's app.js / dom-utils.js.
// A route change is `history.pushState` followed by a synthetic `popstate`, so the
// browser's own back and forward buttons and our links share one code path.

/** @typedef {import("../types.js").Route} Route */
/** @typedef {import("../types.js").AppContext} AppContext */

/**
 * Remove the deployment base (e.g. "/maps/") so route paths are always "/about".
 * @param {string} pathname
 * @param {string} base
 * @returns {string}
 */
export function stripBase(pathname, base) {
  const prefix = base.replace(/\/$/, "");
  const stripped =
    prefix && pathname.startsWith(prefix)
      ? pathname.slice(prefix.length)
      : pathname;
  const path = stripped === "" ? "/" : stripped;
  // "/about/" and "/about" are the same page.
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Whether a click on a link should be handled by the router rather than the browser.
 * @param {MouseEvent} event
 * @param {HTMLAnchorElement} link
 * @param {string} origin
 * @returns {boolean}
 */
export function isInternalNavigation(event, link, origin) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false;
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;
  const url = new URL(link.href, origin);
  return url.origin === origin;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.outlet Where views render. Also receives focus after navigation.
 * @param {HTMLElement} options.announcer A polite live region for page-change announcements.
 * @param {Route[]} options.routes
 * @param {Route} options.notFound Shown when no route matches.
 * @param {AppContext} options.context Passed to every view.
 * @param {string} [options.base] Deployment base URL; defaults to Vite's BASE_URL.
 * @param {string} [options.appName] Appended to document.title.
 */
export function createRouter({
  outlet,
  announcer,
  routes,
  notFound,
  context,
  base = import.meta.env?.BASE_URL ?? "/",
  appName = "",
}) {
  /** @type {(() => void) | undefined} */
  let cleanup;
  // Guards against a slow lazy import finishing after the user has moved on.
  let renderId = 0;
  let isFirstRender = true;

  /** @param {string} path */
  const toHref = (path) => base.replace(/\/$/, "") + path;

  /** @param {string} path */
  function navigate(path) {
    globalThis.history.pushState({}, "", toHref(path));
    reroute();
  }

  /** Re-run the router for the current URL without adding a history entry. */
  function reroute() {
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function render() {
    const id = ++renderId;
    const path = stripBase(globalThis.location.pathname, base);
    const route = routes.find((r) => r.path === path) ?? notFound;

    cleanup?.();
    cleanup = undefined;
    outlet.replaceChildren();

    let result;
    try {
      const view = await route.load();
      if (id !== renderId) return;
      result = await view.render(outlet, context);
    } catch (error) {
      console.error(`[router] Failed to render "${route.path}".`, error);
      if (id !== renderId) return;
      outlet.innerHTML =
        "<p>Sorry, this page could not be loaded. Please try again.</p>";
    }
    if (id !== renderId) {
      if (typeof result === "function") result();
      return;
    }
    if (typeof result === "function") cleanup = result;

    const title = appName ? `${route.title} · ${appName}` : route.title;
    document.title = title;
    // The first render is a normal page load: leave focus where the browser put it,
    // so Tab reaches the skip link and header first. Later renders are in-page
    // navigations, where focus would otherwise stay on a link that has gone.
    if (isFirstRender) {
      isFirstRender = false;
      return;
    }
    outlet.focus({ preventScroll: true });
    globalThis.scrollTo(0, 0);
    announcer.textContent = "";
    // A short delay lets assistive technology notice the region has changed.
    setTimeout(() => {
      if (id === renderId) announcer.textContent = `${route.title} page`;
    }, 50);
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    const link =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    if (!isInternalNavigation(event, link, globalThis.location.origin)) return;
    event.preventDefault();
    const url = new URL(link.href);
    // Same page: do nothing rather than stack identical history entries.
    if (
      url.pathname === globalThis.location.pathname &&
      url.search === globalThis.location.search
    )
      return;
    globalThis.history.pushState({}, "", url.pathname + url.search + url.hash);
    reroute();
  }

  return {
    /** Start listening and render the current URL. */
    start() {
      document.addEventListener("click", onClick);
      globalThis.addEventListener("popstate", render);
      return render();
    },
    /** Stop handling links and navigation, and clean up the current view. */
    stop() {
      document.removeEventListener("click", onClick);
      globalThis.removeEventListener("popstate", render);
      renderId++; // Discards any view that is still loading.
      cleanup?.();
      cleanup = undefined;
    },
    navigate,
    reroute,
  };
}
