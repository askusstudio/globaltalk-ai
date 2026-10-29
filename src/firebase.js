import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()
};

export const firebaseConfigured = Boolean(
  config.apiKey &&
  config.authDomain &&
  config.projectId &&
  config.appId &&
  !config.apiKey.includes("your_") &&
  !config.projectId.includes("your_")
);

let app = null;
let auth = null;
let db = null;

if (firebaseConfigured) {
  try {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn("Firebase initialization failed; running in local storage mode:", err?.message || err);
  }
}

export { auth, db, GoogleAuthProvider, signInWithPopup, signOut };
