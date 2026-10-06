import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './config';

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'unavailable' || (typeof err?.message === 'string' && err.message.includes('offline'))) {
      console.warn('Firestore is syncing in background / offline mode.');
    } else if (err?.code !== 'permission-denied') {
      console.warn('Firestore connection check:', err?.message || error);
    }
  }
}
