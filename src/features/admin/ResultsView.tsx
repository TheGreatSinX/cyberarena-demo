import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, getDoc, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Game, GameResult, AnswerSubmission } from '../../types';
import { exportGameResultsToCsv } from '../../lib/game/gameEngine';
import { getAvatarById } from '../../lib/avatars/avatarsCatalog';
import { Trophy, Download, Clock, CheckCircle2, XCircle, ArrowLeft, BarChart2, Users } from 'lucide-react';

export const ResultsView: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchGames();
  }, []);

  const handleSelectGame = async (game: Game) => {
    setSelectedGame(game);
    try {
      const resSnap = await getDocs(
        query(collection(db, `games/${game.id}/results`), orderBy('rank', 'asc'))
      );
      if (!resSnap.empty) {
        setResults(resSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GameResult)));
      } else {
        // Fallback: derive from players collection
        const pSnap = await getDocs(
          query(collection(db, `games/${game.id}/players`), orderBy('score', 'desc'))
        );
        const fallbackResults: GameResult[] = pSnap.docs.map((d, idx) => {
          const p = d.data();
          const accuracy = game.totalQuestions > 0 ? Math.round(((p.correctCount || 0) / game.totalQuestions) * 100) : 0;
          return {
            id: d.id,
            playerId: d.id,
            nickname: p.nickname,
            finalScore: p.score || 0,
            rank: idx + 1,
            correctAnswers: p.correctCount || 0,
            totalQuestions: game.totalQuestions,
            accuracy,
            averageResponseTime: 4.5,
            createdAt: new Date().toISOString(),
          };
        });
        setResults(fallbackResults);
      }
    } catch (err) {
      console.error('Error fetching results:', err);
    }
  };

  const handleExportCsv = () => {
    if (!selectedGame || results.length === 0) return;
    exportGameResultsToCsv(selectedGame.id, selectedGame.quizTitle, results, selectedGame.startedAt, selectedGame.endedAt);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Game Results & Analytics</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Historical game session reports, player performance, and data exports.</p>
        </div>
      </div>

      {selectedGame ? (
        /* Selected Game Detailed Report */
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setSelectedGame(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Games List</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={results.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV Report</span>
            </button>
          </div>

          {/* Game Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Quiz Title</span>
              <p className="text-base font-bold text-white truncate mt-1">{selectedGame.quizTitle}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Game PIN</span>
              <p className="text-base font-mono font-bold text-indigo-400 mt-1">{selectedGame.gamePin}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Players</span>
              <p className="text-base font-mono font-bold text-white mt-1">{results.length}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
              <p className="text-base font-bold text-emerald-400 mt-1">{selectedGame.status}</p>
            </div>
          </div>

          {/* Results Table */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
            <h3 className="font-black text-lg text-white mb-4">Final Leaderboard Standings</h3>

            {results.length === 0 ? (
              <p className="text-xs text-slate-500">No participants recorded for this session.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
                    <th className="pb-3 px-2">Rank</th>
                    <th className="pb-3 px-2">Player</th>
                    <th className="pb-3 px-2 text-right">Final Score</th>
                    <th className="pb-3 px-2 text-right">Correct</th>
                    <th className="pb-3 px-2 text-right">Accuracy</th>
                    <th className="pb-3 px-2 text-right">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {results.map((r) => (
                    <tr key={r.id || r.playerId} className="hover:bg-slate-800/40 transition-colors">
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
                      <td className="py-3 px-2 text-right text-indigo-300 font-bold">{r.accuracy}%</td>
                      <td className="py-3 px-2 text-right text-slate-400 font-mono">{r.averageResponseTime}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* Games List Table */
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
          <h3 className="font-black text-lg text-white mb-4">Historical Arena Sessions ({games.length})</h3>

          {loading ? (
            <div className="py-8 text-center text-slate-500">Loading sessions...</div>
          ) : games.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No live sessions recorded yet. Start a game from the Quizzes tab!</div>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGame(g)}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-sm sm:text-base truncate">{g.quizTitle}</h4>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400 mt-1 font-mono">
                      <span>PIN: <strong className="text-indigo-400">{g.gamePin}</strong></span>
                      <span>•</span>
                      <span>{g.playerCount || 0} Players</span>
                      <span>•</span>
                      <span className="text-slate-500">{new Date(g.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                        g.status === 'FINISHED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {g.status}
                    </span>
                    <button className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200">
                      View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
