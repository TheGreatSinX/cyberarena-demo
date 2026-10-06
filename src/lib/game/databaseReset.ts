import { collection, getDocs, doc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface ResetDatabaseProgress {
  step: string;
  deletedGames: number;
  deletedQuizzes: number;
  deletedLogs: number;
}

/**
 * Resets the CYBER|ARENA database back to zero.
 * Deletes all games, quiz instances, participant data, answers, results, and audit logs.
 */
export async function resetDatabaseToZero(
  adminUid: string,
  adminEmail: string,
  onProgress?: (progress: ResetDatabaseProgress) => void
): Promise<{ deletedGames: number; deletedQuizzes: number; deletedLogs: number }> {
  const stats = {
    deletedGames: 0,
    deletedQuizzes: 0,
    deletedLogs: 0,
  };

  // 1. Wipe all Games and all their subcollections
  onProgress?.({ step: 'Scanning and wiping active and finished games...', ...stats });
  const gamesSnap = await getDocs(collection(db, 'games'));
  for (const gDoc of gamesSnap.docs) {
    const gameId = gDoc.id;

    // Delete subcollections for this game
    const subcollections = ['questions', 'players', 'answers', 'results', 'privateQuestions'];
    for (const subName of subcollections) {
      try {
        const subSnap = await getDocs(collection(db, `games/${gameId}/${subName}`));
        for (const subDoc of subSnap.docs) {
          await deleteDoc(subDoc.ref);
        }
      } catch (err) {
        console.warn(`Error clearing subcollection ${subName} for game ${gameId}:`, err);
      }
    }

    // Delete the game root doc
    await deleteDoc(doc(db, 'games', gameId));
    stats.deletedGames++;
    onProgress?.({ step: `Deleted ${stats.deletedGames} game sessions...`, ...stats });
  }

  // 2. Wipe all Quizzes and their questions
  onProgress?.({ step: 'Scanning and wiping quizzes repository...', ...stats });
  const quizzesSnap = await getDocs(collection(db, 'quizzes'));
  for (const qDoc of quizzesSnap.docs) {
    const quizId = qDoc.id;
    try {
      const qQuestionsSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      for (const questionDoc of qQuestionsSnap.docs) {
        await deleteDoc(questionDoc.ref);
      }
    } catch (err) {
      console.warn(`Error clearing questions for quiz ${quizId}:`, err);
    }

    await deleteDoc(doc(db, 'quizzes', quizId));
    stats.deletedQuizzes++;
    onProgress?.({ step: `Deleted ${stats.deletedQuizzes} quizzes...`, ...stats });
  }

  // 3. Clear previous audit logs
  onProgress?.({ step: 'Clearing audit logs history...', ...stats });
  try {
    const auditSnap = await getDocs(collection(db, 'auditLogs'));
    for (const logDoc of auditSnap.docs) {
      await deleteDoc(logDoc.ref);
      stats.deletedLogs++;
    }
  } catch (err) {
    console.warn('Error clearing audit logs:', err);
  }

  // 4. Record new initial reset audit log
  try {
    await addDoc(collection(db, 'auditLogs'), {
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'DATABASE_RESET_TO_ZERO',
      resourceType: 'SYSTEM',
      resourceId: 'ALL',
      metadata: {
        timestamp: new Date().toISOString(),
        deletedGames: stats.deletedGames,
        deletedQuizzes: stats.deletedQuizzes,
        deletedLogs: stats.deletedLogs,
        status: 'SUCCESS',
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not record reset audit log:', err);
  }

  // 5. Clear player session cache in localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('quizarena_session_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Could not clear local session cache:', e);
  }

  onProgress?.({ step: 'Database reset to zero complete.', ...stats });
  return stats;
}
