export type Role = 'ADMIN' | 'SUPER_ADMIN';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaSecret?: string; // TOTP secret for verification
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Quiz {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string | null;
  category: string;
  status: QuizStatus;
  questionCount: number;
  gamePin?: string;
  dueDate?: string | null;
  activeGameId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'MULTIPLE_CHOICE' | 'MULTIPLE_CHOICE_2' | 'TRUE_FALSE';

export interface QuestionOption {
  id: string;
  text: string;
  sortOrder: number;
}

export interface Question {
  id: string;
  quizId?: string;
  questionType: QuestionType;
  questionText: string;
  imageUrl?: string | null;
  explanation?: string | null;
  timeLimitSeconds: number;
  points: number;
  sortOrder: number;
  options: QuestionOption[];
  correctOptionId: string;
  createdAt: string;
  updatedAt: string;
}

// Public question data shown to players during live game (NEVER contains correctOptionId)
export interface GameQuestionSnapshot {
  id: string;
  questionType: QuestionType;
  questionText: string;
  imageUrl?: string | null;
  explanation?: string | null;
  timeLimitSeconds: number;
  points: number;
  sortOrder: number;
  options: QuestionOption[];
}

export type GameStatus =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'QUESTION_ACTIVE'
  | 'QUESTION_LOCKED'
  | 'ANSWER_RESULTS'
  | 'LEADERBOARD'
  | 'FINISHED';

export interface Game {
  id: string;
  quizId: string;
  quizTitle: string;
  gamePin: string;
  dueDate?: string | null;
  mode?: 'SELF_PACED' | 'LIVE';
  status: GameStatus;
  currentQuestionIndex: number;
  currentQuestionId: string | null;
  totalQuestions: number;
  playerCount: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  createdBy: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface Player {
  id: string;
  nickname: string;
  avatarId?: string;
  avatarUrl?: string;
  sessionToken: string;
  score: number;
  streak: number;
  correctCount: number;
  rank: number;
  isConnected: boolean;
  joinedAt: string;
  lastActiveAt: string;
}

export interface AnswerSubmission {
  id: string;
  playerId: string;
  nickname: string;
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  responseTimeMs: number;
  submittedAt: string;
}

export interface GameResult {
  id: string;
  playerId: string;
  nickname: string;
  avatarId?: string;
  avatarUrl?: string;
  finalScore: number;
  rank: number;
  correctAnswers: number;
  totalQuestions: number;
  accuracy: number;
  averageResponseTime: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}
