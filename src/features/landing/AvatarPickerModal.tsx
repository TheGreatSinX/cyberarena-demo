import React, { useState } from 'react';
import { X, Check, Sparkles, User, ArrowRight } from 'lucide-react';
import { PLAYER_AVATARS, PlayerAvatar } from '../../lib/avatars/avatarsCatalog';
import { soundManager } from '../../lib/sound/soundManager';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAvatarId: string;
  onSelectAvatar: (avatar: PlayerAvatar) => void;
  nickname: string;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen,
  onClose,
  selectedAvatarId,
  onSelectAvatar,
  nickname,
}) => {
  const [currentId, setCurrentId] = useState<string>(selectedAvatarId || PLAYER_AVATARS[0].id);

  if (!isOpen) return null;

  const currentAvatar = PLAYER_AVATARS.find((a) => a.id === currentId) || PLAYER_AVATARS[0];

  const handlePick = (avatar: PlayerAvatar) => {
    setCurrentId(avatar.id);
    soundManager.playCorrect();
  };

  const handleConfirm = () => {
    onSelectAvatar(currentAvatar);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-slate-900 border-t-2 sm:border-2 border-indigo-500/40 shadow-2xl shadow-indigo-950/60 text-white overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 sm:p-6 border-b border-slate-800 flex items-start justify-between bg-slate-900/90 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                PLAYER CUSTOMIZATION
              </span>
            </div>
            <h3 className="text-lg sm:text-2xl font-black text-white">Choose Your Arena Avatar</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Select your character persona for the live scoreboard & podium.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Preview Banner */}
        <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/60 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={currentAvatar.imageUrl}
                alt={currentAvatar.name}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border-2 shadow-lg"
                style={{ borderColor: currentAvatar.accentColor }}
              />
              <div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-black"
                style={{ backgroundColor: currentAvatar.accentColor }}
              >
                ★
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs text-slate-400 hidden xs:inline">Selected:</span>
                <span className="text-sm font-black text-white truncate">{currentAvatar.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium truncate">
                  {currentAvatar.title}
                </span>
              </div>
              <p className="text-xs text-indigo-300 font-bold truncate">
                Playing as: <strong className="text-white font-mono">{nickname || 'Your Nickname'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer hover:scale-105 shrink-0"
          >
            <span>Lock In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Avatar Grid (Scrollable) */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-4">
          {PLAYER_AVATARS.map((avatar) => {
            const isSelected = avatar.id === currentId;
            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => handlePick(avatar)}
                className={`group relative flex flex-col items-center p-2.5 sm:p-3 rounded-2xl border-2 transition-all cursor-pointer text-center outline-none active:scale-95 ${
                  isSelected
                    ? 'bg-indigo-600/20 shadow-xl scale-[1.02]'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
                style={{
                  borderColor: isSelected ? avatar.accentColor : undefined,
                  boxShadow: isSelected ? `0 0 20px ${avatar.accentColor}33` : undefined,
                }}
              >
                {/* Active Checkmark Pill */}
                {isSelected && (
                  <div
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md z-10 animate-bounce"
                    style={{ backgroundColor: avatar.accentColor }}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}

                {/* Avatar Circular Image */}
                <div className="relative mb-2">
                  <img
                    src={avatar.imageUrl}
                    alt={avatar.name}
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-3 transition-transform group-hover:scale-105 shadow-md ${
                      isSelected ? 'ring-4 ring-offset-2 ring-offset-slate-900' : ''
                    }`}
                    style={{
                      borderColor: avatar.accentColor,
                    }}
                  />
                </div>

                {/* Name & Title */}
                <span className="text-xs font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                  {avatar.name}
                </span>
                <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  {avatar.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-5 pb-safe border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Tap on any persona to select, then tap "Lock In Avatar" to continue.
          </span>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-[44px] flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 active:scale-95 text-white shadow-lg shadow-[#F05A28]/25 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Lock In Avatar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
