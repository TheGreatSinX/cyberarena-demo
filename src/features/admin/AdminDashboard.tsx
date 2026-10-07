import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/auth/authContext';
import { Game } from '../../types';
import { QuizManager } from './QuizManager';
import { QuizPreview } from './QuizPreview';
import { ResultsView } from './ResultsView';
import { AdminUsersView } from './AdminUsersView';
import { ResetDatabaseModal } from './ResetDatabaseModal';
import { WeeklyAdminView } from '../weekly/WeeklyAdminView';
import { purgeLegacyMockDataFromDatabase } from '../../lib/game/gameEngine';
import {
  SettingsView,
  NavVisibilityConfig,
  DEFAULT_NAV_VISIBILITY,
} from './SettingsView';
import {
  LayoutDashboard,
  Layers,
  PlayCircle,
  BarChart3,
  Users,
  ShieldCheck,
  Zap,
  ArrowRight,
  Mail,
  Settings,
  StopCircle,
  Loader2,
} from 'lucide-react';
import { endGameSession } from '../../lib/game/gameEngine';

const NAV_VISIBILITY_STORAGE_KEY = 'cyberarena_nav_visibility_v2';

interface AdminDashboardProps {
  onStartLiveGame: (gameId: string) => void;
  activeGameId: string | null;
  onNavigateToHost: () => void;
  initialTab?: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onStartLiveGame,
  activeGameId,
  onNavigateToHost,
  initialTab = 'dashboard',
}) => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [activeHostGame, setActiveHostGame] = useState<Game | null>(null);
  const [previewQuizId, setPreviewQuizId] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [navVisibility, setNavVisibility] = useState<NavVisibilityConfig>(() => {
    try {
      const saved = localStorage.getItem(NAV_VISIBILITY_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_NAV_VISIBILITY, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load nav visibility config:', e);
    }
    return DEFAULT_NAV_VISIBILITY;
  });

  const handleUpdateNavVisibility = (updated: NavVisibilityConfig) => {
    setNavVisibility(updated);
    try {
      localStorage.setItem(NAV_VISIBILITY_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save nav visibility config:', e);
    }
  };

  // Sync initial tab if changed from navigation
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Real-time listener for current active host game - only show if NOT FINISHED
  useEffect(() => {
    if (!activeGameId) {
      setActiveHostGame(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'games', activeGameId), (snap) => {
      if (snap.exists()) {
        const g = { id: snap.id, ...snap.data() } as Game;
        if (g.status && g.status !== 'FINISHED') {
          setActiveHostGame(g);
        } else {
          setActiveHostGame(null);
        }
      } else {
        setActiveHostGame(null);
      }
    });
    return () => unsub();
  }, [activeGameId]);

  // Metrics & Active Sessions list
  const [activeSessionsList, setActiveSessionsList] = useState<Game[]>([]);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalQuizzes: 0,
    publishedQuizzes: 0,
    activeGames: 0,
    totalPlayers: 0,
    gamesPlayed: 0,
  });

  const fetchMetrics = async () => {
    try {
      await purgeLegacyMockDataFromDatabase();
      const qSnap = await getDocs(collection(db, 'quizzes'));
      const totalQ = qSnap.size;
      const pubQ = qSnap.docs.filter((d) => d.data().status === 'PUBLISHED').length;

      const gamesSnap = await getDocs(collection(db, 'games'));
      const totalG = gamesSnap.size;
      const activeGameDocs = gamesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Game))
        .filter((g) => g.status !== 'FINISHED')
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      let totalP = 0;
      gamesSnap.docs.forEach((d) => {
        totalP += d.data().playerCount || 0;
      });

      setActiveSessionsList(activeGameDocs);
      setMetrics({
        totalQuizzes: totalQ,
        publishedQuizzes: pubQ,
        activeGames: activeGameDocs.length,
        totalPlayers: totalP,
        gamesPlayed: totalG,
      });
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    }
  };

  const handleEndActiveSession = async (gameId: string) => {
    try {
      setEndingSessionId(gameId);
      await endGameSession(gameId);
      await fetchMetrics();
    } catch (err) {
      console.error('Failed to end session:', err);
    } finally {
      setEndingSessionId(null);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [activeTab]);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] bg-slate-950 text-white flex flex-col pb-safe">
      {/* Sub-header Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-14 sm:top-16 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2">
          {navVisibility.dashboard && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>
          )}

          {navVisibility.quizzes && (
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'quizzes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Quizzes</span>
            </button>
          )}

          {activeHostGame && (
            <button
              onClick={onNavigateToHost}
              className="min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40 transition-all cursor-pointer whitespace-nowrap animate-pulse shrink-0"
            >
              <PlayCircle className="w-4 h-4 shrink-0" />
              <span>Active Room ({activeHostGame.gamePin})</span>
            </button>
          )}

          {navVisibility.results && (
            <button
              onClick={() => setActiveTab('results')}
              className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'results'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Results & CSV</span>
            </button>
          )}

          {navVisibility.weekly && (
            <button
              onClick={() => setActiveTab('weekly')}
              className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'weekly'
                  ? 'bg-[#00A191] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span>Weekly Awareness</span>
            </button>
          )}

          {navVisibility.users && (
            <button
              onClick={() => setActiveTab('users')}
              className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Administrators</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('settings')}
            className={`min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap sm:ml-auto shrink-0 ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8">
        {previewQuizId ? (
          <QuizPreview quizId={previewQuizId} onClose={() => setPreviewQuizId(null)} />
        ) : activeTab === 'dashboard' ? (
          <div className="space-y-8">
            {/* Greeting Banner */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 block mb-1">
                  Administrator Console
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
                  Welcome, {profile?.displayName || 'Host'}
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Manage your question vaults, launch synchronized multiplayer arenas, and monitor live performance with server-authoritative scoring.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setActiveTab('quizzes')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
                  >
                    <span>Manage Quizzes</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setActiveTab('results')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer border border-slate-700"
                  >
                    <span>View Analytics</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total Quizzes</span>
                <p className="text-3xl font-mono font-black text-white mt-2">{metrics.totalQuizzes}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">In local repository</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400">Published Quizzes</span>
                <p className="text-3xl font-mono font-black text-emerald-400 mt-2">{metrics.publishedQuizzes}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">Ready for live hosting</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400">Active Games</span>
                <p className="text-3xl font-mono font-black text-indigo-400 mt-2">{metrics.activeGames}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">In progress or waiting</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total Players</span>
                <p className="text-3xl font-mono font-black text-amber-400 mt-2">{metrics.totalPlayers}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">Connected participants</span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Games Played</span>
                <p className="text-3xl font-mono font-black text-purple-400 mt-2">{metrics.gamesPlayed}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">Completed sessions</span>
              </div>
            </div>

            {/* Active Sessions Management Panel */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-lg text-white">
                    Active Game Sessions ({activeSessionsList.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Manage or end any active PIN session currently open to participants.
                  </p>
                </div>
              </div>

              {activeSessionsList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  No active game sessions right now.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeSessionsList.map((sessionGame) => (
                    <div
                      key={sessionGame.id}
                      className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          <h4 className="font-bold text-white text-sm sm:text-base truncate">
                            {sessionGame.quizTitle}
                          </h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400 mt-1 font-mono">
                          <span>
                            PIN: <strong className="text-indigo-400">{sessionGame.gamePin}</strong>
                          </span>
                          <span>•</span>
                          <span>{sessionGame.playerCount || 0} Players</span>
                          <span>•</span>
                          <span className="text-emerald-400 uppercase font-bold text-[10px]">
                            {sessionGame.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => onStartLiveGame(sessionGame.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Open Room
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEndActiveSession(sessionGame.id)}
                          disabled={endingSessionId === sessionGame.id}
                          className="min-h-[36px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {endingSessionId === sessionGame.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <StopCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {endingSessionId === sessionGame.id ? 'Ending...' : 'End Session'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Operations Architecture Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-white text-base">Server-Authoritative Game Engine</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Correct answers are isolated in separate private collections (<code className="text-indigo-300 font-mono">privateQuestions</code>) which client browsers can never query. Game countdowns and speed-scoring multipliers are verified server-side.
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">Mandatory Two-Factor Auth (MFA)</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every administrator undergoes TOTP MFA verification with authenticator applications. Privilege escalation is blocked via Firestore ABAC rules and server-side RBAC validation.
                </p>
              </div>
            </div>
          </div>
        ) : activeTab === 'quizzes' ? (
          <QuizManager
            onStartLiveGame={onStartLiveGame}
            onPreviewQuiz={(qId) => setPreviewQuizId(qId)}
          />
        ) : activeTab === 'results' ? (
          <ResultsView />
        ) : activeTab === 'weekly' ? (
          <WeeklyAdminView />
        ) : activeTab === 'users' ? (
          <AdminUsersView />
        ) : (
          <SettingsView
            navVisibility={navVisibility}
            onUpdateNavVisibility={handleUpdateNavVisibility}
            onOpenResetModal={() => setResetModalOpen(true)}
          />
        )}
      </div>

      {/* Reset Database Modal */}
      <ResetDatabaseModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onSuccess={() => {
          fetchMetrics();
        }}
      />
    </div>
  );
};
