import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/auth/authContext';
import { AuditLog } from '../../types';
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Filter,
  Clock,
  User,
  FileText,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { auditLoggingEnabled, setAuditLoggingEnabled } = useAuth();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black text-white">Security & Audit Logs</h2>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                auditLoggingEnabled
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {auditLoggingEnabled ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Recording Active</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-3 h-3 text-amber-400" />
                  <span>Recording Stopped</span>
                </>
              )}
            </span>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Append-only immutable record of administrator operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Toggle Button */}
          <button
            type="button"
            onClick={() => setAuditLoggingEnabled(!auditLoggingEnabled)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              auditLoggingEnabled
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {auditLoggingEnabled ? (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Stop Logging</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Start Logging</span>
              </>
            )}
          </button>

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

      {/* Status Banner */}
      {!auditLoggingEnabled ? (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Audit Logging is Stopped:</strong> No new writes are being sent to the Firestore <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300 font-mono">auditLogs</code> collection. This preserves daily write quota.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAuditLoggingEnabled(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-[11px] border border-amber-500/40 shrink-0 cursor-pointer"
          >
            Resume
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 text-xs text-emerald-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Audit Logging is Active:</strong> New administrative events will be recorded into Firestore.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAuditLoggingEnabled(false)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-[11px] border border-emerald-500/40 shrink-0 cursor-pointer"
          >
            Stop Logging
          </button>
        </div>
      )}

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
