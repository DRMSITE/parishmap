// The real start-up: nothing but the sign-in screens is shown until a person has signed
// in with a password and an authenticator code and has a role. The map and the data
// are only created for a fully signed-in session, and are torn down on sign-out.

import { sendPasswordResetEmail } from "firebase/auth";
import { createRoleGuard, guardDataSource } from "../auth/guard.js";
import { cacheDirectory, createPeopleApi } from "../auth/people.js";
import { createProjectGuard, guardProjects } from "../auth/project-guard.js";
import { firebaseAuthApi } from "../auth/firebase-auth-api.js";
import { createSession } from "../auth/session.js";
import { config } from "../config.js";
import { createFirestoreAudit } from "../data/firestore-audit.js";
import { createFirestoreProjects } from "../data/firestore-projects.js";
import { createFirestoreSource } from "../data/firestore-source.js";
import { auth, db } from "../firebase/app.js";
import { Flags } from "../state/flags.js";
import { renderAuthScreen } from "../ui/auth-screens.js";
import { createAppRouter, showChrome, showRoleLinks } from "./common.js";

const PEOPLE_ROLES = ["admin", "clerk"];

/**
 * @param {object} options
 * @param {HTMLElement} options.outlet
 * @param {HTMLElement} options.announcer
 */
export function start({ outlet, announcer }) {
  const session = createSession({
    auth,
    api: firebaseAuthApi,
    appName: config.appName,
  });
  const source = createFirestoreSource({
    db,
    getUser: () => session.state.user ?? null,
  });
  const guard = createRoleGuard(() => session.state);
  const projectsSource = createFirestoreProjects({
    db,
    getUser: () => session.state.user ?? null,
  });
  const projectGuard = createProjectGuard(() => session.state);
  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");
    return user.getIdToken();
  };
  const peopleApi = createPeopleApi(getToken);
  const router = createAppRouter({
    outlet,
    announcer,
    context: {
      data: guardDataSource(source, guard),
      guard,
      flags: new Flags(),
      tiles: {
        // Who may have a provider's tiles is the provider's own list of roles; the tile
        // proxy checks it again on every request.
        canUse: (provider) =>
          provider.roles?.includes(session.state.role ?? "") ?? false,
        getToken,
      },
      audit: {
        // Administrators only; firestore.rules refuses everyone else anyway.
        available: () => session.state.role === "admin",
        ...createFirestoreAudit(db),
      },
      people: {
        // The `api` function checks the role again on every request.
        available: () => PEOPLE_ROLES.includes(session.state.role ?? ""),
        role: () => session.state.role,
        uid: () => session.state.user?.uid,
        api: peopleApi,
        // Firebase sends the email; the link lets the person choose a password, which
        // also confirms their address.
        sendInvitation: (email) =>
          sendPasswordResetEmail(auth, email, {
            url: `${globalThis.location.origin}/`,
          }),
      },
      projects: {
        // Everyone with a role may read; the guard and firestore.rules decide the rest.
        available: () => Boolean(session.state.role),
        can: projectGuard,
        // The `api` function lets councillors list who can be named; members cannot name
        // anyone, so for them it is refused and views fall back to the stored emails.
        directory: cacheDirectory(() => peopleApi.directory()),
        ...guardProjects(projectsSource, projectGuard),
      },
    },
  });

  const userLabel = document.querySelector("[data-user-label]");
  document
    .querySelector("[data-sign-out]")
    ?.addEventListener("click", () => void session.signOut());

  let running = false;
  let shownKey = "";
  let hasRenderedAScreen = false;

  /** @param {import("../auth/session.js").SessionState} state */
  function apply(state) {
    if (state.status === "ready") {
      if (userLabel)
        userLabel.textContent = `${state.user?.email ?? ""} (${state.role})`;
      shownKey = "";
      if (!running) {
        running = true;
        showChrome(true);
        showRoleLinks({
          people: PEOPLE_ROLES.includes(state.role ?? ""),
          audit: state.role === "admin",
        });
        void router.start();
      }
      return;
    }

    if (running) {
      running = false;
      router.stop();
      // Stop listening, so the server is not left refusing a signed-out listener.
      source.close();
      projectsSource.close();
      showChrome(false);
      if (userLabel) userLabel.textContent = "";
    }

    const key = `${state.status}|${state.notice ?? ""}`;
    if (key === shownKey) return;
    shownKey = key;
    renderAuthScreen(outlet, session, state);

    const heading = /** @type {HTMLElement | null} */ (
      outlet.querySelector("[data-heading]")
    );
    document.title = `${heading?.textContent ?? "Sign in"} · ${config.appName}`;
    // Leave focus alone on first load, so Tab reaches the skip link first. After that
    // the screen has changed under the person, so move focus to its heading.
    if (hasRenderedAScreen) heading?.focus({ preventScroll: true });
    hasRenderedAScreen = true;
  }

  session.subscribe(apply);
  apply(session.state);
}
