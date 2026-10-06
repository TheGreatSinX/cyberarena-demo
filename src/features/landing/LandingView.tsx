import React, { useState, useEffect } from 'react';
import { Play, Sparkles, Users, Trophy, ShieldCheck, ArrowRight, Loader2, AlertCircle, PartyPopper } from 'lucide-react';
import { joinGameSession } from '../../lib/game/gameEngine';
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
  }) => void;
  onNavigateAdmin?: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onJoinSuccess, onNavigateAdmin }) => {
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
  const [selectedAvatar, setSelectedAvatar] = useState<PlayerAvatar | null>(DEFAULT_AVATAR);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                placeholder="e.g. Alex Rivera"
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
                  <span>Choose Your Avatar (Required)</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || pin.trim().length !== 6 || nickname.trim().length < 2 || !selectedAvatar}
              className={`w-full min-h-[52px] flex items-center justify-center gap-2 py-3.5 sm:py-4 px-6 rounded-2xl font-black text-base sm:text-lg transition-all cursor-pointer ${
                selectedAvatar && pin.trim().length === 6 && nickname.trim().length >= 2
                  ? 'bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/30 hover:scale-[1.01] active:scale-[0.98]'
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
                  <span>{selectedAvatar ? 'JOIN GAME' : 'CHOOSE AVATAR TO JOIN'}</span>
                </>
              )}
            </button>
          </form>
        </div>

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
        }}
        nickname={nickname.trim() || 'Your Nickname'}
      />
    </div>
  );
};
