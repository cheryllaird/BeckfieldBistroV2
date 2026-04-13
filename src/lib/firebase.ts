import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True when all required env vars are present. */
export const firebaseConfigured =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId;

// Initialise Firebase only when config is present — avoids a module-level
// crash (auth/invalid-api-key) when .env.local hasn't been created yet.
const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth           = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
export const db             = app ? getFirestore(app) : null;
