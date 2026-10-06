import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { AuditLog } from '../../types';
import { ShieldAlert, Filter, Clock, User, FileText, RefreshCw } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
      setLogs(list);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = filterAction === 'ALL' ? logs : logs.filter((l) => l.action.includes(filterAction));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Security & Audit Logs</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Append-only immutable record of administrator operations.</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 outline-none"
          >
            <option value="ALL">All Actions</option>
            <option value="LOGIN">Auth & Login</option>
            <option value="MFA">MFA Events</option>
            <option value="QUIZ">Quiz Management</option>
            <option value="GAME">Live Game Actions</option>
            <option value="ADMIN">Admin Management</option>
          </select>

          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 cursor-pointer"
            title="Refresh Logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
        {loading ? (
          <div className="py-8 text-center text-slate-500">Loading audit records...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No matching audit events recorded yet.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-bold">
                <th className="pb-3 px-3">Timestamp</th>
                <th className="pb-3 px-3">Action</th>
                <th className="pb-3 px-3">Actor</th>
                <th className="pb-3 px-3">Target Resource</th>
                <th className="pb-3 px-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.action.includes('MFA')
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : log.action.includes('LOGIN')
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : log.action.includes('DELETE')
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-200">{log.actorEmail}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {log.resourceType} {log.resourceId ? `(${log.resourceId.slice(0, 8)}...)` : ''}
                  </td>
                  <td className="py-3 px-3 text-slate-400 max-w-xs truncate">
                    {log.metadata ? String(log.metadata) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
