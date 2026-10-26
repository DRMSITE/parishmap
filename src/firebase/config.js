// Web app configuration for the Firebase project, read from the VITE_FIREBASE_* variables
// in `.env` (copy `.env.example`). These values identify the project; they do not grant
// access. Access is controlled by Authentication and the Firestore security rules
// (firestore.rules), and the API key should be restricted by HTTP referrer in the Google
// Cloud console. Do not put secrets (service accounts, tile provider keys) here: anything
// in a VITE_* variable is compiled into the public bundle.

const env = /** @type {Record<string, string | undefined>} */ (import.meta.env);

const NAMES = /** @type {const} */ ({
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
});

/**
 * @param {Record<string, string | undefined>} values
 * @returns {Record<keyof typeof NAMES, string>}
 */
export function readFirebaseConfig(values) {
  const missing = Object.values(NAMES).filter((name) => !values[name]);
  if (missing.length) {
    throw new Error(
      `Firebase is not configured. Add ${missing.join(", ")} to .env (see .env.example), then restart the build.`,
    );
  }
  return /** @type {any} */ (
    Object.fromEntries(
      Object.entries(NAMES).map(([key, name]) => [key, values[name]]),
    )
  );
}

/** Read when the app starts, not when this file is imported, so tests can import it. */
export const getFirebaseConfig = () => readFirebaseConfig(env);
