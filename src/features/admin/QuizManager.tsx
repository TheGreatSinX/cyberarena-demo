import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { useAuth } from '../../lib/auth/authContext';
import { Quiz, Question, QuestionOption, QuizStatus, QuestionType } from '../../types';
import {
  createGameSession,
  generateCryptoPin,
  syncQuizPinSession,
  purgeLegacyMockDataFromDatabase,
  isLegacyMockQuestion,
} from '../../lib/game/gameEngine';
import { processUploadedQuestionImage } from '../../lib/utils/imageUpload';
import { parseVideoSource } from '../../lib/utils/videoUpload';
import {
  sanitizeFileName,
  sanitizeIsoDate,
  sanitizeLiveInput,
  sanitizeNumericCode,
  sanitizePlainText,
  sanitizeSafeUrl,
} from '../../lib/utils/sanitize';
import { VideoPlayer } from '../../components/VideoPlayer';
import QRCode from 'qrcode';
import { withTimeout } from '../../lib/firebase/asyncTimeout';
import { getUserFriendlyErrorMessage } from '../../lib/firebase/errors';
import {
  Plus,
  Play,
  Edit3,
  Trash2,
  Copy,
  Check,
  Eye,
  CheckCircle2,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Clock,
  Award,
  HelpCircle,
  Loader2,
  X,
  FileCheck,
  ImagePlus,
  Film,
  Video,
  KeyRound,
  Calendar,
  RefreshCw,
  QrCode,
  Download,
  Maximize2,
  Link2,
  ExternalLink,
  AlertCircle,
  Cloud,
  HardDrive,
} from 'lucide-react';

interface QuizManagerProps {
  onStartLiveGame: (gameId: string) => void;
  onPreviewQuiz: (quizId: string) => void;
}

export const QuizManager: React.FC<QuizManagerProps> = ({ onStartLiveGame, onPreviewQuiz }) => {
  const { user, writeAuditEntry } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [globalError, setGlobalError] = useState<{
    message: string;
    isQuotaError?: boolean;
    quotaUpgradeUrl?: string;
  } | null>(null);
  const isSavingQuestionRef = React.useRef(false);

  // Active quiz being edited
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Quiz Form Modal
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [quizModalMode, setQuizModalMode] = useState<'create' | 'edit'>('create');
  const [quizToEdit, setQuizToEdit] = useState<Quiz | null>(null);
  const [quizForm, setQuizForm] = useState<{
    title: string;
    description: string;
    category: string;
    status: QuizStatus;
    gamePin: string;
    dueDate: string;
    videoUrl: string | null;
    videoFileName: string | null;
  }>({
    title: '',
    description: '',
    category: 'General',
    status: 'PUBLISHED',
    gamePin: '',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    videoUrl: null,
    videoFileName: null,
  });

  // Inline PIN & Due Date management for selectedQuiz
  const [pinInput, setPinInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [pinSavedSuccess, setPinSavedSuccess] = useState(false);

  // QR Code states for Selected Quiz, Create/Edit Quiz Modal, and Enlarged QR Modal
  const [selectedPinQrUrl, setSelectedPinQrUrl] = useState<string>('');
  const [modalPinQrUrl, setModalPinQrUrl] = useState<string>('');
  const [qrPreviewModal, setQrPreviewModal] = useState<{
    title: string;
    gamePin: string;
    dueDate?: string | null;
    qrDataUrl: string;
  } | null>(null);
  const [copiedJoinLink, setCopiedJoinLink] = useState(false);

  // Generate QR code for selected quiz panel whenever pinInput or selectedQuiz.gamePin changes
  useEffect(() => {
    const activePin = (pinInput || selectedQuiz?.gamePin || '').replace(/\D/g, '').slice(0, 6);
    if (activePin.length !== 6) {
      setSelectedPinQrUrl('');
      return;
    }
    let mounted = true;
    const joinLink = `${window.location.origin}/?pin=${activePin}`;
    QRCode.toDataURL(joinLink, {
      width: 360,
      margin: 2,
      color: { dark: '#0D1F3C', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (mounted) setSelectedPinQrUrl(url);
      })
      .catch((err) => console.error('QR generation error:', err));
    return () => {
      mounted = false;
    };
  }, [pinInput, selectedQuiz?.gamePin]);

  // Generate QR code for Create / Edit Quiz modal whenever quizForm.gamePin changes
  useEffect(() => {
    const activePin = (quizForm.gamePin || '').replace(/\D/g, '').slice(0, 6);
    if (!isQuizModalOpen || activePin.length !== 6) {
      setModalPinQrUrl('');
      return;
    }
    let mounted = true;
    const joinLink = `${window.location.origin}/?pin=${activePin}`;
    QRCode.toDataURL(joinLink, {
      width: 360,
      margin: 2,
      color: { dark: '#0D1F3C', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (mounted) setModalPinQrUrl(url);
      })
      .catch((err) => console.error('Modal QR generation error:', err));
    return () => {
      mounted = false;
    };
  }, [quizForm.gamePin, isQuizModalOpen]);

  const handleOpenQrPreview = async (title: string, rawPin: string, dueDate?: string | null) => {
    const cleanPin = rawPin.replace(/\D/g, '').slice(0, 6);
    if (cleanPin.length !== 6) return;
    try {
      const joinLink = `${window.location.origin}/?pin=${cleanPin}`;
      const qrDataUrl = await QRCode.toDataURL(joinLink, {
        width: 480,
        margin: 2,
        color: { dark: '#0D1F3C', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      });
      setQrPreviewModal({
        title,
        gamePin: cleanPin,
        dueDate: dueDate || null,
        qrDataUrl,
      });
    } catch (err) {
      console.error('Failed to open QR preview:', err);
    }
  };

  const handleDownloadQrImage = (qrDataUrl: string, gamePin: string) => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `cyberarena-pin-${gamePin}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyJoinUrl = (gamePin: string) => {
    const joinLink = `${window.location.origin}/?pin=${gamePin}`;
    navigator.clipboard.writeText(joinLink);
    setCopiedJoinLink(true);
    setTimeout(() => setCopiedJoinLink(false), 2000);
  };

  // In-App Confirmation Dialogs (Replaces blocked window.confirm)
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null);

  const fetchQuizzes = async () => {
    try {
      setLoading(true);
      const qSnap = await getDocs(collection(db, 'quizzes'));
      const list = qSnap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id, // Preserves the exact document ID
        } as Quiz;
      });
      setQuizzes(list);
    } catch (err: any) {
      console.error('Error fetching quizzes:', err);
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to load quizzes.');
      setGlobalError(friendly);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuestions = async (quizId: string) => {
    try {
      const qQuery = query(collection(db, `quizzes/${quizId}/questions`), orderBy('sortOrder', 'asc'));
      const snap = await withTimeout(getDocs(qQuery), 8000, 'Fetching questions');
      const list: Question[] = [];
      const docIds = new Set<string>();

      for (const d of snap.docs) {
        if (docIds.has(d.id)) continue;
        docIds.add(d.id);

        const data = d.data() as Question;
        if (isLegacyMockQuestion(data.questionText)) {
          continue;
        }

        list.push({
          ...data,
          id: d.id, // Always preserve the question document ID
        });
      }

      // Stable sorting by sortOrder, with createdAt as secondary sort
      list.sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999;
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });

      setQuestions(list);
    } catch (err: any) {
      console.error('Error fetching questions:', err);
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to load questions.');
      setGlobalError(friendly);
    }
  };

  const handleSelectQuiz = (quiz: Quiz) => {
    setSelectedQuiz(quiz);
    setPinInput(quiz.gamePin || '');
    setDueDateInput(quiz.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    fetchQuestions(quiz.id);
  };

  const handleOpenCreateQuiz = () => {
    setQuizModalMode('create');
    setQuizToEdit(null);
    setQuizForm({
      title: '',
      description: '',
      category: 'General',
      status: 'PUBLISHED',
      gamePin: generateCryptoPin(),
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      videoUrl: null,
      videoFileName: null,
    });
    setIsQuizModalOpen(true);
  };

  const handleOpenEditQuiz = (quiz: Quiz) => {
    setQuizModalMode('edit');
    setQuizToEdit(quiz);
    setQuizForm({
      title: quiz.title,
      description: quiz.description || '',
      category: quiz.category || 'General',
      status: quiz.status,
      gamePin: quiz.gamePin || generateCryptoPin(),
      dueDate: quiz.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      videoUrl: quiz.videoUrl || null,
      videoFileName: quiz.videoFileName || null,
    });
    setIsQuizModalOpen(true);
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sanitizePlainText(quizForm.title, { maxLength: 120 });
    if (!user || !cleanTitle) return;

    try {
      setActionLoading(true);
      const cleanDesc = sanitizePlainText(quizForm.description, { maxLength: 500, allowNewlines: true });
      const cleanCategory = sanitizePlainText(quizForm.category, { maxLength: 60 }) || 'General';
      const cleanPin = sanitizeNumericCode(quizForm.gamePin, 6) || generateCryptoPin();
      const cleanDue = sanitizeIsoDate(quizForm.dueDate) || null;
      const safeVideoUrl = quizForm.videoUrl ? sanitizeSafeUrl(quizForm.videoUrl) || null : null;
      const safeVideoFileName = quizForm.videoFileName
        ? sanitizeFileName(quizForm.videoFileName, 120)
        : null;

      if (quizModalMode === 'edit' && quizToEdit) {
        // Edit existing quiz without creating a duplicate
        const ref = doc(db, 'quizzes', quizToEdit.id);
        const updated = {
          title: cleanTitle,
          description: cleanDesc,
          category: cleanCategory,
          status: quizForm.status,
          gamePin: cleanPin,
          dueDate: cleanDue,
          videoUrl: safeVideoUrl,
          videoFileName: safeVideoFileName,
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(updateDoc(ref, updated), 8000, 'Updating quiz');
        try {
          await withTimeout(
            syncQuizPinSession(quizToEdit.id, user.uid, cleanPin, cleanDue),
            6000,
            'Syncing quiz session'
          );
        } catch (syncErr) {
          console.warn('Non-fatal sync notice while updating quiz:', syncErr);
        }
        await writeAuditEntry('QUIZ_UPDATED', 'quizzes', quizToEdit.id, {
          title: cleanTitle,
          gamePin: cleanPin,
          dueDate: cleanDue,
          hasVideo: Boolean(safeVideoUrl),
        });
        if (selectedQuiz?.id === quizToEdit.id) {
          setSelectedQuiz((prev) => (prev ? { ...prev, ...updated } : null));
          setPinInput(cleanPin);
          setDueDateInput(cleanDue || '');
        }
      } else {
        // Create new quiz
        const ref = doc(collection(db, 'quizzes'));
        const newQuiz = {
          title: cleanTitle,
          description: cleanDesc,
          category: cleanCategory,
          status: quizForm.status,
          questionCount: 0,
          gamePin: cleanPin,
          dueDate: cleanDue,
          videoUrl: safeVideoUrl,
          videoFileName: safeVideoFileName,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await withTimeout(setDoc(ref, newQuiz), 8000, 'Creating quiz');
        try {
          await withTimeout(
            syncQuizPinSession(ref.id, user.uid, cleanPin, cleanDue),
            6000,
            'Syncing new quiz session'
          );
        } catch (syncErr) {
          console.warn('Non-fatal sync notice while creating quiz:', syncErr);
        }
        await writeAuditEntry('QUIZ_CREATED', 'quizzes', ref.id, {
          title: cleanTitle,
          gamePin: cleanPin,
          dueDate: cleanDue,
          hasVideo: Boolean(safeVideoUrl),
        });
      }
      setIsQuizModalOpen(false);
      setQuizToEdit(null);
      await fetchQuizzes();
    } catch (err: any) {
      console.error('Error saving quiz:', err);
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to save quiz.');
      setGlobalError(friendly);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePinAndDueDate = async (targetQuiz?: Quiz, overridePin?: string) => {
    const qz = targetQuiz || selectedQuiz;
    if (!user || !qz) return;
    try {
      setActionLoading(true);
      const nextPin = (overridePin || pinInput || qz.gamePin || generateCryptoPin())
        .replace(/\D/g, '')
        .slice(0, 6);
      const finalPin = nextPin.length === 6 ? nextPin : generateCryptoPin();
      const finalDue = dueDateInput || qz.dueDate || null;

      const res = await syncQuizPinSession(qz.id, user.uid, finalPin, finalDue);
      await writeAuditEntry('QUIZ_PIN_SAVED', 'quizzes', qz.id, {
        gamePin: res.gamePin,
        dueDate: res.dueDate,
      });

      setPinInput(res.gamePin);
      setDueDateInput(res.dueDate || '');
      if (selectedQuiz?.id === qz.id) {
        setSelectedQuiz((prev) =>
          prev
            ? {
                ...prev,
                gamePin: res.gamePin,
                dueDate: res.dueDate,
                activeGameId: res.gameId,
                status: 'PUBLISHED',
              }
            : null
        );
      }
      await fetchQuizzes();
      setPinSavedSuccess(true);
      setTimeout(() => setPinSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving PIN and Due Date:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    const quizId = quizToDelete.id;
    try {
      setActionLoading(true);
      await deleteDoc(doc(db, 'quizzes', quizId));
      await writeAuditEntry('QUIZ_DELETED', 'quizzes', quizId);
      if (selectedQuiz?.id === quizId) {
        setSelectedQuiz(null);
        setQuestions([]);
      }
      setQuizToDelete(null);
      await fetchQuizzes();
    } catch (err) {
      console.error('Error deleting quiz:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePublish = async (quiz: Quiz) => {
    const nextStatus: QuizStatus = quiz.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      if (nextStatus === 'PUBLISHED' && user) {
        await syncQuizPinSession(
          quiz.id,
          user.uid,
          quiz.gamePin || generateCryptoPin(),
          quiz.dueDate || null
        );
      }
      await writeAuditEntry('QUIZ_PUBLISHED', 'quizzes', quiz.id, { status: nextStatus });
      await fetchQuizzes();
      if (selectedQuiz?.id === quiz.id) {
        setSelectedQuiz((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicateQuiz = async (quiz: Quiz) => {
    if (!user) return;
    try {
      setActionLoading(true);
      const newRef = doc(collection(db, 'quizzes'));
      await setDoc(newRef, {
        title: `${quiz.title} (Copy)`,
        description: quiz.description,
        category: quiz.category,
        videoUrl: quiz.videoUrl || null,
        videoFileName: quiz.videoFileName || null,
        status: 'DRAFT',
        questionCount: quiz.questionCount || 0,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Duplicate questions
      const qQuery = query(collection(db, `quizzes/${quiz.id}/questions`), orderBy('sortOrder', 'asc'));
      const snap = await getDocs(qQuery);
      for (const d of snap.docs) {
        const qData = d.data();
        const newQRef = doc(collection(db, `quizzes/${newRef.id}/questions`));
        await setDoc(newQRef, {
          ...qData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await writeAuditEntry('QUIZ_DUPLICATED', 'quizzes', newRef.id);
      await fetchQuizzes();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartGame = async (quiz: Quiz) => {
    if (!user) return;
    try {
      setActionLoading(true);
      const { gameId } = await createGameSession(quiz.id, user.uid);
      await writeAuditEntry('GAME_CREATED', 'games', gameId, { quizTitle: quiz.title });
      onStartLiveGame(gameId);
    } catch (err: any) {
      console.error('Failed to start game session:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // QUESTION ACTIONS
  const handleSaveQuestion = async (q: Question) => {
    if (!selectedQuiz) return;
    if (isSavingQuestionRef.current) return;

    try {
      isSavingQuestionRef.current = true;
      setActionLoading(true);
      setGlobalError(null);

      const questionId = q.id?.trim();
      const { id: _ignored, ...rawQuestion } = q;

      const sanitizedOptions = (rawQuestion.options || []).map((opt, idx) => ({
        id: opt.id || `opt_${idx + 1}`,
        text: sanitizePlainText(opt.text, { maxLength: 200 }),
        sortOrder: typeof opt.sortOrder === 'number' ? opt.sortOrder : idx,
      }));

      const dataToSave = {
        ...rawQuestion,
        questionText: sanitizePlainText(rawQuestion.questionText, {
          maxLength: 300,
          allowNewlines: true,
        }),
        explanation: sanitizePlainText(rawQuestion.explanation || '', {
          maxLength: 400,
          allowNewlines: true,
        }),
        imageUrl: rawQuestion.imageUrl ? sanitizeSafeUrl(rawQuestion.imageUrl) || null : null,
        videoUrl: rawQuestion.videoUrl ? sanitizeSafeUrl(rawQuestion.videoUrl) || null : null,
        videoFileName: rawQuestion.videoFileName
          ? sanitizeFileName(rawQuestion.videoFileName, 120)
          : null,
        options: sanitizedOptions,
      };

      const isEdit = Boolean(questionId && questionId.length > 0);
      const targetRef = isEdit
        ? doc(db, `quizzes/${selectedQuiz.id}/questions`, questionId!)
        : doc(collection(db, `quizzes/${selectedQuiz.id}/questions`));

      const highestOrder = questions.reduce((max, cur) => Math.max(max, cur.sortOrder || 0), 0);
      const computedSortOrder = isEdit && typeof q.sortOrder === 'number' ? q.sortOrder : highestOrder + 1;

      await withTimeout(
        setDoc(
          targetRef,
          {
            ...dataToSave,
            sortOrder: computedSortOrder,
            createdAt: q.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ),
        8000,
        'Saving question'
      );

      // Immediately dismiss editing question modal to guarantee no duplicate re-clicks
      setEditingQuestion(null);

      // Refresh questions list for the selected quiz
      await fetchQuestions(selectedQuiz.id);

      // Non-fatal background sync for quiz question count and PIN session
      try {
        const countSnap = await withTimeout(
          getDocs(collection(db, `quizzes/${selectedQuiz.id}/questions`)),
          6000,
          'Updating question count'
        );
        await withTimeout(
          updateDoc(doc(db, 'quizzes', selectedQuiz.id), {
            questionCount: countSnap.size,
            updatedAt: new Date().toISOString(),
          }),
          6000,
          'Syncing quiz'
        );

        if (user && (selectedQuiz.gamePin || pinInput)) {
          await syncQuizPinSession(
            selectedQuiz.id,
            user.uid,
            selectedQuiz.gamePin || pinInput,
            selectedQuiz.dueDate || dueDateInput || null
          );
        }
      } catch (syncErr: any) {
        console.warn('Non-fatal follow-up sync notice after saving question:', syncErr);
        const friendly = getUserFriendlyErrorMessage(syncErr);
        if (friendly.isQuotaError) {
          setGlobalError(friendly);
        }
      }

      await fetchQuizzes();
    } catch (err: any) {
      console.error('Error saving question:', err);
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to save question.');
      setGlobalError(friendly);
      throw err; // re-throw so QuestionEditorModal can display the error inline
    } finally {
      setActionLoading(false);
      isSavingQuestionRef.current = false;
    }
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!selectedQuiz || !questionToDelete) return;
    const qId = questionToDelete.id;
    try {
      setActionLoading(true);
      setGlobalError(null);
      await withTimeout(
        deleteDoc(doc(db, `quizzes/${selectedQuiz.id}/questions`, qId)),
        8000,
        'Deleting question'
      );
      setQuestionToDelete(null);
      await fetchQuestions(selectedQuiz.id);

      // Non-fatal background sync
      try {
        const countSnap = await withTimeout(
          getDocs(collection(db, `quizzes/${selectedQuiz.id}/questions`)),
          6000,
          'Recounting questions'
        );
        await withTimeout(
          updateDoc(doc(db, 'quizzes', selectedQuiz.id), {
            questionCount: countSnap.size,
            updatedAt: new Date().toISOString(),
          }),
          6000,
          'Syncing quiz count'
        );

        if (user && (selectedQuiz.gamePin || pinInput)) {
          await syncQuizPinSession(
            selectedQuiz.id,
            user.uid,
            selectedQuiz.gamePin || pinInput,
            selectedQuiz.dueDate || dueDateInput || null
          );
        }
      } catch (syncErr: any) {
        console.warn('Non-fatal sync notice after question deletion:', syncErr);
        const friendly = getUserFriendlyErrorMessage(syncErr);
        if (friendly.isQuotaError) {
          setGlobalError(friendly);
        }
      }

      await fetchQuizzes();
    } catch (err: any) {
      console.error('Error deleting question:', err);
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to delete question.');
      setGlobalError(friendly);
    } finally {
      setActionLoading(false);
      setQuestionToDelete(null);
    }
  };

  const handleReorderQuestion = async (index: number, direction: 'up' | 'down') => {
    if (!selectedQuiz) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;

    const list = [...questions];
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    setQuestions(list);

    // Persist new sortOrders
    for (let i = 0; i < list.length; i++) {
      await updateDoc(doc(db, `quizzes/${selectedQuiz.id}/questions`, list[i].id), {
        sortOrder: i + 1,
      });
    }
    if (user && (selectedQuiz.gamePin || pinInput)) {
      await syncQuizPinSession(
        selectedQuiz.id,
        user.uid,
        selectedQuiz.gamePin || pinInput,
        selectedQuiz.dueDate || dueDateInput || null
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Quiz Management</h2>
          <p className="text-slate-400 text-xs sm:text-sm">Create, publish, and host engaging live arena challenges.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateQuiz}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#00A191] hover:bg-[#00bda9] text-white shadow-lg shadow-[#00A191]/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Quiz</span>
          </button>
        </div>
      </div>

      {/* Global Error & Quota Alert Banner */}
      {globalError && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
            globalError.isQuotaError
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
          }`}
        >
          <AlertCircle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              globalError.isQuotaError ? 'text-amber-400' : 'text-rose-400'
            }`}
          />
          <div className="flex-1 min-w-0 text-xs sm:text-sm space-y-1.5">
            <p className="font-bold">{globalError.message}</p>
            {globalError.isQuotaError && globalError.quotaUpgradeUrl && (
              <div className="pt-1">
                <a
                  href={globalError.quotaUpgradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors"
                >
                  <span>Open Firebase Console / Upgrade Quota</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
          <button
            onClick={() => setGlobalError(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Quiz List & Selected Quiz Question Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Quizzes List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Available Quizzes ({quizzes.length})
          </div>

          {loading ? (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <span>Loading quizzes...</span>
            </div>
          ) : quizzes.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center">
              <HelpCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-300 mb-1">No Quizzes Created</p>
              <p className="text-xs text-slate-500 mb-4">Click "Create New Quiz" to build your questionnaire.</p>
            </div>
          ) : (
            quizzes.map((quiz) => {
              const isSelected = selectedQuiz?.id === quiz.id;
              return (
                <div
                  key={quiz.id}
                  onClick={() => handleSelectQuiz(quiz)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-[#00A191] shadow-lg shadow-[#00A191]/15'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {quiz.category || 'General'}
                      </span>
                      <h3 className="font-bold text-white text-base mt-1.5 line-clamp-1">{quiz.title}</h3>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        quiz.status === 'PUBLISHED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {quiz.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{quiz.description}</p>

                  {/* Saved PIN & Due Date Badges on Quiz Card */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {quiz.gamePin ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(quiz.gamePin || '');
                          setCopiedPinId(quiz.id);
                          setTimeout(() => setCopiedPinId(null), 2000);
                        }}
                        title="Click to copy 6-digit Participant PIN"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1F3C] border border-[#00A191]/50 text-[#00A191] text-xs font-mono font-bold hover:bg-[#152e57] transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>PIN: {quiz.gamePin}</span>
                        {copiedPinId === quiz.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-75" />
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectQuiz(quiz);
                          handleSavePinAndDueDate(quiz, generateCryptoPin());
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F05A28]/20 hover:bg-[#F05A28]/30 border border-[#F05A28]/40 text-[#F05A28] text-xs font-bold cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Generate PIN</span>
                      </button>
                    )}

                    {quiz.dueDate && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-mono">
                        <Calendar className="w-3 h-3 text-[#F05A28]" />
                        <span>Due: {quiz.dueDate}</span>
                      </span>
                    )}

                    {quiz.videoUrl && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0D1F3C] border border-[#00A191]/40 text-[#00A191] text-[11px] font-bold">
                        <Film className="w-3 h-3" />
                        <span>MP4 Video</span>
                      </span>
                    )}

                    {quiz.gamePin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenQrPreview(quiz.title, quiz.gamePin || '', quiz.dueDate);
                        }}
                        title="Show Participant Join QR Code"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-[#00A191]/40 text-[#00A191] text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>QR Code</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800/80">
                    <span className="text-slate-400 font-medium">{quiz.questionCount || 0} Questions</span>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenEditQuiz(quiz)}
                        title="Edit Quiz Details"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#00A191] hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleTogglePublish(quiz)}
                        title={quiz.status === 'PUBLISHED' ? 'Unpublish' : 'Publish Quiz'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 cursor-pointer"
                      >
                        <FileCheck className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onPreviewQuiz(quiz.id)}
                        title="Preview Simulator"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#00A191] hover:bg-slate-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDuplicateQuiz(quiz)}
                        title="Duplicate Quiz"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setQuizToDelete(quiz)}
                        title="Delete Quiz"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#F05A28] hover:bg-slate-800 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {quiz.status === 'PUBLISHED' && (
                        <button
                          onClick={() => handleStartGame(quiz)}
                          title="Launch Live Arena"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-sm ml-1"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Host</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Selected Quiz Questions & Actions (7 cols) */}
        <div className="lg:col-span-7">
          {selectedQuiz ? (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-xl font-black text-white">{selectedQuiz.title}</h3>
                  <p className="text-xs text-slate-400">Manage questions, scoring, and time limits.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEditQuiz(selectedQuiz)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#00A191]" />
                    <span>Edit Details</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingQuestion({
                        id: '',
                        questionType: 'MULTIPLE_CHOICE',
                        questionText: '',
                        explanation: '',
                        timeLimitSeconds: 20,
                        points: 1000,
                        sortOrder: questions.length + 1,
                        options: [
                          { id: 'opt_1', text: '', sortOrder: 0 },
                          { id: 'opt_2', text: '', sortOrder: 1 },
                          { id: 'opt_3', text: '', sortOrder: 2 },
                          { id: 'opt_4', text: '', sortOrder: 3 },
                        ],
                        correctOptionId: 'opt_1',
                        createdAt: '',
                        updatedAt: '',
                      });
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#00A191] hover:bg-[#00bda9] text-white shadow-md shadow-[#00A191]/30 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Question</span>
                  </button>
                </div>
              </div>

              {/* Participant Access PIN & Due Date Configuration Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0D1F3C] border-2 border-[#00A191]/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A191] block">
                      SELF-PACED PARTICIPANT ACCESS (ANSWER ANYTIME BEFORE DUE DATE)
                    </span>
                    <h4 className="text-sm font-black text-white">
                      Participant Access PIN, Due Date & QR Code
                    </h4>
                  </div>
                  {(selectedQuiz.gamePin || pinInput.length === 6) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedQuiz.gamePin || pinInput);
                          setCopiedPinId('selected_panel');
                          setTimeout(() => setCopiedPinId(null), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-[#00A191]/50 text-[#00A191] text-xs font-mono font-bold cursor-pointer"
                      >
                        {copiedPinId === 'selected_panel' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>PIN Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy PIN: {selectedQuiz.gamePin || pinInput}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleOpenQrPreview(
                            selectedQuiz.title,
                            pinInput || selectedQuiz.gamePin || '',
                            dueDateInput || selectedQuiz.dueDate
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00A191]/20 hover:bg-[#00A191]/30 border border-[#00A191]/50 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5 text-[#00A191]" />
                        <span>Enlarge QR</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
                  <div className="xl:col-span-4">
                    <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                      6-Digit Participant PIN
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="e.g. 482910"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-mono font-black text-base tracking-widest text-[#00A191] outline-none focus:border-[#00A191]"
                      />
                      <button
                        type="button"
                        onClick={() => setPinInput(generateCryptoPin())}
                        title="Generate random 6-digit PIN"
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#F05A28]" />
                        <span>Generate</span>
                      </button>
                    </div>
                  </div>

                  <div className="xl:col-span-3">
                    <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDateInput}
                      onChange={(e) => setDueDateInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white outline-none focus:border-[#00A191]"
                    />
                  </div>

                  {/* QR Code Beside Due Date */}
                  <div className="xl:col-span-2 flex flex-col">
                    <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                      Join QR Code
                    </label>
                    {selectedPinQrUrl ? (
                      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-950 border border-[#00A191]/40">
                        <div
                          onClick={() =>
                            handleOpenQrPreview(
                              selectedQuiz.title,
                              pinInput || selectedQuiz.gamePin || '',
                              dueDateInput || selectedQuiz.dueDate
                            )
                          }
                          title="Click to enlarge QR Code"
                          className="p-1 rounded-lg bg-white cursor-pointer hover:scale-105 transition-transform shrink-0"
                        >
                          <img
                            src={selectedPinQrUrl}
                            alt="Participant Join QR"
                            className="w-9 h-9 object-contain"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenQrPreview(
                                selectedQuiz.title,
                                pinInput || selectedQuiz.gamePin || '',
                                dueDateInput || selectedQuiz.dueDate
                              )
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00A191] hover:underline cursor-pointer"
                          >
                            <Maximize2 className="w-2.5 h-2.5" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadQrImage(
                                selectedPinQrUrl,
                                (pinInput || selectedQuiz.gamePin || '').slice(0, 6)
                              )
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                          >
                            <Download className="w-2.5 h-2.5" />
                            <span>PNG</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[46px] px-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 text-center">
                        Generate PIN for QR
                      </div>
                    )}
                  </div>

                  <div className="xl:col-span-3">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleSavePinAndDueDate()}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#F05A28] hover:bg-[#ff6c3b] text-white font-bold text-xs shadow-lg shadow-[#F05A28]/30 cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {pinSavedSuccess ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Saved!</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Save PIN & Due Date</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Selected Quiz Video Preview if uploaded */}
              {selectedQuiz.videoUrl && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00A191]">
                      <Film className="w-4 h-4" />
                      <span>Quiz Briefing Video (.mp4)</span>
                    </div>
                    {selectedQuiz.videoFileName && (
                      <span className="text-[11px] font-mono text-slate-400 truncate max-w-[220px]">
                        {selectedQuiz.videoFileName}
                      </span>
                    )}
                  </div>
                  <VideoPlayer
                    videoUrl={selectedQuiz.videoUrl}
                    videoFileName={selectedQuiz.videoFileName}
                    maxHeightClass="max-h-52"
                  />
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-3">
                {questions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
                    <p className="text-sm font-bold text-white">No questions in this quiz yet.</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Click "Add Question" above to add questions to this quiz. Only the questions you add here will be shown to participants who enter this quiz's PIN.
                    </p>
                  </div>
                ) : (
                  questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-300 shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-white line-clamp-2">{q.questionText}</p>
                          {(q.imageUrl || q.videoUrl) && (
                            <div className="mt-2 flex flex-wrap items-start gap-3">
                              {q.imageUrl && (
                                <img
                                  src={q.imageUrl}
                                  alt="Question attachment"
                                  className="h-16 w-auto max-w-[140px] rounded-lg object-cover border border-slate-700"
                                />
                              )}
                              {q.videoUrl && (
                                <div className="w-full max-w-xs">
                                  <VideoPlayer
                                    videoUrl={q.videoUrl}
                                    videoFileName={q.videoFileName}
                                    maxHeightClass="max-h-28"
                                    showFileNameBadge
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {q.timeLimitSeconds}s
                            </span>
                            <span className="flex items-center gap-1">
                              <Award className="w-3 h-3 text-amber-500" />
                              {q.points} pts
                            </span>
                            {q.videoUrl && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#00A191] bg-[#00A191]/10 px-2 py-0.5 rounded border border-[#00A191]/30">
                                <Film className="w-3 h-3" />
                                <span>.MP4 Video</span>
                              </span>
                            )}
                            <span className="text-[10px] uppercase font-bold text-indigo-400">
                              {q.questionType === 'TRUE_FALSE'
                                ? 'True / False'
                                : q.questionType === 'MULTIPLE_CHOICE_2' || q.options.length === 2
                                ? 'Multiple Choice (2 Option)'
                                : 'Multiple Choice (4 Option)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleReorderQuestion(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReorderQuestion(idx, 'down')}
                          disabled={idx === questions.length - 1}
                          className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingQuestion(q)}
                          title="Edit Question"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#00A191] hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setQuestionToDelete(q)}
                          title="Delete Question"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#F05A28] hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 text-center">
              <Sparkles className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="font-bold text-slate-300 mb-1">Select a Quiz</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Choose a quiz from the list on the left to edit its details, manage questions, and launch live sessions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QUIZ CREATE/EDIT MODAL */}
      {isQuizModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1F3C] border-2 border-[#00A191]/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]/20">
              <h3 className="font-black text-lg text-white">
                {quizModalMode === 'edit' ? 'Edit Quiz Details' : 'Create New Quiz'}
              </h3>
              <button
                onClick={() => setIsQuizModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuiz} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Quiz Title</label>
                <input
                  type="text"
                  required
                  value={quizForm.title}
                  onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                  placeholder="e.g. Science & Space Challenge"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-[#00A191]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={quizForm.description}
                  onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                  placeholder="Short brief of this quiz challenge..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-[#00A191] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={quizForm.category}
                    onChange={(e) => setQuizForm({ ...quizForm, category: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-[#00A191]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">Status</label>
                  <select
                    value={quizForm.status}
                    onChange={(e) => setQuizForm({ ...quizForm, status: e.target.value as QuizStatus })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-[#00A191]"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              {/* Quiz Intro / Training Video Section */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300">
                      Quiz Intro / Training Video (Optional)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Attach public video from Google Cloud Storage or Google Drive. Zero quota impact.
                    </p>
                  </div>
                  {quizForm.videoUrl && (
                    <button
                      type="button"
                      onClick={() => setQuizForm({ ...quizForm, videoUrl: null, videoFileName: null })}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-bold"
                    >
                      Remove Video
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={quizForm.videoUrl || ''}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        const parsed = parseVideoSource(val);
                        setQuizForm({
                          ...quizForm,
                          videoUrl: val || null,
                          videoFileName: parsed?.inferredFileName || quizForm.videoFileName || 'Cloud-Video.mp4',
                        });
                      }}
                      placeholder="https://storage.googleapis.com/... or https://drive.google.com/file/d/..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191] font-mono"
                    />
                  </div>

                  {quizForm.videoUrl && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const parsed = parseVideoSource(quizForm.videoUrl);
                        if (parsed?.sourceType === 'google-cloud-storage') {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <Cloud className="w-3 h-3 text-emerald-400" />
                              <span>Detected: Google Cloud Storage (.mp4)</span>
                            </span>
                          );
                        }
                        if (parsed?.sourceType === 'google-drive') {
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                              <HardDrive className="w-3 h-3 text-sky-400" />
                              <span>Detected: Google Drive Video Preview</span>
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            <Video className="w-3 h-3 text-indigo-400" />
                            <span>External Cloud Video Stream</span>
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {quizForm.videoUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-1.5">
                      <VideoPlayer
                        videoUrl={quizForm.videoUrl}
                        videoFileName={quizForm.videoFileName}
                        maxHeightClass="max-h-44 sm:max-h-52"
                        showFileNameBadge={true}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Participant 6-Digit PIN
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={6}
                      value={quizForm.gamePin}
                      onChange={(e) =>
                        setQuizForm({
                          ...quizForm,
                          gamePin: e.target.value.replace(/\D/g, '').slice(0, 6),
                        })
                      }
                      placeholder="482910"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-mono font-black text-sm tracking-widest text-[#00A191] outline-none focus:border-[#00A191]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuizForm({ ...quizForm, gamePin: generateCryptoPin() })}
                      className="shrink-0 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 cursor-pointer"
                    >
                      Generate
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={quizForm.dueDate}
                    onChange={(e) => setQuizForm({ ...quizForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono outline-none focus:border-[#00A191]"
                  />
                </div>

                {/* Live QR Code Beside Due Date in Create / Edit Quiz Modal */}
                <div className="sm:col-span-3 flex flex-col">
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Join QR
                  </label>
                  {modalPinQrUrl ? (
                    <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-950 border border-[#00A191]/40">
                      <div
                        onClick={() =>
                          handleOpenQrPreview(
                            quizForm.title || 'New Quiz',
                            quizForm.gamePin,
                            quizForm.dueDate
                          )
                        }
                        title="Click to enlarge QR Code"
                        className="p-1 rounded-lg bg-white cursor-pointer hover:scale-105 transition-transform shrink-0"
                      >
                        <img
                          src={modalPinQrUrl}
                          alt="New Quiz PIN QR"
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenQrPreview(
                              quizForm.title || 'New Quiz',
                              quizForm.gamePin,
                              quizForm.dueDate
                            )
                          }
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00A191] hover:underline cursor-pointer"
                        >
                          <Maximize2 className="w-2.5 h-2.5" />
                          <span>Zoom</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadQrImage(modalPinQrUrl, quizForm.gamePin)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                        >
                          <Download className="w-2.5 h-2.5" />
                          <span>PNG</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[38px] px-2 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 text-center">
                      6-digit PIN
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuizModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#00A191] hover:bg-[#00bda9] text-white cursor-pointer shadow-lg shadow-[#00A191]/30 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : quizModalMode === 'edit' ? 'Update Quiz' : 'Create Quiz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUESTION DELETE CONFIRMATION MODAL */}
      {questionToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border-2 border-[#E5E5E5]/20 rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F05A28]/20 text-[#F05A28] border border-[#F05A28]/40 flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Delete Question?</h3>
              <p className="text-xs text-[#E5E5E5]/70 mt-1">
                Are you sure you want to permanently delete this question? This action cannot be undone.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-[#E5E5E5]/10 text-xs text-white font-medium text-left line-clamp-3">
              "{questionToDelete.questionText}"
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuestionToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-[#E5E5E5] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteQuestion}
                className="flex-1 py-2.5 rounded-xl bg-[#F05A28] hover:bg-[#ff6c3b] text-xs font-bold text-white shadow-lg shadow-[#F05A28]/30 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUIZ DELETE CONFIRMATION MODAL */}
      {quizToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border-2 border-[#E5E5E5]/20 rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F05A28]/20 text-[#F05A28] border border-[#F05A28]/40 flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Delete Entire Quiz?</h3>
              <p className="text-xs text-[#E5E5E5]/70 mt-1">
                Are you sure you want to permanently delete <strong className="text-white">"{quizToDelete.title}"</strong> and all of its questions?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuizToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-[#E5E5E5] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteQuiz}
                className="flex-1 py-2.5 rounded-xl bg-[#F05A28] hover:bg-[#ff6c3b] text-xs font-bold text-white shadow-lg shadow-[#F05A28]/30 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete Quiz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUESTION EDITOR MODAL */}
      {editingQuestion && (
        <QuestionEditorModal
          question={editingQuestion}
          onSave={handleSaveQuestion}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {/* ENLARGED PARTICIPANT JOIN QR CODE MODAL */}
      {qrPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setQrPreviewModal(null)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl bg-[#0D1F3C] border-2 border-[#00A191]/50 p-6 sm:p-8 shadow-2xl text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQrPreviewModal(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close QR Preview"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00A191]/20 border border-[#00A191]/40 text-[#00A191] text-xs font-bold uppercase">
                <QrCode className="w-3.5 h-3.5" />
                <span>Participant Self-Paced Join QR</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">{qrPreviewModal.title}</h3>
              <p className="text-xs text-slate-300">
                Participants can scan this QR code to open CYBER|ARENA with the 6-digit PIN pre-filled.
              </p>
            </div>

            <div className="p-4 rounded-3xl bg-white shadow-2xl mx-auto inline-block border-4 border-[#00A191]/50">
              <img
                src={qrPreviewModal.qrDataUrl}
                alt={`QR Code for PIN ${qrPreviewModal.gamePin}`}
                className="w-60 h-60 sm:w-64 sm:h-64 object-contain mx-auto"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-around gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  PARTICIPANT PIN
                </span>
                <span className="text-2xl font-mono font-black tracking-widest text-[#00A191]">
                  {qrPreviewModal.gamePin}
                </span>
              </div>
              {qrPreviewModal.dueDate && (
                <div className="border-l border-slate-800 pl-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    DUE DATE
                  </span>
                  <span className="text-sm font-mono font-bold text-white">
                    {qrPreviewModal.dueDate}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleCopyJoinUrl(qrPreviewModal.gamePin)}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {copiedJoinLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 text-[#00A191]" />
                    <span>Copy Join Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDownloadQrImage(qrPreviewModal.qrDataUrl, qrPreviewModal.gamePin)
                }
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-white text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-[#00A191]/30"
              >
                <Download className="w-4 h-4" />
                <span>Download QR</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Standalone Modal for Question creation/editing
interface QuestionEditorModalProps {
  question: Question;
  onSave: (q: Question) => Promise<void> | void;
  onClose: () => void;
}

const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({ question, onSave, onClose }) => {
  const [form, setForm] = useState<Question>({ ...question });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [videoError, setVideoError] = useState<string | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState(
    form.videoUrl && !form.videoUrl.startsWith('firestore-media://') ? form.videoUrl : ''
  );
  const [customVideoTitle, setCustomVideoTitle] = useState(form.videoFileName || '');
  const [showCloudGuide, setShowCloudGuide] = useState(false);

  // Sync custom video URL state if form changes
  useEffect(() => {
    if (form.videoUrl && !form.videoUrl.startsWith('firestore-media://')) {
      setCustomVideoUrl(form.videoUrl);
      if (form.videoFileName) setCustomVideoTitle(form.videoFileName);
    }
  }, [form.videoUrl, form.videoFileName]);

  const handleApplyCustomVideoUrl = () => {
    const trimmed = customVideoUrl.trim();
    if (!trimmed) {
      setForm((prev) => ({ ...prev, videoUrl: null, videoFileName: null }));
      setVideoError(null);
      return;
    }
    const safeUrl = sanitizeSafeUrl(trimmed);
    if (!safeUrl || (!safeUrl.startsWith('https://') && !safeUrl.startsWith('http://'))) {
      setVideoError('Please enter a valid video URL starting with https:// (e.g. Google Cloud Storage, Google Drive, YouTube, or direct .mp4 link).');
      return;
    }
    const parsed = parseVideoSource(safeUrl);
    setVideoError(null);
    const chosenTitle =
      customVideoTitle.trim() ||
      parsed?.inferredFileName ||
      'Embedded Video.mp4';

    setForm((prev) => ({
      ...prev,
      videoUrl: safeUrl,
      videoFileName: chosenTitle,
    }));
  };

  // Only reset form state if the question being edited actually changes ID
  const activeQuestionIdRef = React.useRef(question.id);
  useEffect(() => {
    if (question.id !== activeQuestionIdRef.current) {
      activeQuestionIdRef.current = question.id;
      setForm({ ...question });
      setImageError(null);
      setVideoError(null);
      setFormError(null);
    }
  }, [question.id]);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      setImageError(null);
      const dataUrl = await processUploadedQuestionImage(file);
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch (err: any) {
      setImageError(err?.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOptionChange = (idx: number, text: string) => {
    const nextOpts = [...form.options];
    nextOpts[idx].text = sanitizeLiveInput(text, 200, false);
    setForm({ ...form, options: nextOpts });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || uploadingImage) return;

    const cleanPrompt = sanitizePlainText(form.questionText, { maxLength: 300, allowNewlines: true });
    if (!cleanPrompt) {
      setFormError('Please enter a question prompt.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      await onSave({
        ...form,
        questionText: cleanPrompt,
        explanation: sanitizePlainText(form.explanation || '', { maxLength: 400, allowNewlines: true }),
        id: question.id,
      });
    } catch (err: any) {
      const friendly = getUserFriendlyErrorMessage(err, 'Failed to save question.');
      setFormError(friendly.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl my-4 sm:my-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="font-black text-lg text-white">
            {question.id ? 'Edit Question' : 'New Question'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Question Prompt</label>
            <textarea
              rows={3}
              required
              value={form.questionText}
              onChange={(e) => setForm({ ...form, questionText: e.target.value })}
              placeholder="What is the capital of Japan?"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Question Image Upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase text-slate-400">
                Question Image (Optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D1F3C] hover:bg-[#162f59] text-[#00A191] border border-[#00A191]/40 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{form.imageUrl ? 'Change Image' : 'Upload Image'}</span>
                  </>
                )}
              </button>
            </div>

            {imageError && (
              <p className="text-xs text-[#F05A28] font-medium mb-2">{imageError}</p>
            )}

            {form.imageUrl && (
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 flex items-center justify-center">
                <img
                  src={form.imageUrl}
                  alt="Question preview"
                  className="max-h-44 w-auto rounded-xl object-contain"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, imageUrl: null })}
                  title="Remove Image"
                  className="absolute top-3 right-3 p-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Question Video Section: Cloud Storage / Google Drive URL (Recommended) or Direct Upload */}
          {/* Question Video Section: Dedicated Video Embed (Google Cloud Storage, Drive, YouTube, Vimeo, etc.) */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Question Video Embed (Zero Database Quota Impact)
                </label>
                <p className="text-[11px] text-slate-400">
                  Provide a public video link from Google Cloud Storage, Google Drive, YouTube, or direct MP4. Rendered directly on the platform with 0 Firestore write operations.
                </p>
              </div>

              {form.videoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, videoUrl: null, videoFileName: null });
                    setCustomVideoUrl('');
                    setCustomVideoTitle('');
                    setVideoError(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold cursor-pointer inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Video</span>
                </button>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 relative">
                  <input
                    type="url"
                    value={customVideoUrl}
                    onChange={(e) => {
                      setCustomVideoUrl(e.target.value);
                      if (videoError) setVideoError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCustomVideoUrl();
                      }
                    }}
                    placeholder="https://storage.googleapis.com/... or https://drive.google.com/... or https://youtube.com/..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-[#00A191] font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleApplyCustomVideoUrl}
                  className="px-4 py-2 rounded-xl bg-[#00A191] hover:bg-[#00bda9] text-white text-xs font-bold transition-colors shrink-0 shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Apply Video Link</span>
                </button>
              </div>

              {/* Source Provider Detection Badge */}
              {customVideoUrl && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const parsed = parseVideoSource(customVideoUrl);
                    if (parsed?.sourceType === 'google-cloud-storage') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <Cloud className="w-3 h-3 text-emerald-400" />
                          <span>Detected: Google Cloud Storage (.mp4)</span>
                        </span>
                      );
                    }
                    if (parsed?.sourceType === 'google-drive') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                          <HardDrive className="w-3 h-3 text-sky-400" />
                          <span>Detected: Google Drive Video Preview</span>
                        </span>
                      );
                    }
                    if (parsed?.sourceType === 'youtube') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          <Video className="w-3 h-3 text-rose-400" />
                          <span>Detected: YouTube Video Embed</span>
                        </span>
                      );
                    }
                    if (parsed?.sourceType === 'vimeo') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          <Film className="w-3 h-3 text-cyan-400" />
                          <span>Detected: Vimeo Video Embed</span>
                        </span>
                      );
                    }
                    if (parsed?.sourceType === 'direct-url') {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          <Film className="w-3 h-3 text-indigo-400" />
                          <span>Detected: Direct Cloud Video Stream</span>
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Optional Custom Label */}
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="text"
                  value={customVideoTitle}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomVideoTitle(val);
                    if (form.videoUrl) {
                      setForm((prev) => ({ ...prev, videoFileName: val.trim() || 'Embedded Video.mp4' }));
                    }
                  }}
                  placeholder="Video Display Label / Filename (optional, e.g. Cyber-Security-Awareness.mp4)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs outline-none focus:border-slate-600"
                />
              </div>

              {/* Zero Quota Callout & Guide Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>0 Firestore writes consumed • Zero database quota impact</span>
                </span>

                <button
                  type="button"
                  onClick={() => setShowCloudGuide(!showCloudGuide)}
                  className="inline-flex items-center gap-1 text-[#00A191] hover:underline font-bold cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>{showCloudGuide ? 'Hide Instructions' : 'How to host & embed video links'}</span>
                </button>
              </div>

              {/* Step-by-Step Instructions */}
              {showCloudGuide && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-[#00A191]/30 text-xs text-slate-300 space-y-2.5">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-[#00A191]" />
                    <span>How to host and embed videos without database quota:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="font-bold text-emerald-400 block">Google Cloud Storage (GCS)</span>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                        <li>Upload your .mp4 video into your GCS Bucket.</li>
                        <li>Click the file's Permissions / Edit access.</li>
                        <li>Add <code className="text-white bg-slate-800 px-1 rounded">allUsers</code> with Role: <code className="text-white bg-slate-800 px-1 rounded">Storage Object Viewer</code>.</li>
                        <li>Copy Public URL (<code className="text-slate-300">https://storage.googleapis.com/...</code>) and paste above!</li>
                      </ol>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="font-bold text-sky-400 block">Google Drive Storage</span>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                        <li>Upload your .mp4 video to Google Drive.</li>
                        <li>Right-click the video file and select <strong>Share</strong>.</li>
                        <li>Change General access to <strong>"Anyone with the link"</strong> (Viewer).</li>
                        <li>Click <strong>Copy link</strong> and paste above!</li>
                      </ol>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="font-bold text-rose-400 block">YouTube / Vimeo</span>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                        <li>Upload video (Public or Unlisted).</li>
                        <li>Click <strong>Share</strong> and copy the video URL.</li>
                        <li>Paste URL above (e.g. <code className="text-slate-300">https://youtu.be/...</code>).</li>
                        <li>Video embeds seamlessly on the platform for all players!</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {videoError && (
              <p className="text-xs text-[#F05A28] font-medium pt-1">{videoError}</p>
            )}

            {/* Active Video Preview Player Embedded Directly */}
            {form.videoUrl && (
              <div className="relative pt-2">
                <VideoPlayer
                  videoUrl={form.videoUrl}
                  videoFileName={form.videoFileName}
                  maxHeightClass="max-h-52"
                  showFileNameBadge
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Type</label>
              <select
                value={
                  form.questionType === 'TRUE_FALSE'
                    ? 'TRUE_FALSE'
                    : form.questionType === 'MULTIPLE_CHOICE_2' || form.options.length === 2
                    ? 'MULTIPLE_CHOICE_2'
                    : 'MULTIPLE_CHOICE'
                }
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  if (type === 'TRUE_FALSE') {
                    setForm({
                      ...form,
                      questionType: 'TRUE_FALSE',
                      options: [
                        { id: 'opt_t', text: 'True', sortOrder: 0 },
                        { id: 'opt_f', text: 'False', sortOrder: 1 },
                      ],
                      correctOptionId: 'opt_t',
                    });
                  } else if (type === 'MULTIPLE_CHOICE_2') {
                    const prevOpts = form.options;
                    const isFromTF = form.questionType === 'TRUE_FALSE';
                    setForm({
                      ...form,
                      questionType: 'MULTIPLE_CHOICE_2',
                      options: [
                        { id: 'opt_1', text: !isFromTF && prevOpts[0] ? prevOpts[0].text : '', sortOrder: 0 },
                        { id: 'opt_2', text: !isFromTF && prevOpts[1] ? prevOpts[1].text : '', sortOrder: 1 },
                      ],
                      correctOptionId: 'opt_1',
                    });
                  } else {
                    const prevOpts = form.options;
                    const isFromTF = form.questionType === 'TRUE_FALSE';
                    setForm({
                      ...form,
                      questionType: 'MULTIPLE_CHOICE',
                      options: [
                        { id: 'opt_1', text: !isFromTF && prevOpts[0] ? prevOpts[0].text : '', sortOrder: 0 },
                        { id: 'opt_2', text: !isFromTF && prevOpts[1] ? prevOpts[1].text : '', sortOrder: 1 },
                        { id: 'opt_3', text: !isFromTF && prevOpts[2] ? prevOpts[2].text : '', sortOrder: 2 },
                        { id: 'opt_4', text: !isFromTF && prevOpts[3] ? prevOpts[3].text : '', sortOrder: 3 },
                      ],
                      correctOptionId: 'opt_1',
                    });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none"
              >
                <option value="MULTIPLE_CHOICE">Multiple Choice (4 Option)</option>
                <option value="MULTIPLE_CHOICE_2">Multiple Choice (2 Option)</option>
                <option value="TRUE_FALSE">True / False</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Time Limit</label>
              <select
                value={form.timeLimitSeconds}
                onChange={(e) => setForm({ ...form, timeLimitSeconds: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none"
              >
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Points</label>
              <select
                value={form.points}
                onChange={(e) => setForm({ ...form, points: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none"
              >
                <option value={500}>500 pts</option>
                <option value={1000}>1000 pts (Standard)</option>
                <option value={2000}>2000 pts (Double)</option>
              </select>
            </div>
          </div>

          {/* Options with Correct Answer Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
              Answer Options (Select radio for correct answer)
            </label>
            <div className="space-y-2">
              {form.options.map((opt, idx) => {
                const badges = [
                  { shape: '▲', color: 'bg-[#F05A28] text-white', label: 'Primary Orange' },
                  { shape: '◆', color: 'bg-[#0D1F3C] text-white border border-[#2d4d80]', label: 'Primary Navy' },
                  { shape: '●', color: 'bg-[#00A191] text-white', label: 'Primary Teal' },
                  { shape: '■', color: 'bg-[#E5E5E5] text-[#0D1F3C]', label: 'Secondary Gray' },
                ];
                const badge = badges[idx % badges.length];

                return (
                  <div key={opt.id} className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="correctOption"
                      checked={form.correctOptionId === opt.id}
                      onChange={() => setForm({ ...form, correctOptionId: opt.id })}
                      className="w-4 h-4 text-[#00A191] bg-slate-950 border-slate-700 focus:ring-0 cursor-pointer"
                      title="Mark as correct answer"
                    />
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${badge.color}`}>
                      {badge.shape}
                    </span>
                    <input
                      type="text"
                      required
                      value={opt.text}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className={`flex-1 px-3 py-2 rounded-xl bg-slate-950 border text-sm outline-none transition-all ${
                        form.correctOptionId === opt.id
                          ? 'border-[#00A191] text-white font-bold ring-1 ring-[#00A191]'
                          : 'border-slate-700 text-white'
                      }`}
                    />
                    {form.correctOptionId === opt.id && (
                      <span className="text-[10px] font-bold text-[#00A191] uppercase px-1.5 py-0.5 rounded bg-[#00A191]/15">
                        Correct
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
              Explanation (Optional - shown after question closes)
            </label>
            <input
              type="text"
              value={form.explanation || ''}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              placeholder="e.g. Tokyo became the capital in 1868..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none"
            />
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/40 text-xs text-rose-300">
              <div className="font-bold mb-0.5">Unable to save question</div>
              <div>{formError}</div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploadingImage}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#00A191] hover:bg-[#00bda9] text-white cursor-pointer shadow-lg shadow-[#00A191]/30 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Question...</span>
                </>
              ) : (
                question.id ? 'Update Question' : 'Save Question'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
