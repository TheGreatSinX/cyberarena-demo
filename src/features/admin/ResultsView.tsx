import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Game, GameResult } from '../../types';
import {
  exportGameResultsToCsv,
  deletePlayersFromGame,
  endGameSession,
  recalculateAllGameRankings,
  sortGameResultsProperly,
} from '../../lib/game/gameEngine';
import { getAvatarById } from '../../lib/avatars/avatarsCatalog';
import {
  Download,
  ArrowLeft,
  Trash2,
  StopCircle,
  CheckSquare,
  Square,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

export const ResultsView: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [deletingPlayers, setDeletingPlayers] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [endingGameId, setEndingGameId] = useState<string | null>(null);

  const fetchGames = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Game));
      setGames(list);
    } catch (err) {
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const loadGameResults = async (game: Game) => {
    try {
      const recalculated = await recalculateAllGameRankings(game.id);
      if (recalculated.length > 0) {
        setResults(recalculated);
        return;
      }

      const resSnap = await getDocs(collection(db, `games/${game.id}/results`));
      if (!resSnap.empty) {
        const list = resSnap.docs.map((d) => {
          const data = d.data() as GameResult;
          return {
            ...data,
            id: d.id,
            playerId: data.playerId || d.id,
          };
        });
        setResults(sortGameResultsProperly(list));
      } else {
        // Fallback: derive from players collection
        const pSnap = await getDocs(
          query(collection(db, `games/${game.id}/players`), orderBy('score', 'desc'))
        );
        const fallbackResults: GameResult[] = pSnap.docs.map((d, idx) => {
          const p = d.data();
          const accuracy =
            game.totalQuestions > 0
              ? Math.round(((p.correctCount || 0) / game.totalQuestions) * 100)
              : 0;
          return {
            id: d.id,
            playerId: d.id,
            nickname: p.nickname,
            avatarId: p.avatarId,
            avatarUrl: p.avatarUrl,
            finalScore: p.score || 0,
            rank: idx + 1,
            correctAnswers: p.correctCount || 0,
            totalQuestions: game.totalQuestions,
            accuracy,
            averageResponseTime: 4.5,
            createdAt: p.joinedAt || new Date().toISOString(),
          };
        });
        setResults(sortGameResultsProperly(fallbackResults));
      }
    } catch (err) {
      console.error('Error fetching results:', err);
    }
  };

  const handleSelectGame = async (game: Game) => {
    setSelectedGame(game);
    setSelectedPlayerIds(new Set());
    await loadGameResults(game);
  };

  const handleExportCsv = () => {
    if (!selectedGame || results.length === 0) return;
    exportGameResultsToCsv(
      selectedGame.id,
      selectedGame.quizTitle,
      results,
      selectedGame.startedAt,
      selectedGame.endedAt
    );
  };

  // Toggle single player checkbox
  const handleToggleSelectPlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  // Toggle Select All / Deselect All
  const allPlayerIds = results.map((r) => r.playerId || r.id || '').filter(Boolean);
  const isAllSelected =
    allPlayerIds.length > 0 && allPlayerIds.every((id) => selectedPlayerIds.has(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedPlayerIds(new Set());
    } else {
      setSelectedPlayerIds(new Set(allPlayerIds));
    }
  };

  // Delete selected players from Final Leaderboard Standings
  const handleConfirmDeletePlayers = async () => {
    if (!selectedGame || selectedPlayerIds.size === 0) return;
    try {
      setDeletingPlayers(true);
      const idsToDelete = Array.from(selectedPlayerIds);
      const { remainingCount } = await deletePlayersFromGame(selectedGame.id, idsToDelete);
      setSelectedPlayerIds(new Set());
      setConfirmDeleteOpen(false);
      await loadGameResults(selectedGame);
      setSelectedGame((prev) => (prev ? { ...prev, playerCount: remainingCount } : null));
      setGames((prev) =>
        prev.map((g) => (g.id === selectedGame.id ? { ...g, playerCount: remainingCount } : g))
      );
    } catch (err) {
      console.error('Failed to delete selected players:', err);
    } finally {
      setDeletingPlayers(false);
    }
  };

  // End an active game session
  const handleEndSession = async (game: Game, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!game.id || game.status === 'FINISHED') return;
    try {
      setEndingGameId(game.id);
      await endGameSession(game.id);
      const endedIso = new Date().toISOString();
      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, status: 'FINISHED', endedAt: endedIso } : g))
      );
      if (selectedGame?.id === game.id) {
        const updatedGame: Game = { ...selectedGame, status: 'FINISHED', endedAt: endedIso };
        setSelectedGame(updatedGame);
        await loadGameResults(updatedGame);
      }
    } catch (err) {
      console.error('Error ending session:', err);
    } finally {
      setEndingGameId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Game Results & Analytics</h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Historical game session reports, player performance, session controls, and data exports.
          </p>
        </div>
      </div>

      {selectedGame ? (
        /* Selected Game Detailed Report */
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => {
                setSelectedGame(null);
                setSelectedPlayerIds(new Set());
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Games List</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {selectedGame.status !== 'FINISHED' && (
                <button
                  onClick={() => handleEndSession(selectedGame)}
                  disabled={endingGameId === selectedGame.id}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs cursor-pointer transition-all disabled:opacity-50"
                >
                  {endingGameId === selectedGame.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StopCircle className="w-4 h-4" />
                  )}
                  <span>
                    {endingGameId === selectedGame.id ? 'Ending Session...' : 'End Session'}
                  </span>
                </button>
              )}

              <button
                onClick={handleExportCsv}
                disabled={results.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV Report</span>
              </button>
            </div>
          </div>

          {/* Game Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Quiz Title</span>
              <p className="text-base font-bold text-white truncate mt-1">
                {selectedGame.quizTitle}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Game PIN</span>
              <p className="text-base font-mono font-bold text-indigo-400 mt-1">
                {selectedGame.gamePin}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Players</span>
              <p className="text-base font-mono font-bold text-white mt-1">{results.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
              <p
                className={`text-base font-bold mt-1 ${
                  selectedGame.status === 'FINISHED' ? 'text-emerald-400' : 'text-indigo-400'
                }`}
              >
                {selectedGame.status}
              </p>
            </div>
          </div>

          {/* Results Table with Select All & Delete Players */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-black text-lg text-white">Final Leaderboard Standings</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select individual players or use Select All to clear players in preparation for a new batch.
                </p>
              </div>

              {results.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-slate-700"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={selectedPlayerIds.size === 0 || deletingPlayers}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      Delete Selected{selectedPlayerIds.size > 0 ? ` (${selectedPlayerIds.size})` : ''}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No participants recorded for this session. Ready for new players!
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
                    <th className="pb-3 px-2 w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all players"
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-500"
                      />
                    </th>
                    <th className="pb-3 px-2">Rank</th>
                    <th className="pb-3 px-2">Player</th>
                    <th className="pb-3 px-2 text-right">Final Score</th>
                    <th className="pb-3 px-2 text-right">Correct</th>
                    <th className="pb-3 px-2 text-right">Accuracy</th>
                    <th className="pb-3 px-2 text-right">Avg Time</th>
                    <th className="pb-3 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {results.map((r) => {
                    const pId = r.playerId || r.id || '';
                    const isChecked = selectedPlayerIds.has(pId);
                    return (
                      <tr
                        key={pId}
                        onClick={() => handleToggleSelectPlayer(pId)}
                        className={`transition-colors cursor-pointer ${
                          isChecked ? 'bg-indigo-950/30 hover:bg-indigo-950/40' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectPlayer(pId)}
                            aria-label={`Select ${r.nickname}`}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 cursor-pointer accent-indigo-500"
                          />
                        </td>
                        <td className="py-3 px-2 font-black text-white">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs ${
                              r.rank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : r.rank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : r.rank === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {r.rank}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-white font-bold">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={getAvatarById(r.avatarId).imageUrl}
                              alt={r.nickname}
                              className="w-7 h-7 rounded-full object-cover border"
                              style={{ borderColor: getAvatarById(r.avatarId).accentColor }}
                            />
                            <span>{r.nickname}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-amber-300">
                          {r.finalScore.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-300">
                          {r.correctAnswers} / {r.totalQuestions}
                        </td>
                        <td className="py-3 px-2 text-right text-indigo-300 font-bold">
                          {r.accuracy}%
                        </td>
                        <td className="py-3 px-2 text-right text-slate-400 font-mono">
                          {r.averageResponseTime}s
                        </td>
                        <td
                          className="py-3 px-2 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlayerIds(new Set([pId]));
                              setConfirmDeleteOpen(true);
                            }}
                            title={`Delete ${r.nickname}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* Games List Table */
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <h3 className="font-black text-lg text-white mb-4">
            Historical & Active Arena Sessions ({games.length})
          </h3>

          {loading ? (
            <div className="py-8 text-center text-slate-500">Loading sessions...</div>
          ) : games.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No live sessions recorded yet. Start a game from the Quizzes tab!
            </div>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGame(g)}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-sm sm:text-base truncate">
                      {g.quizTitle}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400 mt-1 font-mono">
                      <span>
                        PIN: <strong className="text-indigo-400">{g.gamePin}</strong>
                      </span>
                      <span>•</span>
                      <span>{g.playerCount || 0} Players</span>
                      <span>•</span>
                      <span className="text-slate-500">
                        {new Date(g.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                        g.status === 'FINISHED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {g.status === 'FINISHED' ? 'FINISHED' : `ACTIVE (${g.status})`}
                    </span>

                    {g.status !== 'FINISHED' && (
                      <button
                        type="button"
                        onClick={(e) => handleEndSession(g, e)}
                        disabled={endingGameId === g.id}
                        className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {endingGameId === g.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <StopCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{endingGameId === g.id ? 'Ending...' : 'End Session'}</span>
                      </button>
                    )}

                    <button className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer">
                      View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Deleting Selected Players */}
      {confirmDeleteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deletingPlayers && setConfirmDeleteOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">
                Delete {selectedPlayerIds.size}{' '}
                {selectedPlayerIds.size === 1 ? 'Player' : 'Players'}?
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                This will permanently remove the selected{' '}
                {selectedPlayerIds.size === 1 ? 'participant' : 'participants'}, their submitted
                answers, and their leaderboard entries from{' '}
                <strong className="text-white">{selectedGame?.quizTitle}</strong> so the session is
                ready for new players.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={deletingPlayers}
                onClick={() => setConfirmDeleteOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingPlayers}
                onClick={handleConfirmDeletePlayers}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                {deletingPlayers ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
