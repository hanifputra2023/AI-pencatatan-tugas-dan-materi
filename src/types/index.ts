// TypeScript Types untuk seluruh aplikasi

export type MoodType = string;

export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface ChatAttachment {
  type: 'image' | 'audio' | 'document' | 'file';
  uri: string;
  name?: string;
  size?: number;
  mimeType?: string;
  base64?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  last_message?: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: ChatAttachment | null;
  session_id?: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  title: string;
  content: string;
  mood: string;
  tags: string[];
  image_url: string | null;
  created_at: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface StudyNote {
  id: string;
  user_id: string;
  subject: string;
  title: string;
  content: string;
  summary?: string | null;
  quiz_data?: QuizQuestion[] | null;
  color?: string;
  created_at: string;
  updated_at?: string;
}

export interface StudentTask {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  is_completed: boolean;
  created_at: string;
}

export interface MoodOption {
  type: string;
  emoji: string;
  label: string;
  color: string;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { type: 'happy',   emoji: '😄', label: 'Senang',   color: '#FFD60A' },
  { type: 'excited', emoji: '🤩', label: 'Semangat', color: '#FF6B6B' },
  { type: 'neutral', emoji: '😐', label: 'Biasa',    color: '#8B8FA8' },
  { type: 'tired',   emoji: '😴', label: 'Capek',    color: '#A78BFA' },
  { type: 'anxious', emoji: '😰', label: 'Cemas',    color: '#FB923C' },
  { type: 'sad',     emoji: '😢', label: 'Sedih',    color: '#60A5FA' },
  { type: 'angry',   emoji: '😠', label: 'Marah',    color: '#F87171' },
];
