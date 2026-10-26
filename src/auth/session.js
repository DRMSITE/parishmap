// The signed-in session, as a small state machine the interface can render from.
//
// Everyone must verify their email, enrol an authenticator app and sign in with a code
// before they reach the map. Firebase has no switch that forces this, so the app does,
// and firestore.rules refuses any token without a second factor, so skipping the screens
// would get a user nothing.
//
// Statuses:
//   loading          waiting for Firebase to say who is signed in
//   signed-out       show the sign-in form (`notice` may explain why)
//   second-factor    password accepted; waiting for the authenticator code
//   verify-email     signed in, email address not yet verified
//   enrol            verified, no authenticator app yet
//   no-access        fully signed in but with no role; ask the Clerk
//   ready            can use the app; `role` is set

/** @typedef {"admin" | "clerk" | "councillor" | "member"} Role */

/** The roles the rules recognise. Keep in step with firestore.rules. */
export const ROLES = /** @type {const} */ ([
  "admin",
  "clerk",
  "councillor",
  "member",
]);

/**
 * @typedef {object} SessionState
 * @property {"loading" | "signed-out" | "second-factor" | "verify-email" | "enrol" | "no-access" | "ready"} status
 * @property {{ uid: string, email: string }} [user]
 * @property {Role} [role]
 * @property {string} [notice] Something to tell the person on the sign-in form.
 */

/**
 * The Firebase calls the session uses (see firebase-auth-api.js).
 * @typedef {object} AuthApi
 * @property {(auth: any, listener: (user: any) => void) => () => void} onAuthStateChanged
 * @property {(auth: any, email: string, password: string) => Promise<unknown>} signIn
 * @property {(auth: any) => Promise<void>} signOut
 * @property {(user: any) => Promise<void>} sendVerification
 * @property {(auth: any, email: string) => Promise<void>} sendPasswordReset
 * @property {(user: any) => Promise<void>} reload
 * @property {(user: any, forceRefresh: boolean) => Promise<Record<string, any>>} tokenClaims
 * @property {(user: any) => number} enrolledFactorCount
 * @property {(auth: any, error: unknown) => { resolve: (code: string) => Promise<unknown> } | null} resolverFor
 * @property {(user: any, appName: string) => Promise<{ uri: string, key: string, confirm: (code: string) => Promise<unknown> }>} startEnrolment
 */

const CODE_PATTERN = /^\d{6}$/;

/**
 * A message a person can act on. Sign-in failures are deliberately vague about whether
 * the email or the password was wrong, so the form does not reveal which accounts exist.
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
export function describeAuthError(error, fallback) {
  switch (/** @type {{ code?: string }} */ (error)?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "The email address or password is not correct.";
    case "auth/invalid-verification-code":
      return "That code is not correct. Check the app and try again.";
    case "auth/code-expired":
      return "That code has expired. Enter the latest code from the app.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact the Clerk.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Cannot reach the server. Check your connection and try again.";
    case "auth/requires-recent-login":
    case "auth/user-token-expired":
      return "Please sign in again.";
    default:
      return fallback;
  }
}

/**
 * @param {string} code
 * @returns {string} The six digits, with any spaces removed.
 */
function cleanCode(code) {
  const digits = code.replace(/\s+/g, "");
  if (!CODE_PATTERN.test(digits)) throw new Error("Enter the six-digit code.");
  return digits;
}

/**
 * @param {object} options
 * @param {any} options.auth The Firebase Auth instance.
 * @param {AuthApi} options.api
 * @param {string} options.appName Shown in the authenticator app next to the account.
 */
export function createSession({ auth, api, appName }) {
  /** @type {SessionState} */
  let state = { status: "loading" };
  /** @type {Set<(state: SessionState) => void>} */
  const listeners = new Set();
  /** Discards the result of an older check when a newer one has started. */
  let sequence = 0;
  let currentUser = /** @type {any} */ (null);
  let resolver = /** @type {ReturnType<AuthApi["resolverFor"]>} */ (null);
  let enrolment =
    /** @type {Awaited<ReturnType<AuthApi["startEnrolment"]>> | null} */ (null);
  /** Shown on the sign-in form after the next sign-out. @type {string | undefined} */
  let pendingNotice;

  /** @param {SessionState} next */
  function set(next) {
    state = next;
    for (const listener of listeners) listener(state);
  }

  /** Work out which screen this user should see. @param {any} user */
  async function evaluate(user) {
    const id = ++sequence;
    currentUser = user;

    if (!user) {
      // A password has been accepted and the code is awaited: not signed out yet.
      if (state.status === "second-factor") return;
      const notice = pendingNotice;
      pendingNotice = undefined;
      set({ status: "signed-out", ...(notice && { notice }) });
      return;
    }

    const identity = { uid: user.uid, email: user.email ?? "" };
    if (!user.emailVerified) {
      set({ status: "verify-email", user: identity });
      return;
    }
    if (api.enrolledFactorCount(user) === 0) {
      set({ status: "enrol", user: identity });
      return;
    }

    let claims;
    try {
      claims = await api.tokenClaims(user, false);
    } catch {
      pendingNotice = "Could not check your sign-in. Please try again.";
      await api.signOut(auth);
      return;
    }
    if (id !== sequence) return;

    // A session made before the authenticator was enrolled has no second factor in it.
    // The rules would refuse it, so start again rather than show a broken map.
    if (!claims.firebase?.sign_in_second_factor) {
      pendingNotice = "Please sign in again, using the code from your app.";
      await api.signOut(auth);
      return;
    }

    const role = ROLES.find((r) => r === claims.role);
    set(
      role
        ? { status: "ready", user: identity, role }
        : { status: "no-access", user: identity },
    );
  }

  const stopWatching = api.onAuthStateChanged(auth, (user) => {
    void evaluate(user);
  });

  return {
    get state() {
      return state;
    },

    /** @param {(state: SessionState) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Step 1: email and password. Resolves when the code is now needed, or when
     * sign-in is complete; throws a readable Error when it fails.
     * @param {string} email
     * @param {string} password
     */
    async signIn(email, password) {
      if (!email.trim() || !password)
        throw new Error("Enter your email address and password.");
      try {
        await api.signIn(auth, email.trim(), password);
      } catch (error) {
        if (
          /** @type {{ code?: string }} */ (error)?.code ===
          "auth/multi-factor-auth-required"
        ) {
          resolver = api.resolverFor(auth, error);
          if (!resolver)
            throw new Error(
              "This account has no authenticator app. Please contact the Clerk.",
            );
          set({ status: "second-factor" });
          return;
        }
        throw new Error(
          describeAuthError(error, "Sign-in failed. Please try again."),
          { cause: error },
        );
      }
    },

    /**
     * Step 2: the six-digit code, after a password was accepted.
     * @param {string} code
     */
    async verifySecondFactor(code) {
      if (!resolver) throw new Error("Please sign in again.");
      const digits = cleanCode(code);
      try {
        await resolver.resolve(digits);
        resolver = null;
      } catch (error) {
        throw new Error(
          describeAuthError(error, "Could not check that code. Try again."),
          { cause: error },
        );
      }
    },

    /** Go back from the code step to the password form. */
    cancelSecondFactor() {
      resolver = null;
      set({ status: "signed-out" });
    },

    /**
     * Email a link for choosing a new password. It says nothing about whether the
     * address has an account, so the form cannot be used to find out who does.
     * @param {string} email
     */
    async sendPasswordReset(email) {
      const address = email.trim();
      if (!address) throw new Error("Enter your email address.");
      try {
        await api.sendPasswordReset(auth, address);
      } catch (error) {
        const code = /** @type {{ code?: string }} */ (error)?.code;
        if (code === "auth/user-not-found") return;
        throw new Error(
          code === "auth/invalid-email"
            ? "Enter a valid email address."
            : describeAuthError(error, "Could not send the email. Try again."),
          { cause: error },
        );
      }
    },

    async sendVerificationEmail() {
      if (!currentUser) throw new Error("Please sign in again.");
      try {
        await api.sendVerification(currentUser);
      } catch (error) {
        throw new Error(
          describeAuthError(error, "Could not send the email. Try again."),
          { cause: error },
        );
      }
    },

    /** Re-read the account after the person says they have verified their email. */
    async refresh() {
      if (!currentUser) throw new Error("Please sign in again.");
      await api.reload(currentUser);
      await evaluate(currentUser);
    },

    /** Begin adding an authenticator app. @returns {Promise<{ uri: string, key: string }>} */
    async beginEnrolment() {
      if (!currentUser) throw new Error("Please sign in again.");
      try {
        enrolment = await api.startEnrolment(currentUser, appName);
      } catch (error) {
        throw new Error(
          describeAuthError(error, "Could not start setup. Try again."),
          { cause: error },
        );
      }
      return { uri: enrolment.uri, key: enrolment.key };
    },

    /**
     * Confirm the app with its first code. The current session was issued without a
     * second factor, so the person is signed out and asked to sign in again.
     * @param {string} code
     */
    async finishEnrolment(code) {
      if (!enrolment) throw new Error("Start the setup again.");
      const digits = cleanCode(code);
      try {
        await enrolment.confirm(digits);
      } catch (error) {
        throw new Error(
          describeAuthError(error, "Could not check that code. Try again."),
          { cause: error },
        );
      }
      enrolment = null;
      pendingNotice =
        "Authenticator added. Now sign in again with your password and a code.";
      await api.signOut(auth);
    },

    async signOut() {
      resolver = null;
      enrolment = null;
      await api.signOut(auth);
    },

    /** Stop listening to Firebase. */
    destroy() {
      stopWatching();
      listeners.clear();
    },
  };
}
