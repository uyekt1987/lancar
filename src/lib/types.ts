/** Shared types for Lancar. */

export type Level = 'Pemula' | 'Menengah' | 'Mahir';
export type Topic = 'Sehari-hari' | 'Kerja' | 'Traveling' | 'Sekolah';
export type TutorStyle = 'Santai' | 'Tegas' | 'Menyemangati';

/** Where a given AI answer actually ran. */
export type InferenceOrigin = 'on-device' | 'cloud' | 'demo';

export interface Settings {
  level: Level;
  topic: Topic;
  style: TutorStyle;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  /** Only set on tutor messages. */
  source?: InferenceOrigin;
}

export interface VocabItem {
  word: string;
  meaning: string;
  example: string;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface BetterPhrase {
  original: string;
  better: string;
}

export interface CorrectionReportData {
  corrections: GrammarCorrection[];
  betterPhrases: BetterPhrase[];
  newVocab: VocabItem[];
  levelEstimate: string;
  score: number;
  summary: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface ProgressData {
  sessionsCompleted: number;
  totalMessages: number;
  streakDays: number;
  /** ISO date (YYYY-MM-DD) of the last active day, local time. */
  lastActiveDate: string | null;
  /** Rough CEFR-style level shown on the progress screen. */
  level: string;
}

export interface AiResult {
  text: string;
  source: InferenceOrigin;
  /**
   * Set when the answer came from the local demo tutor because the real AI
   * call failed or timed out. The UI shows this as an error banner.
   */
  error?: string;
}

export const LEVELS: Level[] = ['Pemula', 'Menengah', 'Mahir'];
export const TOPICS: Topic[] = ['Sehari-hari', 'Kerja', 'Traveling', 'Sekolah'];
export const STYLES: TutorStyle[] = ['Santai', 'Tegas', 'Menyemangati'];
