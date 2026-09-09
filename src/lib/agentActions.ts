import { StudentTask, StudyNote, JournalEntry, QuizQuestion, FlashcardItem } from '../types';
import {
  localSaveTask,
  localDeleteTask,
  localSaveNote,
  localDeleteNote,
  localSaveJournal,
  localDeleteJournal,
  getCachedTasks,
  getCachedNotes,
  getCachedJournals,
} from './offlineSync';

// =========================================================================
// AI AGENT - action parsing & execution
// =========================================================================
// The chat AI, when running in "Agent" mode, is instructed to append a
// structured action block at the end of its reply:
//
//   <AGENT_ACTION>{"action":"create_task","data":{...}}</AGENT_ACTION>
//
// This module extracts that block, executes the action using the same local
// storage the app's own screens use, and strips the block from the reply so
// users only ever see a normal message plus a confirmation.

const ACTION_BLOCK_RE = /<AGENT_ACTION>([\s\S]*?)<\/AGENT_ACTION>/i;

export type AgentActionType =
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'save_journal'
  | 'delete_journal'
  | 'create_note'
  | 'delete_note'
  | 'create_quiz'
  | 'search_data'
  | 'summarize'
  | 'create_study_plan';

export interface AgentAction {
  action: AgentActionType;
  data: Record<string, any>;
}

const VALID_PRIORITIES = ['high', 'medium', 'low'];

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// Parse a loose date string (from the AI) into an ISO string or null.
function normalizeDate(value: any): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // Already ISO / full timestamp
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString();

  // dd/mm/yyyy or dd-mm-yyyy or dd/mm/yy
  const short = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (short) {
    let year = short[3] ? parseInt(short[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const month = parseInt(short[2], 10) - 1;
    const day = parseInt(short[1], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // "besok" / "lusa" / "hari ini"
  const rel = s.toLowerCase();
  if (rel.includes('besok')) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  if (rel.includes('lusa')) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString();
  }
  if (rel.includes('hari ini') || rel.includes('nanti malam') || rel.includes('nanti sore')) {
    return new Date().toISOString();
  }

  return null;
}

// Parse a loose range ("minggu ini", "bulan ini", ...) into a start Date or null.
function normalizeRange(value: any): Date | null {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  const now = new Date();

  if (s.includes('minggu ini')) {
    const d = new Date(now);
    d.setDate(d.getDate() - (now.getDay() || 7) + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (s.includes('bulan ini')) {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (s.includes('hari ini')) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (s.includes('7 hari') || s.includes('minggu lalu')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (s.includes('30 hari') || s.includes('bulan lalu')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function cleanText(v: any, maxLen = 4000): string {
  return typeof v === 'string' ? v.trim().slice(0, maxLen) : '';
}

function splitTags(v: any, max = 6): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean).slice(0, max);
  if (typeof v === 'string') {
    return v
      .split(/,|;/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, max);
  }
  return [];
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// Find an item by explicit id, then by title/query sub-string match.
function matchTitle<T extends { id: string; title: string }>(
  items: T[],
  data: Record<string, any>
): T | null {
  const id = cleanText(data.id, 80);
  if (id) {
    const byId = items.find((i) => i.id === id);
    if (byId) return byId;
  }
  const q = cleanText(data.title || data.query, 120).toLowerCase();
  if (q) {
    return items.find((i) => i.title.toLowerCase().includes(q)) || null;
  }
  return null;
}

function matchJournal(items: JournalEntry[], data: Record<string, any>): JournalEntry | null {
  const id = cleanText(data.id, 80);
  if (id) {
    const byId = items.find((i) => i.id === id);
    if (byId) return byId;
  }
  const q = cleanText(data.title || data.query, 120).toLowerCase();
  if (q) {
    return (
      items.find(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.content.toLowerCase().includes(q) ||
          (i.tags || []).some((t) => t.toLowerCase().includes(q))
      ) || null
    );
  }
  return null;
}

function clampInt(v: any, fallback: number, min: number, max: number): number {
  const n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function extractAgentAction(text: string): AgentAction | null {
  const m = text.match(ACTION_BLOCK_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (!parsed || typeof parsed !== 'object' || !parsed.action) return null;
    return { action: parsed.action, data: parsed.data || {} };
  } catch (e) {
    return null;
  }
}

export function stripAgentActionBlock(text: string): string {
  return text.replace(ACTION_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

export interface AgentActionResult {
  ok: boolean;
  message: string;
  kind: AgentActionType;
}

export async function executeAgentAction(
  userId: string,
  action: AgentAction
): Promise<AgentActionResult> {
  const data = action.data || {};

  switch (action.action) {
    // ---------------------------------------------------------------------
    case 'create_task': {
      const title = cleanText(data.title);
      if (!title) {
        return { ok: false, message: 'Tidak ada judul task yang jelas.', kind: 'create_task' };
      }
      const priority = VALID_PRIORITIES.includes(data.priority) ? data.priority : 'medium';
      const task: StudentTask = {
        id: genId('task'),
        user_id: userId,
        subject: cleanText(data.subject, 60) || 'Umum',
        title,
        due_date: normalizeDate(data.due_date),
        priority: priority as StudentTask['priority'],
        is_completed: false,
        subtasks: null,
        notes: cleanText(data.notes, 500) || null,
        attachments: null,
        created_at: new Date().toISOString(),
      };
      await localSaveTask(userId, task);
      const due = task.due_date ? `, tenggat ${fmtDateShort(task.due_date)}` : '';
      return {
        ok: true,
        message: `Task "${task.title}" berhasil dibuat (${task.priority}, ${task.subject})${due}.`,
        kind: 'create_task',
      };
    }

    // ---------------------------------------------------------------------
    case 'update_task': {
      const tasks = await getCachedTasks(userId);
      const target = matchTitle(tasks, data);
      if (!target) {
        return {
          ok: false,
          message: 'Task yang dimaksud tidak ditemukan. Sebutkan judul atau ID task-nya.',
          kind: 'update_task',
        };
      }
      const updated: StudentTask = {
        ...target,
        id: target.id,
        user_id: target.user_id,
        created_at: target.created_at,
      };
      if (data.is_completed !== undefined) {
        updated.is_completed = data.is_completed === true || data.is_completed === 'true';
      }
      if (trackedChange(data, 'due_date', true)) {
        const parsed = normalizeDate(data.due_date);
        if (parsed) updated.due_date = parsed;
      }
      if (trackedChange(data, 'title')) updated.title = cleanText(data.title, 200) || updated.title;
      if (trackedChange(data, 'subject')) {
        updated.subject = cleanText(data.subject, 60) || updated.subject;
      }
      if (trackedChange(data, 'priority') && VALID_PRIORITIES.includes(data.priority)) {
        updated.priority = data.priority as StudentTask['priority'];
      }
      if (trackedChange(data, 'notes')) {
        updated.notes = data.notes === null || data.notes === '' ? null : cleanText(data.notes, 500);
      }
      await localSaveTask(userId, updated);
      const changes: string[] = [];
      if (data.is_completed !== undefined) {
        changes.push(updated.is_completed ? 'ditandai selesai' : 'dibuka lagi');
      }
      if (data.due_date !== undefined) changes.push(`tenggat ${fmtDateShort(updated.due_date) || 'dihapus'}`);
      if (typeof data.title === 'string') changes.push(`judul jadi "${updated.title}"`);
      if (typeof data.priority === 'string') changes.push(`prioritas ${updated.priority}`);
      return {
        ok: true,
        message: `Task "${updated.title}" ${changes.length ? 'diperbarui: ' + changes.join(', ') + '.' : 'tidak ada perubahan.'}`,
        kind: 'update_task',
      };
    }

    // ---------------------------------------------------------------------
    case 'delete_task': {
      const tasks = await getCachedTasks(userId);
      const target = matchTitle(tasks, data);
      if (!target) {
        return {
          ok: false,
          message: 'Task yang dimaksud tidak ditemukan.',
          kind: 'delete_task',
        };
      }
      await localDeleteTask(userId, target.id);
      return { ok: true, message: `Task "${target.title}" telah dihapus.`, kind: 'delete_task' };
    }

    // ---------------------------------------------------------------------
    case 'save_journal': {
      const content = cleanText(data.content, 8000);
      if (!content) {
        return { ok: false, message: 'Isi jurnalnya masih kosong.', kind: 'save_journal' };
      }
      const entry: JournalEntry = {
        id: genId('journal'),
        user_id: userId,
        title: cleanText(data.title, 80) || 'Catatan dari Chat',
        content,
        mood: cleanText(data.mood, 20) || 'neutral',
        tags: splitTags(data.tags),
        image_url: null,
        created_at: new Date().toISOString(),
      };
      await localSaveJournal(userId, entry);
      return {
        ok: true,
        message: `Jurnal "${entry.title}" tersimpan (mood: ${entry.mood}).`,
        kind: 'save_journal',
      };
    }

    // ---------------------------------------------------------------------
    case 'delete_journal': {
      const journals = await getCachedJournals(userId);
      const target = matchJournal(journals, data);
      if (!target) {
        return {
          ok: false,
          message: 'Jurnal yang dimaksud tidak ditemukan.',
          kind: 'delete_journal',
        };
      }
      await localDeleteJournal(userId, target.id);
      return { ok: true, message: `Jurnal "${target.title}" telah dihapus.`, kind: 'delete_journal' };
    }

    // ---------------------------------------------------------------------
    case 'create_note': {
      const title = cleanText(data.title);
      const content = cleanText(data.content);
      if (!title) {
        return { ok: false, message: 'Tidak ada judul catatan belajar.', kind: 'create_note' };
      }
      const note: StudyNote = {
        id: genId('note'),
        user_id: userId,
        subject: cleanText(data.subject, 60) || 'Umum',
        title,
        content: content || `Catatan ringkas "${title}" (disusun oleh AI).`,
        summary: cleanText(data.summary, 1000) || null,
        created_at: new Date().toISOString(),
      };
      await localSaveNote(userId, note);
      const sum = note.subject !== 'Umum' ? ` di ${note.subject}` : '';
      return {
        ok: true,
        message: `Catatan "${note.title}" berhasil dibuat${sum}.`,
        kind: 'create_note',
      };
    }

    // ---------------------------------------------------------------------
    case 'delete_note': {
      const notes = await getCachedNotes(userId);
      const target = matchTitle(notes, data);
      if (!target) {
        return {
          ok: false,
          message: 'Catatan yang dimaksud tidak ditemukan.',
          kind: 'delete_note',
        };
      }
      await localDeleteNote(userId, target.id);
      return { ok: true, message: `Catatan "${target.title}" telah dihapus.`, kind: 'delete_note' };
    }

    // ---------------------------------------------------------------------
    case 'create_quiz': {
      const title = cleanText(data.title);
      if (!title) {
        return { ok: false, message: 'Tidak ada judul untuk kuis/flashcard.', kind: 'create_quiz' };
      }
      const quizRaw = Array.isArray(data.quiz) ? data.quiz : [];
      const flashRaw = Array.isArray(data.flashcards) ? data.flashcards : [];
      if (!quizRaw.length && !flashRaw.length) {
        return {
          ok: false,
          message: 'Belum ada soal kuis maupun flashcard untuk disimpan.',
          kind: 'create_quiz',
        };
      }
      const quiz: QuizQuestion[] = quizRaw
        .filter((q: any) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2)
        .slice(0, 12)
        .map((q: any) => ({
          question: cleanText(q.question, 500),
          options: q.options.slice(0, 4).map((o: any) => String(o).trim()),
          correctIndex: clampInt(q.correctIndex, 0, 0, Math.min(q.options.length - 1, 3)),
          explanation: cleanText(q.explanation, 500) || undefined,
        }));
      const flashcards: FlashcardItem[] = flashRaw
        .filter((f: any) => f && typeof f.front === 'string' && typeof f.back === 'string')
        .slice(0, 20)
        .map((f: any) => ({
          id: genId('card'),
          front: cleanText(f.front, 300),
          back: cleanText(f.back, 500),
          hint: cleanText(f.hint, 200) || undefined,
          difficulty: (f.difficulty === 'easy' || f.difficulty === 'medium' || f.difficulty === 'hard'
            ? f.difficulty
            : undefined) as FlashcardItem['difficulty'],
        }));
      if (!quiz.length && !flashcards.length) {
        return {
          ok: false,
          message: 'Format soal kuis/flashcard tidak valid.',
          kind: 'create_quiz',
        };
      }
      const subject = cleanText(data.subject, 60) || 'Umum';
      const note: StudyNote = {
        id: genId('note'),
        user_id: userId,
        subject,
        title,
        content:
          cleanText(data.content, 2000) ||
          `Kuis & flashcard "${title}" (dibuat oleh AI, ${quiz.length} soal + ${flashcards.length} kartu).`,
        summary: null,
        quiz_data: quiz.length ? quiz : null,
        flashcards: flashcards.length ? flashcards : null,
        created_at: new Date().toISOString(),
      };
      await localSaveNote(userId, note);
      return {
        ok: true,
        message: `Kuis "${note.title}" tersimpan: ${quiz.length} soal + ${flashcards.length} flashcard (${subject}).`,
        kind: 'create_quiz',
      };
    }

    // ---------------------------------------------------------------------
    case 'search_data': {
      const kind = cleanText(data.type, 20).toLowerCase() || 'all';
      const query = cleanText(data.query || data.keyword, 120).toLowerCase();
      const limit = clampInt(data.limit, 5, 1, 10);
      const lines: string[] = [];
      let total = 0;

      if (kind === 'task' || kind === 'tasks' || kind === 'all') {
        const tasks = await getCachedTasks(userId);
        const matched = tasks
          .filter((t) => !query || t.title.toLowerCase().includes(query) || (t.subject || '').toLowerCase().includes(query))
          .slice(0, limit);
        if (matched.length) {
          lines.push(`Tugas (${matched.length}):`);
          matched.forEach((t) => {
            const st = t.is_completed ? '✅' : t.due_date && new Date(t.due_date) < new Date() ? '⚠️' : '•';
            lines.push(`  ${st} ${t.title} — ${t.subject}, ${t.priority}${t.due_date ? ', ' + fmtDateShort(t.due_date) : ''}`);
          });
          total += matched.length;
        }
      }
      if (kind === 'note' || kind === 'notes' || kind === 'all') {
        const notes = await getCachedNotes(userId);
        const matched = notes
          .filter((n) => !query || n.title.toLowerCase().includes(query) || (n.content || '').toLowerCase().includes(query) || (n.subject || '').toLowerCase().includes(query))
          .slice(0, limit);
        if (matched.length) {
          lines.push(`Catatan (${matched.length}):`);
          matched.forEach((n) => lines.push(`  📄 ${n.title} — ${n.subject}`));
          total += matched.length;
        }
      }
      if (kind === 'journal' || kind === 'journals' || kind === 'all') {
        const journals = await getCachedJournals(userId);
        const matched = journals
          .filter((j) => !query || j.title.toLowerCase().includes(query) || j.content.toLowerCase().includes(query) || (j.tags || []).some((t) => t.toLowerCase().includes(query)))
          .slice(0, limit);
        if (matched.length) {
          lines.push(`Jurnal (${matched.length}):`);
          matched.forEach((j) => lines.push(`  📓 ${j.title} — ${fmtDateShort(j.created_at)} (${j.mood})`));
          total += matched.length;
        }
      }

      if (!total) {
        return {
          ok: false,
          message: `Tidak ada data yang cocok${query ? ` dengan kata "${query}"` : ''}.`,
          kind: 'search_data',
        };
      }
      return {
        ok: true,
        message: `🔎 Hasil pencarian${query ? ` "${query}"` : ''}:\n${lines.join('\n')}`,
        kind: 'search_data',
      };
    }

    // ---------------------------------------------------------------------
    case 'summarize': {
      const kind = cleanText(data.type, 20).toLowerCase() || 'all';
      const since = normalizeRange(data.since ?? data.period);
      const topic = cleanText(data.topic, 120).toLowerCase();
      const parts: string[] = [];
      let count = 0;

      const inRange = (iso: string) => !since || !isNaN(new Date(iso).getTime()) && new Date(iso).getTime() >= since.getTime();
      const inTopic = (hay: string) => !topic || hay.toLowerCase().includes(topic);

      if (kind === 'journal' || kind === 'journals' || kind === 'all') {
        const journals = (await getCachedJournals(userId)).filter((j) => inRange(j.created_at) && inTopic(j.title));
        if (journals.length) {
          const moodCounts: Record<string, number> = {};
          journals.forEach((j) => {
            const m = (j.mood || 'neutral').toLowerCase();
            moodCounts[m] = (moodCounts[m] || 0) + 1;
          });
          const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
          const tagSet = new Set<string>();
          journals.forEach((j) => (j.tags || []).slice(0, 3).forEach((t) => tagSet.add(t)));
          parts.push(
            `Jurnal: ${journals.length} entri${since ? ` sejak ${fmtDateShort(since.toISOString())}` : ''}` +
              (topMood ? `, mood dominan "${topMood[0]}" (${topMood[1]}x)` : '') +
              (tagSet.size ? `, topik: ${Array.from(tagSet).slice(0, 5).join(', ')}` : '')
          );
          count += journals.length;
        }
      }
      if (kind === 'note' || kind === 'notes' || kind === 'all') {
        const notes = (await getCachedNotes(userId)).filter((n) => inRange(n.created_at) && inTopic(n.title));
        if (notes.length) {
          const subjCounts: Record<string, number> = {};
          notes.forEach((n) => {
            const s = (n.subject || 'Umum').toLowerCase();
            subjCounts[s] = (subjCounts[s] || 0) + 1;
          });
          const topSubj = Object.entries(subjCounts).sort((a, b) => b[1] - a[1])[0];
          const quizTotal = notes.reduce((acc, n) => acc + (n.quiz_data?.length || 0), 0);
          parts.push(
            `Catatan: ${notes.length} catatan` +
              (topSubj ? `, terbanyak di "${topSubj[0]}" (${topSubj[1]}x)` : '') +
              (quizTotal ? `, ${quizTotal} soal kuis` : '')
          );
          count += notes.length;
        }
      }
      if (kind === 'task' || kind === 'tasks' || kind === 'all') {
        const tasks = (await getCachedTasks(userId)).filter((t) => inRange(t.created_at) && inTopic(t.title));
        if (tasks.length) {
          const done = tasks.filter((t) => t.is_completed).length;
          const open = tasks.length - done;
          const overdue = tasks.filter((t) => !t.is_completed && t.due_date && new Date(t.due_date) < new Date()).length;
          parts.push(
            `Tugas: ${tasks.length} tugas (${done} selesai, ${open} terbuka` +
              (overdue ? `, ${overdue} terlambat` : '') + `)`
          );
          count += tasks.length;
        }
      }

      if (!parts.length) {
        return {
          ok: false,
          message: `Belum ada data${kind !== 'all' ? ` ${kind}` : ''} untuk dirangkum${since ? ' dalam rentang tersebut' : ''}.`,
          kind: 'summarize',
        };
      }
      return {
        ok: true,
        message: `📊 Rangkuman pengguna (${count} data):\n` + parts.map((p) => '• ' + p).join('\n'),
        kind: 'summarize',
      };
    }

    // ---------------------------------------------------------------------
    case 'create_study_plan': {
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      const validSessions = sessions.filter((s: any) => s && cleanText(s.title)).slice(0, 12);
      if (!validSessions.length) {
        return {
          ok: false,
          message: 'Rencana belajar belum berisi sesi belajar (kolom title wajib di tiap sesi).',
          kind: 'create_study_plan',
        };
      }
      const goal = cleanText(data.goal, 120) || 'Belajar';
      const planSubject = cleanText(data.subject, 60) || 'Umum';
      const now = new Date();
      let created = 0;
      for (const s of validSessions) {
        const title = cleanText(s.title, 200);
        const task: StudentTask = {
          id: genId('task'),
          user_id: userId,
          subject: cleanText(s.subject, 60) || planSubject,
          title,
          due_date: normalizeDate(s.due_date),
          priority: VALID_PRIORITIES.includes(s.priority) ? s.priority : 'medium',
          is_completed: false,
          subtasks: null,
          notes: cleanText(s.notes, 500) || `Bagian dari rencana "${goal}".`,
          attachments: null,
          created_at: now.toISOString(),
        };
        await localSaveTask(userId, task);
        created += 1;
      }
      const exam = normalizeDate(data.exam_date);
      return {
        ok: true,
        message: `🐣 Rencana belajar "${goal}" tersimpan: ${created} sesi dibuat${exam ? `, target ${fmtDateShort(exam)}` : ''}.`,
        kind: 'create_study_plan',
      };
    }

    default:
      return { ok: false, message: `Aksi "${action.action}" belum didukung.`, kind: action.action };
  }
}

// True when the AI explicitly sent the key (helps distinguish "clear the field"
// from "leave it alone").
function trackedChange(data: Record<string, any>, key: string, allowNull = false): boolean {
  if (!(key in data)) return false;
  const v = data[key];
  if (v === undefined) return false;
  if (v === null) return allowNull;
  return String(v).trim() !== '';
}