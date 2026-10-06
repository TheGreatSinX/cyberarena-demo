import React from 'react';
import { AuditLogsView } from './AuditLogsView';
import {
  Settings,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  ShieldAlert,
  LayoutDashboard,
  Layers,
  BarChart3,
  Mail,
  Users,
  ShieldCheck,
} from 'lucide-react';

export interface NavVisibilitySettings {
  dashboard: boolean;
  quizzes: boolean;
  results: boolean;
  weekly: boolean;
  users: boolean;
}

export const DEFAULT_NAV_VISIBILITY: NavVisibilitySettings = {
  dashboard: true,
  quizzes: true,
  results: true,
  weekly: true,
  users: true,
};

interface AdminSettingsViewProps {
  navVisibility: NavVisibilitySettings;
  onUpdateNavVisibility: (next: NavVisibilitySettings) => void;
  onOpenResetDatabase: () => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  navVisibility,
  onUpdateNavVisibility,
  onOpenResetDatabase,
}) => {
  const navItems: {
    key: keyof NavVisibilitySettings;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      description: 'Overview metrics and system summary',
      icon: <LayoutDashboard className="w-4 h-4 text-indigo-400" />,
    },
    {
      key: 'quizzes',
      label: 'Quizzes',
      description: 'Quiz builder, question bank, PIN & due date management',
      icon: <Layers className="w-4 h-4 text-[#00A191]" />,
    },
    {
      key: 'results',
      label: 'Results & CSV',
      description: 'Participant quiz scores, accuracy, and CSV report export',
      icon: <BarChart3 className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'weekly',
      label: 'Weekly Awareness',
      description: 'Weekly security awareness questionnaires and HTML email templates',
      icon: <Mail className="w-4 h-4 text-[#F05A28]" />,
    },
    {
      key: 'users',
      label: 'Administrators',
      description: 'Administrator accounts, RBAC roles, and MFA status',
      icon: <Users className="w-4 h-4 text-emerald-400" />,
    },
  ];

  const allHidden = Object.values(navVisibility).every((v) => !v);

  const handleToggleItem = (key: keyof NavVisibilitySettings) => {
    onUpdateNavVisibility({
      ...navVisibility,
      [key]: !navVisibility[key],
    });
  };

  const handleToggleAll = () => {
    const targetState = allHidden ? true : false;
    onUpdateNavVisibility({
      dashboard: targetState,
      quizzes: targetState,
      results: targetState,
      weekly: targetState,
      users: targetState,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-3xl bg-[#0D1F3C] border border-[#00A191]/30 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#00A191]/20 border border-[#00A191]/40 text-[#00A191] flex items-center justify-center shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#00A191] block">
              PLATFORM CONFIGURATION & SECURITY
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">Platform Settings</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Customize navigator link visibility, inspect security audit logs, and manage database state.
            </p>
          </div>
        </div>
      </div>

      {/* 1. Navigator Link Visibility Toggles */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              {allHidden ? (
                <EyeOff className="w-5 h-5 text-[#F05A28]" />
              ) : (
                <Eye className="w-5 h-5 text-[#00A191]" />
              )}
              <span>Navigator Links Visibility</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Toggle which navigation links are visible in the top Administrator navigation bar.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleAll}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              allHidden
                ? 'bg-[#00A191]/20 text-[#00A191] border-[#00A191]/40 hover:bg-[#00A191]/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {allHidden ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show All Navigator Links</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide All Navigator Links</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {navItems.map((item) => {
            const isVisible = navVisibility[item.key];
            return (
              <div
                key={item.key}
                onClick={() => handleToggleItem(item.key)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isVisible
                    ? 'bg-slate-950 border-[#00A191]/40 shadow-md shadow-[#00A191]/5'
                    : 'bg-slate-950/50 border-slate-800 opacity-75'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{item.label}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isVisible
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {isVisible ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isVisible}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleItem(item.key);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isVisible ? 'bg-[#00A191]' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isVisible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Security & Audit Logs (Moved to Settings) */}
      <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl">
        <AuditLogsView />
      </div>

      {/* 3. System Danger Zone: Reset Database (Moved to Settings) */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-rose-900/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="font-bold text-white text-base">Reset Database & Return to Zero</h3>
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            Permanently wipe all quizzes, active game sessions, answers, weekly campaigns, and analytics to return the database back to zero. Requires typing confirmation before executing.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenResetDatabase}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition-all cursor-pointer shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Database to Zero</span>
        </button>
      </div>
    </div>
  );
};
