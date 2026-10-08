import React, { useState, useEffect, useRef } from 'react';
import { Play, Sparkles, Users, Trophy, ShieldCheck, CheckCircle2, Loader2, AlertCircle, Lock, Mail } from 'lucide-react';
import { joinGameSession, prefetchPinSession } from '../../lib/game/gameEngine';
import { GameQuestionSnapshot } from '../../types';
import { soundManager } from '../../lib/sound/soundManager';
import { FloatingPartyObjects } from '../../components/FloatingPartyObjects';
import { AvatarPickerModal } from './AvatarPickerModal';
import { PlayerAvatar, DEFAULT_AVATAR } from '../../lib/avatars/avatarsCatalog';

interface LandingViewProps {
  onJoinSuccess: (session: {
    playerId: string;
    sessionToken: string;
    gameId: string;
    quizTitle: string;
    nickname: string;
    gamePin: string;
    dueDate?: string | null;
    avatarId?: string;
    avatarUrl?: string;
    alreadyCompleted?: boolean;
    preloadedQuestions?: GameQuestionSnapshot[];
  }) => void;
  onNavigateAdmin?: () => void;
  onNavigatePrivacy?: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onJoinSuccess,
}) => {
  const [pin, setPin] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlPin = params.get('pin') || params.get('gamePin') || '';
      return urlPin.replace(/\D/g, '').slice(0, 6);
    } catch {
      return '';
    }
  });
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<PlayerAvatar | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we have already auto-popped the privacy modal for the current completion cycle
  const hasAutoOpenedPrivacyRef = useRef(false);

  const isPinValid = pin.trim().replace(/\D/g, '').length === 6;
  const isNameValid = nickname.trim().length >= 2;
  const isAvatarSelected = Boolean(selectedAvatar);
  const isJoinActivated = isPinValid && isNameValid && isAvatarSelected && privacyAcknowledged;

  useEffect(() => {
    const syncPinFromUrl = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlPin = params.get('pin') || params.get('gamePin');
        if (urlPin) {
          const clean = urlPin.replace(/\D/g, '').slice(0, 6);
          if (clean.length === 6) {
            setPin(clean);
          }
        }
      } catch {
        // ignore URL parse issues
      }
    };
    syncPinFromUrl();
    window.addEventListener('popstate', syncPinFromUrl);
    return () => window.removeEventListener('popstate', syncPinFromUrl);
  }, []);

  // Prefetch quiz & questions in the background as soon as the 6-digit PIN is entered
  useEffect(() => {
    const clean = pin.trim().replace(/\D/g, '');
    if (clean.length === 6) {
      prefetchPinSession(clean);
    }
  }, [pin]);

  // If participant selected avatar first and then finished typing PIN & Full Name, pop up the Data Privacy Notice modal
  useEffect(() => {
    if (
      isPinValid &&
      isNameValid &&
      isAvatarSelected &&
      !privacyAcknowledged &&
      !avatarModalOpen &&
      !privacyModalOpen &&
      !hasAutoOpenedPrivacyRef.current
    ) {
      const timer = setTimeout(() => {
        hasAutoOpenedPrivacyRef.current = true;
        setPrivacyModalOpen(true);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isPinValid, isNameValid, isAvatarSelected, privacyAcknowledged, avatarModalOpen, privacyModalOpen]);

  const handleAcknowledgePrivacy = () => {
    soundManager.playAnswerSubmit();
    setPrivacyAcknowledged(true);
    setPrivacyModalOpen(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPin = pin.trim().replace(/\D/g, '');
    const cleanNick = nickname.trim();

    if (!cleanPin || cleanPin.length !== 6) {
      setError('Please enter a valid 6-digit Game PIN.');
      return;
    }

    if (!cleanNick || cleanNick.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!selectedAvatar) {
      setError('Please select your Player Avatar before joining.');
      setAvatarModalOpen(true);
      return;
    }

    if (!privacyAcknowledged) {
      setPrivacyModalOpen(true);
      return;
    }

    const avatarToUse = selectedAvatar || DEFAULT_AVATAR;

    try {
      setLoading(true);
      const res = await joinGameSession(cleanPin, cleanNick, avatarToUse.id, avatarToUse.imageUrl);
      soundManager.playJoin();
      onJoinSuccess({
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        gameId: res.gameId,
        quizTitle: res.quizTitle,
        nickname: res.nickname || cleanNick,
        gamePin: cleanPin,
        dueDate: res.dueDate || null,
        avatarId: res.avatarId || avatarToUse.id,
        avatarUrl: res.avatarUrl || avatarToUse.imageUrl,
        alreadyCompleted: Boolean(res.alreadyCompleted),
        preloadedQuestions: res.preloadedQuestions,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to join quiz. Please verify your PIN and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col justify-center items-center px-3.5 py-6 sm:px-4 sm:py-12 pb-safe relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Background ambient glow circles */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Floating 3D Party Objects Background Effect */}
      <FloatingPartyObjects />

      <div className="w-full max-w-md relative z-10">
        {/* Hero title */}
        <div className="text-center mb-5 sm:mb-8">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-1.5 sm:mb-2">
            CYBER<span className="text-[#F05A28] mx-0.5">|</span><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F05A28] via-[#E5E5E5] to-[#00A191]">ARENA</span>
          </h1>
          <p className="text-[#E5E5E5]/75 text-xs sm:text-base font-medium px-2">
            Jump in with friends, test your wits, and rise up the live leaderboard.
          </p>
        </div>

        {/* Join Card in Primary Navy with Teal accent */}
        <div className="bg-[#0D1F3C]/95 border-2 border-[#00A191]/30 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-[#0D1F3C]/80 backdrop-blur-xl relative">
          <form onSubmit={handleJoin} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#F05A28]/15 border border-[#F05A28]/40 text-[#F05A28] text-xs font-medium">
                <AlertCircle className="w-4 h-4 text-[#F05A28] shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="gamePin" className="block text-xs font-bold uppercase tracking-wider text-[#E5E5E5]/70 mb-1.5 sm:mb-2">
                Game PIN
              </label>
              <input
                id="gamePin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setError(null);
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="000000"
                className="w-full text-center text-2xl sm:text-3xl font-mono font-black tracking-widest px-4 py-2.5 sm:py-3 rounded-2xl bg-slate-950/80 border-2 border-slate-700 focus:border-[#00A191] focus:ring-4 focus:ring-[#00A191]/20 text-white placeholder-slate-600 transition-all outline-none"
              />
            </div>

            <div>
              <label htmlFor="nickname" className="block text-xs font-bold uppercase tracking-wider text-[#E5E5E5]/70 mb-1.5 sm:mb-2">
                Your Full Name
              </label>
              <input
                id="nickname"
                type="text"
                autoComplete="name"
                maxLength={48}
                value={nickname}
                onChange={(e) => {
                  setError(null);
                  setNickname(e.target.value.slice(0, 48));
                }}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full text-center text-base sm:text-lg font-bold px-4 py-2.5 sm:py-3 rounded-2xl bg-slate-950/80 border-2 border-slate-700 focus:border-[#00A191] focus:ring-4 focus:ring-[#00A191]/20 text-white placeholder-slate-600 transition-all outline-none"
              />
            </div>

            {/* Avatar Selector Card */}
            <div>
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#E5E5E5]/70">
                  Player Avatar {selectedAvatar ? '✓' : '(Required)'}
                </label>
                {selectedAvatar && (
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="text-xs font-bold text-[#00A191] hover:underline cursor-pointer py-0.5 px-1"
                  >
                    Change Avatar
                  </button>
                )}
              </div>

              {selectedAvatar ? (
                <div
                  onClick={() => setAvatarModalOpen(true)}
                  className="flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl bg-slate-950/80 border-2 border-indigo-500/50 hover:border-indigo-400 active:scale-[0.99] transition-all cursor-pointer group shadow-inner"
                >
                  <div className="relative shrink-0">
                    <img
                      src={selectedAvatar.imageUrl}
                      alt={selectedAvatar.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 shadow-md group-hover:scale-105 transition-transform"
                      style={{ borderColor: selectedAvatar.accentColor }}
                    />
                    <div
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-black"
                      style={{ backgroundColor: selectedAvatar.accentColor }}
                    >
                      ★
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white truncate">{selectedAvatar.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold truncate">
                        {selectedAvatar.title}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Tap to choose a different avatar</p>
                  </div>
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 group-hover:rotate-12 transition-transform" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-[0.99] border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 text-indigo-300 hover:text-white transition-all cursor-pointer font-bold text-sm group"
                >
                  <span>Select Your Avatar</span>
                </button>
              )}
            </div>

            {/* Privacy Consent Status Indicator when PIN, Full Name, and Avatar are ready */}
            {isPinValid && isNameValid && isAvatarSelected && (
              <div
                onClick={() => {
                  if (!privacyAcknowledged) setPrivacyModalOpen(true);
                }}
                className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  privacyAcknowledged
                    ? 'bg-[#00A191]/15 border-[#00A191]/50 text-[#00A191]'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-300 cursor-pointer hover:bg-amber-500/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {privacyAcknowledged ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00A191] shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {privacyAcknowledged
                      ? 'Data Privacy Notice Acknowledged'
                      : 'Read & Acknowledge Data Privacy Notice to Activate Join'}
                  </span>
                </div>
                {!privacyAcknowledged && (
                  <span className="underline shrink-0 text-[11px]">Review</span>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isJoinActivated}
              className={`w-full min-h-[52px] flex items-center justify-center gap-2 py-3.5 sm:py-4 px-6 rounded-2xl font-black text-base sm:text-lg transition-all ${
                isJoinActivated
                  ? 'bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/30 hover:scale-[1.01] active:scale-[0.98] cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>JOIN GAME</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* DATA PRIVACY NOTICE Button beneath Join Card */}
        <button
          type="button"
          onClick={() => {
            soundManager.playAnswerSubmit();
            setPrivacyModalOpen(true);
          }}
          className="w-full mt-3.5 sm:mt-4 min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-[#0D1F3C]/90 hover:bg-[#0D1F3C] border border-[#00A191]/40 hover:border-[#00A191] text-[#E5E5E5] hover:text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg shadow-[#0D1F3C]/50 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-[#00A191] shrink-0" />
          <span>DATA PRIVACY NOTICE</span>
          {privacyAcknowledged && (
            <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00A191]/20 border border-[#00A191]/50 text-[#00A191] text-[10px] font-extrabold">
              <CheckCircle2 className="w-3 h-3" />
              ACKNOWLEDGED
            </span>
          )}
        </button>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5 sm:mt-8">
          <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 mx-auto mb-1" />
            <h4 className="text-[11px] sm:text-xs font-bold text-slate-200">Real-Time</h4>
            <p className="text-[10px] text-slate-500 leading-tight">Live multi-user sync</p>
          </div>
          <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 mx-auto mb-1" />
            <h4 className="text-[11px] sm:text-xs font-bold text-slate-200">Live Ranks</h4>
            <p className="text-[10px] text-slate-500 leading-tight">Speed-based scoring</p>
          </div>
          <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 mx-auto mb-1" />
            <h4 className="text-[11px] sm:text-xs font-bold text-slate-200">Secure</h4>
            <p className="text-[10px] text-slate-500 leading-tight">Anti-cheat & TOTP MFA</p>
          </div>
        </div>
      </div>

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        selectedAvatarId={selectedAvatar?.id || DEFAULT_AVATAR.id}
        onSelectAvatar={(av) => {
          setSelectedAvatar(av);
          setError(null);
          // Immediately pop up the Data Privacy Notice modal if PIN and Full Name are entered and not yet acknowledged
          if (pin.trim().replace(/\D/g, '').length === 6 && nickname.trim().length >= 2 && !privacyAcknowledged) {
            hasAutoOpenedPrivacyRef.current = true;
            setPrivacyModalOpen(true);
          }
        }}
        nickname={nickname.trim() || 'Your Nickname'}
      />

      {/* Data Privacy Notice Modal */}
      {privacyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#0D1F3C] border-t-2 sm:border-2 border-[#00A191]/40 shadow-2xl shadow-black/80 text-white overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 sm:p-6 border-b border-slate-800/90 flex items-center justify-between gap-3 bg-[#0D1F3C]/95 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#F05A28]/20 to-[#00A191]/20 border border-[#00A191]/40 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-[#00A191]" />
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[#00A191] text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">InfoPro Business Solutions, Inc. (IBSI)</span>
                  </div>
                  <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white">
                    DATA PRIVACY <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F05A28] via-[#E5E5E5] to-[#00A191]">NOTICE</span>
                  </h2>
                </div>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-sm sm:text-base text-slate-200 leading-relaxed bg-slate-950/60">
              <p>
                We, at <strong className="text-white font-bold">InfoPro Business Solutions, Inc. (IBSI)</strong>, understand the importance of your privacy and are committed to protecting the confidentiality of your Personal Information and Sensitive Personal Information (collectively, “Personal Data”) in accordance with the <strong className="text-[#00A191] font-semibold">Data Privacy Act of 2012</strong>.
              </p>

              <p>
                Please be informed that the Personal Data you provide through this game will be collected and processed for purposes related to the <strong className="text-white font-semibold">“Spot the Phish: Legit or Not Legit?”</strong> cybersecurity awareness activity, including game participation, score tracking, winner verification, and communicating game-related announcements and updates.
              </p>

              <p>
                Your Personal Data will be securely stored and handled in accordance with the policies, systems, and procedures of the Company.
              </p>

              <p>
                By clicking <strong className="text-white font-semibold">“Acknowledge &amp; Return,”</strong> you acknowledge and consent to the processing of your Personal Data for the purposes stated above. Should you have any inquiries, concerns, feedback, and/or complaints, you may contact our Data Protection Officer at{' '}
                <a
                  href="mailto:dpo@ibs-ph.com"
                  className="inline-flex items-center gap-1 font-bold text-[#00A191] hover:text-[#F05A28] underline underline-offset-4 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 inline" />
                  dpo@ibs-ph.com
                </a>
                .
              </p>
            </div>

            {/* Modal Footer with Acknowledge & Return */}
            <div className="p-4 sm:p-6 border-t border-slate-800/90 bg-[#0D1F3C]/95 shrink-0">
              <button
                type="button"
                onClick={handleAcknowledgePrivacy}
                className="w-full min-h-[52px] flex items-center justify-center gap-2.5 py-3.5 sm:py-4 px-6 rounded-2xl font-black text-base sm:text-lg bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/30 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Acknowledge &amp; Return</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

