// Local-only start-up for development and the end-to-end tests: no sign-in, points kept
// in this browser. It is used only when the app is built with VITE_LOCAL_DATA=true; a
// normal build never contains it (see main.js).

import { allowAll, guardDataSource } from "../auth/guard.js";
import { createProjectGuard, guardProjects } from "../auth/project-guard.js";
import { createLocalAudit } from "../data/local-audit.js";
import { createLocalPeople } from "../data/local-people.js";
import { createLocalProjects } from "../data/local-projects.js";
import { createLocalSource } from "../data/local-source.js";
import { Flags } from "../state/flags.js";
import { createAppRouter, showChrome, showRoleLinks } from "./common.js";

/**
 * @param {object} options
 * @param {HTMLElement} options.outlet
 * @param {HTMLElement} options.announcer
 */
export function start({ outlet, announcer }) {
  const guard = allowAll;
  const people = createLocalPeople();
  // Signed in as the administrator, as the local people stand-in is.
  const projectGuard = createProjectGuard(() => ({
    status: "ready",
    role: "admin",
    user: { uid: "me", email: "me@example.org" },
  }));
  const router = createAppRouter({
    outlet,
    announcer,
    context: {
      data: guardDataSource(createLocalSource(), guard),
      guard,
      flags: new Flags(),
      people,
      audit: { available: () => true, ...createLocalAudit() },
      projects: {
        available: () => true,
        can: projectGuard,
        directory: () => people.api.directory(),
        ...guardProjects(createLocalProjects(), projectGuard),
      },
    },
  });
  showChrome(true);
  showRoleLinks({ people: true, audit: true });
  router.start();
}
