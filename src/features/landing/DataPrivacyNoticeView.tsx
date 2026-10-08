import React from 'react';
import { ShieldCheck, CheckCircle2, Mail, Lock } from 'lucide-react';
import { FloatingPartyObjects } from '../../components/FloatingPartyObjects';
import { soundManager } from '../../lib/sound/soundManager';

interface DataPrivacyNoticeViewProps {
  onAcknowledgeAndReturn: () => void;
}

export const DataPrivacyNoticeView: React.FC<DataPrivacyNoticeViewProps> = ({
  onAcknowledgeAndReturn,
}) => {
  const handleAcknowledge = () => {
    soundManager.playAnswerSubmit();
    onAcknowledgeAndReturn();
  };

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col justify-center items-center px-3.5 py-6 sm:px-4 sm:py-12 pb-safe relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Background ambient glow circles */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Floating 3D Cyber Security Objects Background Effect */}
      <FloatingPartyObjects />

      <div className="w-full max-w-2xl relative z-10">
        {/* Top Brand / Context Pill */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1F3C]/90 border border-[#00A191]/40 text-[#00A191] text-xs font-bold uppercase tracking-wider mb-3 shadow-lg">
            <ShieldCheck className="w-4 h-4 text-[#00A191]" />
            <span>InfoPro Business Solutions, Inc. (IBSI)</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            DATA PRIVACY <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F05A28] via-[#E5E5E5] to-[#00A191]">NOTICE</span>
          </h1>
        </div>

        {/* Main Content Card */}
        <div className="bg-[#0D1F3C]/95 border-2 border-[#00A191]/30 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-[#0D1F3C]/80 backdrop-blur-xl relative space-y-4 sm:space-y-5">
          {/* Header Banner inside Card */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800/90">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#F05A28]/20 to-[#00A191]/20 border border-[#00A191]/40 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-[#00A191]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                DATA PRIVACY NOTICE
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Data Privacy Act of 2012 Compliance & Participant Consent
              </p>
            </div>
          </div>

          {/* Notice Body Text */}
          <div className="space-y-4 text-sm sm:text-base text-slate-200 leading-relaxed font-normal bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 sm:p-6">
            <p>
              We, at <strong className="text-white font-bold">InfoPro Business Solutions, Inc. (IBSI)</strong>, understand the importance of your privacy and are committed to protecting the confidentiality of your Personal Information and Sensitive Personal Information (collectively, “Personal Data”) in accordance with the <strong className="text-[#00A191] font-semibold">Data Privacy Act of 2012</strong>.
            </p>

            <p>
              Please be informed that the Personal Data you provide through this game will be collected and processed for purposes related to the <strong className="text-white font-semibold">“Spot the Phish: Legit or Not Legit?”</strong> cybersecurity awareness activity, including game participation, score tracking, winner verification, and communicating game-related announcements and updates.
            </p>

            <p>
              Your Personal Data will be securely stored and handled in accordance with the policies, systems, and procedures of the Company.
            </p>

            <p>
              By clicking <strong className="text-white font-semibold">“Acknowledge &amp; Return,”</strong> you acknowledge and consent to the processing of your Personal Data for the purposes stated above. Should you have any inquiries, concerns, feedback, and/or complaints, you may contact our Data Protection Officer at{' '}
              <a
                href="mailto:dpo@ibs-ph.com"
                className="inline-flex items-center gap-1 font-bold text-[#00A191] hover:text-[#F05A28] underline underline-offset-4 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 inline" />
                dpo@ibs-ph.com
              </a>
              .
            </p>
          </div>

          {/* Action Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleAcknowledge}
              className="w-full min-h-[52px] flex items-center justify-center gap-2.5 py-3.5 sm:py-4 px-6 rounded-2xl font-black text-base sm:text-lg bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/30 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Acknowledge &amp; Return</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
