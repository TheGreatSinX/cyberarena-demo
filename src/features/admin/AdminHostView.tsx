import React, { useEffect, useState } from 'react';
import { doc, collection, onSnapshot, query, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { db } from '../../lib/firebase/config';
import { Game, GameQuestionSnapshot, Player, AnswerSubmission } from '../../types';
import { advanceGameState } from '../../lib/game/gameEngine';
import { getAvatarById } from '../../lib/avatars/avatarsCatalog';
import {
  Users,
  Play,
  SkipForward,
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  StopCircle,
  BarChart3,
  UserX,
  QrCode,
  Download,
  Maximize2,
  X,
  Link2,
} from 'lucide-react';

interface AdminHostViewProps {
  gameId: string;
  onFinishGame: () => void;
  onExit: () => void;
}

const OPTION_STYLES = [
  { color: 'bg-[#F05A28]', border: 'border-[#ff8357]', text: 'text-white', shape: '▲' },
  { color: 'bg-[#0D1F3C]', border: 'border-[#2d4d80]', text: 'text-white', shape: '◆' },
  { color: 'bg-[#00A191]', border: 'border-[#20d8c4]', text: 'text-white', shape: '●' },
  { color: 'bg-[#E5E5E5]', border: 'border-white', text: 'text-[#0D1F3C]', shape: '■' },
];

export const AdminHostView: React.FC<AdminHostViewProps> = ({ gameId, onFinishGame, onExit }) => {
  const [game, setGame] = useState<Game | null>(null);
  const [questions, setQuestions] = useState<GameQuestionSnapshot[]>([]);
  const [privateAnswers, setPrivateAnswers] = useState<Record<string, { correctOptionId: string; explanation?: string }>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<AnswerSubmission[]>([]);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(20);
  const [countdownNum, setCountdownNum] = useState<number>(3);

  const joinUrl = game?.gamePin ? `${window.location.origin}/?pin=${game.gamePin}` : '';

  // Generate QR Code Data URL whenever gamePin changes
  useEffect(() => {
    if (!game?.gamePin) {
      setQrCodeDataUrl('');
      return;
    }
    let isMounted = true;
    const targetUrl = `${window.location.origin}/?pin=${game.gamePin}`;
    QRCode.toDataURL(targetUrl, {
      width: 420,
      margin: 2,
      color: {
        dark: '#0D1F3C',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) setQrCodeDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [game?.gamePin]);

  // Countdown timer effect for host view
  useEffect(() => {
    if (game?.status === 'COUNTDOWN') {
      setCountdownNum(3);
      const t1 = setTimeout(() => setCountdownNum(2), 800);
      const t2 = setTimeout(() => setCountdownNum(1), 1600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [game?.status]);

  // 1. Listen to Game doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'games', gameId), (snap) => {
      if (snap.exists()) {
        setGame(snap.data() as Game);
      }
    });
    return () => unsub();
  }, [gameId]);

  // 2. Fetch game questions snapshot
  useEffect(() => {
    const qQuery = query(collection(db, `games/${gameId}/questions`), orderBy('sortOrder', 'asc'));
    const unsub = onSnapshot(qQuery, (snap) => {
      const qList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GameQuestionSnapshot));
      setQuestions(qList);
    });
    return () => unsub();
  }, [gameId]);

  // 3. Fetch private answers for Host view
  useEffect(() => {
    const unsub = onSnapshot(collection(db, `games/${gameId}/privateQuestions`), (snap) => {
      const map: Record<string, { correctOptionId: string; explanation?: string }> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() as { correctOptionId: string; explanation?: string };
      });
      setPrivateAnswers(map);
    });
    return () => unsub();
  }, [gameId]);

  // 4. Real-time players in game
  useEffect(() => {
    const pQuery = query(collection(db, `games/${gameId}/players`), orderBy('score', 'desc'));
    const unsub = onSnapshot(pQuery, (snap) => {
      const pList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
      setPlayers(pList);
    });
    return () => unsub();
  }, [gameId]);

  // 5. Real-time answers for current question
  useEffect(() => {
    if (!game?.currentQuestionId) return;
    const unsub = onSnapshot(collection(db, `games/${gameId}/answers`), (snap) => {
      const allAnswers = snap.docs.map((d) => d.data() as AnswerSubmission);
      const filtered = allAnswers.filter((a) => a.questionId === game.currentQuestionId);
      setAnswers(filtered);
    });
    return () => unsub();
  }, [gameId, game?.currentQuestionId]);

  // Timer calculation
  useEffect(() => {
    if (game?.status !== 'QUESTION_ACTIVE' || !game.questionEndsAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingMs = Math.max(0, (game.questionEndsAt || 0) - now);
      const secs = Math.ceil(remainingMs / 1000);
      setTimeRemaining(secs);

      // Auto-lock when timer reaches 0
      if (secs <= 0) {
        advanceGameState(gameId, 'QUESTION_LOCKED');
      }
    }, 200);

    return () => clearInterval(interval);
  }, [gameId, game?.status, game?.questionEndsAt]);

  const handleCopyPin = () => {
    if (!game?.gamePin) return;
    navigator.clipboard.writeText(game.gamePin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const handleCopyJoinLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrCodeDataUrl || !game?.gamePin) return;
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `cyberarena-pin-${game.gamePin}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStartGame = async () => {
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'COUNTDOWN', 0);
      setTimeout(async () => {
        await advanceGameState(gameId, 'QUESTION_ACTIVE', 0);
        setActionLoading(false);
      }, 2500);
    } catch (err) {
      console.error('Failed to start game:', err);
      setActionLoading(false);
    }
  };

  const handleLockQuestion = async () => {
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'QUESTION_LOCKED');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShowResults = async () => {
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'ANSWER_RESULTS');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShowLeaderboard = async () => {
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'LEADERBOARD');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleNextQuestion = async () => {
    if (!game) return;
    const totalQ = questions.length || game.totalQuestions || 0;
    const nextIdx = (game.currentQuestionIndex || 0) + 1;
    if (totalQ > 0 && nextIdx >= totalQ) {
      handleEndGame();
      return;
    }
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'COUNTDOWN', nextIdx);
      setTimeout(async () => {
        await advanceGameState(gameId, 'QUESTION_ACTIVE', nextIdx);
        setActionLoading(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      setActionLoading(false);
    }
  };

  const handleEndGame = async () => {
    try {
      setActionLoading(true);
      await advanceGameState(gameId, 'FINISHED');
      onFinishGame();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickPlayer = async (playerId: string) => {
    try {
      await deleteDoc(doc(db, `games/${gameId}/players`, playerId));
      if (game) {
        await updateDoc(doc(db, 'games', gameId), {
          playerCount: Math.max(0, (game.playerCount || 1) - 1),
        });
      }
    } catch (err) {
      console.error('Error removing player:', err);
    }
  };

  const activeQuestion = questions[game?.currentQuestionIndex || 0];
  const activePrivate = activeQuestion ? privateAnswers[activeQuestion.id] : null;

  if (!game) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-950 text-white">
        <p>Loading Game Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col bg-slate-950 text-white p-3.5 sm:p-8 pb-safe">
      {/* Top Banner: Game PIN, Status, and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-xl mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">GAME PIN</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl sm:text-4xl font-mono font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
                {game.gamePin}
              </span>
              <button
                onClick={handleCopyPin}
                title="Copy PIN"
                aria-label="Copy PIN"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition-colors"
              >
                {copiedPin ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setQrModalOpen(true)}
                title="Show Join QR Code"
                aria-label="Show Join QR Code"
                className="min-h-[38px] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 cursor-pointer transition-colors text-xs font-bold"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden md:inline">QR Code</span>
              </button>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-800 mx-1 sm:mx-2 hidden xs:block sm:block" />

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">CURRENT STATUS</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  game.status === 'QUESTION_ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'
                }`}
              />
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide">{game.status.replace('_', ' ')}</span>
            </div>
          </div>
        </div>

        {/* Players count & Exit */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-xs sm:text-sm text-slate-200">{players.length} Players</span>
          </div>

          <button
            onClick={handleEndGame}
            disabled={actionLoading}
            className="min-h-[40px] flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 cursor-pointer transition-colors disabled:opacity-50"
          >
            <StopCircle className="w-4 h-4" />
            <span>{actionLoading ? 'Ending...' : 'End Session'}</span>
          </button>
        </div>
      </div>

      {/* Main Host Area */}
      {game.status === 'WAITING' ? (
        /* LOBBY VIEW */
        <div className="flex-1 flex flex-col justify-between max-w-5xl w-full mx-auto">
          <div className="text-center py-3 sm:py-5">
            <h2 className="text-2xl sm:text-3xl font-black mb-2">{game.quizTitle}</h2>
            <p className="text-slate-400 text-xs sm:text-sm">
              Scan the QR code below or enter PIN <strong className="text-white font-mono">{game.gamePin}</strong> on CYBER|ARENA to join immediately
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 my-auto items-stretch">
            {/* QR Code Join Card */}
            <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-indigo-500/30 shadow-xl flex flex-col items-center justify-between text-center">
              <div className="w-full flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                  <QrCode className="w-4 h-4" />
                  <span>Scan to Join</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                  title="Enlarge QR Code for Projector"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Enlarge</span>
                </button>
              </div>

              {qrCodeDataUrl ? (
                <div
                  onClick={() => setQrModalOpen(true)}
                  className="p-3 rounded-2xl bg-white shadow-lg shadow-indigo-950/50 border-2 border-indigo-400/40 cursor-pointer hover:scale-[1.02] transition-transform"
                  title="Click to enlarge QR Code"
                >
                  <img
                    src={qrCodeDataUrl}
                    alt={`Join Game PIN ${game.gamePin} QR Code`}
                    className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xs text-slate-500">
                  Generating QR...
                </div>
              )}

              <div className="w-full mt-4 space-y-2">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 truncate">
                  PIN: <strong className="text-white font-black tracking-widest">{game.gamePin}</strong>
                </div>

                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleCopyJoinLink}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Copy Join Link</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    disabled={!qrCodeDataUrl}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="Download QR Code PNG"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PNG</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Connected Players Wall */}
            <div className="lg:col-span-7 p-4 sm:p-6 rounded-3xl bg-slate-900/60 border border-slate-800 min-h-[240px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Connected Players ({players.length})
                </span>
                {players.length === 0 && (
                  <span className="text-xs text-amber-400 animate-pulse">Waiting for players to scan or enter PIN...</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-2.5 content-start flex-1">
                {players.map((p) => {
                  const av = getAvatarById(p.avatarId);
                  return (
                    <div
                      key={p.id}
                      className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all text-xs sm:text-sm font-bold text-white shadow-sm"
                    >
                      <img
                        src={av.imageUrl}
                        alt={p.nickname}
                        className="w-6 h-6 rounded-full object-cover border shrink-0"
                        style={{ borderColor: av.accentColor }}
                      />
                      <span className="truncate max-w-[140px] sm:max-w-none">{p.nickname}</span>
                      <button
                        onClick={() => handleKickPlayer(p.id)}
                        title="Remove Player"
                        aria-label={`Remove ${p.nickname}`}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-400 hover:text-rose-400 cursor-pointer ml-1 p-0.5"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-5 sm:pt-6 text-center">
            <button
              onClick={handleStartGame}
              disabled={players.length === 0 || actionLoading}
              className="w-full sm:w-auto min-h-[52px] py-3.5 sm:py-4 px-6 sm:px-10 rounded-2xl font-black text-base sm:text-lg bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white shadow-xl shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all hover:scale-105 active:scale-95"
            >
              Start CYBER|ARENA ({players.length} Ready)
            </button>
          </div>
        </div>
      ) : game.status === 'QUESTION_ACTIVE' ? (
        /* QUESTION ACTIVE VIEW */
        <div className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto">
          {/* Question Stats Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 rounded-2xl bg-[#0D1F3C] border border-[#E5E5E5]/20">
            <span className="text-xs sm:text-sm font-bold text-[#E5E5E5]">
              Question {(game.currentQuestionIndex || 0) + 1} of {questions.length}
            </span>

            <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full bg-slate-950 font-mono text-base sm:text-lg font-black text-[#F05A28] border border-[#F05A28]/30">
              <Clock className="w-4 h-4 text-[#F05A28]" />
              <span>{timeRemaining}s</span>
            </div>

            <div className="text-xs sm:text-sm font-bold text-[#00A191]">
              {answers.length} / {players.length} Answered
            </div>
          </div>

          {/* Question Prompt in Primary Navy with Teal/Orange accent */}
          <div className="p-5 sm:p-12 rounded-3xl bg-[#0D1F3C] border-2 border-[#00A191]/40 shadow-2xl text-center my-4 sm:my-6 relative overflow-hidden backdrop-blur-xl space-y-4">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F05A28] via-[#00A191] to-[#E5E5E5]" />
            <h2 className="text-xl sm:text-4xl font-black text-white">{activeQuestion?.questionText}</h2>
            {activeQuestion?.imageUrl && (
              <div className="flex justify-center pt-1">
                <img
                  src={activeQuestion.imageUrl}
                  alt="Question visual"
                  className="max-h-56 sm:max-h-72 w-auto rounded-2xl object-contain border border-slate-700/80 bg-slate-950/60 p-1.5"
                />
              </div>
            )}
          </div>

          {/* Live Responses Indicator with 4 brand colors */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-6">
            {activeQuestion?.options.map((opt, idx) => {
              const style = OPTION_STYLES[idx % OPTION_STYLES.length];
              const count = answers.filter((a) => a.selectedOptionId === opt.id).length;
              return (
                <div key={opt.id} className={`p-3 sm:p-4 rounded-2xl border-2 text-center transition-all ${style.color} ${style.border} ${style.text} shadow-xl`}>
                  <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mx-auto mb-1.5 sm:mb-2 font-black text-xs sm:text-sm ${idx === 3 ? 'bg-black/15 text-[#0D1F3C]' : 'bg-black/25 text-white'}`}>
                    {style.shape}
                  </span>
                  <p className="text-xs truncate mb-1 font-bold opacity-90">{opt.text}</p>
                  <p className="text-xl sm:text-2xl font-mono font-black">{count}</p>
                </div>
              );
            })}
          </div>

          {/* Control: Early lock */}
          <div className="text-center">
            <button
              onClick={handleLockQuestion}
              disabled={actionLoading}
              className="w-full sm:w-auto min-h-[48px] py-3 px-8 rounded-xl font-bold bg-[#F05A28] hover:bg-[#ff6c3b] text-white cursor-pointer shadow-lg shadow-[#F05A28]/30 transition-all"
            >
              Lock Question Early
            </button>
          </div>
        </div>
      ) : game.status === 'QUESTION_LOCKED' || game.status === 'ANSWER_RESULTS' ? (
        /* ANSWER RESULTS VIEW */
        <div className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto">
          <div className="text-center mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-[#00A191]">QUESTION RECAP</span>
            <h3 className="text-xl sm:text-2xl font-black mt-1 text-white">{activeQuestion?.questionText}</h3>
          </div>

          {/* Options with correctness and response distribution */}
          <div className="space-y-3 my-auto max-w-2xl w-full mx-auto">
            {activeQuestion?.options.map((opt, idx) => {
              const style = OPTION_STYLES[idx % OPTION_STYLES.length];
              const isCorrect = activePrivate?.correctOptionId === opt.id;
              const answerCount = answers.filter((a) => a.selectedOptionId === opt.id).length;
              const percent = players.length > 0 ? Math.round((answerCount / players.length) * 100) : 0;

              return (
                <div
                  key={opt.id}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    isCorrect
                      ? 'bg-[#00A191]/20 border-[#00A191] text-white shadow-lg shadow-[#00A191]/20'
                      : 'bg-[#0D1F3C]/80 border-[#E5E5E5]/20 opacity-70 text-[#E5E5E5]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{style.shape}</span>
                      <span className="font-bold text-base">{opt.text}</span>
                      {isCorrect && (
                        <span className="px-2 py-0.5 rounded bg-[#00A191]/30 border border-[#00A191] text-[#29d4c1] text-xs font-bold">
                          CORRECT
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-sm">
                      {answerCount} ({percent}%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isCorrect ? 'bg-[#00A191]' : 'bg-[#F05A28]/80'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {activePrivate?.explanation && (
              <div className="p-4 rounded-xl bg-[#0D1F3C] border border-[#00A191]/40 text-xs text-[#E5E5E5] mt-4">
                <strong className="text-[#00A191]">Explanation: </strong> {activePrivate.explanation}
              </div>
            )}
          </div>

          <div className="pt-6 text-center">
            <button
              onClick={handleShowLeaderboard}
              disabled={actionLoading}
              className="py-3.5 px-8 rounded-2xl font-bold bg-[#00A191] hover:bg-[#00bda9] text-white shadow-lg shadow-[#00A191]/30 cursor-pointer transition-all"
            >
              Show Leaderboard
            </button>
          </div>
        </div>
      ) : game.status === 'LEADERBOARD' ? (
        /* LEADERBOARD VIEW */
        <div className="flex-1 flex flex-col justify-between max-w-2xl w-full mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase mb-2">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Arena Scores
            </div>
            <h2 className="text-3xl font-black text-white">Live Leaderboard</h2>
          </div>

          <div className="space-y-2.5 my-auto">
            {players.slice(0, 5).map((p, idx) => {
              const av = getAvatarById(p.avatarId);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <img
                      src={av.imageUrl}
                      alt={p.nickname}
                      className="w-8 h-8 rounded-full object-cover border"
                      style={{ borderColor: av.accentColor }}
                    />
                    <span className="font-bold text-white text-base">{p.nickname}</span>
                  </div>
                  <span className="font-mono font-black text-amber-400 text-base">{p.score} pts</span>
                </div>
              );
            })}
          </div>

          <div className="pt-6 text-center">
            <button
              onClick={handleNextQuestion}
              disabled={actionLoading}
              className="py-4 px-10 rounded-2xl font-black text-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/30 cursor-pointer transition-all hover:scale-105"
            >
              {(game.currentQuestionIndex || 0) + 1 >= (questions.length || game.totalQuestions || 1)
                ? 'Show Final Podium'
                : 'Next Question'}
            </button>
          </div>
        </div>
      ) : game.status === 'COUNTDOWN' ? (
        /* COUNTDOWN VIEW */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-6">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>
              Upcoming Question {(game.currentQuestionIndex !== undefined ? game.currentQuestionIndex : 0) + 1} of{' '}
              {questions.length || game.totalQuestions || 1}
            </span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">Get Ready!</h3>
          <p className="text-slate-400 text-sm mb-6">Broadcasting question to all connected players...</p>
          <div className="w-32 h-32 rounded-3xl bg-indigo-950/60 border-2 border-indigo-500/40 flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-6">
            <span className="text-7xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-tr from-white via-indigo-200 to-purple-400 animate-pulse">
              {countdownNum}
            </span>
          </div>
        </div>
      ) : game.status === 'FINISHED' ? (
        /* FINISHED */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6">
          <Trophy className="w-16 h-16 text-amber-400 animate-bounce mb-4" />
          <h2 className="text-2xl sm:text-3xl font-black mb-2">Arena Completed!</h2>
          <p className="text-slate-400 text-xs sm:text-sm mb-6">Final scores and statistics have been archived for analysis.</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
            <button
              onClick={onFinishGame}
              className="min-h-[48px] py-3 px-6 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg"
            >
              View Results & Export CSV
            </button>
            <button
              onClick={onExit}
              className="min-h-[48px] py-3 px-6 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : null}

      {/* Fullscreen / Projector QR Code Modal */}
      {qrModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl bg-slate-900 border-2 border-indigo-500/40 p-6 sm:p-8 shadow-2xl text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close QR Code Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase">
                <QrCode className="w-3.5 h-3.5" />
                <span>Instant Mobile Join</span>
              </div>
              <h3 className="text-2xl font-black text-white">{game.quizTitle}</h3>
              <p className="text-xs text-slate-400">
                Scan with your phone camera to open CYBER|ARENA with the Game PIN pre-filled
              </p>
            </div>

            {qrCodeDataUrl && (
              <div className="p-4 rounded-3xl bg-white shadow-2xl mx-auto inline-block border-4 border-indigo-500/40">
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code for Game PIN ${game.gamePin}`}
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain mx-auto"
                />
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                GAME PIN
              </span>
              <span className="text-3xl font-mono font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
                {game.gamePin}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyJoinLink}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Copied Join Link!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 text-indigo-400" />
                    <span>Copy Join Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadQr}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <Download className="w-4 h-4" />
                <span>Download QR</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
