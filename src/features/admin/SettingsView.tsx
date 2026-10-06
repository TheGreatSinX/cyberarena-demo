import React, { useState } from 'react';
import { AuditLogsView } from './AuditLogsView';
import {
  Settings,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  LayoutDashboard,
  Layers,
  BarChart3,
  Mail,
  Users,
  CheckCircle2,
  Sliders,
} from 'lucide-react';

export interface NavVisibilityConfig {
  dashboard: boolean;
  quizzes: boolean;
  results: boolean;
  weekly: boolean;
  users: boolean;
}

export const DEFAULT_NAV_VISIBILITY: NavVisibilityConfig = {
  dashboard: true,
  quizzes: true,
  results: true,
  weekly: true,
  users: true,
};

interface SettingsViewProps {
  navVisibility: NavVisibilityConfig;
  onUpdateNavVisibility: (updated: NavVisibilityConfig) => void;
  onOpenResetModal: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  navVisibility,
  onUpdateNavVisibility,
  onOpenResetModal,
}) => {
  const [activeSubSection, setActiveSubSection] = useState<'general' | 'audit'>('general');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleToggleLink = (key: keyof NavVisibilityConfig) => {
    const next = {
      ...navVisibility,
      [key]: !navVisibility[key],
    };
    onUpdateNavVisibility(next);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleShowAllLinks = () => {
    onUpdateNavVisibility(DEFAULT_NAV_VISIBILITY);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const navItems: {
    key: keyof NavVisibilityConfig;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      description: 'Main administrator console overview and platform metrics.',
      icon: <LayoutDashboard className="w-4 h-4 text-indigo-400" />,
    },
    {
      key: 'quizzes',
      label: 'Quizzes',
      description: 'Create, manage, and configure quiz question banks, PINs, and due dates.',
      icon: <Layers className="w-4 h-4 text-indigo-400" />,
    },
    {
      key: 'results',
      label: 'Result & CSV',
      description: 'View participant scores, session leaderboards, and export CSV reports.',
      icon: <BarChart3 className="w-4 h-4 text-indigo-400" />,
    },
    {
      key: 'weekly',
      label: 'Weekly Awareness',
      description: 'Manage weekly security awareness campaigns, email templates, and submissions.',
      icon: <Mail className="w-4 h-4 text-[#00A191]" />,
    },
    {
      key: 'users',
      label: 'Administrator',
      description: 'Manage administrator accounts, roles, and two-factor authentication status.',
      icon: <Users className="w-4 h-4 text-indigo-400" />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Platform Settings</h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              Configure navigator link visibility, inspect security audit logs, and manage system database state.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubSection('general')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubSection === 'general'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>General & Database</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubSection('audit')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubSection === 'audit'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>
      </div>

      {activeSubSection === 'general' ? (
        <div className="space-y-8">
          {/* Navigator Links Visibility Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-black text-white">Navigator Link Visibility</h2>
                  {savedNotice && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Toggle individual navigation links to show or hide them in the top administrator navigation bar.
                </p>
              </div>

              <button
                type="button"
                onClick={handleShowAllLinks}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Show All Links</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl bg-slate-950/60 overflow-hidden">
              {navItems.map((item) => {
                const isVisible = navVisibility[item.key];
                return (
                  <div
                    key={item.key}
                    className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                          isVisible
                            ? 'bg-slate-900 border-slate-700'
                            : 'bg-slate-900/40 border-slate-800 opacity-50'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-bold ${
                              isVisible ? 'text-white' : 'text-slate-500 line-through'
                            }`}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                              isVisible
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {isVisible ? 'Visible' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      aria-label={`Toggle ${item.label} navigator link`}
                      onClick={() => handleToggleLink(item.key)}
                      className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isVisible ? 'bg-indigo-600' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                          isVisible ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      >
                        {isVisible ? (
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System Danger Zone: Reset Database */}
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-rose-900/50 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">
                  DANGER ZONE • DATABASE MANAGEMENT
                </span>
              </div>
              <h3 className="font-black text-white text-lg">Reset Database & Return to Zero</h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                Permanently wipe all quizzes, active game sessions, participant answers, weekly awareness campaigns, and analytics to return the database back to zero. Requires typing confirmation before executing.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenResetModal}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0 shadow-lg shadow-rose-950/30"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Reset Database</span>
            </button>
          </div>

          {/* Embedded Audit Logs Section Preview / Full Access */}
          <div className="pt-2">
            <AuditLogsView />
          </div>
        </div>
      ) : (
        <AuditLogsView />
      )}
    </div>
  );
};
