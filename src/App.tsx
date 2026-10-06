import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase/config';
import { AuthProvider, useAuth } from './lib/auth/authContext';
import { testConnection } from './lib/firebase/testConnection';
import { Navbar } from './components/Navbar';
import { LandingView } from './features/landing/LandingView';
import { PlayerView } from './features/player/PlayerView';
import { AdminLoginMfa } from './features/admin/AdminLoginMfa';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { AdminHostView } from './features/admin/AdminHostView';
import { WeeklyRespondentView } from './features/weekly/WeeklyRespondentView';

interface PlayerSession {
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
}

const AppContent: React.FC = () => {
  const { user, isMfaVerified, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>(() => {
    try {
      return sessionStorage.getItem('cyberarena_active_view') || 'landing';
    } catch {
      return 'landing';
    }
  });
  const [playerSession, setPlayerSession] = useState<PlayerSession | null>(null);
  const [activeHostGameId, setActiveHostGameId] = useState<string | null>(null);
  const [adminInitialTab, setAdminInitialTab] = useState<string>('dashboard');
  const [weeklyParams, setWeeklyParams] = useState<{ questionnaireId: string; token: string | null } | null>(null);

  // Save currentView to sessionStorage so refreshing stays on the same view
  useEffect(() => {
    try {
      sessionStorage.setItem('cyberarena_active_view', currentView);
    } catch {
      // ignore storage errors
    }
  }, [currentView]);

  // Automatically return to landing or admin-login if admin is auto-logged out after 10 minutes of inactivity
  useEffect(() => {
    if (!authLoading && !user && (currentView === 'admin-dashboard' || currentView === 'admin-host')) {
      setCurrentView('admin-login');
    }
  }, [authLoading, user, currentView]);

  // 1. Initial Firestore connection test as mandated by skill
  useEffect(() => {
    testConnection();
  }, []);

  // 2. Real-time active host game status listener: clear host game if session is FINISHED
  useEffect(() => {
    if (!activeHostGameId) return;
    const unsub = onSnapshot(doc(db, 'games', activeHostGameId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.status === 'FINISHED') {
          setActiveHostGameId(null);
        }
      } else {
        setActiveHostGameId(null);
      }
    });
    return () => unsub();
  }, [activeHostGameId]);

  // 3. Player Reconnection handler
  useEffect(() => {
    // Check if there is an active player session in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('quizarena_session_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as PlayerSession;
            if (parsed.gameId && parsed.playerId && parsed.sessionToken) {
              setPlayerSession(parsed);
              break;
            }
          }
        } catch (e) {
          console.warn('Failed to parse cached session:', e);
        }
      }
    }
  }, []);

  // 4. Special secret link listener for /cyberadmin portal & ?weekly= questionnaire links
  useEffect(() => {
    const handleUrlRoute = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const weeklyId = searchParams.get('weekly');
      const weeklyToken = searchParams.get('token');
      if (weeklyId) {
        setWeeklyParams({ questionnaireId: weeklyId, token: weeklyToken });
        setCurrentView('weekly-respondent');
        return;
      }

      const fullUrl = (window.location.pathname + window.location.hash + window.location.search).toLowerCase();
      if (fullUrl.includes('cyberadmin') || fullUrl.includes('cyber-admin')) {
        if (authLoading) return;
        if (user && isMfaVerified) {
          setCurrentView('admin-dashboard');
        } else {
          setCurrentView('admin-login');
        }
      }
    };

    handleUrlRoute();
    window.addEventListener('popstate', handleUrlRoute);
    window.addEventListener('hashchange', handleUrlRoute);

    // Keyboard shortcut (Ctrl+Shift+A or Cmd+Shift+A) to quickly access /cyberadmin
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        try {
          window.history.pushState({}, '', '/cyberadmin');
        } catch {
          window.location.hash = '#/cyberadmin';
        }
        if (user && isMfaVerified) {
          setCurrentView('admin-dashboard');
        } else {
          setCurrentView('admin-login');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handleUrlRoute);
      window.removeEventListener('hashchange', handleUrlRoute);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [user, isMfaVerified, authLoading]);

  // Handle navigation
  const handleNavigate = (view: string) => {
    if (view === 'admin-dashboard' && (!user || !isMfaVerified)) {
      setCurrentView('admin-login');
      return;
    }
    setCurrentView(view);
  };

  const handleJoinSuccess = (session: PlayerSession) => {
    setPlayerSession(session);
    setCurrentView('player');
  };

  const handleStartLiveGameAsHost = (gameId: string) => {
    setActiveHostGameId(gameId);
    setCurrentView('admin-host');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        gamePin={playerSession?.gamePin || null}
      />

      <main className="flex-1 flex flex-col">
        {currentView === 'weekly-respondent' && weeklyParams ? (
          <WeeklyRespondentView
            questionnaireId={weeklyParams.questionnaireId}
            inviteToken={weeklyParams.token}
          />
        ) : currentView === 'player' && playerSession ? (
          <PlayerView
            session={playerSession}
            onExit={() => {
              if (playerSession?.gameId) {
                localStorage.removeItem(`quizarena_session_${playerSession.gameId}`);
              }
              setPlayerSession(null);
              setCurrentView('landing');
            }}
          />
        ) : currentView === 'admin-host' && activeHostGameId ? (
          <AdminHostView
            gameId={activeHostGameId}
            onFinishGame={() => {
              setActiveHostGameId(null);
              setAdminInitialTab('results');
              setCurrentView('admin-dashboard');
            }}
            onExit={() => {
              setActiveHostGameId(null);
              setAdminInitialTab('dashboard');
              setCurrentView('admin-dashboard');
            }}
          />
        ) : currentView === 'admin-login' ? (
          <AdminLoginMfa
            onSuccess={() => {
              setCurrentView('admin-dashboard');
            }}
          />
        ) : currentView === 'admin-dashboard' && user && isMfaVerified ? (
          <AdminDashboard
            onStartLiveGame={handleStartLiveGameAsHost}
            activeGameId={activeHostGameId}
            onNavigateToHost={() => setCurrentView('admin-host')}
            initialTab={adminInitialTab}
          />
        ) : (
          <LandingView
            onJoinSuccess={handleJoinSuccess}
            onNavigateAdmin={() => {
              if (user && isMfaVerified) {
                setCurrentView('admin-dashboard');
              } else {
                setCurrentView('admin-login');
              }
            }}
          />
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
