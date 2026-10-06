import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/auth/authContext';
import { UserProfile, Role } from '../../types';
import { Shield, ShieldAlert, UserPlus, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

export const AdminUsersView: React.FC = () => {
  const { user, profile, registerAdmin, writeAuditEntry } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<Role>('ADMIN');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
      setUsers(list);
    } catch (err) {
      console.error('Error fetching admin users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleDisabled = async (targetUser: UserProfile) => {
    if (!isSuperAdmin) {
      alert('Only SUPER_ADMIN can modify account statuses.');
      return;
    }
    if (targetUser.uid === user?.uid) {
      alert('You cannot disable your own administrator account.');
      return;
    }

    const nextDisabled = !targetUser.disabled;
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        disabled: nextDisabled,
        updatedAt: new Date().toISOString(),
      });
      await writeAuditEntry(
        nextDisabled ? 'ADMIN_DISABLED' : 'ADMIN_ENABLED',
        'users',
        targetUser.uid,
        { email: targetUser.email }
      );
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (targetUser: UserProfile, newRoleVal: Role) => {
    if (!isSuperAdmin) {
      alert('Only SUPER_ADMIN can modify roles.');
      return;
    }
    if (targetUser.uid === user?.uid) {
      alert('You cannot change your own role.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        role: newRoleVal,
        updatedAt: new Date().toISOString(),
      });
      await writeAuditEntry('ROLE_CHANGED', 'users', targetUser.uid, { role: newRoleVal });
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setError(null);
    setSubmitting(true);

    try {
      await registerAdmin(newEmail.trim(), newPassword, newDisplayName.trim(), newRole);
      setIsAddOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      await fetchUsers();
    } catch (err: any) {
      setError(err?.message || 'Failed to create administrator account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Administrator Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Role-based access control (RBAC), MFA status, and account provisioning.</p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Administrator</span>
          </button>
        )}
      </div>

      {!isSuperAdmin && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>
            You are logged in as a standard <strong>ADMIN</strong>. Super Admin privileges are required to create or disable other administrators.
          </span>
        </div>
      )}

      {/* Users Table */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-bold">
              <th className="pb-3 px-3">Administrator</th>
              <th className="pb-3 px-3">Role</th>
              <th className="pb-3 px-3">MFA Enrolled</th>
              <th className="pb-3 px-3">Status</th>
              <th className="pb-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3.5 px-3">
                  <div className="font-bold text-white">{u.displayName || 'Administrator'}</div>
                  <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                </td>

                <td className="py-3.5 px-3">
                  {isSuperAdmin && u.uid !== user?.uid ? (
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-indigo-300 outline-none"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold">
                      {u.role}
                    </span>
                  )}
                </td>

                <td className="py-3.5 px-3">
                  {u.mfaEnrolled ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Enrolled</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                      <AlertCircle className="w-4 h-4" />
                      <span>Pending Verification</span>
                    </span>
                  )}
                </td>

                <td className="py-3.5 px-3">
                  {u.disabled ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
                      Disabled
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                      Active
                    </span>
                  )}
                </td>

                <td className="py-3.5 px-3 text-right">
                  {isSuperAdmin && u.uid !== user?.uid ? (
                    <button
                      onClick={() => handleToggleDisabled(u)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        u.disabled
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {u.disabled ? 'Re-enable' : 'Disable'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Self</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Admin Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-lg text-white">Create Administrator</h3>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Host John"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@cyberarena.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                >
                  <option value="ADMIN">ADMIN (Quizzes, Games, Results)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Full Privileges)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
