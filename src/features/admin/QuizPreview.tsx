import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase/config';
import { Quiz, Question } from '../../types';
import { Clock, ArrowLeft, ArrowRight, CheckCircle2, XCircle, RotateCcw, Smartphone, Monitor } from 'lucide-react';

interface QuizPreviewProps {
  quizId: string;
  onClose: () => void;
}

const OPTION_STYLES = [
  { bg: 'bg-[#F05A28] hover:bg-[#ff6c3b] text-white', shape: '▲', badgeBg: 'bg-black/20 text-white' },
  { bg: 'bg-[#0D1F3C] hover:bg-[#162f59] border border-[#2d4d80] text-white', shape: '◆', badgeBg: 'bg-white/20 text-white' },
  { bg: 'bg-[#00A191] hover:bg-[#00bda9] text-white', shape: '●', badgeBg: 'bg-black/20 text-white' },
  { bg: 'bg-[#E5E5E5] hover:bg-white text-[#0D1F3C]', shape: '■', badgeBg: 'bg-[#0D1F3C]/15 text-[#0D1F3C]' },
];

export const QuizPreview: React.FC<QuizPreviewProps> = ({ quizId, onClose }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(true);

  useEffect(() => {
    const load = async () => {
      const qDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (qDoc.exists()) {
        setQuiz(qDoc.data() as Quiz);
      }
      const questionsSnap = await getDocs(
        query(collection(db, `quizzes/${quizId}/questions`), orderBy('sortOrder', 'asc'))
      );
      setQuestions(questionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question)));
    };
    load();
  }, [quizId]);

  const handleSelectOption = (optId: string) => {
    setSelectedOptionId(optId);
    setIsRevealed(true);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOptionId(null);
      setIsRevealed(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setSelectedOptionId(null);
      setIsRevealed(false);
    }
  };

  const currentQ = questions[currentIndex];

  if (!quiz || questions.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>Loading Quiz Preview...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-slate-950 text-white p-4 sm:p-6">
      {/* Top Bar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exit Preview</span>
          </button>
          <div>
            <h3 className="font-black text-sm sm:text-base text-white">{quiz.title} (Preview Simulator)</h3>
            <p className="text-[11px] text-slate-400">Non-authoritative sandbox: does not alter live game data</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMode(!isMobileMode)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title={isMobileMode ? 'Switch to Fullscreen' : 'Switch to Mobile View'}
          >
            {isMobileMode ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Simulator Container */}
      <div className="flex-1 flex flex-col items-center justify-center my-auto">
        <div
          className={`w-full transition-all duration-300 ${
            isMobileMode
              ? 'max-w-sm rounded-[36px] border-4 border-slate-700 bg-slate-900 shadow-2xl p-6 min-h-[580px]'
              : 'max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl'
          } flex flex-col justify-between`}
        >
          {/* Header */}
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-4">
            <span className="px-2.5 py-1 rounded-full bg-[#0D1F3C] border border-[#E5E5E5]/20 text-[#E5E5E5]">
              {currentIndex + 1} / {questions.length}
            </span>
            <div className="flex items-center gap-1 font-mono text-[#F05A28]">
              <Clock className="w-3.5 h-3.5" />
              <span>{currentQ?.timeLimitSeconds}s</span>
            </div>
            <span className="text-[#00A191] font-bold">{currentQ?.points} pts</span>
          </div>

          {/* Question text in Primary Navy card */}
          <div className="p-6 rounded-2xl bg-[#0D1F3C] border-2 border-[#00A191]/40 text-center my-auto shadow-xl relative overflow-hidden space-y-3">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#F05A28] via-[#00A191] to-[#E5E5E5]" />
            <h4 className="text-base sm:text-lg font-black text-white">{currentQ?.questionText}</h4>
            {currentQ?.imageUrl && (
              <div className="flex justify-center">
                <img
                  src={currentQ.imageUrl}
                  alt="Question preview"
                  className="max-h-40 w-auto rounded-xl object-contain border border-slate-700/80 bg-slate-950/60 p-1"
                />
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-4">
            {currentQ?.options.map((opt, idx) => {
              const style = OPTION_STYLES[idx % OPTION_STYLES.length];
              const isSelected = selectedOptionId === opt.id;
              const isCorrect = isRevealed && currentQ.correctOptionId === opt.id;

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  disabled={isRevealed}
                  className={`flex items-center gap-3 p-3.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-md ${
                    isRevealed
                      ? isCorrect
                        ? 'bg-[#00A191] ring-2 ring-[#20d8c4] text-white'
                        : isSelected
                        ? 'bg-[#F05A28]/85 text-white'
                        : 'bg-[#0D1F3C]/60 border border-[#E5E5E5]/20 opacity-40 text-white'
                      : style.bg
                  }`}
                >
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center font-black ${style.badgeBg}`}>
                    {style.shape}
                  </span>
                  <span className="text-left flex-1 font-bold">{opt.text}</span>
                  {isRevealed && isCorrect && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
                  {isRevealed && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-white shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Feedback & Explanation if revealed */}
          {isRevealed && (
            <div className="p-3.5 rounded-xl bg-[#0D1F3C] border border-[#00A191]/40 text-center text-xs">
              <span className={`font-bold block mb-1 ${selectedOptionId === currentQ.correctOptionId ? 'text-[#00A191]' : 'text-[#F05A28]'}`}>
                {selectedOptionId === currentQ.correctOptionId ? 'Correct Answer Selected!' : 'Incorrect Choice'}
              </span>
              {currentQ.explanation && (
                <p className="text-[#E5E5E5]/80 text-[11px]">{currentQ.explanation}</p>
              )}
            </div>
          )}

          {/* Simulator Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 font-bold text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => {
                setSelectedOptionId(null);
                setIsRevealed(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              title="Reset Question State"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex === questions.length - 1}
              className="flex items-center gap-1 font-bold text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
