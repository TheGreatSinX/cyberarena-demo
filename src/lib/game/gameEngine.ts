import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Game,
  GameStatus,
  Question,
  Quiz,
  Player,
  AnswerSubmission,
  GameResult,
} from '../../types';
import { SEED_QUIZ_TITLE, SEED_QUIZ_DESCRIPTION, SEED_QUIZ_CATEGORY, SEED_QUESTIONS } from '../seed/seedData';
import { handleFirestoreError, OperationType } from '../firebase/errors';

export function generateCryptoPin(): string {
  // Cryptographically random 6-digit PIN
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const pin = 100000 + (array[0] % 900000);
  return pin.toString();
}

export function isPastDueDate(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  // Treat YYYY-MM-DD as valid through 23:59:59 local time on that date
  const endOfDay = new Date(`${dueDate}T23:59:59`);
  if (isNaN(endOfDay.getTime())) return false;
  return Date.now() > endOfDay.getTime();
}

export async function seedDefaultQuizIfNone(userId: string): Promise<string | null> {
  try {
    const qSnap = await getDocs(collection(db, 'quizzes'));
    if (!qSnap.empty) {
      // Check if existing quiz has questions
      for (const qDoc of qSnap.docs) {
        const subSnap = await getDocs(collection(db, `quizzes/${qDoc.id}/questions`));
        if (!subSnap.empty) {
          return qDoc.id;
        }
      }

      // Existing quiz has 0 questions; populate it with SEED_QUESTIONS
      const targetQuizId = qSnap.docs[0].id;
      for (const q of SEED_QUESTIONS) {
        const qRef = doc(collection(db, `quizzes/${targetQuizId}/questions`));
        await setDoc(qRef, {
          ...q,
          quizId: targetQuizId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(db, 'quizzes', targetQuizId), {
        questionCount: SEED_QUESTIONS.length,
        status: 'PUBLISHED',
        updatedAt: new Date().toISOString(),
      });

      return targetQuizId;
    }

    const quizRef = doc(collection(db, 'quizzes'));
    const quizId = quizRef.id;
    const defaultPin = generateCryptoPin();
    const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    await setDoc(quizRef, {
      title: SEED_QUIZ_TITLE,
      description: SEED_QUIZ_DESCRIPTION,
      coverImageUrl: null,
      category: SEED_QUIZ_CATEGORY,
      status: 'PUBLISHED',
      questionCount: SEED_QUESTIONS.length,
      gamePin: defaultPin,
      dueDate: defaultDueDate,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    for (const q of SEED_QUESTIONS) {
      const qRef = doc(collection(db, `quizzes/${quizId}/questions`));
      await setDoc(qRef, {
        ...q,
        quizId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await syncQuizPinSession(quizId, userId, defaultPin, defaultDueDate);

    return quizId;
  } catch (err) {
    console.error('Error seeding quiz:', err);
    return null;
  }
}

/**
 * Generates/saves a reusable 6-digit PIN and optional Due Date for a Quiz,
 * and syncs a persistent self-paced Game session so participants can enter the PIN
 * and answer questions continuously anytime before the due date.
 */
export async function syncQuizPinSession(
  quizId: string,
  hostUid: string,
  customPin?: string,
  dueDate?: string | null
): Promise<{ gameId: string; gamePin: string; dueDate: string | null }> {
  try {
    const quizRef = doc(db, 'quizzes', quizId);
    const quizDoc = await getDoc(quizRef);
    if (!quizDoc.exists()) {
      throw new Error('Quiz not found');
    }
    const quizData = quizDoc.data() as Quiz;

    // Fetch quiz questions
    const qQuery = query(collection(db, `quizzes/${quizId}/questions`), orderBy('sortOrder', 'asc'));
    let qSnap = await getDocs(qQuery);

    // If quiz is empty, auto-populate sample questions so PIN works immediately
    if (qSnap.empty) {
      for (const q of SEED_QUESTIONS) {
        const qRef = doc(collection(db, `quizzes/${quizId}/questions`));
        await setDoc(qRef, {
          ...q,
          quizId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      qSnap = await getDocs(qQuery);
    }

    const finalPin = (customPin || quizData.gamePin || generateCryptoPin()).trim();
    const finalDueDate = dueDate !== undefined ? dueDate : (quizData.dueDate || null);

    // Check if an active game already exists for this quiz
    let gameId = quizData.activeGameId || '';
    let existingGameSnap = gameId ? await getDoc(doc(db, 'games', gameId)) : null;

    if (!existingGameSnap || !existingGameSnap.exists()) {
      const pinGamesQ = query(collection(db, 'games'), where('gamePin', '==', finalPin));
      const pinGamesSnap = await getDocs(pinGamesQ);
      const matchingQuizGame = pinGamesSnap.docs.find((d) => d.data().quizId === quizId);
      if (matchingQuizGame) {
        gameId = matchingQuizGame.id;
        existingGameSnap = matchingQuizGame;
      }
    }

    const firstQuestionDoc = qSnap.docs[0];
    const nowIso = new Date().toISOString();

    if (existingGameSnap && existingGameSnap.exists()) {
      const gameRef = doc(db, 'games', gameId);
      await updateDoc(gameRef, {
        quizTitle: quizData.title,
        gamePin: finalPin,
        dueDate: finalDueDate,
        mode: 'SELF_PACED',
        status: 'QUESTION_ACTIVE',
        totalQuestions: qSnap.size,
        currentQuestionId: firstQuestionDoc?.id || null,
      });
    } else {
      const gameRef = doc(collection(db, 'games'));
      gameId = gameRef.id;
      await setDoc(gameRef, {
        quizId,
        quizTitle: quizData.title,
        gamePin: finalPin,
        dueDate: finalDueDate,
        mode: 'SELF_PACED',
        status: 'QUESTION_ACTIVE',
        currentQuestionIndex: 0,
        currentQuestionId: firstQuestionDoc?.id || null,
        totalQuestions: qSnap.size,
        playerCount: 0,
        questionStartedAt: Date.now(),
        questionEndsAt: null,
        createdBy: hostUid,
        createdAt: nowIso,
        startedAt: nowIso,
        endedAt: null,
      });
    }

    // Sync public and private question snapshots
    for (let i = 0; i < qSnap.docs.length; i++) {
      const qDoc = qSnap.docs[i];
      const qData = qDoc.data() as Question;

      const publicQRef = doc(db, `games/${gameId}/questions`, qDoc.id);
      await setDoc(publicQRef, {
        questionType: qData.questionType,
        questionText: qData.questionText,
        imageUrl: qData.imageUrl || null,
        explanation: qData.explanation || null,
        timeLimitSeconds: qData.timeLimitSeconds,
        points: qData.points,
        sortOrder: i + 1,
        options: qData.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          sortOrder: opt.sortOrder,
        })),
      });

      const privateQRef = doc(db, `games/${gameId}/privateQuestions`, qDoc.id);
      await setDoc(privateQRef, {
        correctOptionId: qData.correctOptionId,
        explanation: qData.explanation || null,
        points: qData.points,
      });
    }

    // Save PIN, dueDate, and activeGameId on the Quiz document
    await updateDoc(quizRef, {
      gamePin: finalPin,
      dueDate: finalDueDate,
      activeGameId: gameId,
      questionCount: qSnap.size,
      status: 'PUBLISHED',
      updatedAt: nowIso,
    });

    return { gameId, gamePin: finalPin, dueDate: finalDueDate };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'quizzes');
  }
}

export async function createGameSession(quizId: string, hostUid: string): Promise<{ gameId: string; gamePin: string }> {
  const res = await syncQuizPinSession(quizId, hostUid);
  return { gameId: res.gameId, gamePin: res.gamePin };
}

export async function joinGameSession(
  gamePin: string,
  rawNickname: string,
  avatarId?: string,
  avatarUrl?: string
): Promise<{
  playerId: string;
  sessionToken: string;
  gameId: string;
  quizTitle: string;
  dueDate?: string | null;
  avatarId?: string;
  avatarUrl?: string;
}> {
  const nickname = rawNickname.trim().slice(0, 48);
  if (!nickname) {
    throw new Error('Please enter your full name.');
  }

  const cleanPin = gamePin.trim();
  const pinQuery = query(collection(db, 'games'), where('gamePin', '==', cleanPin));
  const pinSnap = await getDocs(pinQuery);

  let gameId = '';
  let gameData: Game | null = null;

  if (!pinSnap.empty) {
    // Prefer the most recently created session matching this PIN
    const sortedDocs = [...pinSnap.docs].sort((a, b) =>
      (b.data().createdAt || '').localeCompare(a.data().createdAt || '')
    );
    const chosenDoc = sortedDocs[0];
    gameId = chosenDoc.id;
    gameData = chosenDoc.data() as Game;
  } else {
    // Fallback: Check if a Quiz has this saved gamePin
    const quizPinQuery = query(collection(db, 'quizzes'), where('gamePin', '==', cleanPin));
    const quizPinSnap = await getDocs(quizPinQuery);
    if (quizPinSnap.empty) {
      throw new Error('PIN not found. Please verify the 6-digit PIN from your Administrator.');
    }
    const quizDoc = quizPinSnap.docs[0];
    const quizData = quizDoc.data() as Quiz;
    const synced = await syncQuizPinSession(
      quizDoc.id,
      quizData.createdBy || 'admin',
      cleanPin,
      quizData.dueDate || null
    );
    gameId = synced.gameId;
    const freshGameSnap = await getDoc(doc(db, 'games', gameId));
    gameData = freshGameSnap.data() as Game;
  }

  if (!gameData) {
    throw new Error('Game session not found. Please verify the 6-digit PIN.');
  }

  // Also check the parent quiz's dueDate if present
  let effectiveDueDate = gameData.dueDate || null;
  if (!effectiveDueDate && gameData.quizId) {
    try {
      const parentQuizSnap = await getDoc(doc(db, 'quizzes', gameData.quizId));
      if (parentQuizSnap.exists()) {
        effectiveDueDate = (parentQuizSnap.data() as Quiz).dueDate || null;
      }
    } catch {
      // ignore
    }
  }

  if (isPastDueDate(effectiveDueDate)) {
    throw new Error(`This quiz passed its due date (${effectiveDueDate}) and is no longer accepting submissions.`);
  }

  const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sessionToken = `st_${Math.random().toString(36).substring(2)}${Date.now()}`;
  const finalAvatarId = avatarId || 'blue_thinker';
  const finalAvatarUrl = avatarUrl || '';

  const playerRef = doc(db, `games/${gameId}/players`, playerId);
  await setDoc(playerRef, {
    nickname,
    avatarId: finalAvatarId,
    avatarUrl: finalAvatarUrl,
    sessionToken,
    score: 0,
    streak: 0,
    correctCount: 0,
    rank: 1,
    isConnected: true,
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  });

  // Increment player count
  await updateDoc(doc(db, 'games', gameId), {
    playerCount: (gameData.playerCount || 0) + 1,
  });

  // Store in localStorage for reconnection
  localStorage.setItem(
    `quizarena_session_${gameId}`,
    JSON.stringify({
      playerId,
      sessionToken,
      nickname,
      gamePin: cleanPin,
      dueDate: effectiveDueDate,
      avatarId: finalAvatarId,
      avatarUrl: finalAvatarUrl,
    })
  );

  return {
    playerId,
    sessionToken,
    gameId,
    quizTitle: gameData.quizTitle,
    dueDate: effectiveDueDate,
    avatarId: finalAvatarId,
    avatarUrl: finalAvatarUrl,
  };
}

export async function submitPlayerAnswer(
  gameId: string,
  playerId: string,
  sessionToken: string,
  questionId: string,
  selectedOptionId: string,
  elapsedMs?: number
): Promise<{
  submitted: boolean;
  pointsAwarded: number;
  isCorrect: boolean;
  correctOptionId?: string;
  explanation?: string | null;
}> {
  const gameRef = doc(db, 'games', gameId);
  const gameSnap = await getDoc(gameRef);

  if (!gameSnap.exists()) {
    throw new Error('Quiz session not found.');
  }

  const gameData = gameSnap.data() as Game;
  if (isPastDueDate(gameData.dueDate)) {
    throw new Error(`This quiz passed its due date (${gameData.dueDate}) and is no longer accepting answers.`);
  }

  const playerRef = doc(db, `games/${gameId}/players`, playerId);
  const playerSnap = await getDoc(playerRef);
  if (!playerSnap.exists()) {
    throw new Error('Participant session not found.');
  }

  const playerData = playerSnap.data() as Player;
  if (playerData.sessionToken !== sessionToken) {
    throw new Error('Session token mismatch.');
  }

  // Prevent duplicate submission for the same question by the same player attempt
  const answerRef = doc(db, `games/${gameId}/answers`, `${playerId}_${questionId}`);
  const answerSnap = await getDoc(answerRef);
  if (answerSnap.exists()) {
    const existingAns = answerSnap.data() as AnswerSubmission;
    return {
      submitted: true,
      pointsAwarded: existingAns.pointsAwarded,
      isCorrect: existingAns.isCorrect,
    };
  }

  // Retrieve private question data for authoritative evaluation
  const privateQRef = doc(db, `games/${gameId}/privateQuestions`, questionId);
  const privateQSnap = await getDoc(privateQRef);
  let correctOptionId = '';
  let basePoints = 1000;
  let explanation: string | null = null;

  if (privateQSnap.exists()) {
    const privateQData = privateQSnap.data() as {
      correctOptionId: string;
      points: number;
      explanation?: string | null;
    };
    correctOptionId = privateQData.correctOptionId;
    basePoints = privateQData.points || 1000;
    explanation = privateQData.explanation || null;
  } else if (gameData.quizId) {
    // Fallback to parent quiz question doc if privateQuestions wasn't synced yet
    const origQSnap = await getDoc(doc(db, `quizzes/${gameData.quizId}/questions`, questionId));
    if (origQSnap.exists()) {
      const origQ = origQSnap.data() as Question;
      correctOptionId = origQ.correctOptionId;
      basePoints = origQ.points || 1000;
      explanation = origQ.explanation || null;
    }
  }

  const isCorrect = Boolean(selectedOptionId && correctOptionId && correctOptionId === selectedOptionId);
  let pointsAwarded = 0;

  const responseTimeMs =
    typeof elapsedMs === 'number' && elapsedMs >= 0
      ? elapsedMs
      : Math.max(0, Date.now() - (gameData.questionStartedAt || Date.now()));

  if (isCorrect) {
    const totalTimeMs = 20000;
    const speedRatio = Math.min(1, responseTimeMs / totalTimeMs);
    // Speed multiplier from 1.0 (instant) down to 0.5 (at time limit)
    const multiplier = 1 - speedRatio * 0.5;
    pointsAwarded = Math.round(basePoints * multiplier);
  }

  await setDoc(answerRef, {
    playerId,
    nickname: playerData.nickname,
    questionId,
    selectedOptionId: selectedOptionId || 'TIME_EXPIRED',
    isCorrect,
    pointsAwarded,
    responseTimeMs,
    submittedAt: new Date().toISOString(),
  });

  const newScore = (playerData.score || 0) + pointsAwarded;
  const newStreak = isCorrect ? (playerData.streak || 0) + 1 : 0;
  const newCorrectCount = isCorrect
    ? (playerData.correctCount || 0) + 1
    : playerData.correctCount || 0;

  await updateDoc(playerRef, {
    score: newScore,
    streak: newStreak,
    correctCount: newCorrectCount,
    lastActiveAt: new Date().toISOString(),
  });

  // Also upsert player's result record in games/{gameId}/results/{playerId} so Admin Results & CSV stays live
  const accuracy =
    gameData.totalQuestions > 0
      ? Math.round((newCorrectCount / gameData.totalQuestions) * 100)
      : 0;

  const resultRef = doc(db, `games/${gameId}/results`, playerId);
  await setDoc(resultRef, {
    playerId,
    nickname: playerData.nickname,
    avatarId: playerData.avatarId || 'blue_thinker',
    avatarUrl: playerData.avatarUrl || '',
    finalScore: newScore,
    rank: playerData.rank || 1,
    correctAnswers: newCorrectCount,
    totalQuestions: gameData.totalQuestions || 1,
    accuracy,
    averageResponseTime: Math.round((responseTimeMs / 1000) * 10) / 10,
    createdAt: new Date().toISOString(),
  });

  return {
    submitted: true,
    pointsAwarded,
    isCorrect,
    correctOptionId,
    explanation,
  };
}

export async function completePlayerSelfPacedSession(
  gameId: string,
  playerId: string
): Promise<void> {
  try {
    const gameSnap = await getDoc(doc(db, 'games', gameId));
    if (!gameSnap.exists()) return;
    const gameData = gameSnap.data() as Game;

    const playersSnap = await getDocs(
      query(collection(db, `games/${gameId}/players`), orderBy('score', 'desc'))
    );

    let rank = 1;
    for (const pDoc of playersSnap.docs) {
      const pData = pDoc.data() as Player;
      if (pDoc.id === playerId) {
        await updateDoc(pDoc.ref, { rank, lastActiveAt: new Date().toISOString() });
        const accuracy =
          gameData.totalQuestions > 0
            ? Math.round(((pData.correctCount || 0) / gameData.totalQuestions) * 100)
            : 0;

        await setDoc(
          doc(db, `games/${gameId}/results`, pDoc.id),
          {
            playerId: pDoc.id,
            nickname: pData.nickname,
            avatarId: pData.avatarId || 'blue_thinker',
            avatarUrl: pData.avatarUrl || '',
            finalScore: pData.score || 0,
            rank,
            correctAnswers: pData.correctCount || 0,
            totalQuestions: gameData.totalQuestions || 1,
            accuracy,
            averageResponseTime: 4.0,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      rank++;
    }
  } catch (err) {
    console.error('Error finalizing self-paced session:', err);
  }
}

export async function advanceGameState(
  gameId: string,
  targetState: GameStatus,
  targetQuestionIndex?: number
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const gameSnap = await getDoc(gameRef);
  if (!gameSnap.exists()) return;

  const gameData = gameSnap.data() as Game;
  const updatePayload: Partial<Game> = { status: targetState };

  if (targetState === 'COUNTDOWN') {
    if (gameData.status === 'WAITING') {
      updatePayload.startedAt = new Date().toISOString();
    }
    if (targetQuestionIndex !== undefined) {
      updatePayload.currentQuestionIndex = targetQuestionIndex;
    }
  } else if (targetState === 'QUESTION_ACTIVE') {
    const nextIdx = targetQuestionIndex !== undefined ? targetQuestionIndex : gameData.currentQuestionIndex;
    const qSnap = await getDocs(query(collection(db, `games/${gameId}/questions`), orderBy('sortOrder', 'asc')));
    const activeQ = qSnap.docs[nextIdx];

    if (activeQ) {
      const qData = activeQ.data();
      const timeLimitMs = (qData.timeLimitSeconds || 20) * 1000;
      const now = Date.now();
      updatePayload.currentQuestionIndex = nextIdx;
      updatePayload.currentQuestionId = activeQ.id;
      updatePayload.questionStartedAt = now;
      updatePayload.questionEndsAt = now + timeLimitMs;
    }
  } else if (targetState === 'LEADERBOARD') {
    // Recalculate player ranks
    const playersSnap = await getDocs(query(collection(db, `games/${gameId}/players`), orderBy('score', 'desc')));
    let rank = 1;
    for (const pDoc of playersSnap.docs) {
      await updateDoc(pDoc.ref, { rank });
      rank++;
    }
  } else if (targetState === 'FINISHED') {
    updatePayload.endedAt = new Date().toISOString();

    // Persist final results
    const playersSnap = await getDocs(query(collection(db, `games/${gameId}/players`), orderBy('score', 'desc')));
    const answersSnap = await getDocs(collection(db, `games/${gameId}/answers`));
    const answers = answersSnap.docs.map((d) => d.data() as AnswerSubmission);

    let rank = 1;
    for (const pDoc of playersSnap.docs) {
      const pData = pDoc.data() as Player;
      const playerAnswers = answers.filter((a) => a.playerId === pDoc.id);
      const avgResponseTime = playerAnswers.length
        ? Math.round(playerAnswers.reduce((sum, a) => sum + a.responseTimeMs, 0) / playerAnswers.length / 100) / 10
        : 0;

      const accuracy = gameData.totalQuestions > 0
        ? Math.round(((pData.correctCount || 0) / gameData.totalQuestions) * 100)
        : 0;

      const resultRef = doc(db, `games/${gameId}/results`, pDoc.id);
      await setDoc(resultRef, {
        playerId: pDoc.id,
        nickname: pData.nickname,
        avatarId: pData.avatarId || 'blue_thinker',
        avatarUrl: pData.avatarUrl || '',
        finalScore: pData.score || 0,
        rank,
        correctAnswers: pData.correctCount || 0,
        totalQuestions: gameData.totalQuestions,
        accuracy,
        averageResponseTime: avgResponseTime,
        createdAt: new Date().toISOString(),
      });

      rank++;
    }
  }

  await updateDoc(gameRef, updatePayload);
}

export function exportGameResultsToCsv(
  gameId: string,
  quizTitle: string,
  results: GameResult[],
  gameStartedAt?: string | null,
  gameEndedAt?: string | null
): void {
  const headers = [
    'Game ID',
    'Quiz Title',
    'Player Nickname',
    'Rank',
    'Final Score',
    'Correct Answers',
    'Total Questions',
    'Accuracy (%)',
    'Avg Response Time (s)',
    'Started At',
    'Finished At',
  ];

  const rows = results.map((r) => [
    `"${gameId}"`,
    `"${quizTitle.replace(/"/g, '""')}"`,
    `"${r.nickname.replace(/"/g, '""')}"`,
    r.rank,
    r.finalScore,
    r.correctAnswers,
    r.totalQuestions,
    `${r.accuracy}%`,
    r.averageResponseTime,
    `"${gameStartedAt || ''}"`,
    `"${gameEndedAt || ''}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `CYBER_ARENA_${quizTitle.replace(/\s+/g, '_')}_Results.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
