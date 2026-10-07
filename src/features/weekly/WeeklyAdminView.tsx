import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/auth/authContext';
import { Quiz, Question } from '../../types';
import {
  WeeklyQuestionnaire,
  WeeklyQuestion,
  WeeklyQuestionType,
  WeeklyInvitation,
  WeeklySubmission,
  WeeklyEmailTemplate,
} from '../../types/weekly';
import {
  DEFAULT_WEEKLY_EMAIL_TEMPLATE,
  DEFAULT_EMAIL_BACKGROUND_URL,
  generateWeeklyEmailHtml,
  interpolateTemplate,
  buildWeeklyQuestionnaireUrl,
  exportWeeklySubmissionsToCsv,
  EmailTemplateVariables,
} from './emailTemplateBuilder';
import { processUploadedQuestionImage } from '../../lib/utils/imageUpload';
import {
  Mail,
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  Eye,
  Send,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Code2,
  LayoutTemplate,
  Download,
  ExternalLink,
  Search,
  X,
  Loader2,
  ShieldCheck,
  XCircle,
  RotateCcw,
  FolderInput,
  ImagePlus,
} from 'lucide-react';

type SubTab = 'dashboard' | 'campaigns' | 'email-template' | 'recipients';

export const WeeklyAdminView: React.FC = () => {
  const { user, writeAuditEntry } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const [questionnaires, setQuestionnaires] = useState<WeeklyQuestionnaire[]>([]);
  const [selectedQ, setSelectedQ] = useState<WeeklyQuestionnaire | null>(null);
  const [invitations, setInvitations] = useState<WeeklyInvitation[]>([]);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<WeeklySubmission[]>([]);
  const [existingQuizzes, setExistingQuizzes] = useState<Quiz[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Dashboard filters
  const [searchTerm, setSearchTerm] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('ALL');
  const [inspectingSubmission, setInspectingSubmission] = useState<WeeklySubmission | null>(null);

  // Campaign create/edit modal state
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    id: '',
    title: '',
    weekLabel: 'Week 1 • Security Awareness',
    description:
      'Weekly employee cybersecurity awareness check covering phishing detection, credential hygiene, and incident reporting.',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    passingScorePercent: 80,
    status: 'ACTIVE' as 'ACTIVE' | 'CLOSED',
    importQuizId: '',
  });

  // Question editor modal state
  const [editingQuestion, setEditingQuestion] = useState<WeeklyQuestion | null>(null);
  const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
  const [questionImageError, setQuestionImageError] = useState<string | null>(null);
  const weeklyImageInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleWeeklyQuestionImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingQuestion) return;
    try {
      setUploadingQuestionImage(true);
      setQuestionImageError(null);
      const dataUrl = await processUploadedQuestionImage(file);
      setEditingQuestion((prev) => (prev ? { ...prev, imageUrl: dataUrl } : null));
    } catch (err: any) {
      setQuestionImageError(err?.message || 'Failed to upload image.');
    } finally {
      setUploadingQuestionImage(false);
      if (weeklyImageInputRef.current) {
        weeklyImageInputRef.current.value = '';
      }
    }
  };

  // Recipient form state
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientDept, setRecipientDept] = useState('');
  const [bulkRecipientsText, setBulkRecipientsText] = useState('');
  const [selectedInviteForPreview, setSelectedInviteForPreview] = useState<WeeklyInvitation | null>(null);

  // Email template editor state
  const [templateMode, setTemplateMode] = useState<'visual' | 'html'>('visual');
  const [emailTemplateForm, setEmailTemplateForm] = useState<WeeklyEmailTemplate>(
    DEFAULT_WEEKLY_EMAIL_TEMPLATE
  );
  const [rawHtmlCode, setRawHtmlCode] = useState<string>('');
  const [uploadingEmailBg, setUploadingEmailBg] = useState(false);
  const emailBgInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleEmailBgFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingEmailBg(true);
      const dataUrl = await processUploadedQuestionImage(file, 1280, 720, 0.85);
      setEmailTemplateForm((prev) => ({
        ...prev,
        backgroundImageUrl: dataUrl,
        customHtmlOverride: null,
      }));
    } catch (err) {
      console.error('Error uploading email background:', err);
    } finally {
      setUploadingEmailBg(false);
      if (emailBgInputRef.current) {
        emailBgInputRef.current.value = '';
      }
    }
  };

  const triggerCopyFeedback = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Load all weekly questionnaires + all submissions across campaigns
  const fetchAllWeeklyData = async () => {
    try {
      setLoading(true);
      const qSnap = await getDocs(collection(db, 'weeklyQuestionnaires'));
      const qList = qSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WeeklyQuestionnaire))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      setQuestionnaires(qList);

      // Load existing live quizzes for optional question import
      const quizzesSnap = await getDocs(collection(db, 'quizzes'));
      setExistingQuizzes(quizzesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Quiz)));

      // Gather all submissions across all questionnaires for the unified dashboard
      const combinedSubs: WeeklySubmission[] = [];
      for (const wq of qList) {
        const subSnap = await getDocs(
          collection(db, `weeklyQuestionnaires/${wq.id}/submissions`)
        );
        subSnap.docs.forEach((sd) => {
          combinedSubs.push({ id: sd.id, ...sd.data() } as WeeklySubmission);
        });
      }
      combinedSubs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setAllSubmissions(combinedSubs);

      if (qList.length > 0) {
        const active = selectedQ ? qList.find((x) => x.id === selectedQ.id) || qList[0] : qList[0];
        await selectQuestionnaire(active);
      } else {
        setSelectedQ(null);
        setInvitations([]);
        setSubmissions([]);
      }
    } catch (err) {
      console.error('Error loading weekly questionnaires:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectQuestionnaire = async (wq: WeeklyQuestionnaire) => {
    setSelectedQ(wq);
    const tpl: WeeklyEmailTemplate = {
      ...DEFAULT_WEEKLY_EMAIL_TEMPLATE,
      ...(wq.emailTemplate || {}),
      backgroundImageUrl:
        wq.emailTemplate?.backgroundImageUrl || DEFAULT_EMAIL_BACKGROUND_URL,
    };
    setEmailTemplateForm(tpl);

    const invSnap = await getDocs(
      collection(db, `weeklyQuestionnaires/${wq.id}/invitations`)
    );
    const invList = invSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as WeeklyInvitation))
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    setInvitations(invList);
    setSelectedInviteForPreview(invList[0] || null);

    const subSnap = await getDocs(
      collection(db, `weeklyQuestionnaires/${wq.id}/submissions`)
    );
    const subList = subSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as WeeklySubmission))
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    setSubmissions(subList);

    const vars = getPreviewVariables(wq, invList[0] || null);
    const cleanedOverride = tpl.customHtmlOverride
      ? tpl.customHtmlOverride.replace(
          /<p[^>]*>\s*Or copy and paste this direct link into your browser:[\s\S]*?<\/p>/gi,
          ''
        )
      : null;
    setRawHtmlCode(
      cleanedOverride || generateWeeklyEmailHtml({ ...tpl, customHtmlOverride: null }, vars)
    );
  };

  useEffect(() => {
    fetchAllWeeklyData();
  }, []);

  const getPreviewVariables = (
    wq: WeeklyQuestionnaire | null = selectedQ,
    inv: WeeklyInvitation | null = selectedInviteForPreview
  ): EmailTemplateVariables => {
    const qId = wq?.id || 'demo';
    const link = buildWeeklyQuestionnaireUrl(qId, inv?.token);
    return {
      recipient_name: inv?.recipientName || 'Alex Rivera',
      recipient_email: inv?.recipientEmail || 'alex.rivera@company.com',
      department: inv?.department || 'Security Operations',
      questionnaire_title: wq?.title || 'Weekly Security Awareness Assessment',
      week_label: wq?.weekLabel || 'Week 1 • Oct 2026',
      due_date: wq?.dueDate || 'Friday, 5:00 PM',
      questionnaire_link: link,
      question_count: String(wq?.questions?.length || 5),
      passing_score: String(wq?.passingScorePercent || 80),
    };
  };

  // Create or update a Weekly Questionnaire Campaign
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !campaignForm.title.trim()) return;

    try {
      setSaving(true);
      const nowIso = new Date().toISOString();

      if (campaignForm.id) {
        // Update existing campaign metadata
        const ref = doc(db, 'weeklyQuestionnaires', campaignForm.id);
        await updateDoc(ref, {
          title: campaignForm.title.trim(),
          weekLabel: campaignForm.weekLabel.trim(),
          description: campaignForm.description.trim(),
          dueDate: campaignForm.dueDate,
          passingScorePercent: Number(campaignForm.passingScorePercent) || 80,
          status: campaignForm.status,
          updatedAt: nowIso,
        });
        await writeAuditEntry('WEEKLY_CAMPAIGN_UPDATED', 'weeklyQuestionnaires', campaignForm.id);
      } else {
        // Optionally import questions from an existing Quiz, otherwise start empty
        let initialQuestions: WeeklyQuestion[] = [];
        if (campaignForm.importQuizId) {
          const qSnap = await getDocs(
            query(
              collection(db, `quizzes/${campaignForm.importQuizId}/questions`),
              orderBy('sortOrder', 'asc')
            )
          );
          if (!qSnap.empty) {
            initialQuestions = qSnap.docs.map((d) => {
              const q = d.data() as Question;
              return {
                id: d.id,
                questionType: q.questionType,
                questionText: q.questionText,
                imageUrl: q.imageUrl || null,
                explanation: q.explanation || '',
                points: 20,
                options: q.options.map((o) => ({ id: o.id, text: o.text })),
                correctOptionId: q.correctOptionId,
              };
            });
          }
        }

        const ref = doc(collection(db, 'weeklyQuestionnaires'));
        await setDoc(ref, {
          title: campaignForm.title.trim(),
          weekLabel: campaignForm.weekLabel.trim(),
          description: campaignForm.description.trim(),
          dueDate: campaignForm.dueDate,
          passingScorePercent: Number(campaignForm.passingScorePercent) || 80,
          status: campaignForm.status,
          questions: initialQuestions,
          emailTemplate: DEFAULT_WEEKLY_EMAIL_TEMPLATE,
          createdBy: user.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await writeAuditEntry('WEEKLY_CAMPAIGN_CREATED', 'weeklyQuestionnaires', ref.id, {
          title: campaignForm.title.trim(),
        });
      }

      setIsCampaignModalOpen(false);
      await fetchAllWeeklyData();
    } catch (err) {
      console.error('Error saving weekly campaign:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (qId: string) => {
    try {
      setSaving(true);
      await deleteDoc(doc(db, 'weeklyQuestionnaires', qId));
      await writeAuditEntry('WEEKLY_CAMPAIGN_DELETED', 'weeklyQuestionnaires', qId);
      await fetchAllWeeklyData();
    } catch (err) {
      console.error('Error deleting weekly campaign:', err);
    } finally {
      setSaving(false);
    }
  };

  // Save question inside selectedQ
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQ || !editingQuestion || !editingQuestion.questionText.trim()) return;

    try {
      setSaving(true);
      const existingList = [...(selectedQ.questions || [])];
      const idx = existingList.findIndex((x) => x.id === editingQuestion.id);
      if (idx >= 0) {
        existingList[idx] = editingQuestion;
      } else {
        existingList.push({
          ...editingQuestion,
          id: `wq_${Date.now()}`,
        });
      }

      await updateDoc(doc(db, 'weeklyQuestionnaires', selectedQ.id), {
        questions: existingList,
        updatedAt: new Date().toISOString(),
      });

      const updated = { ...selectedQ, questions: existingList };
      setSelectedQ(updated);
      setQuestionnaires((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingQuestion(null);
    } catch (err) {
      console.error('Error saving question:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selectedQ) return;
    try {
      setSaving(true);
      const nextList = selectedQ.questions.filter((q) => q.id !== questionId);
      await updateDoc(doc(db, 'weeklyQuestionnaires', selectedQ.id), {
        questions: nextList,
        updatedAt: new Date().toISOString(),
      });
      const updated = { ...selectedQ, questions: nextList };
      setSelectedQ(updated);
      setQuestionnaires((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error('Error deleting question:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add single recipient invitation
  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQ || !recipientEmail.trim()) return;

    try {
      setSaving(true);
      const cleanEmail = recipientEmail.trim().toLowerCase();
      const cleanName = recipientName.trim() || cleanEmail.split('@')[0];
      const cleanDept = recipientDept.trim() || 'General';
      const token = `wk_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;

      const invRef = doc(collection(db, `weeklyQuestionnaires/${selectedQ.id}/invitations`));
      const newInv: Omit<WeeklyInvitation, 'id'> = {
        questionnaireId: selectedQ.id,
        recipientEmail: cleanEmail,
        recipientName: cleanName,
        department: cleanDept,
        token,
        status: 'PENDING',
        sentAt: new Date().toISOString(),
        completedAt: null,
      };
      await setDoc(invRef, newInv);

      setRecipientName('');
      setRecipientEmail('');
      setRecipientDept('');
      await selectQuestionnaire(selectedQ);
    } catch (err) {
      console.error('Error adding recipient:', err);
    } finally {
      setSaving(false);
    }
  };

  // Bulk add recipients (one per line: email, name, department)
  const handleBulkAddRecipients = async () => {
    if (!selectedQ || !bulkRecipientsText.trim()) return;
    const lines = bulkRecipientsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    try {
      setSaving(true);
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        const emailPart = parts[0]?.toLowerCase();
        if (!emailPart || !emailPart.includes('@')) continue;
        const namePart = parts[1] || emailPart.split('@')[0];
        const deptPart = parts[2] || 'General';
        const token = `wk_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;

        const invRef = doc(collection(db, `weeklyQuestionnaires/${selectedQ.id}/invitations`));
        await setDoc(invRef, {
          questionnaireId: selectedQ.id,
          recipientEmail: emailPart,
          recipientName: namePart,
          department: deptPart,
          token,
          status: 'PENDING',
          sentAt: new Date().toISOString(),
          completedAt: null,
        });
      }
      setBulkRecipientsText('');
      await selectQuestionnaire(selectedQ);
    } catch (err) {
      console.error('Error bulk adding recipients:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInvitation = async (inviteId: string) => {
    if (!selectedQ) return;
    try {
      await deleteDoc(doc(db, `weeklyQuestionnaires/${selectedQ.id}/invitations`, inviteId));
      await selectQuestionnaire(selectedQ);
    } catch (err) {
      console.error('Error deleting invitation:', err);
    }
  };

  // Save editable HTML email template
  const handleSaveEmailTemplate = async () => {
    if (!selectedQ) return;
    try {
      setSaving(true);
      const updatedTemplate: WeeklyEmailTemplate = {
        ...emailTemplateForm,
        customHtmlOverride: templateMode === 'html' ? rawHtmlCode : null,
      };
      await updateDoc(doc(db, 'weeklyQuestionnaires', selectedQ.id), {
        emailTemplate: updatedTemplate,
        updatedAt: new Date().toISOString(),
      });
      const updatedQ = { ...selectedQ, emailTemplate: updatedTemplate };
      setSelectedQ(updatedQ);
      setQuestionnaires((prev) => prev.map((q) => (q.id === updatedQ.id ? updatedQ : q)));
      triggerCopyFeedback('saved-template');
    } catch (err) {
      console.error('Error saving email template:', err);
    } finally {
      setSaving(false);
    }
  };

  // Computed current HTML email output
  const currentPreviewVars = getPreviewVariables(selectedQ, selectedInviteForPreview);
  const currentEmailHtml =
    templateMode === 'html' && rawHtmlCode.trim().length > 0
      ? interpolateTemplate(rawHtmlCode, currentPreviewVars)
      : generateWeeklyEmailHtml(
          { ...emailTemplateForm, customHtmlOverride: null },
          currentPreviewVars
        );
  const currentEmailSubject = interpolateTemplate(
    emailTemplateForm.subject,
    currentPreviewVars
  );

  // Copy rich HTML so user can paste formatted email directly into Gmail/Outlook compose window
  const handleCopyRenderedEmail = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined') {
        const htmlBlob = new Blob([currentEmailHtml], { type: 'text/html' });
        const textBlob = new Blob(
          [
            `${currentEmailSubject}\n\nComplete the Weekly Security Awareness Questionnaire here:\n${currentPreviewVars.questionnaire_link}`,
          ],
          { type: 'text/plain' }
        );
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(currentEmailHtml);
      }
      triggerCopyFeedback('rendered-email');
    } catch {
      await navigator.clipboard.writeText(currentEmailHtml);
      triggerCopyFeedback('rendered-email');
    }
  };

  const handleCopyHtmlSource = async () => {
    await navigator.clipboard.writeText(currentEmailHtml);
    triggerCopyFeedback('html-source');
  };

  const handleDownloadHtmlTemplate = () => {
    const blob = new Blob([currentEmailHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CYBER_ARENA_Weekly_Questionnaire_Email_Template.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Filtered submissions for the unified dashboard
  const displayedSubmissions = allSubmissions.filter((s) => {
    if (campaignFilter !== 'ALL' && s.questionnaireId !== campaignFilter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.recipientName?.toLowerCase().includes(term) ||
      s.recipientEmail?.toLowerCase().includes(term) ||
      s.department?.toLowerCase().includes(term) ||
      s.questionnaireTitle?.toLowerCase().includes(term) ||
      s.weekLabel?.toLowerCase().includes(term)
    );
  });

  const avgAccuracy =
    displayedSubmissions.length > 0
      ? Math.round(
          displayedSubmissions.reduce((acc, s) => acc + (s.accuracy || 0), 0) /
            displayedSubmissions.length
        )
      : 0;
  const passCount = displayedSubmissions.filter((s) => s.passed).length;
  const passRate =
    displayedSubmissions.length > 0
      ? Math.round((passCount / displayedSubmissions.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#0D1F3C] border border-[#00A191]/30 shadow-xl">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#00A191] block mb-0.5">
            EMPLOYEE CYBERSECURITY COMPLIANCE MODULE
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            Weekly Security Awareness Questionnaires
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Create weekly security questionnaires, customize the HTML email template, dispatch user links, and export all logged responses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setCampaignForm({
                id: '',
                title: '',
                weekLabel: `Week ${questionnaires.length + 1} • Security Awareness`,
                description:
                  'Weekly employee security awareness check covering phishing detection, MFA, and safe security practices.',
                dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                passingScorePercent: 80,
                status: 'ACTIVE',
                importQuizId: '',
              });
              setIsCampaignModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#00A191] hover:bg-[#00bda9] text-white shadow-lg shadow-[#00A191]/30 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Weekly Questionnaire</span>
          </button>
        </div>
      </div>

      {/* Module Sub-Tabs + Active Campaign Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSubTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'dashboard'
                ? 'bg-[#00A191] text-white shadow-md shadow-[#00A191]/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Results Dashboard & CSV ({allSubmissions.length})</span>
          </button>

          <button
            onClick={() => setSubTab('campaigns')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'campaigns'
                ? 'bg-[#00A191] text-white shadow-md shadow-[#00A191]/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Questionnaires & Questions ({questionnaires.length})</span>
          </button>

          <button
            onClick={() => setSubTab('email-template')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'email-template'
                ? 'bg-[#F05A28] text-white shadow-md shadow-[#F05A28]/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Editable HTML Email Template</span>
          </button>

          <button
            onClick={() => setSubTab('recipients')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'recipients'
                ? 'bg-[#00A191] text-white shadow-md shadow-[#00A191]/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Invitations & Links ({invitations.length})</span>
          </button>
        </div>

        {questionnaires.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">Active Campaign:</span>
            <select
              value={selectedQ?.id || ''}
              onChange={(e) => {
                const found = questionnaires.find((x) => x.id === e.target.value);
                if (found) selectQuestionnaire(found);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white outline-none focus:border-[#00A191]"
            >
              {questionnaires.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.weekLabel} — {q.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: UNIFIED SUBMISSIONS DASHBOARD & CSV DOWNLOAD */}
      {subTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Weekly Campaigns
              </span>
              <p className="text-3xl font-mono font-black text-white mt-1">
                {questionnaires.length}
              </p>
              <span className="text-[11px] text-slate-500">Active & archived weeks</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Logged Responses
              </span>
              <p className="text-3xl font-mono font-black text-[#00A191] mt-1">
                {displayedSubmissions.length}
              </p>
              <span className="text-[11px] text-slate-500">Completed employee submissions</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Average Accuracy
              </span>
              <p className="text-3xl font-mono font-black text-amber-400 mt-1">
                {avgAccuracy}%
              </p>
              <span className="text-[11px] text-slate-500">Across logged responses</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Compliance Pass Rate
              </span>
              <p className="text-3xl font-mono font-black text-emerald-400 mt-1">
                {passRate}%
              </p>
              <span className="text-[11px] text-slate-500">{passCount} passed threshold</span>
            </div>
          </div>

          {/* Filter & Export Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search user name, email, department..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                />
              </div>

              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 outline-none"
              >
                <option value="ALL">All Weekly Questionnaires</option>
                {questionnaires.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.weekLabel}: {q.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {selectedQ && (
                <a
                  href={buildWeeklyQuestionnaireUrl(selectedQ.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#00A191]" />
                  <span>Open User Questionnaire View</span>
                </a>
              )}

              <button
                onClick={() => {
                  const targetQ =
                    campaignFilter === 'ALL'
                      ? null
                      : questionnaires.find((x) => x.id === campaignFilter) || null;
                  exportWeeklySubmissionsToCsv(targetQ, displayedSubmissions);
                }}
                disabled={displayedSubmissions.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 cursor-pointer transition-all disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>Download Results (CSV)</span>
              </button>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-base text-white">
                Logged User Questionnaire Responses ({displayedSubmissions.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-10 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <span className="text-xs">Loading weekly responses...</span>
              </div>
            ) : displayedSubmissions.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm font-bold text-slate-300">No questionnaire responses logged yet.</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Create a Weekly Questionnaire, customize the HTML email template or copy the user link, and when users submit their answers they will appear here in real time.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
                    <th className="pb-3 px-2">Employee</th>
                    <th className="pb-3 px-2">Department</th>
                    <th className="pb-3 px-2">Week / Campaign</th>
                    <th className="pb-3 px-2 text-right">Score</th>
                    <th className="pb-3 px-2 text-right">Accuracy</th>
                    <th className="pb-3 px-2 text-center">Status</th>
                    <th className="pb-3 px-2">Submitted At</th>
                    <th className="pb-3 px-2 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayedSubmissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-2">
                        <div className="font-bold text-white">{sub.recipientName}</div>
                        {sub.recipientEmail && (
                          <div className="text-xs text-slate-400 font-mono">{sub.recipientEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-slate-300">{sub.department || 'General'}</td>
                      <td className="py-3 px-2">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#0D1F3C] text-[#00A191] border border-[#00A191]/30">
                          {sub.weekLabel}
                        </span>
                        <div className="text-xs text-slate-300 font-medium mt-0.5 truncate max-w-[200px]">
                          {sub.questionnaireTitle}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-amber-300">
                        {sub.score} / {sub.maxScore}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-white">
                        {sub.accuracy}% ({sub.correctCount}/{sub.totalQuestions})
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sub.passed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {sub.passed ? 'PASSED' : 'NEEDS REVIEW'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                        {new Date(sub.submittedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => setInspectingSubmission(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-[#00A191] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Answers</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: QUESTIONNAIRES & QUESTIONS BUILDER */}
      {subTab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Campaigns List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Weekly Campaigns ({questionnaires.length})
            </div>

            {questionnaires.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                <p className="text-sm font-bold text-white">No Weekly Questionnaires Yet</p>
                <p className="text-xs text-slate-400">
                  Click "New Weekly Questionnaire" above to create a campaign and add your questions.
                </p>
              </div>
            ) : (
              questionnaires.map((wq) => {
                const isSelected = selectedQ?.id === wq.id;
                return (
                  <div
                    key={wq.id}
                    onClick={() => selectQuestionnaire(wq)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-[#00A191] shadow-lg shadow-[#00A191]/15'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#0D1F3C] text-[#00A191] border border-[#00A191]/30">
                        {wq.weekLabel}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          wq.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {wq.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-base">{wq.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 mb-3">{wq.description}</p>

                    <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800/80">
                      <span className="text-slate-400">
                        {wq.questions?.length || 0} Questions • Pass: {wq.passingScorePercent || 80}%
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            const url = buildWeeklyQuestionnaireUrl(wq.id);
                            navigator.clipboard.writeText(url);
                            triggerCopyFeedback(`link_${wq.id}`);
                          }}
                          title="Copy Shareable Questionnaire Link"
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `link_${wq.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-[#00A191]" /> Copy Link
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setCampaignForm({
                              id: wq.id,
                              title: wq.title,
                              weekLabel: wq.weekLabel,
                              description: wq.description,
                              dueDate: wq.dueDate,
                              passingScorePercent: wq.passingScorePercent || 80,
                              status: wq.status,
                              importQuizId: '',
                            });
                            setIsCampaignModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                          title="Edit Campaign"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteCampaign(wq.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                          title="Delete Campaign"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Questions in Selected Campaign (7 cols) */}
          <div className="lg:col-span-7">
            {selectedQ ? (
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[#00A191]">
                      {selectedQ.weekLabel}
                    </span>
                    <h3 className="text-lg font-black text-white">{selectedQ.title}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSubTab('email-template')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F05A28]/20 hover:bg-[#F05A28]/30 text-[#F05A28] border border-[#F05A28]/30 text-xs font-bold cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Edit Email Template</span>
                    </button>

                    <button
                      onClick={() =>
                        setEditingQuestion({
                          id: '',
                          questionType: 'MULTIPLE_CHOICE',
                          questionText: '',
                          explanation: '',
                          points: 20,
                          options: [
                            { id: 'opt_1', text: '' },
                            { id: 'opt_2', text: '' },
                            { id: 'opt_3', text: '' },
                            { id: 'opt_4', text: '' },
                          ],
                          correctOptionId: 'opt_1',
                        })
                      }
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-white text-xs font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>

                {/* Questions List */}
                <div className="space-y-3">
                  {(selectedQ.questions || []).map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#0D1F3C] text-[#00A191] font-mono text-xs font-black">
                            Q{idx + 1}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                            {q.questionType === 'TRUE_FALSE'
                              ? 'True / False'
                              : q.questionType === 'MULTIPLE_CHOICE_2' || q.options.length === 2
                              ? 'Multiple Choice (2 Option)'
                              : 'Multiple Choice (4 Option)'}
                          </span>
                          <span className="text-xs font-bold text-white">{q.questionText}</span>
                        </div>
                        {q.imageUrl && (
                          <div className="pl-2 pt-1">
                            <img
                              src={q.imageUrl}
                              alt="Question attachment"
                              className="h-16 w-auto max-w-[180px] rounded-xl object-cover border border-slate-700"
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-2">
                          {q.options.map((o) => (
                            <div
                              key={o.id}
                              className={`text-xs px-2.5 py-1 rounded-lg border ${
                                o.id === q.correctOptionId
                                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 font-bold'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-400'
                              }`}
                            >
                              {o.id === q.correctOptionId ? '✓ ' : '• '}
                              {o.text}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditingQuestion(q)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#00A191] hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: EDITABLE HTML EMAIL TEMPLATE STUDIO */}
      {subTab === 'email-template' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Template Editor Controls (6 cols) */}
          <div className="lg:col-span-6 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-black text-white">Editable HTML Email Template</h3>
                <p className="text-xs text-slate-400">
                  Customize the security awareness invitation email with dynamic placeholders.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setTemplateMode('visual')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    templateMode === 'visual'
                      ? 'bg-[#00A191] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  <span>Guided Fields</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!rawHtmlCode.trim()) {
                      setRawHtmlCode(
                        generateWeeklyEmailHtml(
                          { ...emailTemplateForm, customHtmlOverride: null },
                          currentPreviewVars
                        )
                      );
                    }
                    setTemplateMode('html');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    templateMode === 'html'
                      ? 'bg-[#F05A28] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Raw HTML Editor</span>
                </button>
              </div>
            </div>

            {/* Supported Variables Reference Pill Bar */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-bold text-slate-300">Available Placeholders (Click to insert or type):</div>
              <div className="flex flex-wrap gap-1.5 pt-1 font-mono">
                {[
                  '{{recipient_name}}',
                  '{{recipient_email}}',
                  '{{department}}',
                  '{{questionnaire_title}}',
                  '{{week_label}}',
                  '{{due_date}}',
                  '{{questionnaire_link}}',
                ].map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ph);
                      triggerCopyFeedback(ph);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[#00A191] border border-slate-800 cursor-pointer"
                  >
                    {copiedKey === ph ? 'Copied!' : ph}
                  </button>
                ))}
              </div>
            </div>

            {templateMode === 'visual' ? (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Email Subject Line
                  </label>
                  <input
                    type="text"
                    value={emailTemplateForm.subject}
                    onChange={(e) =>
                      setEmailTemplateForm({ ...emailTemplateForm, subject: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      Top Banner Subtitle
                    </label>
                    <input
                      type="text"
                      value={emailTemplateForm.bannerSubtitle}
                      onChange={(e) =>
                        setEmailTemplateForm({
                          ...emailTemplateForm,
                          bannerSubtitle: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      Heading
                    </label>
                    <input
                      type="text"
                      value={emailTemplateForm.heading}
                      onChange={(e) =>
                        setEmailTemplateForm({ ...emailTemplateForm, heading: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      Greeting
                    </label>
                    <input
                      type="text"
                      value={emailTemplateForm.greeting}
                      onChange={(e) =>
                        setEmailTemplateForm({ ...emailTemplateForm, greeting: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                      CTA Button Label
                    </label>
                    <input
                      type="text"
                      value={emailTemplateForm.ctaButtonText}
                      onChange={(e) =>
                        setEmailTemplateForm({
                          ...emailTemplateForm,
                          ctaButtonText: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Main Message Paragraph
                  </label>
                  <textarea
                    rows={3}
                    value={emailTemplateForm.introParagraph}
                    onChange={(e) =>
                      setEmailTemplateForm({
                        ...emailTemplateForm,
                        introParagraph: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Security Tip Callout Box
                  </label>
                  <textarea
                    rows={2}
                    value={emailTemplateForm.securityTipBox}
                    onChange={(e) =>
                      setEmailTemplateForm({
                        ...emailTemplateForm,
                        securityTipBox: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Footer Text
                  </label>
                  <input
                    type="text"
                    value={emailTemplateForm.footerText}
                    onChange={(e) =>
                      setEmailTemplateForm({ ...emailTemplateForm, footerText: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                  />
                </div>

                {/* Email Background Image Selector */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="block text-xs font-bold uppercase text-slate-300">
                        Rendered Email Background Theme
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Default: CSAM 2026 Overall Theme (Hexagonal Cyber Mesh)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        ref={emailBgInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleEmailBgFileSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => emailBgInputRef.current?.click()}
                        disabled={uploadingEmailBg}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D1F3C] hover:bg-[#162f59] text-[#00A191] border border-[#00A191]/40 text-xs font-bold cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>{uploadingEmailBg ? 'Uploading...' : 'Upload Custom Background'}</span>
                      </button>

                      {emailTemplateForm.backgroundImageUrl &&
                        emailTemplateForm.backgroundImageUrl !== DEFAULT_EMAIL_BACKGROUND_URL && (
                          <button
                            type="button"
                            onClick={() =>
                              setEmailTemplateForm({
                                ...emailTemplateForm,
                                backgroundImageUrl: DEFAULT_EMAIL_BACKGROUND_URL,
                                customHtmlOverride: null,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset to CSAM 2026 Theme</span>
                          </button>
                        )}
                    </div>
                  </div>

                  <div className="h-20 w-full rounded-xl overflow-hidden border border-slate-800 relative">
                    <img
                      src={emailTemplateForm.backgroundImageUrl || DEFAULT_EMAIL_BACKGROUND_URL}
                      alt="CSAM 2026 Email Background Theme"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1.5 right-2 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] font-bold text-[#00A191] border border-[#00A191]/30">
                      Active Email Background
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Raw HTML Code Editor */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-slate-400">
                    Editable Raw HTML Email Source
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setRawHtmlCode(
                        generateWeeklyEmailHtml(
                          { ...emailTemplateForm, customHtmlOverride: null },
                          currentPreviewVars
                        )
                      )
                    }
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset HTML from Guided Fields</span>
                  </button>
                </div>
                <textarea
                  rows={16}
                  value={rawHtmlCode}
                  onChange={(e) => setRawHtmlCode(e.target.value)}
                  spellCheck={false}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 font-mono text-xs text-emerald-300 outline-none focus:border-[#F05A28]"
                />
              </div>
            )}

            {/* Save & Export Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSaveEmailTemplate}
                disabled={saving || !selectedQ}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-white text-xs font-bold cursor-pointer shadow-lg shadow-[#00A191]/25"
              >
                {copiedKey === 'saved-template' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Template Saved!</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Template</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyRenderedEmail}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F05A28] hover:bg-[#ff6c3b] text-white text-xs font-bold cursor-pointer shadow-lg shadow-[#F05A28]/25"
              >
                {copiedKey === 'rendered-email' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied Rendered Email!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Rendered Email (Paste in Mail)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyHtmlSource}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                {copiedKey === 'html-source' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>HTML Copied!</span>
                  </>
                ) : (
                  <>
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    <span>Copy HTML Code</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadHtmlTemplate}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download .HTML</span>
              </button>
            </div>
          </div>

          {/* Right: Live Rendered HTML Email Preview (6 cols) */}
          <div className="lg:col-span-6 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#00A191] block">
                  LIVE HTML EMAIL PREVIEW
                </span>
                <h4 className="text-sm font-bold text-white truncate max-w-md">
                  Subject: {currentEmailSubject}
                </h4>
              </div>

              {invitations.length > 0 && (
                <select
                  value={selectedInviteForPreview?.id || ''}
                  onChange={(e) => {
                    const inv = invitations.find((x) => x.id === e.target.value) || null;
                    setSelectedInviteForPreview(inv);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 outline-none"
                >
                  {invitations.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      Preview as: {inv.recipientName} ({inv.recipientEmail})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800 bg-[#070d19] min-h-[540px]">
              <iframe
                title="Weekly Security Awareness Email Preview"
                srcDoc={currentEmailHtml}
                className="w-full h-[560px] border-0"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: USER INVITATIONS & PERSONALIZED LINKS */}
      {subTab === 'recipients' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Add Recipient / Bulk Import (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-base font-black text-white">Add Employee Recipient</h3>
              <form onSubmit={handleAddRecipient} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="employee@company.com"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={recipientDept}
                    onChange={(e) => setRecipientDept(e.target.value)}
                    placeholder="Engineering / Finance / HR"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || !selectedQ}
                  className="w-full py-2.5 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-white font-bold text-xs cursor-pointer shadow-lg shadow-[#00A191]/25"
                >
                  Generate Personalized Invite Link
                </button>
              </form>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
              <h3 className="text-base font-black text-white">Bulk Add Recipients (CSV Lines)</h3>
              <p className="text-xs text-slate-400">
                Paste one recipient per line: <code className="text-[#00A191]">email, Full Name, Department</code>
              </p>
              <textarea
                rows={4}
                value={bulkRecipientsText}
                onChange={(e) => setBulkRecipientsText(e.target.value)}
                placeholder={`alice@company.com, Alice Tan, Finance\nbob@company.com, Bob Cruz, IT Security`}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xs text-white outline-none focus:border-[#00A191]"
              />
              <button
                type="button"
                onClick={handleBulkAddRecipients}
                disabled={saving || !selectedQ || !bulkRecipientsText.trim()}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Import Recipients List
              </button>
            </div>
          </div>

          {/* Right: Invitations List (7 cols) */}
          <div className="lg:col-span-7 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white">
                  Recipient Invitations ({invitations.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Copy a user’s personalized HTML email or direct questionnaire link.
                </p>
              </div>

              {selectedQ && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(buildWeeklyQuestionnaireUrl(selectedQ.id));
                    triggerCopyFeedback('general-link');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D1F3C] border border-[#00A191]/40 text-[#00A191] text-xs font-bold cursor-pointer"
                >
                  {copiedKey === 'general-link' ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> General Link Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy General Campaign Link
                    </>
                  )}
                </button>
              )}
            </div>

            {invitations.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No individual invitations added for this campaign yet. Add recipients on the left or share the general campaign link.
              </div>
            ) : (
              <div className="space-y-2.5">
                {invitations.map((inv) => {
                  const personalUrl = buildWeeklyQuestionnaireUrl(inv.questionnaireId, inv.token);
                  return (
                    <div
                      key={inv.id}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{inv.recipientName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {inv.department}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              inv.status === 'COMPLETED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{inv.recipientEmail}</div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(personalUrl);
                            triggerCopyFeedback(`inv_link_${inv.id}`);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `inv_link_${inv.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Link Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#00A191]" /> Copy Link
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedInviteForPreview(inv);
                            setSubTab('email-template');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#F05A28]/20 hover:bg-[#F05A28]/30 text-[#F05A28] border border-[#F05A28]/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email Template</span>
                        </button>

                        <button
                          onClick={() => handleDeleteInvitation(inv.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT WEEKLY CAMPAIGN */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border-2 border-[#00A191]/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-black text-lg text-white">
                {campaignForm.id ? 'Edit Weekly Questionnaire' : 'Create Weekly Questionnaire'}
              </h3>
              <button
                onClick={() => setIsCampaignModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Week Label *
                  </label>
                  <input
                    type="text"
                    required
                    value={campaignForm.weekLabel}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, weekLabel: e.target.value })
                    }
                    placeholder="e.g. Week 1 • Oct 2026"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={campaignForm.dueDate}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, dueDate: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Questionnaire Title *
                </label>
                <input
                  type="text"
                  required
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                  placeholder="e.g. Phishing & Ransomware Defense Check"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-[#00A191]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Description / Instructions
                </label>
                <textarea
                  rows={3}
                  value={campaignForm.description}
                  onChange={(e) =>
                    setCampaignForm({ ...campaignForm, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Passing Score (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={campaignForm.passingScorePercent}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        passingScorePercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={campaignForm.status}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        status: e.target.value as 'ACTIVE' | 'CLOSED',
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191]"
                  >
                    <option value="ACTIVE">ACTIVE (Accepting Responses)</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              {!campaignForm.id && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Initial Questions Source
                  </label>
                  <select
                    value={campaignForm.importQuizId}
                    onChange={(e) =>
                      setCampaignForm({ ...campaignForm, importQuizId: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191]"
                  >
                    <option value="">Start with Blank Questionnaire (Add Questions Manually)</option>
                    {existingQuizzes.map((qz) => (
                      <option key={qz.id} value={qz.id}>
                        Import from Quiz: {qz.title} ({qz.questionCount || 0} Qs)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCampaignModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-xs font-bold text-white cursor-pointer"
                >
                  {saving ? 'Saving...' : campaignForm.id ? 'Update Campaign' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT QUESTION */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-black text-base text-white">
                {editingQuestion.id ? 'Edit Security Question' : 'Add Security Question'}
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Question Type
                </label>
                <select
                  value={
                    editingQuestion.questionType === 'TRUE_FALSE'
                      ? 'TRUE_FALSE'
                      : editingQuestion.questionType === 'MULTIPLE_CHOICE_2' ||
                        editingQuestion.options.length === 2
                      ? 'MULTIPLE_CHOICE_2'
                      : 'MULTIPLE_CHOICE'
                  }
                  onChange={(e) => {
                    const nextType = e.target.value as WeeklyQuestionType;
                    if (nextType === 'TRUE_FALSE') {
                      setEditingQuestion({
                        ...editingQuestion,
                        questionType: 'TRUE_FALSE',
                        options: [
                          { id: 'opt_true', text: 'True' },
                          { id: 'opt_false', text: 'False' },
                        ],
                        correctOptionId: 'opt_true',
                      });
                    } else if (nextType === 'MULTIPLE_CHOICE_2') {
                      const prevOpts = editingQuestion.options;
                      const isFromTF = editingQuestion.questionType === 'TRUE_FALSE';
                      const opt1Text = !isFromTF && prevOpts[0] ? prevOpts[0].text : '';
                      const opt2Text = !isFromTF && prevOpts[1] ? prevOpts[1].text : '';
                      setEditingQuestion({
                        ...editingQuestion,
                        questionType: 'MULTIPLE_CHOICE_2',
                        options: [
                          { id: 'opt_1', text: opt1Text },
                          { id: 'opt_2', text: opt2Text },
                        ],
                        correctOptionId: 'opt_1',
                      });
                    } else {
                      const prevOpts = editingQuestion.options;
                      const isFromTF = editingQuestion.questionType === 'TRUE_FALSE';
                      setEditingQuestion({
                        ...editingQuestion,
                        questionType: 'MULTIPLE_CHOICE',
                        options: [
                          { id: 'opt_1', text: !isFromTF && prevOpts[0] ? prevOpts[0].text : '' },
                          { id: 'opt_2', text: !isFromTF && prevOpts[1] ? prevOpts[1].text : '' },
                          { id: 'opt_3', text: !isFromTF && prevOpts[2] ? prevOpts[2].text : '' },
                          { id: 'opt_4', text: !isFromTF && prevOpts[3] ? prevOpts[3].text : '' },
                        ],
                        correctOptionId: 'opt_1',
                      });
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-[#00A191]"
                >
                  <option value="MULTIPLE_CHOICE">Multiple Choice (4 Option)</option>
                  <option value="MULTIPLE_CHOICE_2">Multiple Choice (2 Option)</option>
                  <option value="TRUE_FALSE">True / False</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Question Prompt *
                </label>
                <textarea
                  rows={3}
                  required
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-[#00A191]"
                />
              </div>

              {/* Question Image Upload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-400">
                    Question Image (Optional)
                  </label>
                  <input
                    ref={weeklyImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleWeeklyQuestionImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => weeklyImageInputRef.current?.click()}
                    disabled={uploadingQuestionImage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D1F3C] hover:bg-[#162f59] text-[#00A191] border border-[#00A191]/40 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {uploadingQuestionImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>{editingQuestion.imageUrl ? 'Change Image' : 'Upload Image'}</span>
                      </>
                    )}
                  </button>
                </div>

                {questionImageError && (
                  <p className="text-xs text-[#F05A28] font-medium mb-2">{questionImageError}</p>
                )}

                {editingQuestion.imageUrl && (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 flex items-center justify-center">
                    <img
                      src={editingQuestion.imageUrl}
                      alt="Question preview"
                      className="max-h-44 w-auto rounded-xl object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingQuestion({ ...editingQuestion, imageUrl: null })}
                      title="Remove Image"
                      className="absolute top-3 right-3 p-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
                  Options (Select radio for the correct answer)
                </label>
                <div className="space-y-2">
                  {editingQuestion.options.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="weeklyCorrectOpt"
                        checked={editingQuestion.correctOptionId === opt.id}
                        onChange={() =>
                          setEditingQuestion({ ...editingQuestion, correctOptionId: opt.id })
                        }
                        className="w-4 h-4 cursor-pointer"
                      />
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const nextOpts = [...editingQuestion.options];
                          nextOpts[i] = { ...opt, text: e.target.value };
                          setEditingQuestion({ ...editingQuestion, options: nextOpts });
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Security Takeaway / Explanation
                </label>
                <input
                  type="text"
                  value={editingQuestion.explanation || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  placeholder="Shown to the employee after submitting..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#00A191] text-xs font-bold text-white cursor-pointer"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT INDIVIDUAL USER SUBMISSION ANSWERS */}
      {inspectingSubmission && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#00A191]">
                  {inspectingSubmission.weekLabel} • {inspectingSubmission.questionnaireTitle}
                </span>
                <h3 className="text-lg font-black text-white">
                  {inspectingSubmission.recipientName}
                  {inspectingSubmission.recipientEmail ? ` (${inspectingSubmission.recipientEmail})` : ''}
                </h3>
                <p className="text-xs text-slate-400">
                  Department: {inspectingSubmission.department} • Score:{' '}
                  <strong className="text-white">
                    {inspectingSubmission.score}/{inspectingSubmission.maxScore} (
                    {inspectingSubmission.accuracy}%)
                  </strong>
                </p>
              </div>
              <button
                onClick={() => setInspectingSubmission(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {inspectingSubmission.answers?.map((ans, idx) => (
                <div
                  key={ans.questionId || idx}
                  className={`p-4 rounded-2xl border ${
                    ans.isCorrect
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-rose-950/20 border-rose-500/30'
                  } space-y-1.5`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      Q{idx + 1}. {ans.questionText}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        ans.isCorrect
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {ans.isCorrect ? 'CORRECT' : 'INCORRECT'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Selected: <strong>{ans.selectedOptionText}</strong>
                  </p>
                  {!ans.isCorrect && (
                    <p className="text-xs text-emerald-300">
                      Correct Answer: <strong>{ans.correctOptionText}</strong>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
