import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { resetDatabaseToZero, ResetDatabaseProgress } from '../../lib/game/databaseReset';
import { useAuth } from '../../lib/auth/authContext';

interface ResetDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResetDatabaseModal: React.FC<ResetDatabaseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [confirmationInput, setConfirmationInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ResetDatabaseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const targetPhrase = 'delete zero database';
  const isMatch = confirmationInput.trim().toLowerCase() === targetPhrase;

  const handleReset = async () => {
    if (!isMatch || !user) return;
    setLoading(true);
    setError(null);

    try {
      await resetDatabaseToZero(user.uid, user.email || 'admin@cyberarena.internal', (p) => {
        setProgress(p);
      });
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
        setIsSuccess(false);
        setConfirmationInput('');
        setProgress(null);
      }, 1800);
    } catch (err: any) {
      console.error('Failed to reset database:', err);
      setError(err?.message || 'Failed to complete database reset.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-rose-500/50 p-6 sm:p-8 shadow-2xl shadow-rose-950/50 text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white">Database Reset Complete!</h3>
            <p className="text-sm text-slate-300">
              All games, quizzes, and session statistics have been reset to zero.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">
                  DANGER ZONE • DESTRUCTIVE ACTION
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  Reset Database to Zero
                </h3>
              </div>
            </div>

            {/* Warning Text */}
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Warning:</strong> This will permanently delete all published and draft quizzes, active host sessions, participant records, submitted answers, and historical game results.
                </p>
              </div>
              <p className="text-rose-300/80 pl-6">
                Your administrator account and TOTP MFA credentials will be preserved.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500 text-rose-200 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Verification Prompt */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                To confirm, type <strong className="font-mono text-rose-400 select-all">{targetPhrase}</strong> below:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                disabled={loading}
                placeholder="delete zero database"
                autoComplete="off"
                spellCheck="false"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/20 text-white font-mono text-sm placeholder:text-slate-600 outline-none transition-all disabled:opacity-50"
              />
            </div>

            {/* Live Progress Indicator */}
            {loading && progress && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{progress.step}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between font-mono">
                  <span>Games: {progress.deletedGames}</span>
                  <span>Quizzes: {progress.deletedQuizzes}</span>
                  <span>Logs: {progress.deletedLogs}</span>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={!isMatch || loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resetting Database...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm Complete Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
