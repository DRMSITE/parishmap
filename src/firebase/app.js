// The single Firebase app for the browser. Only client SDKs are used here; privileged
// work (setting roles, inviting users) belongs in Cloud Functions with the Admin SDK.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFirebaseConfig } from "./config.js";

export const app = initializeApp(getFirebaseConfig());
export const auth = getAuth(app);
export const db = getFirestore(app);
