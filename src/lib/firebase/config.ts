import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import localFirebaseConfig from '../../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig?.projectId || 'csam-2026',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localFirebaseConfig?.appId || '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localFirebaseConfig?.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig?.authDomain || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || localFirebaseConfig?.firestoreDatabaseId || undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig?.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig?.messagingSenderId || '',
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Configure Firestore with experimentalForceLongPolling to prevent 10s connection timeouts in browser/iframe sandbox
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

export const auth = getAuth(app);
export const projectId = firebaseConfig.projectId;
