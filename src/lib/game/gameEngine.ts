import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
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
import { handleFirestoreError, OperationType } from '../firebase/errors';

// Legacy mock question texts that were previously auto-seeded into quizzes/games
const LEGACY_MOCK_QUESTION_TEXTS = new Set([
  'Which ocean trench is the deepest known location on Earth?',
  "What element makes up approximately 78% of the Earth's atmosphere?",
  "Who is widely credited with writing the first computer algorithm, intended for Babbage's Analytical Engine?",
  'Which ancient Mediterranean city was famous for the Library of Alexandria and Pharos Lighthouse?',
  'True or False: Sound travels faster in water than in air.',
  'What protocol translates human-readable domain names into IP addresses?',
  'Which celestial body in our solar system has the highest mountain and volcano (Olympus Mons)?',
  'In which year did the Apollo 11 mission successfully land the first humans on the Moon?',
  'What organelle produces the majority of chemical energy (ATP) in eukaryotic cells?',
  'True or False: The World Wide Web and the Internet are the exact same entity.',
]);

const LEGACY_MOCK_QUIZ_TITLES = new Set([
  'General Knowledge Challenge',
]);

export function isLegacyMockQuestion(questionText?: string | null): boolean {
  if (!questionText) return false;
  return LEGACY_MOCK_QUESTION_TEXTS.has(questionText.trim());
}

/**
 * Purges any legacy mock quizzes ("General Knowledge Challenge") and any auto-seeded
 * mock questions that were previously injected into admin-created quizzes or active game sessions.
 */
export async function purgeLegacyMockDataFromDatabase(): Promise<void> {
  try {
    const quizzesSnap = await getDocs(collection(db, 'quizzes'));
    for (const qDoc of quizzesSnap.docs) {
      const qData = qDoc.data() as Quiz;
      const quizId = qDoc.id;

      // If this entire quiz is the legacy mock "General Knowledge Challenge", delete it and its games
      if (LEGACY_MOCK_QUIZ_TITLES.has((qData.title || '').trim())) {
        const subQSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
        for (const sq of subQSnap.docs) {
          await deleteDoc(sq.ref);
        }
        await deleteDoc(qDoc.ref);
        continue;
      }

      // Otherwise, inspect this quiz's questions and remove any auto-seeded mock questions
      const questionsSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      let removedAny = false;
      let remainingCount = 0;

      for (const questionDoc of questionsSnap.docs) {
        const questionData = questionDoc.data() as Question;
        if (isLegacyMockQuestion(questionData.questionText)) {
          await deleteDoc(questionDoc.ref);
          removedAny = true;
        } else {
          remainingCount++;
        }
      }

      if (removedAny) {
        await updateDoc(qDoc.ref, {
          questionCount: remainingCount,
          updatedAt: new Date().toISOString(),
        });

        // Re-sync the PIN session so the game snapshot only has the real questions
        if (qData.gamePin) {
          await syncQuizPinSession(
            quizId,
            qData.createdBy || 'admin',
            qData.gamePin,
            qData.dueDate || null
          );
        }
      }
    }

    // Also clean any standalone games whose title is the legacy mock quiz or that contain legacy mock questions
    const gamesSnap = await getDocs(collection(db, 'games'));
    for (const gDoc of gamesSnap.docs) {
      const gData = gDoc.data() as Game;
      const gameId = gDoc.id;

      if (LEGACY_MOCK_QUIZ_TITLES.has((gData.quizTitle || '').trim())) {
        const subcollections = ['questions', 'players', 'answers', 'results', 'privateQuestions'];
        for (const subName of subcollections) {
          const subSnap = await getDocs(collection(db, `games/${gameId}/${subName}`));
          for (const subDoc of subSnap.docs) {
            await deleteDoc(subDoc.ref);
          }
        }
        await deleteDoc(gDoc.ref);
        continue;
      }

      const gQuestionsSnap = await getDocs(collection(db, `games/${gameId}/questions`));
      let removedGameMock = false;
      let validRemaining = 0;
      for (const gqDoc of gQuestionsSnap.docs) {
        const gqData = gqDoc.data();
        if (isLegacyMockQuestion(gqData.questionText)) {
          await deleteDoc(gqDoc.ref);
          await deleteDoc(doc(db, `games/${gameId}/privateQuestions`, gqDoc.id));
          removedGameMock = true;
        } else {
          validRemaining++;
        }
      }

      if (removedGameMock) {
        await updateDoc(gDoc.ref, {
          totalQuestions: validRemaining,
        });
      }
    }
  } catch (err) {
    console.warn('Completed check for legacy mock data:', err);
  }
}

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

/**
 * Generates/saves a reusable 6-digit PIN and optional Due Date for a Quiz,
 * and strictly syncs the exact questions belonging to that Quiz into the Game session.
 * Never injects mock or sample questions.
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

    // Fetch strictly the current quiz's questions (filtering out any legacy mock questions if present)
    const qQuery = query(collection(db, `quizzes/${quizId}/questions`), orderBy('sortOrder', 'asc'));
    const rawQSnap = await getDocs(qQuery);

    const validQuestionDocs = [];
    for (const d of rawQSnap.docs) {
      const qData = d.data() as Question;
      if (isLegacyMockQuestion(qData.questionText)) {
        await deleteDoc(d.ref);
      } else {
        validQuestionDocs.push(d);
      }
    }

    const finalPin = (customPin || quizData.gamePin || generateCryptoPin()).trim();
    const finalDueDate = dueDate !== undefined ? dueDate : (quizData.dueDate || null);

    // Check if an active game already exists for this quiz
    let gameId = quizData.activeGameId || '';
    let existingGameSnap = gameId ? await getDoc(doc(db, 'games', gameId)) : null;

    // Verify existingGameSnap actually belongs to this quizId
    if (
      existingGameSnap &&
      existingGameSnap.exists() &&
      existingGameSnap.data()?.quizId !== quizId
    ) {
      existingGameSnap = null;
      gameId = '';
    }

    if (!existingGameSnap || !existingGameSnap.exists()) {
      const pinGamesQ = query(collection(db, 'games'), where('gamePin', '==', finalPin));
      const pinGamesSnap = await getDocs(pinGamesQ);
      const matchingQuizGame = pinGamesSnap.docs.find((d) => d.data().quizId === quizId);
      if (matchingQuizGame) {
        gameId = matchingQuizGame.id;
        existingGameSnap = matchingQuizGame;
      }
    }

    const firstQuestionDoc = validQuestionDocs[0];
    const nowIso = new Date().toISOString();

    if (existingGameSnap && existingGameSnap.exists()) {
      const gameRef = doc(db, 'games', gameId);
      await updateDoc(gameRef, {
        quizId,
        quizTitle: quizData.title,
        gamePin: finalPin,
        dueDate: finalDueDate,
        mode: 'SELF_PACED',
        status: 'QUESTION_ACTIVE',
        totalQuestions: validQuestionDocs.length,
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
        totalQuestions: validQuestionDocs.length,
        playerCount: 0,
        questionStartedAt: Date.now(),
        questionEndsAt: null,
        createdBy: hostUid,
        createdAt: nowIso,
        startedAt: nowIso,
        endedAt: null,
      });
    }

    // Remove any stale or old question documents in games/{gameId}/questions and privateQuestions
    // that are NOT part of the current quiz's validQuestionDocs
    const validIds = new Set(validQuestionDocs.map((d) => d.id));
    const existingPublicQSnap = await getDocs(collection(db, `games/${gameId}/questions`));
    for (const oldDoc of existingPublicQSnap.docs) {
      if (!validIds.has(oldDoc.id)) {
        await deleteDoc(oldDoc.ref);
      }
    }
    const existingPrivateQSnap = await getDocs(collection(db, `games/${gameId}/privateQuestions`));
    for (const oldPrivDoc of existingPrivateQSnap.docs) {
      if (!validIds.has(oldPrivDoc.id)) {
        await deleteDoc(oldPrivDoc.ref);
      }
    }

    // Sync public and private question snapshots strictly from the current quiz's questions
    for (let i = 0; i < validQuestionDocs.length; i++) {
      const qDoc = validQuestionDocs[i];
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
      questionCount: validQuestionDocs.length,
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
  nickname: string;
  dueDate?: string | null;
  avatarId?: string;
  avatarUrl?: string;
  alreadyCompleted?: boolean;
}> {
  const nickname = rawNickname.trim().slice(0, 48);
  if (!nickname) {
    throw new Error('Please enter your full name.');
  }

  const cleanPin = gamePin.trim();

  // First check the authoritative Quiz with this current gamePin so we always load the exact current quiz for this PIN
  const quizPinQuery = query(collection(db, 'quizzes'), where('gamePin', '==', cleanPin));
  const quizPinSnap = await getDocs(quizPinQuery);

  let gameId = '';
  let gameData: Game | null = null;

  if (!quizPinSnap.empty) {
    // Prefer published quizzes or most recently updated quiz matching this PIN
    const sortedQuizzes = [...quizPinSnap.docs].sort((a, b) => {
      const aPub = a.data().status === 'PUBLISHED' ? 1 : 0;
      const bPub = b.data().status === 'PUBLISHED' ? 1 : 0;
      if (aPub !== bPub) return bPub - aPub;
      return (b.data().updatedAt || '').localeCompare(a.data().updatedAt || '');
    });

    const targetQuizDoc = sortedQuizzes[0];
    const targetQuiz = targetQuizDoc.data() as Quiz;

    if (targetQuiz.status !== 'PUBLISHED') {
      throw new Error('This quiz is currently in Draft/Archived status and is not accepting participants yet.');
    }

    // Sync the quiz session to guarantee the game's questions strictly match the current quiz's questions
    const synced = await syncQuizPinSession(
      targetQuizDoc.id,
      targetQuiz.createdBy || 'admin',
      cleanPin,
      targetQuiz.dueDate || null
    );
    gameId = synced.gameId;
    const freshGameSnap = await getDoc(doc(db, 'games', gameId));
    if (freshGameSnap.exists()) {
      gameData = freshGameSnap.data() as Game;
    }
  } else {
    // Fallback: Check if a standalone live game session exists with this PIN
    const pinQuery = query(collection(db, 'games'), where('gamePin', '==', cleanPin));
    const pinSnap = await getDocs(pinQuery);

    if (!pinSnap.empty) {
      const sortedDocs = [...pinSnap.docs].sort((a, b) =>
        (b.data().createdAt || '').localeCompare(a.data().createdAt || '')
      );
      const chosenDoc = sortedDocs[0];
      gameId = chosenDoc.id;
      gameData = chosenDoc.data() as Game;
    }
  }

  if (!gameData || !gameId) {
    throw new Error('PIN not found. Please verify the 6-digit PIN from your Administrator.');
  }

  if ((gameData.totalQuestions || 0) === 0) {
    throw new Error('This quiz does not have any published questions yet. Please contact your Administrator.');
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

  // Check if this participant already exists in games/{gameId}/players (by Full Name case-insensitive OR cached completed PIN session)
  const playersSnap = await getDocs(collection(db, `games/${gameId}/players`));
  let cachedCompletedPlayerId: string | null = null;
  try {
    const cachedRaw = localStorage.getItem(`quizarena_completed_pin_${cleanPin}`);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed?.gameId === gameId && parsed?.playerId) {
        cachedCompletedPlayerId = parsed.playerId;
      }
    }
  } catch {
    // ignore
  }

  const normalizedInputName = nickname.toLowerCase();
  const existingPlayerDoc =
    playersSnap.docs.find(
      (d) => (d.data().nickname || '').trim().toLowerCase() === normalizedInputName
    ) ||
    (cachedCompletedPlayerId
      ? playersSnap.docs.find((d) => d.id === cachedCompletedPlayerId)
      : undefined);

  if (existingPlayerDoc) {
    const existingPlayer = existingPlayerDoc.data() as Player;
    const existingPlayerId = existingPlayerDoc.id;

    // Check how many answers this player has already submitted or if a result record exists
    const resultSnap = await getDoc(doc(db, `games/${gameId}/results`, existingPlayerId));
    const answersSnap = await getDocs(
      query(
        collection(db, `games/${gameId}/answers`),
        where('playerId', '==', existingPlayerId)
      )
    );

    const totalQ = gameData.totalQuestions || 1;
    const isAlreadyDone =
      Boolean(cachedCompletedPlayerId) ||
      localStorage.getItem(`quizarena_completed_game_${gameId}_${existingPlayerId}`) === 'true' ||
      answersSnap.size >= totalQ ||
      resultSnap.exists();

    // Ensure their result summary is finalized if they are returning after completion
    if (isAlreadyDone) {
      localStorage.setItem(
        `quizarena_completed_pin_${cleanPin}`,
        JSON.stringify({
          playerId: existingPlayerId,
          sessionToken: existingPlayer.sessionToken,
          gameId,
          nickname: existingPlayer.nickname,
        })
      );
      localStorage.setItem(`quizarena_completed_game_${gameId}_${existingPlayerId}`, 'true');
    }

    return {
      playerId: existingPlayerId,
      sessionToken: existingPlayer.sessionToken,
      gameId,
      quizTitle: gameData.quizTitle,
      nickname: existingPlayer.nickname || nickname,
      dueDate: effectiveDueDate,
      avatarId: existingPlayer.avatarId || avatarId || 'blue_thinker',
      avatarUrl: existingPlayer.avatarUrl || avatarUrl || '',
      alreadyCompleted: isAlreadyDone,
    };
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
    nickname,
    dueDate: effectiveDueDate,
    avatarId: finalAvatarId,
    avatarUrl: finalAvatarUrl,
    alreadyCompleted: false,
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
