// The route table. To add a page: create a view in `views/` that exports
// `render(container, ctx)`, then add one entry here. Views are imported lazily,
// so each page is only downloaded when it is first visited.

/** @typedef {import("./types.js").Route} Route */

/** @type {Route[]} */
export const routes = [
  { path: "/", title: "Map", load: () => import("./views/map.view.js") },
  {
    path: "/list",
    title: "Points",
    load: () => import("./views/list.view.js"),
  },
  {
    path: "/projects",
    title: "Projects",
    load: () => import("./views/projects.view.js"),
  },
  {
    path: "/people",
    title: "People",
    load: () => import("./views/people.view.js"),
  },
  {
    path: "/activity",
    title: "Activity",
    load: () => import("./views/activity.view.js"),
  },
  {
    path: "/help",
    title: "Help",
    load: () => import("./views/help.view.js"),
  },
  {
    path: "/about",
    title: "About",
    load: () => import("./views/about.view.js"),
  },
];

/** @type {Route} */
export const notFound = {
  path: "*",
  title: "Page not found",
  load: () => import("./views/not-found.view.js"),
};
