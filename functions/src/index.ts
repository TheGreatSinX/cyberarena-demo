import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function generatePin(): string {
  const min = 100000;
  const max = 999999;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

function verifyAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return context.auth;
}

// 1. Create live game
export const createGame = functions.https.onCall(async (data, context) => {
  const auth = verifyAuth(context);
  const { quizId } = data;
  if (!quizId) {
    throw new functions.https.HttpsError('invalid-argument', 'quizId is required');
  }

  const quizDoc = await db.collection('quizzes').doc(quizId).get();
  if (!quizDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Quiz not found');
  }
  const quizData = quizDoc.data()!;
  if (quizData.status !== 'PUBLISHED') {
    throw new functions.https.HttpsError('failed-precondition', 'Quiz is not published');
  }

  // Fetch questions to build immutable game snapshot
  const questionsSnapshot = await db.collection('quizzes').doc(quizId).collection('questions').orderBy('sortOrder', 'asc').get();
  if (questionsSnapshot.empty) {
    throw new functions.https.HttpsError('failed-precondition', 'Quiz has no questions');
  }

  // Generate unique PIN
  let gamePin = generatePin();
  let pinQuery = await db.collection('games').where('gamePin', '==', gamePin).where('status', 'in', ['WAITING', 'COUNTDOWN', 'QUESTION_ACTIVE', 'QUESTION_LOCKED', 'ANSWER_RESULTS', 'LEADERBOARD']).get();
  while (!pinQuery.empty) {
    gamePin = generatePin();
    pinQuery = await db.collection('games').where('gamePin', '==', gamePin).where('status', 'in', ['WAITING', 'COUNTDOWN', 'QUESTION_ACTIVE', 'QUESTION_LOCKED', 'ANSWER_RESULTS', 'LEADERBOARD']).get();
  }

  const gameRef = db.collection('games').doc();
  const gameId = gameRef.id;

  const batch = db.batch();
  batch.set(gameRef, {
    quizId,
    quizTitle: quizData.title,
    gamePin,
    status: 'WAITING',
    currentQuestionIndex: 0,
    currentQuestionId: questionsSnapshot.docs[0].id,
    totalQuestions: questionsSnapshot.size,
    playerCount: 0,
    questionStartedAt: null,
    questionEndsAt: null,
    createdBy: auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    startedAt: null,
    endedAt: null,
  });

  // Write immutable snapshot: public question data without answers, private question with correctOptionId
  questionsSnapshot.docs.forEach((doc, idx) => {
    const qData = doc.data();
    const publicQRef = gameRef.collection('questions').doc(doc.id);
    batch.set(publicQRef, {
      questionType: qData.questionType,
      questionText: qData.questionText,
      imageUrl: qData.imageUrl || null,
      timeLimitSeconds: qData.timeLimitSeconds,
      points: qData.points,
      sortOrder: idx + 1,
      options: qData.options || [],
    });

    const privateQRef = gameRef.collection('privateQuestions').doc(doc.id);
    batch.set(privateQRef, {
      correctOptionId: qData.correctOptionId,
      explanation: qData.explanation || null,
      points: qData.points,
    });
  });

  await batch.commit();

  return { gameId, gamePin };
});

// 2. Join game
export const joinGame = functions.https.onCall(async (data) => {
  const { gamePin, nickname } = data;
  if (!gamePin || !nickname) {
    throw new functions.https.HttpsError('invalid-argument', 'gamePin and nickname are required');
  }

  const cleanNickname = nickname.trim().slice(0, 24);
  if (cleanNickname.length < 1) {
    throw new functions.https.HttpsError('invalid-argument', 'Nickname cannot be empty');
  }

  const gameQuery = await db.collection('games').where('gamePin', '==', gamePin).limit(1).get();
  if (gameQuery.empty) {
    throw new functions.https.HttpsError('not-found', 'Game not found with this PIN');
  }

  const gameDoc = gameQuery.docs[0];
  const gameData = gameDoc.data();
  if (gameData.status !== 'WAITING') {
    throw new functions.https.HttpsError('failed-precondition', 'Game has already started or ended');
  }

  const gameId = gameDoc.id;
  const playersRef = gameDoc.ref.collection('players');

  // Transaction to ensure duplicate nickname prevention & atomic count
  const result = await db.runTransaction(async (t) => {
    const existingNick = await t.get(playersRef.where('nickname', '==', cleanNickname));
    if (!existingNick.empty) {
      throw new functions.https.HttpsError('already-exists', 'Nickname is already taken in this game');
    }

    const playerRef = playersRef.doc();
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    t.set(playerRef, {
      nickname: cleanNickname,
      sessionToken,
      score: 0,
      streak: 0,
      correctCount: 0,
      rank: 1,
      isConnected: true,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    t.update(gameDoc.ref, {
      playerCount: admin.firestore.FieldValue.increment(1),
    });

    return {
      playerId: playerRef.id,
      sessionToken,
      gameId,
      quizTitle: gameData.quizTitle,
    };
  });

  return result;
});

// 3. Submit answer (Server-Authoritative scoring)
export const submitAnswer = functions.https.onCall(async (data) => {
  const { gameId, playerId, sessionToken, questionId, selectedOptionId } = data;
  if (!gameId || !playerId || !sessionToken || !questionId || !selectedOptionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing parameters');
  }

  const gameRef = db.collection('games').doc(gameId);
  const gameDoc = await gameRef.get();
  if (!gameDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Game not found');
  }

  const gameData = gameDoc.data()!;
  if (gameData.status !== 'QUESTION_ACTIVE' || gameData.currentQuestionId !== questionId) {
    throw new functions.https.HttpsError('failed-precondition', 'Question is not active for submissions');
  }

  const now = Date.now();
  if (gameData.questionEndsAt && now > gameData.questionEndsAt + 1000) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Time limit has expired for this question');
  }

  const playerRef = gameRef.collection('players').doc(playerId);
  const privateQRef = gameRef.collection('privateQuestions').doc(questionId);

  return await db.runTransaction(async (t) => {
    const playerDoc = await t.get(playerRef);
    if (!playerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Player not found');
    }
    const playerData = playerDoc.data()!;
    if (playerData.sessionToken !== sessionToken) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid player session');
    }

    const answerRef = gameRef.collection('answers').doc(`${playerId}_${questionId}`);
    const existingAnswer = await t.get(answerRef);
    if (existingAnswer.exists) {
      throw new functions.https.HttpsError('already-exists', 'You have already answered this question');
    }

    const privateQDoc = await t.get(privateQRef);
    if (!privateQDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Question data missing');
    }
    const privateQData = privateQDoc.data()!;

    const isCorrect = privateQData.correctOptionId === selectedOptionId;
    let pointsAwarded = 0;
    const responseTimeMs = Math.max(0, now - (gameData.questionStartedAt || now));

    if (isCorrect) {
      const basePoints = privateQData.points || 1000;
      const totalTime = (gameData.questionEndsAt - gameData.questionStartedAt) || 20000;
      const speedMultiplier = Math.max(0.5, 1 - (responseTimeMs / (totalTime * 2)));
      pointsAwarded = Math.round(basePoints * speedMultiplier);
    }

    t.set(answerRef, {
      playerId,
      nickname: playerData.nickname,
      questionId,
      selectedOptionId,
      isCorrect,
      pointsAwarded,
      responseTimeMs,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const newScore = (playerData.score || 0) + pointsAwarded;
    const newStreak = isCorrect ? (playerData.streak || 0) + 1 : 0;
    const newCorrectCount = isCorrect ? (playerData.correctCount || 0) + 1 : (playerData.correctCount || 0);

    t.update(playerRef, {
      score: newScore,
      streak: newStreak,
      correctCount: newCorrectCount,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      submitted: true,
      pointsAwarded,
      isCorrect,
    };
  });
});

// 4. Advance Game State
export const advanceGameState = functions.https.onCall(async (data, context) => {
  verifyAuth(context);
  const { gameId, targetState } = data;
  if (!gameId || !targetState) {
    throw new functions.https.HttpsError('invalid-argument', 'gameId and targetState are required');
  }

  const gameRef = db.collection('games').doc(gameId);
  const gameDoc = await gameRef.get();
  if (!gameDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Game not found');
  }

  const gameData = gameDoc.data()!;
  const updateData: any = { status: targetState };

  if (targetState === 'QUESTION_ACTIVE') {
    const qSnapshot = await gameRef.collection('questions').orderBy('sortOrder', 'asc').get();
    const currIndex = data.nextIndex !== undefined ? data.nextIndex : gameData.currentQuestionIndex;
    const activeQDoc = qSnapshot.docs[currIndex];
    if (activeQDoc) {
      const qData = activeQDoc.data();
      const timeLimitMs = (qData.timeLimitSeconds || 20) * 1000;
      const now = Date.now();
      updateData.currentQuestionIndex = currIndex;
      updateData.currentQuestionId = activeQDoc.id;
      updateData.questionStartedAt = now;
      updateData.questionEndsAt = now + timeLimitMs;
    }
  } else if (targetState === 'FINISHED') {
    updateData.endedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await gameRef.update(updateData);
  return { success: true, status: targetState };
});
