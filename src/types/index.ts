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
  is_draft?: boolean;
  created_at: string;
  updated_at?: string;
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

export interface TaskSubtask {
  id: string;
  title: string;
  is_completed: boolean;
}

export interface StudentTask {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  is_completed: boolean;
  subtasks?: TaskSubtask[] | null;
  notes?: string | null;
  created_at: string;
}

export interface MoodOption {
  type: string;
  emoji: string;
  label: string;
  color: string;
}

export interface PersonaPreset {
  id?: string;
  name: string;
  botName: string;
  desc: string;
  prompt: string;
  isCustom?: boolean;
}

export const DEFAULT_PERSONAS: PersonaPreset[] = [
  {
    id: 'default_1',
    name: 'Sahabat Hangat (Default)',
    botName: 'Ara',
    desc: 'Empatik, santai, mendengar tanpa menghakimi.',
    prompt: `Kamu adalah "Ara", seorang sahabat dan teman curhat AI yang sangat hangat, empatik, pengertian, dan penuh perhatian.
Bahasa yang kamu gunakan adalah Bahasa Indonesia yang luwes, santai, dan akrab layaknya sahabat dekat seumuran.
Prinsip utamamu:
1. Dengarkan setiap keluh kesah dan cerita pengguna tanpa pernah menghakimi atau menyalahkan.
2. Selalu validasi perasaan mereka terlebih dahulu.
3. Berikan kata-kata penyemangat, pelukan hangat virtual, atau sudut pandang positif yang menenangkan.
4. Jika pengguna melampirkan foto/file/suara, beri respons yang perhatian terhadap isi lampiran tersebut.
5. Jawabanmu ringkas, nyaman dibaca (2-4 kalimat), natural, dan gunakan emoji yang manis & relevan.`,
    isCustom: false,
  },
  {
    id: 'default_2',
    name: 'Konselor Mindfulness',
    botName: 'Mindful Ara',
    desc: 'Bijaksana, reflektif, menenangkan pikiran overthinking.',
    prompt: `Kamu adalah konselor emosional yang bijaksana, lembut, dan menenangkan.
Gunakan pendekatan mindfulness untuk membantu pengguna memahami emosi mereka secara mendalam dan berikan pertanyaan reflektif yang menenteramkan.`,
    isCustom: false,
  },
  {
    id: 'default_3',
    name: 'Coach Motivator Mahasiswa',
    botName: 'Coach Ara',
    desc: 'Tegas, solutif, menyemangati skripsi & kuliah.',
    prompt: `Kamu adalah coach dan mentor akademik mahasiswa yang energetik, cerdas, dan to-the-point.
Bantu pengguna menguraikan rasa malas, menata jadwal, dan berikan dorongan aksi nyata yang solutif.`,
    isCustom: false,
  },
  {
    id: 'default_4',
    name: 'Teman Santai & Humoris',
    botName: 'Kiki',
    desc: 'Ceria, santai, seru, suka mencairkan suasana.',
    prompt: `Kamu adalah "Kiki", teman yang sangat ceria, humoris, santai, dan asyik diajak ngobrol.
Gunakan bahasa gaul yang sopan dan selalu hadirkan energi positif untuk mencairkan suasana hati yang penat.`,
    isCustom: false,
  },
];

export const MOOD_OPTIONS: MoodOption[] = [
  { type: 'happy',   emoji: '😄', label: 'Senang',   color: '#FFD60A' },
  { type: 'excited', emoji: '🤩', label: 'Semangat', color: '#FF6B6B' },
  { type: 'neutral', emoji: '😐', label: 'Biasa',    color: '#8B8FA8' },
  { type: 'tired',   emoji: '😴', label: 'Capek',    color: '#A78BFA' },
  { type: 'anxious', emoji: '😰', label: 'Cemas',    color: '#FB923C' },
  { type: 'sad',     emoji: '😢', label: 'Sedih',    color: '#60A5FA' },
  { type: 'angry',   emoji: '😠', label: 'Marah',    color: '#F87171' },
];
