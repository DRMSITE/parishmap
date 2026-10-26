// The Firebase Authentication calls the session needs, gathered in one object so
// `session.js` can be tested with a stand-in. Flow and function names follow
// https://firebase.google.com/docs/auth/web/totp-mfa

import {
  getIdTokenResult,
  getMultiFactorResolver,
  multiFactor,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
} from "firebase/auth";

/** @typedef {import("firebase/auth").Auth} Auth */
/** @typedef {import("firebase/auth").User} User */

/** @type {import("./session.js").AuthApi} */
export const firebaseAuthApi = {
  onAuthStateChanged: (auth, listener) => onAuthStateChanged(auth, listener),
  signIn: (auth, email, password) =>
    signInWithEmailAndPassword(auth, email, password),
  signOut: (auth) => signOut(auth),
  sendVerification: (user) => sendEmailVerification(user),
  // The link's "Continue" button comes back to the app.
  sendPasswordReset: (auth, email) =>
    sendPasswordResetEmail(auth, email, {
      url: `${globalThis.location.origin}/`,
    }),
  reload: (user) => reload(user),
  async tokenClaims(user, forceRefresh) {
    const result = await getIdTokenResult(user, forceRefresh);
    return result.claims;
  },
  enrolledFactorCount: (user) => multiFactor(user).enrolledFactors.length,
  resolverFor: (auth, error) => {
    // Only called for an `auth/multi-factor-auth-required` error, which is this type.
    const resolver = getMultiFactorResolver(
      auth,
      /** @type {import("firebase/auth").MultiFactorError} */ (error),
    );
    const hint = resolver.hints.find(
      (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (!hint) return null;
    return {
      resolve: (code) =>
        resolver.resolveSignIn(
          TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
        ),
    };
  },
  async startEnrolment(user, appName) {
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    return {
      uri: secret.generateQrCodeUrl(user.email ?? "", appName),
      key: secret.secretKey,
      confirm: (code) =>
        multiFactor(user).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
          "Authenticator app",
        ),
    };
  },
};
