import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { db } from '../../lib/firebase/config';
import {
  WeeklyQuestionnaire,
  WeeklyInvitation,
  WeeklySubmission,
  WeeklyAnswerItem,
} from '../../types/weekly';
import { DEFAULT_EMAIL_BACKGROUND_URL } from './emailTemplateBuilder';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Send,
  User,
  Mail,
  Building2,
  Award,
  Calendar,
  HelpCircle,
} from 'lucide-react';

interface WeeklyRespondentViewProps {
  questionnaireId: string;
  inviteToken?: string | null;
  onExitToHome?: () => void;
}

export const WeeklyRespondentView: React.FC<WeeklyRespondentViewProps> = ({
  questionnaireId,
  inviteToken,
}) => {
  const [questionnaire, setQuestionnaire] = useState<WeeklyQuestionnaire | null>(null);
  const [invitation, setInvitation] = useState<WeeklyInvitation | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<WeeklySubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Respondent identity fields
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [department, setDepartment] = useState('');

  // Selected answers: map of questionId -> selectedOptionId
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const qRef = doc(db, 'weeklyQuestionnaires', questionnaireId);
        const qSnap = await getDoc(qRef);
        if (!qSnap.exists()) {
          setError('This Weekly Security Awareness Questionnaire could not be found or is no longer active.');
          setLoading(false);
          return;
        }

        const qData = { id: qSnap.id, ...qSnap.data() } as WeeklyQuestionnaire;
        setQuestionnaire(qData);

        // If an invite token is present, find the matching invitation and check if already submitted
        if (inviteToken) {
          const invQuery = query(
            collection(db, `weeklyQuestionnaires/${questionnaireId}/invitations`),
            where('token', '==', inviteToken)
          );
          const invSnap = await getDocs(invQuery);
          if (!invSnap.empty) {
            const invDoc = invSnap.docs[0];
            const invData = { id: invDoc.id, ...invDoc.data() } as WeeklyInvitation;
            setInvitation(invData);
            setRecipientName(invData.recipientName || '');
            setRecipientEmail(invData.recipientEmail || '');
            setDepartment(invData.department || '');

            // Check if a submission already exists for this token
            const subQuery = query(
              collection(db, `weeklyQuestionnaires/${questionnaireId}/submissions`),
              where('token', '==', inviteToken)
            );
            const subSnap = await getDocs(subQuery);
            if (!subSnap.empty) {
              const sDoc = subSnap.docs[0];
              setExistingSubmission({ id: sDoc.id, ...sDoc.data() } as WeeklySubmission);
            }
          }
        }
      } catch (err: any) {
        console.error('Error loading weekly questionnaire:', err);
        setError(err?.message || 'Unable to load questionnaire.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [questionnaireId, inviteToken]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionnaire) return;

    const cleanName = recipientName.trim();
    const cleanEmail = (invitation?.recipientEmail || recipientEmail || '').trim().toLowerCase();
    const cleanDept = department.trim() || 'General';

    if (!cleanName || cleanName.length < 2) {
      setError('Please enter your full name.');
      return;
    }

    const questions = questionnaire.questions || [];
    const unanswered = questions.filter((q) => !selectedAnswers[q.id]);
    if (unanswered.length > 0) {
      setError(`Please answer all questions before submitting (${unanswered.length} remaining).`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Check if this respondent already submitted for this questionnaire
      if (cleanEmail) {
        const dupQuery = query(
          collection(db, `weeklyQuestionnaires/${questionnaireId}/submissions`),
          where('recipientEmail', '==', cleanEmail)
        );
        const dupSnap = await getDocs(dupQuery);
        if (!dupSnap.empty) {
          const existingDoc = dupSnap.docs[0];
          setExistingSubmission({ id: existingDoc.id, ...existingDoc.data() } as WeeklySubmission);
          setSubmitting(false);
          return;
        }
      }

      let score = 0;
      let maxScore = 0;
      let correctCount = 0;

      const evaluatedAnswers: WeeklyAnswerItem[] = questions.map((q) => {
        const chosenId = selectedAnswers[q.id];
        const chosenOpt = q.options.find((o) => o.id === chosenId);
        const correctOpt = q.options.find((o) => o.id === q.correctOptionId);
        const isCorrect = chosenId === q.correctOptionId;
        const pts = q.points || 20;
        maxScore += pts;
        if (isCorrect) {
          score += pts;
          correctCount += 1;
        }

        return {
          questionId: q.id,
          questionText: q.questionText,
          selectedOptionId: chosenId,
          selectedOptionText: chosenOpt?.text || '',
          correctOptionId: q.correctOptionId,
          correctOptionText: correctOpt?.text || '',
          isCorrect,
          pointsAwarded: isCorrect ? pts : 0,
        };
      });

      const totalQuestions = questions.length;
      const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const passingThreshold = questionnaire.passingScorePercent || 80;
      const passed = accuracy >= passingThreshold;
      const nowIso = new Date().toISOString();

      const subRef = doc(collection(db, `weeklyQuestionnaires/${questionnaireId}/submissions`));
      const submissionPayload: Omit<WeeklySubmission, 'id'> = {
        questionnaireId,
        questionnaireTitle: questionnaire.title,
        weekLabel: questionnaire.weekLabel || 'Weekly Campaign',
        invitationId: invitation?.id || null,
        token: inviteToken || null,
        recipientEmail: cleanEmail,
        recipientName: cleanName,
        department: cleanDept,
        answers: evaluatedAnswers,
        score,
        maxScore,
        correctCount,
        totalQuestions,
        accuracy,
        passed,
        submittedAt: nowIso,
      };

      await setDoc(subRef, submissionPayload);

      // If linked to an invitation, mark invitation as COMPLETED
      if (invitation) {
        await updateDoc(doc(db, `weeklyQuestionnaires/${questionnaireId}/invitations`, invitation.id), {
          status: 'COMPLETED',
          recipientName: cleanName,
          department: cleanDept,
          completedAt: nowIso,
        });
      } else if (cleanEmail) {
        // Also check if an invitation exists matching this email
        const emailInvQuery = query(
          collection(db, `weeklyQuestionnaires/${questionnaireId}/invitations`),
          where('recipientEmail', '==', cleanEmail)
        );
        const emailInvSnap = await getDocs(emailInvQuery);
        for (const invDoc of emailInvSnap.docs) {
          await updateDoc(invDoc.ref, {
            status: 'COMPLETED',
            completedAt: nowIso,
          });
        }
      }

      setExistingSubmission({
        id: subRef.id,
        ...submissionPayload,
      });

      if (passed) {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    } catch (err: any) {
      console.error('Error submitting weekly questionnaire:', err);
      setError(err?.message || 'Failed to submit your responses. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const bgImageUrl = questionnaire?.emailTemplate?.backgroundImageUrl || DEFAULT_EMAIL_BACKGROUND_URL;

  if (loading) {
    return (
      <div
        className="min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center p-6 bg-slate-950 text-white relative overflow-hidden bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${bgImageUrl}')` }}
      >
        <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#00A191] mb-3" />
          <p className="text-sm font-bold text-slate-200">Loading Weekly Security Awareness Questionnaire...</p>
        </div>
      </div>
    );
  }

  if (!questionnaire) {
    return (
      <div
        className="min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center p-6 bg-slate-950 text-white text-center relative overflow-hidden bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${bgImageUrl}')` }}
      >
        <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] pointer-events-none" />
        <div className="relative z-10 max-w-md w-full p-8 rounded-3xl bg-[#0D1F3C]/90 backdrop-blur-md border border-[#F05A28]/40 space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-[#F05A28] mx-auto" />
          <h2 className="text-xl font-black">Questionnaire Not Available</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {error || 'The requested Weekly Security Awareness Questionnaire does not exist or has been removed.'}
          </p>
        </div>
      </div>
    );
  }

  // COMPLETED / SUBMITTED STATE
  if (existingSubmission) {
    return (
      <div
        className="min-h-[calc(100dvh-4rem)] py-8 px-4 bg-slate-950 text-white relative overflow-hidden bg-cover bg-center bg-fixed bg-no-repeat"
        style={{ backgroundImage: `url('${bgImageUrl}')` }}
      >
        <div className="fixed inset-0 bg-slate-950/55 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          {/* Completion Summary Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0D1F3C]/90 backdrop-blur-md border-2 border-[#00A191] shadow-2xl text-center space-y-4 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F05A28] via-[#00A191] to-[#E5E5E5]" />

            <div className="w-16 h-16 rounded-2xl bg-[#00A191]/20 border border-[#00A191] text-[#00A191] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <span className="inline-block px-3 py-1 rounded-full bg-[#00A191]/15 border border-[#00A191]/30 text-[#00A191] text-xs font-bold uppercase tracking-wider">
              {existingSubmission.weekLabel} • Response Logged
            </span>

            <h1 className="text-2xl sm:text-3xl font-black text-white">
              Thank You, {existingSubmission.recipientName}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
              Your Weekly Security Awareness Questionnaire responses have been securely logged on the administrator compliance dashboard.
            </p>

            {/* Score Metrics */}
            <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Score</span>
                <span className="text-xl font-mono font-black text-white">
                  {existingSubmission.score}/{existingSubmission.maxScore}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Accuracy</span>
                <span className="text-xl font-mono font-black text-[#00A191]">
                  {existingSubmission.accuracy}%
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Status</span>
                <span
                  className={`text-sm font-black uppercase ${
                    existingSubmission.passed ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {existingSubmission.passed ? 'PASSED' : 'COMPLETED'}
                </span>
              </div>
            </div>
          </div>

          {/* Question-by-Question Knowledge Review */}
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 backdrop-blur-md border border-slate-800 space-y-4 shadow-2xl">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#00A191]" />
              <span>Security Awareness Review & Explanations</span>
            </h2>

            <div className="space-y-4">
              {existingSubmission.answers.map((ans, idx) => {
                const qObj = questionnaire.questions.find((q) => q.id === ans.questionId);
                return (
                  <div
                    key={ans.questionId}
                    className={`p-4 sm:p-5 rounded-2xl border ${
                      ans.isCorrect
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-rose-950/20 border-rose-500/30'
                    } space-y-2.5`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-white">
                        {idx + 1}. {ans.questionText}
                      </p>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          ans.isCorrect
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {ans.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> Incorrect
                          </>
                        )}
                      </span>
                    </div>

                    {qObj?.imageUrl && (
                      <div className="rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-800 p-2 flex justify-center">
                        <img
                          src={qObj.imageUrl}
                          alt={`Question ${idx + 1}`}
                          className="max-h-60 w-auto rounded-xl object-contain"
                        />
                      </div>
                    )}

                    <div className="text-xs space-y-1">
                      <p className="text-slate-300">
                        <span className="text-slate-400">Your Answer: </span>
                        <strong className={ans.isCorrect ? 'text-emerald-300' : 'text-rose-300'}>
                          {ans.selectedOptionText}
                        </strong>
                      </p>
                      {!ans.isCorrect && (
                        <p className="text-slate-300">
                          <span className="text-slate-400">Correct Answer: </span>
                          <strong className="text-emerald-300">{ans.correctOptionText}</strong>
                        </p>
                      )}
                    </div>

                    {qObj?.explanation && (
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        <strong className="text-[#00A191]">Security Takeaway: </strong>
                        {qObj.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE QUESTIONNAIRE FORM
  const answeredCount = Object.keys(selectedAnswers).length;
  const totalCount = questionnaire.questions?.length || 0;

  return (
    <div
      className="min-h-[calc(100dvh-4rem)] py-6 sm:py-10 px-4 bg-slate-950 text-white relative overflow-hidden bg-cover bg-center bg-fixed bg-no-repeat"
      style={{ backgroundImage: `url('${bgImageUrl}')` }}
    >
      <div className="fixed inset-0 bg-slate-950/50 pointer-events-none" />
      <div className="relative z-10 max-w-3xl mx-auto space-y-6">
        {/* Campaign Header Banner */}
        <div
          className="p-6 sm:p-8 rounded-3xl bg-[#0D1F3C]/90 backdrop-blur-md border-2 border-[#00A191]/50 shadow-2xl relative overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(13,31,60,0.88) 0%, rgba(13,31,60,0.72) 60%, rgba(240,90,40,0.22) 100%), url('${bgImageUrl}')`,
          }}
        >
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F05A28] via-[#00A191] to-[#E5E5E5]" />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F05A28]/15 border border-[#F05A28]/40 text-[#F05A28] text-xs font-bold uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" />
              {questionnaire.weekLabel || 'Weekly Security Awareness'}
            </span>

            {questionnaire.dueDate && (
              <span className="text-xs font-mono text-slate-300 bg-slate-950/70 px-3 py-1 rounded-full border border-slate-800">
                Due: {questionnaire.dueDate}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">{questionnaire.title}</h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{questionnaire.description}</p>

          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 font-semibold">
              <HelpCircle className="w-4 h-4 text-[#00A191]" />
              {totalCount} Questions
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <Award className="w-4 h-4 text-amber-400" />
              Passing Score: {questionnaire.passingScorePercent || 80}%
            </span>
            <span className="font-mono text-[#00A191] font-bold">
              Progress: {answeredCount} / {totalCount} Answered
            </span>
          </div>
        </div>

        {questionnaire.status === 'CLOSED' ? (
          <div className="p-8 rounded-3xl bg-slate-900 border border-amber-500/40 text-center space-y-2">
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">This Weekly Questionnaire is Closed</h3>
            <p className="text-xs text-slate-400">
              The submission window for this weekly security awareness campaign has ended.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-[#F05A28]/15 border border-[#F05A28]/40 text-[#F05A28] text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Respondent Identification Card */}
            <div className="p-6 rounded-3xl bg-slate-900/90 backdrop-blur-md border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-white">1. Your Employee Information</h2>
                {invitation && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#00A191]/15 text-[#00A191] border border-[#00A191]/30 font-bold">
                    Verified Invitation Link
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-[#00A191] text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
                    Department / Team
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Finance, Engineering"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-[#00A191] text-sm text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {questionnaire.questions.map((q, qIdx) => {
                const selectedId = selectedAnswers[q.id];
                return (
                  <div
                    key={q.id}
                    className="p-6 rounded-3xl bg-slate-900/90 backdrop-blur-md border border-slate-800 shadow-xl space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-xl bg-[#0D1F3C] border border-[#00A191]/40 text-[#00A191] font-mono text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                          Q{qIdx + 1}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white leading-relaxed">
                          {q.questionText}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-slate-400 shrink-0">{q.points || 20} pts</span>
                    </div>

                    {q.imageUrl && (
                      <div className="pl-0 sm:pl-10">
                        <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2.5 flex justify-center">
                          <img
                            src={q.imageUrl}
                            alt={`Question ${qIdx + 1} illustration`}
                            className="max-h-72 w-auto rounded-xl object-contain"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2.5 pl-0 sm:pl-10">
                      {q.options.map((opt, oIdx) => {
                        const isChecked = selectedId === opt.id;
                        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                        return (
                          <label
                            key={opt.id}
                            onClick={() => handleSelectOption(q.id, opt.id)}
                            className={`flex items-center gap-3.5 p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-[#0D1F3C] border-[#00A191] text-white shadow-lg shadow-[#00A191]/15'
                                : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`question_${q.id}`}
                              checked={isChecked}
                              onChange={() => handleSelectOption(q.id, opt.id)}
                              className="sr-only"
                            />
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-black shrink-0 ${
                                isChecked
                                  ? 'bg-[#00A191] text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {letters[oIdx] || oIdx + 1}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold leading-snug flex-1">
                              {opt.text}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit Bar */}
            <div className="p-6 rounded-3xl bg-[#0D1F3C]/90 backdrop-blur-md border-2 border-[#00A191]/40 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">
              <div className="text-xs text-slate-300">
                <strong className="text-white block text-sm">Ready to submit your response?</strong>
                You have answered <span className="text-[#00A191] font-bold">{answeredCount}</span> of{' '}
                <span className="font-bold text-white">{totalCount}</span> questions.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-[#F05A28] via-[#e45120] to-[#00A191] hover:brightness-110 text-white shadow-xl shadow-[#F05A28]/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Answers...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Security Questionnaire</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
