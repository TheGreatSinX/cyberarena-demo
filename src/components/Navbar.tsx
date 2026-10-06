import React, { useState } from 'react';
import { useAuth } from '../lib/auth/authContext';
import { Zap, ShieldCheck, LogOut, User, Trophy, LayoutDashboard, Volume2, VolumeX } from 'lucide-react';
import { soundManager } from '../lib/sound/soundManager';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  gamePin?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, gamePin }) => {
  const { user, profile, isMfaVerified, logout } = useAuth();
  const [muted, setMuted] = useState(soundManager.isMuted());

  const handleToggleSound = () => {
    const isNowMuted = soundManager.toggleMute();
    setMuted(isNowMuted);
    if (!isNowMuted) {
      soundManager.playJoin();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 sm:gap-2.5 group text-left cursor-pointer focus:outline-none shrink-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#F05A28] to-[#00A191] flex items-center justify-center shadow-lg shadow-[#F05A28]/25 group-hover:scale-105 transition-transform shrink-0">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg sm:text-xl font-black tracking-tight text-white">
                CYBER<span className="text-[#F05A28]">|</span>ARENA
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#00A191]/20 text-[#00A191] border border-[#00A191]/30">
                LIVE
              </span>
            </div>
            <p className="hidden xs:block sm:block text-[11px] sm:text-xs text-slate-400 font-medium leading-tight">
              Multiplayer Quiz Platform
            </p>
          </div>
        </button>

        {/* Center / Game PIN status if in game */}
        {gamePin && (
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] sm:text-xs text-slate-400 font-medium">PIN:</span>
            <span className="text-xs font-mono font-bold tracking-wider text-white">{gamePin}</span>
          </div>
        )}

        {/* Right Nav */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={handleToggleSound}
            title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
            aria-label={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-xl border transition-colors cursor-pointer ${
              muted
                ? 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
            }`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {user && isMfaVerified ? (
            <div className="flex items-center gap-1.5 sm:gap-3">
              <button
                onClick={() => onNavigate('admin-dashboard')}
                className={`min-h-[40px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  currentView.startsWith('admin')
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Admin Console</span>
              </button>

              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300 font-medium">{profile?.displayName || user.email?.split('@')[0]}</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] uppercase font-bold">
                  {profile?.role || 'ADMIN'}
                </span>
              </div>

              <button
                onClick={logout}
                title="Sign Out"
                aria-label="Sign Out"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
