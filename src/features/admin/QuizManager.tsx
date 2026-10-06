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
  seedDefaultQuizIfNone,
  generateCryptoPin,
  syncQuizPinSession,
} from '../../lib/game/gameEngine';
import { SEED_QUESTIONS } from '../../lib/seed/seedData';
import { processUploadedQuestionImage } from '../../lib/utils/imageUpload';
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
  KeyRound,
  Calendar,
  RefreshCw,
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
  }>({
    title: '',
    description: '',
    category: 'General',
    status: 'PUBLISHED',
    gamePin: '',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  });

  // Inline PIN & Due Date management for selectedQuiz
  const [pinInput, setPinInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [pinSavedSuccess, setPinSavedSuccess] = useState(false);

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
    } catch (err) {
      console.error('Error fetching quizzes:', err);
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
      const snap = await getDocs(qQuery);
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id, // Always preserve the question document ID
        } as Question;
      });
      setQuestions(list);
    } catch (err) {
      console.error('Error fetching questions:', err);
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
    });
    setIsQuizModalOpen(true);
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !quizForm.title.trim()) return;

    try {
      setActionLoading(true);
      const cleanPin = quizForm.gamePin.replace(/\D/g, '').slice(0, 6) || generateCryptoPin();
      const cleanDue = quizForm.dueDate || null;

      if (quizModalMode === 'edit' && quizToEdit) {
        // Edit existing quiz without creating a duplicate
        const ref = doc(db, 'quizzes', quizToEdit.id);
        const updated = {
          title: quizForm.title.trim(),
          description: quizForm.description.trim(),
          category: quizForm.category.trim(),
          status: quizForm.status,
          gamePin: cleanPin,
          dueDate: cleanDue,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(ref, updated);
        await syncQuizPinSession(quizToEdit.id, user.uid, cleanPin, cleanDue);
        await writeAuditEntry('QUIZ_UPDATED', 'quizzes', quizToEdit.id, {
          title: quizForm.title,
          gamePin: cleanPin,
          dueDate: cleanDue,
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
          title: quizForm.title.trim(),
          description: quizForm.description.trim(),
          category: quizForm.category.trim(),
          status: quizForm.status,
          questionCount: 0,
          gamePin: cleanPin,
          dueDate: cleanDue,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(ref, newQuiz);
        await syncQuizPinSession(ref.id, user.uid, cleanPin, cleanDue);
        await writeAuditEntry('QUIZ_CREATED', 'quizzes', ref.id, {
          title: quizForm.title,
          gamePin: cleanPin,
          dueDate: cleanDue,
        });
      }
      setIsQuizModalOpen(false);
      setQuizToEdit(null);
      await fetchQuizzes();
    } catch (err) {
      console.error('Error saving quiz:', err);
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
      alert(err?.message || 'Failed to start game session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadSampleQuestions = async (quizId: string) => {
    if (!user) return;
    try {
      setActionLoading(true);
      for (const q of SEED_QUESTIONS) {
        const qRef = doc(collection(db, `quizzes/${quizId}/questions`));
        await setDoc(qRef, {
          ...q,
          quizId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await updateDoc(doc(db, 'quizzes', quizId), {
        questionCount: SEED_QUESTIONS.length,
        status: 'PUBLISHED',
        updatedAt: new Date().toISOString(),
      });
      await fetchQuestions(quizId);
      await fetchQuizzes();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeedQuiz = async () => {
    if (!user) return;
    try {
      setActionLoading(true);
      await seedDefaultQuizIfNone(user.uid);
      await fetchQuizzes();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // QUESTION ACTIONS
  const handleSaveQuestion = async (q: Question) => {
    if (!selectedQuiz) return;
    try {
      setActionLoading(true);
      const questionId = q.id?.trim();
      const { id: _ignored, ...dataToSave } = q;

      if (questionId) {
        // Edit existing question directly in Firestore
        await updateDoc(doc(db, `quizzes/${selectedQuiz.id}/questions`, questionId), {
          ...dataToSave,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Create new question
        const ref = doc(collection(db, `quizzes/${selectedQuiz.id}/questions`));
        await setDoc(ref, {
          ...dataToSave,
          sortOrder: questions.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // Update question count in quiz doc
      const countSnap = await getDocs(collection(db, `quizzes/${selectedQuiz.id}/questions`));
      await updateDoc(doc(db, 'quizzes', selectedQuiz.id), {
        questionCount: countSnap.size,
      });

      // Automatically sync active PIN session if quiz has a saved PIN
      if (user && (selectedQuiz.gamePin || pinInput)) {
        await syncQuizPinSession(
          selectedQuiz.id,
          user.uid,
          selectedQuiz.gamePin || pinInput,
          selectedQuiz.dueDate || dueDateInput || null
        );
      }

      setEditingQuestion(null);
      await fetchQuestions(selectedQuiz.id);
      await fetchQuizzes();
    } catch (err) {
      console.error('Error saving question:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!selectedQuiz || !questionToDelete) return;
    const qId = questionToDelete.id;
    try {
      setActionLoading(true);
      await deleteDoc(doc(db, `quizzes/${selectedQuiz.id}/questions`, qId));
      setQuestionToDelete(null);
      await fetchQuestions(selectedQuiz.id);
      const countSnap = await getDocs(collection(db, `quizzes/${selectedQuiz.id}/questions`));
      await updateDoc(doc(db, 'quizzes', selectedQuiz.id), {
        questionCount: countSnap.size,
      });
      await fetchQuizzes();
    } catch (err) {
      console.error('Error deleting question:', err);
    } finally {
      setActionLoading(false);
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
          {quizzes.length === 0 && (
            <button
              onClick={handleSeedQuiz}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Load 10-Question Demo</span>
            </button>
          )}

          <button
            onClick={handleOpenCreateQuiz}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#00A191] hover:bg-[#00bda9] text-white shadow-lg shadow-[#00A191]/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Quiz</span>
          </button>
        </div>
      </div>

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
              <p className="text-xs text-slate-500 mb-4">Click "Create New Quiz" or load the seed challenge.</p>
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
                      Participant Access PIN & Due Date
                    </h4>
                  </div>
                  {selectedQuiz.gamePin && (
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
                          <span>Copy PIN: {selectedQuiz.gamePin}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
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
                        <span>Generate PIN</span>
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-4">
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

                  <div className="sm:col-span-3">
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

              {/* Questions List */}
              <div className="space-y-3">
                {questions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
                    <p className="text-sm font-bold text-white">No questions in this quiz yet.</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Add questions manually or load 8 curated sample questions to immediately launch live arena sessions.
                    </p>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleLoadSampleQuestions(selectedQuiz.id)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Load 8 Sample Questions</span>
                    </button>
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
                          {q.imageUrl && (
                            <div className="mt-2">
                              <img
                                src={q.imageUrl}
                                alt="Question attachment"
                                className="h-14 w-auto max-w-[140px] rounded-lg object-cover border border-slate-700"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {q.timeLimitSeconds}s
                            </span>
                            <span className="flex items-center gap-1">
                              <Award className="w-3 h-3 text-amber-500" />
                              {q.points} pts
                            </span>
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1F3C] border-2 border-[#00A191]/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
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
                  rows={3}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
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

                <div>
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
    </div>
  );
};

// Standalone Modal for Question creation/editing
interface QuestionEditorModalProps {
  question: Question;
  onSave: (q: Question) => void;
  onClose: () => void;
}

const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({ question, onSave, onClose }) => {
  const [form, setForm] = useState<Question>({ ...question });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Update local form whenever the passed question prop changes
  useEffect(() => {
    setForm({ ...question });
    setImageError(null);
  }, [question]);

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
    nextOpts[idx].text = text;
    setForm({ ...form, options: nextOpts });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.questionText.trim()) return;
    // Explicitly guarantee question.id is preserved so it updates the existing question
    onSave({
      ...form,
      id: question.id,
    });
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

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#00A191] hover:bg-[#00bda9] text-white cursor-pointer shadow-lg shadow-[#00A191]/30 transition-all"
            >
              {question.id ? 'Update Question' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
