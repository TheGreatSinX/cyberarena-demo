export type WeeklyQuestionType = 'MULTIPLE_CHOICE' | 'MULTIPLE_CHOICE_2' | 'TRUE_FALSE';

export interface WeeklyQuestionOption {
  id: string;
  text: string;
}

export interface WeeklyQuestion {
  id: string;
  questionType: WeeklyQuestionType;
  questionText: string;
  imageUrl?: string | null;
  explanation?: string;
  points: number;
  options: WeeklyQuestionOption[];
  correctOptionId: string;
}

export interface WeeklyEmailTemplate {
  subject: string;
  bannerSubtitle: string;
  heading: string;
  greeting: string;
  introParagraph: string;
  ctaButtonText: string;
  securityTipBox: string;
  footerText: string;
  accentColor: string;
  backgroundImageUrl?: string | null;
  customHtmlOverride?: string | null;
}

export interface WeeklyQuestionnaire {
  id: string;
  title: string;
  weekLabel: string;
  description: string;
  dueDate: string;
  passingScorePercent: number;
  status: 'ACTIVE' | 'CLOSED';
  questions: WeeklyQuestion[];
  emailTemplate: WeeklyEmailTemplate;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyInvitation {
  id: string;
  questionnaireId: string;
  recipientEmail: string;
  recipientName: string;
  department: string;
  token: string;
  status: 'PENDING' | 'COMPLETED';
  sentAt: string;
  completedAt?: string | null;
}

export interface WeeklyAnswerItem {
  questionId: string;
  questionText: string;
  selectedOptionId: string;
  selectedOptionText: string;
  correctOptionId: string;
  correctOptionText: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface WeeklySubmission {
  id: string;
  questionnaireId: string;
  questionnaireTitle: string;
  weekLabel: string;
  invitationId?: string | null;
  token?: string | null;
  recipientEmail: string;
  recipientName: string;
  department: string;
  answers: WeeklyAnswerItem[];
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  passed: boolean;
  submittedAt: string;
}
