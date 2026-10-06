import React, { useEffect, useState, useRef } from 'react';
import { doc, collection, onSnapshot, getDocs, getDoc, query, orderBy } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { db } from '../../lib/firebase/config';
import { Game, GameQuestionSnapshot, Player, Question } from '../../types';
import {
  submitPlayerAnswer,
  completePlayerSelfPacedSession,
  isPastDueDate,
} from '../../lib/game/gameEngine';
import { soundManager } from '../../lib/sound/soundManager';
import { getAvatarById } from '../../lib/avatars/avatarsCatalog';
import {
  Trophy,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  WifiOff,
  RefreshCw,
  Volume2,
  VolumeX,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface PlayerViewProps {
  session: {
    playerId: string;
    sessionToken: string;
    gameId: string;
    quizTitle: string;
    nickname: string;
    gamePin: string;
    dueDate?: string | null;
    avatarId?: string;
    avatarUrl?: string;
  };
  onExit: () => void;
}

// Geometric shapes & styles for distinct accessible answer tiles using the brand palette:
// 1: Primary Orange (#F05A28), 2: Primary Navy (#0D1F3C), 3: Primary Teal (#00A191), 4: Secondary Gray (#E5E5E5)
const OPTION_STYLES = [
  {
    bg: 'bg-[#F05A28] hover:bg-[#ff6c3b] border-[#ff8357] active:bg-[#d94819] shadow-[#F05A28]/35 text-white',
    shape: '▲',
    shapeLabel: 'Triangle',
    badgeBg: 'bg-black/25 text-white',
    border: 'border-[#ff8357]',
    key: '1',
  },
  {
    bg: 'bg-[#0D1F3C] hover:bg-[#162f59] border-[#2d4d80] active:bg-[#071326] shadow-[#0D1F3C]/60 text-white',
    shape: '◆',
    shapeLabel: 'Diamond',
    badgeBg: 'bg-white/20 text-white',
    border: 'border-[#2d4d80]',
    key: '2',
  },
  {
    bg: 'bg-[#00A191] hover:bg-[#00bda9] border-[#20d8c4] active:bg-[#008779] shadow-[#00A191]/35 text-white',
    shape: '●',
    shapeLabel: 'Circle',
    badgeBg: 'bg-black/25 text-white',
    border: 'border-[#20d8c4]',
    key: '3',
  },
  {
    bg: 'bg-[#E5E5E5] hover:bg-white border-white active:bg-[#cccccc] shadow-black/25 text-[#0D1F3C]',
    shape: '■',
    shapeLabel: 'Square',
    badgeBg: 'bg-[#0D1F3C]/15 text-[#0D1F3C]',
    border: 'border-white',
    key: '4',
  },
];

export const PlayerView: React.FC<PlayerViewProps> = ({ session, onExit }) => {
  const { gameId, playerId, sessionToken, nickname } = session;
  const [game, setGame] = useState<Game | null>(null);
  const [allQuestions, setAllQuestions] = useState<GameQuestionSnapshot[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(true);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const [playerData, setPlayerData] = useState<Player | null>(null);
  const myAvatar = getAvatarById(playerData?.avatarId || session.avatarId);
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{
    submitted: boolean;
    pointsAwarded: number;
    isCorrect: boolean;
    correctOptionId?: string;
    explanation?: string | null;
  } | null>(null);

  const [timeRemaining, setTimeRemaining] = useState<number>(20);
  const [connectionLost, setConnectionLost] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [muted, setMuted] = useState(soundManager.isMuted());

  const questionStartRef = useRef<number>(Date.now());
  const autoExpiredForQRef = useRef<string | null>(null);

  const currentQuestion = allQuestions[currentIdx] || null;
  const effectiveDueDate = game?.dueDate || session.dueDate || null;
  const expiredDueDate = isPastDueDate(effectiveDueDate);

  // 1. Real-time Game listener
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'games', gameId),
      (snap) => {
        if (snap.exists()) {
          setConnectionLost(false);
          const data = { id: snap.id, ...snap.data() } as Game;
          setGame(data);
        } else {
          setConnectionLost(true);
        }
      },
      (err) => {
        console.error('Game listener error:', err);
        setConnectionLost(true);
      }
    );
    return () => unsub();
  }, [gameId]);

  // 2. Load all questions for continuous self-paced progression
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoadingQuestions(true);
        const qSnap = await getDocs(
          query(collection(db, `games/${gameId}/questions`), orderBy('sortOrder', 'asc'))
        );

        if (!qSnap.empty) {
          const list = qSnap.docs.map(
            (d) => ({ id: d.id, ...d.data() } as GameQuestionSnapshot)
          );
          setAllQuestions(list);
          if (list[0]) {
            setTimeRemaining(list[0].timeLimitSeconds || 20);
            questionStartRef.current = Date.now();
          }
          setLoadingQuestions(false);
          return;
        }

        // Fallback: load from parent quiz if game questions subcollection was empty
        const gDoc = await getDoc(doc(db, 'games', gameId));
        if (gDoc.exists()) {
          const gData = gDoc.data() as Game;
          if (gData.quizId) {
            const origSnap = await getDocs(
              query(
                collection(db, `quizzes/${gData.quizId}/questions`),
                orderBy('sortOrder', 'asc')
              )
            );
            const fallbackList: GameQuestionSnapshot[] = origSnap.docs.map((d, i) => {
              const q = d.data() as Question;
              return {
                id: d.id,
                questionType: q.questionType,
                questionText: q.questionText,
                imageUrl: q.imageUrl || null,
                explanation: q.explanation || null,
                timeLimitSeconds: q.timeLimitSeconds || 20,
                points: q.points || 1000,
                sortOrder: q.sortOrder || i + 1,
                options: q.options || [],
              };
            });
            setAllQuestions(fallbackList);
            if (fallbackList[0]) {
              setTimeRemaining(fallbackList[0].timeLimitSeconds || 20);
              questionStartRef.current = Date.now();
            }
          }
        }
      } catch (err) {
        console.error('Error loading questions:', err);
      } finally {
        setLoadingQuestions(false);
      }
    };

    loadQuestions();
  }, [gameId]);

  // 3. Real-time Player Data listener
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, `games/${gameId}/players`, playerId),
      (snap) => {
        if (snap.exists()) {
          setPlayerData(snap.data() as Player);
        }
      },
      (err) => console.error('Player listener error:', err)
    );
    return () => unsub();
  }, [gameId, playerId]);

  // 4. Real-time Leaderboard listener
  useEffect(() => {
    const q = query(collection(db, `games/${gameId}/players`), orderBy('score', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
      setTopPlayers(list);
    });
    return () => unsub();
  }, [gameId]);

  // 5. Reset question timer whenever currentIdx changes
  useEffect(() => {
    if (!currentQuestion || isCompleted) return;
    const limit = currentQuestion.timeLimitSeconds || 20;
    setTimeRemaining(limit);
    setSelectedOptionId(null);
    setSubmissionResult(null);
    questionStartRef.current = Date.now();
  }, [currentIdx, currentQuestion?.id, isCompleted]);

  // 6. Per-question countdown timer
  useEffect(() => {
    if (!currentQuestion || isCompleted || submissionResult || submitting) return;

    const totalSec = currentQuestion.timeLimitSeconds || 20;
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - questionStartRef.current) / 1000;
      const rem = Math.max(0, Math.ceil(totalSec - elapsedSec));
      setTimeRemaining(rem);

      if (rem <= 0 && autoExpiredForQRef.current !== currentQuestion.id) {
        autoExpiredForQRef.current = currentQuestion.id;
        clearInterval(interval);
        // Mark question as time-expired so the Next button appears
        setSubmissionResult({
          submitted: true,
          pointsAwarded: 0,
          isCorrect: false,
        });
        soundManager.playIncorrect();
      }
    }, 200);

    return () => clearInterval(interval);
  }, [currentQuestion, isCompleted, submissionResult, submitting]);

  // Handle answer selection
  const handleSelectOption = async (optionId: string) => {
    if (
      selectedOptionId ||
      submissionResult ||
      submitting ||
      !currentQuestion ||
      expiredDueDate
    ) {
      return;
    }

    try {
      setSubmitting(true);
      setSelectedOptionId(optionId);
      soundManager.playAnswerSubmit();

      const elapsedMs = Math.max(0, Date.now() - questionStartRef.current);
      const res = await submitPlayerAnswer(
        gameId,
        playerId,
        sessionToken,
        currentQuestion.id,
        optionId,
        elapsedMs
      );
      setSubmissionResult(res);

      if (res.isCorrect) {
        soundManager.playCorrect();
      } else {
        soundManager.playIncorrect();
      }
    } catch (err: any) {
      console.error('Answer submission error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Advance to the next question or finish the quiz when clicking "Next"
  const handleNextQuestion = async () => {
    if (currentIdx + 1 < allQuestions.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      await completePlayerSelfPacedSession(gameId, playerId);
      setIsCompleted(true);
      soundManager.playVictory();
      confetti({
        particleCount: 110,
        spread: 80,
        origin: { y: 0.6 },
      });
    }
  };

  // Keyboard accessibility: 1, 2, 3, 4 keys to answer; Enter/ArrowRight for Next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted || !currentQuestion) return;
      if (!submissionResult && !selectedOptionId) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < currentQuestion.options.length) {
          handleSelectOption(currentQuestion.options[idx].id);
        }
      } else if (submissionResult && (e.key === 'Enter' || e.key === 'ArrowRight')) {
        handleNextQuestion();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCompleted, currentQuestion, submissionResult, selectedOptionId, currentIdx]);

  if (connectionLost) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center p-6 pb-safe text-center bg-slate-950 text-white">
        <WifiOff className="w-16 h-16 text-rose-500 animate-pulse mb-4" />
        <h2 className="text-2xl font-bold mb-2">Connection Lost</h2>
        <p className="text-slate-400 mb-6">Attempting to reconnect to quiz session...</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reload Session</span>
        </button>
      </div>
    );
  }

  if (expiredDueDate) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center p-6 pb-safe text-center bg-slate-950 text-white">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0D1F3C] border-2 border-[#F05A28]/50 space-y-4 shadow-2xl">
          <AlertCircle className="w-14 h-14 text-[#F05A28] mx-auto" />
          <h2 className="text-2xl font-black text-white">Past Due Date</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            This quiz closed on <strong className="text-white">{effectiveDueDate}</strong> and is no longer accepting submissions.
          </p>
          <button
            onClick={onExit}
            className="w-full py-3 px-6 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (loadingQuestions) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center p-6 bg-slate-950 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#00A191] mb-3" />
        <p className="text-sm font-bold text-slate-300">Loading questions for {session.quizTitle}...</p>
      </div>
    );
  }

  // COMPLETED SCREEN / FINAL SUMMARY & STANDINGS
  if (isCompleted || allQuestions.length === 0) {
    const totalQuestionsCount = allQuestions.length || game?.totalQuestions || 1;
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col justify-between items-center p-4 sm:p-8 pb-safe bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 text-white">
        <div className="text-center pt-2 sm:pt-4">
          <span className="inline-block px-3 py-1 rounded-full bg-[#00A191]/20 border border-[#00A191]/40 text-[#00A191] text-xs font-bold uppercase tracking-wider mb-2">
            PIN: {session.gamePin} • Completed
          </span>
          <h1 className="text-2xl sm:text-5xl font-black tracking-tight mb-1 sm:mb-2">
            QUIZ COMPLETE!
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm">
            Thank you, <strong className="text-white">{nickname}</strong>! Your answers have been saved.
          </p>
        </div>

        {/* Podium Top 3 */}
        {topPlayers.length > 0 && (
          <div className="w-full max-w-lg grid grid-cols-3 gap-2 sm:gap-4 items-end my-auto py-6">
            {/* 2nd place */}
            {topPlayers[1] ? (
              <div className="flex flex-col items-center">
                <img
                  src={getAvatarById(topPlayers[1].avatarId).imageUrl}
                  alt={topPlayers[1].nickname}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-slate-300 shadow-lg mb-1.5"
                />
                <span className="font-bold text-xs sm:text-sm text-slate-300 truncate max-w-full">
                  {topPlayers[1].nickname}
                </span>
                <span className="font-mono text-xs text-slate-400 mb-2">{topPlayers[1].score}</span>
                <div className="w-full h-24 sm:h-32 rounded-t-2xl bg-gradient-to-t from-slate-800 to-slate-700 flex items-center justify-center border-t-2 border-slate-400 shadow-xl">
                  <span className="text-2xl font-black text-slate-300">2</span>
                </div>
              </div>
            ) : (
              <div />
            )}

            {/* 1st place */}
            {topPlayers[0] && (
              <div className="flex flex-col items-center">
                <div className="relative mb-1.5">
                  <img
                    src={getAvatarById(topPlayers[0].avatarId).imageUrl}
                    alt={topPlayers[0].nickname}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-3 border-amber-400 shadow-xl shadow-amber-400/40"
                  />
                  <div className="absolute -top-2 -right-2 p-1.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
                    <Trophy className="w-4 h-4" />
                  </div>
                </div>
                <span className="font-black text-sm sm:text-base text-amber-300 truncate max-w-full">
                  {topPlayers[0].nickname}
                </span>
                <span className="font-mono text-xs text-amber-400 font-bold mb-2">
                  {topPlayers[0].score}
                </span>
                <div className="w-full h-32 sm:h-44 rounded-t-2xl bg-gradient-to-t from-amber-600 to-amber-400 flex items-center justify-center border-t-2 border-amber-200 shadow-2xl shadow-amber-500/20">
                  <span className="text-4xl font-black text-slate-950">1</span>
                </div>
              </div>
            )}

            {/* 3rd place */}
            {topPlayers[2] ? (
              <div className="flex flex-col items-center">
                <img
                  src={getAvatarById(topPlayers[2].avatarId).imageUrl}
                  alt={topPlayers[2].nickname}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-amber-700 shadow-md mb-1.5"
                />
                <span className="font-bold text-xs sm:text-sm text-slate-400 truncate max-w-full">
                  {topPlayers[2].nickname}
                </span>
                <span className="font-mono text-xs text-slate-400 mb-2">{topPlayers[2].score}</span>
                <div className="w-full h-16 sm:h-24 rounded-t-2xl bg-gradient-to-t from-amber-950 to-amber-900 flex items-center justify-center border-t-2 border-amber-700 shadow-lg">
                  <span className="text-xl font-black text-amber-600">3</span>
                </div>
              </div>
            ) : (
              <div />
            )}
          </div>
        )}

        {/* Personal Summary Card */}
        <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl text-center space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Your Results Summary
          </h3>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Your Score</p>
              <p className="text-lg font-mono font-black text-amber-400">
                {playerData?.score || 0}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Correct</p>
              <p className="text-lg font-mono font-black text-emerald-400">
                {playerData?.correctCount || 0} / {totalQuestionsCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Accuracy</p>
              <p className="text-lg font-mono font-black text-indigo-400">
                {totalQuestionsCount > 0
                  ? Math.round(((playerData?.correctCount || 0) / totalQuestionsCount) * 100)
                  : 0}
                %
              </p>
            </div>
          </div>

          <button
            onClick={onExit}
            className="w-full py-3.5 px-6 rounded-xl font-bold bg-[#00A191] hover:bg-[#00bda9] text-white transition-all cursor-pointer shadow-lg shadow-[#00A191]/30"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // CONTINUOUS SELF-PACED QUESTION SCREEN
  const totalTime = currentQuestion?.timeLimitSeconds || 20;
  const progressPercent = Math.min(100, Math.max(0, (timeRemaining / totalTime) * 100));
  const isLastQuestion = currentIdx + 1 >= allQuestions.length;

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col justify-between p-3 sm:p-6 pb-safe bg-slate-950 text-white select-none">
      {/* Header: Question Progress, PIN & Due Date, Timer, and Score */}
      <div className="max-w-4xl w-full mx-auto space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <span className="px-2.5 sm:px-3 py-1 rounded-full bg-[#0D1F3C] border border-[#00A191]/40 text-white whitespace-nowrap">
              Question {currentIdx + 1} of {allQuestions.length}
            </span>

            {effectiveDueDate && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
                <Calendar className="w-3.5 h-3.5 text-[#F05A28]" />
                <span>Due: {effectiveDueDate}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full bg-[#0D1F3C] border border-[#E5E5E5]/20 font-mono text-white shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#00A191]" />
            <span
              className={`text-sm sm:text-base font-black ${
                timeRemaining <= 5 && !submissionResult
                  ? 'text-[#F05A28] animate-pulse'
                  : 'text-[#00A191]'
              }`}
            >
              {timeRemaining}s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#0D1F3C] border border-[#E5E5E5]/20 text-[#F05A28] font-bold shrink-0">
              <img
                src={myAvatar.imageUrl}
                alt={nickname}
                className="w-4 h-4 rounded-full object-cover border"
                style={{ borderColor: myAvatar.accentColor }}
              />
              <span className="text-xs text-slate-300 hidden sm:inline truncate max-w-[120px]">
                {nickname}
              </span>
              <Trophy className="w-3.5 h-3.5 text-[#F05A28]" />
              <span className="text-[#E5E5E5] font-mono">{playerData?.score || 0} pts</span>
            </div>

            <button
              onClick={() => {
                const next = soundManager.toggleMute();
                setMuted(next);
              }}
              title={muted ? 'Unmute Sound' : 'Mute Sound'}
              className="p-2 rounded-full bg-[#0D1F3C] border border-[#E5E5E5]/20 text-slate-300 hover:text-white cursor-pointer"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-[#00A191]" />
              )}
            </button>
          </div>
        </div>

        {/* Time Progress Bar */}
        <div className="w-full h-2 sm:h-2.5 rounded-full bg-[#0D1F3C] overflow-hidden border border-[#E5E5E5]/20">
          <div
            className={`h-full transition-all duration-200 ease-linear rounded-full ${
              progressPercent > 25
                ? 'bg-gradient-to-r from-[#00A191] to-[#F05A28]'
                : 'bg-[#F05A28]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question Prompt Card in Primary Navy with Teal accent */}
      <div className="max-w-4xl w-full mx-auto my-auto py-3 sm:py-5">
        <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-[#0D1F3C] border-2 border-[#00A191]/40 shadow-2xl shadow-[#0D1F3C]/60 text-center relative overflow-hidden backdrop-blur-xl space-y-4">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F05A28] via-[#00A191] to-[#E5E5E5]" />
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#00A191]">
            {session.quizTitle} • PIN {session.gamePin}
          </div>
          <h2 className="text-lg sm:text-3xl font-black text-white leading-snug sm:leading-relaxed">
            {currentQuestion?.questionText || 'Loading question...'}
          </h2>
          {currentQuestion?.imageUrl && (
            <div className="flex justify-center pt-1">
              <img
                src={currentQuestion.imageUrl}
                alt="Question visual"
                className="max-h-48 sm:max-h-64 w-auto rounded-2xl object-contain border border-slate-700/80 bg-slate-950/60 p-1.5"
              />
            </div>
          )}
        </div>
      </div>

      {/* Answer Options Grid + Continuous "Next" Button Flow */}
      <div className="max-w-4xl w-full mx-auto pb-2 sm:pb-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
          {currentQuestion?.options.map((opt, idx) => {
            const style = OPTION_STYLES[idx % OPTION_STYLES.length];
            const isSelected = selectedOptionId === opt.id;
            const isRevealed = Boolean(submissionResult);
            const isCorrectOption =
              isRevealed &&
              submissionResult?.correctOptionId &&
              submissionResult.correctOptionId === opt.id;
            const isWrongSelected = isRevealed && isSelected && !submissionResult?.isCorrect;

            return (
              <button
                key={opt.id}
                onClick={() => handleSelectOption(opt.id)}
                disabled={submitting || isRevealed}
                className={`min-h-[60px] sm:min-h-[76px] flex items-center gap-3 sm:gap-4 p-3.5 sm:p-5 rounded-2xl font-bold text-sm sm:text-lg border-2 transition-all shadow-xl ${
                  isRevealed
                    ? isCorrectOption
                      ? 'bg-emerald-600 border-emerald-300 text-white ring-4 ring-emerald-400/30 scale-[1.01]'
                      : isWrongSelected
                      ? 'bg-rose-700 border-rose-300 text-white opacity-90'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 opacity-60'
                    : `transform active:scale-95 cursor-pointer ${style.bg}`
                }`}
                aria-label={`Option ${idx + 1}: ${opt.text}`}
              >
                <span
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xl sm:text-2xl font-black shrink-0 ${style.badgeBg}`}
                >
                  {style.shape}
                </span>
                <span className="text-left flex-1 break-words font-extrabold leading-tight">
                  {opt.text}
                </span>
                {isRevealed && isCorrectOption && (
                  <CheckCircle2 className="w-6 h-6 text-white shrink-0" />
                )}
                {isRevealed && isWrongSelected && (
                  <XCircle className="w-6 h-6 text-white shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Continuous Self-Paced Feedback & Next Button Bar */}
        {submissionResult && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0D1F3C] border-2 border-[#00A191] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-left">
              {submissionResult.isCorrect ? (
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#F05A28]/20 border border-[#F05A28] text-[#F05A28] flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-base sm:text-lg font-black ${
                      submissionResult.isCorrect ? 'text-emerald-400' : 'text-[#F05A28]'
                    }`}
                  >
                    {selectedOptionId
                      ? submissionResult.isCorrect
                        ? `CORRECT! +${submissionResult.pointsAwarded} pts`
                        : 'INCORRECT'
                      : 'TIME EXPIRED'}
                  </span>
                  {playerData?.streak && playerData.streak > 1 && submissionResult.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-400/30">
                      <Flame className="w-3.5 h-3.5 fill-amber-400" />
                      Streak {playerData.streak}
                    </span>
                  ) : null}
                </div>
                {(submissionResult.explanation || currentQuestion?.explanation) && (
                  <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                    {submissionResult.explanation || currentQuestion?.explanation}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextQuestion}
              className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-black text-sm sm:text-base bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/30 cursor-pointer transition-all"
            >
              <span>{isLastQuestion ? 'Finish Quiz' : 'Next'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
