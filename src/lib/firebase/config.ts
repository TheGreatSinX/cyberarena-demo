import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import localFirebaseConfig from '../../../firebase-applet-config.json';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as Record<string, string>;

const firebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig?.projectId || 'csam-2026',
  appId: env.VITE_FIREBASE_APP_ID || localFirebaseConfig?.appId || '',
  apiKey: env.VITE_FIREBASE_API_KEY || localFirebaseConfig?.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig?.authDomain || '',
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || localFirebaseConfig?.firestoreDatabaseId || undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig?.storageBucket || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig?.messagingSenderId || '',
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Configure Firestore with experimentalForceLongPolling and memoryLocalCache to prevent
// persistent failed write mutations in IndexedDB from spamming exponential backoff retries across page reloads.
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache(),
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

export const auth = getAuth(app);
export const projectId = firebaseConfig.projectId;
