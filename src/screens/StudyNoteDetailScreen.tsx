import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Platform, AppState
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { useTheme, isColorLight } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { StudyNote, QuizQuestion, FlashcardItem, NoteAttachment } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';
import { copyToClipboard } from '../lib/clipboard';
import SubjectManagerModal from '../components/SubjectManagerModal';
import MarkdownRenderer from '../components/MarkdownRenderer';
import AttachmentManager from '../components/AttachmentManager';
import ScanNoteModal from '../components/ScanNoteModal';
import Flashcard3DModal from '../components/Flashcard3DModal';
import AudioLecturePlayer from '../components/AudioLecturePlayer';
import QuizBattleModal from '../components/QuizBattleModal';
import ShareNoteModal from '../components/ShareNoteModal';
import { exportStudyNoteToPdf } from '../lib/pdfExporter';
import {
  XpPopup,
  ConfettiBurst,
  ShakeView,
  FloatingBadge,
  FadeSlideIn,
} from '../components/DuolingoAnimations';
import {
  isDeviceOnline,
  queueOfflineAction,
  cacheNotesLocally,
  getCachedNotes
} from '../lib/offlineSync';
import { addWaterDrops, addGrowthPoints } from '../lib/gardenStorage';
import { addChest, awardWheelTicketForActivity } from '../lib/lootChestStorage';
import { defeatBossEvent } from '../lib/bossEventStorage';

type StudyNoteRouteProp = RouteProp<RootStackParamList, 'StudyNoteDetail'>;


const FLASHCARD_COUNT_OPTIONS = [5, 10, 15, 20];
const QUIZ_COUNT_OPTIONS = [3, 5, 10, 15];

export default function StudyNoteDetailScreen() {
  const { user } = useAuth();
  const { subjects, addSubject } = useSubjects();
  const { theme, isLightMode } = useTheme();
  const route = useRoute<StudyNoteRouteProp>();
  const navigation = useNavigation();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const primaryBtnTextColor = isColorLight(theme.primary) ? '#0F172A' : '#FFFFFF';

  const noteId = route.params?.noteId;

  // View Mode: 'reader' (clean detail view) vs 'edit' (form input)
  const [viewMode, setViewMode] = useState<'reader' | 'edit'>(noteId ? 'reader' : 'edit');

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizQuestion[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [createdAt, setCreatedAt] = useState<string>('');

  // Subject Manager Modal
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  // AI Scan & Rewrite Modal
  const [showScanModal, setShowScanModal] = useState(!!route.params?.autoOpenScan);

  // 3D Flashcard Modal & Audio Player
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState<number>(10);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Interactive Quiz options & test answers state
  const [quizCount, setQuizCount] = useState<number>(5);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showXpPopup, setShowXpPopup] = useState(false);
  const [xpAmount, setXpAmount] = useState(10);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showQuizBattleModal, setShowQuizBattleModal] = useState(false);
  const [shakeQuestionIndex, setShakeQuestionIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!noteId);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  const handleApplyScanResult = ({
    content: newContent,
    title: suggestedTitle,
    subject: suggestedSubj,
    mode,
  }: {
    content: string;
    title?: string;
    subject?: string;
    mode: 'replace' | 'append';
  }) => {
    if (mode === 'append') {
      setContent(prev => (prev.trim() ? prev.trim() + '\n\n---\n\n' + newContent : newContent));
    } else {
      setContent(newContent);
    }

    if (suggestedTitle && (!title.trim() || mode === 'replace')) {
      setTitle(suggestedTitle);
    }

    if (suggestedSubj && (!subject.trim() || mode === 'replace')) {
      const matched = subjects.find(s => s.name.toLowerCase() === suggestedSubj.toLowerCase());
      if (matched) {
        setSubject(matched.name);
      } else if (suggestedSubj.trim()) {
        setSubject(suggestedSubj.trim());
      }
    }

    setViewMode('edit');
    showAlert('Materi Diterapkan 🎉', 'Catatan berhasil diperbarui dari hasil analisis foto AI!');
  };

  const handleUpdateAttachment = (updated: NoteAttachment) => {
    setAttachments(prev => prev.map(a => a.id === updated.id ? updated : a));

    if (noteId && user) {
      getCachedNotes(user.id)
        .then(currentNotes => {
          const idx = currentNotes.findIndex(n => n.id === noteId);
          if (idx >= 0) {
            const currentAtts = currentNotes[idx].attachments || [];
            const nextAtts = currentAtts.map(a => a.id === updated.id ? updated : a);
            const updatedNote: StudyNote = {
              ...currentNotes[idx],
              attachments: nextAtts,
              updated_at: new Date().toISOString(),
            };
            const nextNotes = [...currentNotes];
            nextNotes[idx] = updatedNote;
            cacheNotesLocally(user.id, nextNotes).catch(() => {});
          }
        })
        .catch(() => {});
    }
  };

  const contentInputRef = useRef<TextInput>(null);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [contentHeight, setContentHeight] = useState(260);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const lastSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [editTab, setEditTab] = useState<'write' | 'preview'>('write');

  const FONT_SIZES = [12, 14, 16, 18, 20];

  const getEffectiveSelection = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        const ta = activeEl as HTMLTextAreaElement;
        if (typeof ta.selectionStart === 'number' && typeof ta.selectionEnd === 'number') {
          if (ta.selectionStart !== ta.selectionEnd || lastSelectionRef.current.start === 0) {
            lastSelectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
          }
        }
      }
    }
    return lastSelectionRef.current;
  }, []);

  const wrapSelection = useCallback((before: string, after: string, placeholder: string) => {
    const sel = getEffectiveSelection();
    let start = sel.start ?? 0;
    let end = sel.end ?? 0;

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    start = Math.max(0, Math.min(start, content.length));
    end = Math.max(0, Math.min(end, content.length));

    const hasSelection = start !== end;

    if (hasSelection) {
      const selected = content.substring(start, end);

      // Check if text is ALREADY wrapped by this exact format -> TOGGLE OFF
      const beforeLen = before.length;
      const afterLen = after.length;
      const textBefore = content.substring(Math.max(0, start - beforeLen), start);
      const textAfter = content.substring(end, Math.min(content.length, end + afterLen));

      if (textBefore === before && textAfter === after) {
        // Toggle OFF: Remove surrounding tag
        const newText = content.substring(0, start - beforeLen) + selected + content.substring(end + afterLen);
        setContent(newText);
        const newStart = start - beforeLen;
        const newEnd = newStart + selected.length;
        lastSelectionRef.current = { start: newStart, end: newEnd };
        setSelection({ start: newStart, end: newEnd });
        setTimeout(() => {
          contentInputRef.current?.focus();
        }, 50);
        return;
      }

      // Check if selected substring already starts and ends with tag
      if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= beforeLen + afterLen) {
        const unwrapped = selected.substring(beforeLen, selected.length - afterLen);
        const newText = content.substring(0, start) + unwrapped + content.substring(end);
        setContent(newText);
        const newEnd = start + unwrapped.length;
        lastSelectionRef.current = { start, end: newEnd };
        setSelection({ start, end: newEnd });
        setTimeout(() => {
          contentInputRef.current?.focus();
        }, 50);
        return;
      }

      // Wrap the highlighted text directly!
      const newText = content.substring(0, start) + before + selected + after + content.substring(end);
      setContent(newText);
      const newStart = start + before.length;
      const newEnd = newStart + selected.length;
      lastSelectionRef.current = { start: newStart, end: newEnd };
      setSelection({ start: newStart, end: newEnd });
      setTimeout(() => {
        contentInputRef.current?.focus();
      }, 50);
    } else {
      // No text selected: insert placeholder and highlight it so typing replaces it
      const newText = content.substring(0, start) + before + placeholder + after + content.substring(start);
      setContent(newText);
      const newCursorStart = start + before.length;
      const newCursorEnd = newCursorStart + placeholder.length;
      lastSelectionRef.current = { start: newCursorStart, end: newCursorEnd };
      setSelection({ start: newCursorStart, end: newCursorEnd });
      setTimeout(() => {
        contentInputRef.current?.focus();
      }, 50);
    }
  }, [content, getEffectiveSelection]);

  const prefixLine = useCallback((prefix: string, placeholder: string) => {
    const sel = getEffectiveSelection();
    let start = sel.start ?? 0;
    let end = sel.end ?? 0;

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    start = Math.max(0, Math.min(start, content.length));
    end = Math.max(0, Math.min(end, content.length));

    const hasSelection = start !== end;

    if (hasSelection) {
      const lastNewlineBeforeStart = content.lastIndexOf('\n', start - 1);
      const lineStartIndex = lastNewlineBeforeStart === -1 ? 0 : lastNewlineBeforeStart + 1;
      const nextNewlineAfterEnd = content.indexOf('\n', end);
      const lineEndIndex = nextNewlineAfterEnd === -1 ? content.length : nextNewlineAfterEnd;

      const selectedLinesBlock = content.substring(lineStartIndex, lineEndIndex);
      const lines = selectedLinesBlock.split('\n');

      const transformedLines = lines.map((line, idx) => {
        if (prefix.startsWith('#')) {
          return prefix + line.replace(/^#{1,6}\s*/, '');
        }
        if (prefix === '1. ') {
          return `${idx + 1}. ` + line.replace(/^(\d+\.|[-*•>])\s*/, '');
        }
        if (prefix === '- ') {
          return `- ` + line.replace(/^(\d+\.|[-*•>])\s*/, '');
        }
        if (prefix === '> ') {
          return `> ` + line.replace(/^>\s*/, '');
        }
        if (prefix.includes('---')) {
          return `${line}\n---`;
        }
        return prefix + line;
      });

      const newBlock = transformedLines.join('\n');
      const newText = content.substring(0, lineStartIndex) + newBlock + content.substring(lineEndIndex);
      setContent(newText);

      const newStart = lineStartIndex;
      const newEnd = lineStartIndex + newBlock.length;
      lastSelectionRef.current = { start: newStart, end: newEnd };
      setSelection({ start: newStart, end: newEnd });
      setTimeout(() => {
        contentInputRef.current?.focus();
      }, 50);
    } else {
      const lastNewline = content.lastIndexOf('\n', start - 1);
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const nextNewline = content.indexOf('\n', start);
      const lineEnd = nextNewline === -1 ? content.length : nextNewline;
      const currentLine = content.substring(lineStart, lineEnd);

      if (currentLine.trim().length > 0) {
        let newLine = currentLine;
        if (prefix.startsWith('#')) {
          newLine = prefix + currentLine.replace(/^#{1,6}\s*/, '');
        } else if (prefix === '1. ') {
          newLine = `1. ` + currentLine.replace(/^(\d+\.|[-*•>])\s*/, '');
        } else if (prefix === '- ') {
          newLine = `- ` + currentLine.replace(/^(\d+\.|[-*•>])\s*/, '');
        } else if (prefix === '> ') {
          newLine = `> ` + currentLine.replace(/^>\s*/, '');
        } else if (prefix.includes('---')) {
          newLine = `${currentLine}\n---`;
        } else {
          newLine = prefix + currentLine;
        }

        const newText = content.substring(0, lineStart) + newLine + content.substring(lineEnd);
        setContent(newText);
        const newCursor = lineStart + newLine.length;
        lastSelectionRef.current = { start: newCursor, end: newCursor };
        setSelection({ start: newCursor, end: newCursor });
        setTimeout(() => {
          contentInputRef.current?.focus();
        }, 50);
      } else {
        const insert = prefix + placeholder;
        const newText = content.substring(0, lineStart) + insert + content.substring(lineEnd);
        setContent(newText);
        const newCursorStart = lineStart + prefix.length;
        const newCursorEnd = newCursorStart + placeholder.length;
        lastSelectionRef.current = { start: newCursorStart, end: newCursorEnd };
        setSelection({ start: newCursorStart, end: newCursorEnd });
        setTimeout(() => {
          contentInputRef.current?.focus();
        }, 50);
      }
    }
  }, [content, getEffectiveSelection]);

  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const draftSaveTimeoutRef = useRef<any>(null);
  const isSavedRef = useRef(false);

  const getDraftKey = useCallback(() => {
    return `@study_note_draft_${user?.id || 'anonymous'}`;
  }, [user]);

  // Load Note from DB or Restore Local Draft on Focus / Mount
  useFocusEffect(
    useCallback(() => {
      if (noteId) {
        // Reset semua state catatan ke kosong SEBELUM fetch agar tidak ada
        // "ghost" konten catatan sebelumnya tampil selama loading
        setTitle('');
        setContent('');
        setSummary(null);
        setQuizData([]);
        setFlashcards([]);
        setAttachments([]);
        setCreatedAt('');
        setSelectedAnswers({});
        setFetching(true);
        fetchNote();
        setViewMode('reader');
      } else {
        setViewMode('edit');
        if (isSavedRef.current) {
          isSavedRef.current = false;
          setTitle('');
          setSubject(subjects.length > 0 ? subjects[0].name : 'Umum');
          setContent('');
          setSummary(null);
          setQuizData([]);
          setSelectedAnswers({});
          setDraftSavedTime(null);
          setHasRestoredDraft(false);
          setFetching(false);
          return;
        }

        const loadDraft = async () => {
          try {
            const draftKey = getDraftKey();
            const rawDraft = await AsyncStorage.getItem(draftKey);
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft && (draft.title || draft.content)) {
                setTitle(draft.title || '');
                setSubject(draft.subject || (subjects.length > 0 ? subjects[0].name : 'Umum'));
                setContent(draft.content || '');
                setSummary(draft.summary || null);
                setQuizData(draft.quizData || []);
                if (draft.savedAt) {
                  setDraftSavedTime(new Date(draft.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
                }
                setHasRestoredDraft(true);
                setFetching(false);
                return;
              }
            }
          } catch (e) {
            console.log('Error loading note draft:', e);
          }

          setTitle('');
          setSubject(subjects.length > 0 ? subjects[0].name : 'Umum');
          setContent('');
          setSummary(null);
          setQuizData([]);
          setSelectedAnswers({});
          setCreatedAt('');
          setFetching(false);
        };

        loadDraft();
      }
    }, [noteId, getDraftKey, subjects])
  );

  // Auto-Save Draft to Local Storage (Debounced 700ms)
  useEffect(() => {
    // Only auto-save for new notes
    if (noteId || isSavedRef.current) return;

    // Only save if there's actual text
    if (!title.trim() && !content.trim()) {
      return;
    }

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(async () => {
      if (isSavedRef.current) return;
      try {
        const draftKey = getDraftKey();
        const draftPayload = {
          title,
          subject,
          content,
          summary,
          quizData,
          savedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(draftKey, JSON.stringify(draftPayload));
        setDraftSavedTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
        setHasRestoredDraft(true);
      } catch (e) {
        console.log('Error saving note draft:', e);
      }
    }, 700);

    return () => {
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
    };
  }, [title, subject, content, summary, quizData, noteId, getDraftKey]);

  // AppState Listener to flush-save draft on background / screen off
  useEffect(() => {
    if (noteId || isSavedRef.current) return;

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (isSavedRef.current) return;
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (title.trim() || content.trim()) {
          try {
            const draftKey = getDraftKey();
            const draftPayload = {
              title,
              subject,
              content,
              summary,
              quizData,
              savedAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem(draftKey, JSON.stringify(draftPayload));
          } catch (e) {}
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [title, subject, content, summary, quizData, noteId, getDraftKey]);

  // Discard Draft & Start Fresh
  const handleDiscardDraft = () => {
    confirmAction(
      'Hapus Draf Catatan?',
      'Semua teks draf yang belum disimpan akan dihapus dan formulir dikosongkan.',
      async () => {
        try {
          const draftKey = getDraftKey();
          await AsyncStorage.removeItem(draftKey);
        } catch (e) {}
        setTitle('');
        setContent('');
        setSummary(null);
        setQuizData([]);
        setSelectedAnswers({});
        setDraftSavedTime(null);
        setHasRestoredDraft(false);
        showAlert('Draf Dihapus', 'Formulir catatan telah dikosongkan.');
      },
      'Hapus Draf'
    );
  };

  const fetchNote = async () => {
    if (!user || !noteId) {
      setFetching(false);
      return;
    }
    try {
      const cached = await getCachedNotes(user.id);
      const found = cached.find(n => n.id === noteId);
      if (found) {
        // Set semua field catatan sekaligus (atomic) agar tidak ada
        // frame yang menampilkan state setengah-setengah
        setTitle(found.title);
        setSubject(found.subject || (subjects.length > 0 ? subjects[0].name : 'Umum'));
        setContent(found.content);
        setSummary(found.summary || null);
        setQuizData(found.quiz_data || []);
        setFlashcards(found.flashcards || []);
        setAttachments(found.attachments || []);
        setCreatedAt(found.created_at);
      } else {
        // Note tidak ditemukan di cache — kosongkan state
        setTitle('');
        setSubject(subjects.length > 0 ? subjects[0].name : 'Umum');
        setContent('');
        setSummary(null);
        setQuizData([]);
        setFlashcards([]);
        setAttachments([]);
        setCreatedAt('');
      }
    } catch (e) {
      console.log('Error fetching local note:', e);
    } finally {
      setFetching(false);
    }
  };

  // AI Feature 1: Advanced Structured Academic Summarizer
  const handleGenerateSummary = async () => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Tulis materi catatan terlebih dahulu untuk dirangkum AI.');
      return;
    }

    const online = await isDeviceOnline();
    if (!online) {
      showAlert('Mode Offline ☁️', 'Fitur Rangkuman AI memerlukan koneksi internet. Sambungkan perangkat ke internet untuk menggunakan AI.');
      return;
    }
    setGeneratingSummary(true);
    try {
      const attachmentsCtx = attachments.length > 0
        ? `\nLampiran Dokumen/File: ` + attachments.map(a => `${a.name}${a.textContent ? ` (Isi: ${a.textContent.substring(0, 500)})` : ''}`).join(', ')
        : '';

      const prompt = `Kamu adalah Ara, asisten pintar profesor akademik dan tutor belajar terbaik untuk mahasiswa.
Rangkum materi kuliah berikut menjadi intisari yang sangat terstruktur, jelas, komprehensif, dan mudah dihafal untuk persiapan ujian kuliah.

Format ringkasan harus memuat:
📌 Konsep & Definisi Kunci
💡 Rumus / Logika / Alur Utama
⚠️ Poin Kritis yang Sering Keluar di Ujian
🎯 Kesimpulan Ringkas

Judul: ${title || 'Catatan Kuliah'}
Mata Kuliah: ${subject || 'Kuliah'}
${attachmentsCtx}
Isi Catatan:
${content}`;

      const aiReply = await sendMessageToGemini([], prompt);
      setSummary(aiReply);
      if (noteId && user) {
        const currentNotes = await getCachedNotes(user.id);
        const updated = currentNotes.map(n => n.id === noteId ? { ...n, summary: aiReply, updated_at: new Date().toISOString() } : n);
        await cacheNotesLocally(user.id, updated);
      }
      showAlert('Rangkuman Selesai', 'Intisari materi telah dibuat dan otomatis tersimpan ke catatan.');
    } catch (e: any) {
      console.log('AI Summary error:', e);
      showAlert('Gagal Merangkum', e?.message || 'Server AI sedang sibuk.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Feature 1.1: Append Summary into Note Content
  const handleAppendSummaryToContent = async () => {
    if (!summary) return;
    const newContent = `${content.trim()}\n\n---\n### Rangkuman Intisari AI:\n${summary.trim()}`;
    setContent(newContent);
    if (noteId && user) {
      const currentNotes = await getCachedNotes(user.id);
      const updated = currentNotes.map(n => n.id === noteId ? { ...n, content: newContent, updated_at: new Date().toISOString() } : n);
      await cacheNotesLocally(user.id, updated);
    }
    showAlert('Berhasil Disisipkan', 'Rangkuman telah digabungkan ke dalam catatan kuliah dan tersimpan.');
  };

  // AI Feature 1.5: Interactive 3D Flashcards Generator & SRS Manager
  const handleSaveFlashcardsState = async (updatedCards: FlashcardItem[]) => {
    setFlashcards(updatedCards);
    if (noteId && user) {
      const currentNotes = await getCachedNotes(user.id);
      const updated = currentNotes.map(n => n.id === noteId ? { ...n, flashcards: updatedCards, updated_at: new Date().toISOString() } : n);
      await cacheNotesLocally(user.id, updated);
    }
  };

  const handleGenerateFlashcards = async (overrideCount?: number) => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Isi catatan masih kosong. Tulis materi terlebih dahulu untuk dibuatkan flashcard.');
      return;
    }

    const online = await isDeviceOnline();
    if (!online) {
      showAlert('Mode Offline', 'Fitur Flashcard AI memerlukan koneksi internet.');
      return;
    }

    const countToGenerate = overrideCount || flashcardCount || 10;
    setGeneratingFlashcards(true);
    try {
      const prompt = `Anda adalah asisten dosen akademik jenius dan sistem pembuat kartu belajar cerdas (Spaced Repetition Flashcard).
Tugas Anda adalah membedah dan mengekstrak materi kuliah berikut menjadi tepat ${countToGenerate} kartu flashcard konsep inti yang berkualitas tinggi, mendalam, dan mudah dipahami.

PEDOMAN PENTING:
1. JANGAN copy-paste teks mentah apa adanya. Olah dan sintesis informasi menjadi konsep yang padat, berbobot, dan jernih.
2. Jika ada rumus matematika / fisika / sains, gunakan format Unicode yang bersih dan langsung terbaca (misal: "E = mc²", "sin θ", "V = I × R", "Δv / Δt") dan HINDARI kode LaTeX mentah yang membingungkan.
3. Sisi depan ("front"): Pertanyaan pemicu ingatan, istilah konsep, atau studi kasus singkat yang menantang pemahaman.
4. Sisi belakang ("back"): Jawaban esensial, definisi lugas, rumus, atau penjelasan logis yang mudah dihafal.
5. "hint": Petunjuk kata kunci atau analogi singkat pembantu ingatan (opsional).

Judul Materi: "${title || 'Materi Kuliah'}"
Mata Kuliah: "${subject || 'Kuliah Umum'}"
Isi Catatan:
"""
${content}
"""

Kembalikan HANYA JSON array valid tanpa markdown pembungkus:
[
  {
    "id": "1",
    "front": "Pertanyaan konsep / istilah penting",
    "back": "Penjelasan esensial atau jawaban lugas",
    "hint": "Petunjuk kata kunci singkat"
  }
]`;

      const response = await sendMessageToGemini([], prompt, null, undefined, { isJsonMode: true, maxTokens: 4096 });
      const parsed: any = extractJsonFromText(response);
      let rawArray: any[] = [];
      if (Array.isArray(parsed)) {
        rawArray = parsed;
      } else if (parsed && Array.isArray(parsed.flashcards)) {
        rawArray = parsed.flashcards;
      } else if (parsed && typeof parsed === 'object') {
        const found = Object.values(parsed).find(v => Array.isArray(v));
        if (found) rawArray = found as any[];
      }

      if (Array.isArray(rawArray) && rawArray.length > 0) {
        const formatted: FlashcardItem[] = rawArray.slice(0, countToGenerate).map((item, idx) => ({
          id: item.id || String(idx + 1),
          front: item.front || item.question || item.term || '',
          back: item.back || item.answer || item.definition || '',
          hint: item.hint || undefined,
          mastered: false,
          difficulty: undefined,
        }));

        setFlashcards(formatted);

        if (noteId && user) {
          const currentNotes = await getCachedNotes(user.id);
          const updated = currentNotes.map(n => n.id === noteId ? { ...n, flashcards: formatted, updated_at: new Date().toISOString() } : n);
          await cacheNotesLocally(user.id, updated);
        }

        showAlert(
          'Flashcard Siap',
          `${formatted.length} kartu flashcard berhasil dibuat. Buka sekarang untuk mulai belajar?`,
          {
            confirmText: 'Buka Flashcard',
            onClose: () => {
              setShowFlashcardModal(true);
            },
          }
        );
      } else {
        showAlert('Perhatian', 'AI belum dapat menghasilkan flashcard dari teks ini. Pastikan catatan memiliki materi penjelasan.');
      }
    } catch (e: any) {
      showAlert('Gagal', e.message || 'Terjadi kesalahan saat membuat flashcard AI.');
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  // AI Feature 2: Generate Comprehensive Interactive Quiz
  const handleGenerateQuiz = async (autoLaunchBattle?: boolean | any) => {
    const shouldLaunch = autoLaunchBattle === true;
    if (!content.trim()) {
      showAlert('Perhatian', 'Isi catatan terlebih dahulu untuk membuat soal kuis.');
      return;
    }
    setGeneratingQuiz(true);
    try {
      const prompt = `Buatkan tepat ${quizCount} soal kuis pilihan ganda akademik (4 opsi A, B, C, D) yang mendalam dan berkualitas tinggi berdasarkan materi kuliah ini.

PEDOMAN PENTING:
1. JANGAN gunakan teks mentah tanpa diolah. Buat pertanyaan konseptual, analisis kasus, dan penalaran logis dari materi.
2. Sediakan 1 opsi jawaban benar dan 3 opsi pengecoh yang masuk akal dan realistis (bukan opsi asal-asalan).
3. Berikan penjelasan ilmiah yang padat dan mencerahkan kenapa opsi tersebut benar.
4. Gunakan format Unicode yang bersih untuk simbol dan rumus matematika/sains.

Format output HARUS HANYA berupa JSON valid array murni:
[
  {
    "question": "Pertanyaan soal yang berbobot",
    "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
    "correctIndex": 0,
    "explanation": "Penjelasan ilmiah kenapa opsi ini benar"
  }
]

Mata Kuliah: ${subject || 'Kuliah'}
Materi Catatan:
${content}`;

      const academicSystemPrompt = `Kamu adalah mesin pembuat kuis akademik cerdas berformat JSON murni.
Output WAJIB berupa JSON array valid [...] tanpa pembuka, tanpa salam, dan tanpa penutup.`;

      const aiReply = await sendMessageToGemini([], prompt, null, academicSystemPrompt, {
        isJsonMode: true,
        maxTokens: 4096,
      });

      const rawParsed: any = extractJsonFromText(aiReply);
      let rawArray: any[] = [];
      if (Array.isArray(rawParsed)) {
        rawArray = rawParsed;
      } else if (rawParsed && Array.isArray(rawParsed.questions)) {
        rawArray = rawParsed.questions;
      } else if (rawParsed && Array.isArray(rawParsed.quiz)) {
        rawArray = rawParsed.quiz;
      } else if (rawParsed && typeof rawParsed === 'object') {
        const found = Object.values(rawParsed).find(v => Array.isArray(v));
        if (found) rawArray = found as any[];
      }

      if (!rawArray || rawArray.length === 0) {
        throw new Error('Format kuis dari AI tidak valid. Coba buat lagi.');
      }

      const cleanQuestions: QuizQuestion[] = rawArray.slice(0, quizCount).map((q: any, idx: number) => {
        const options: string[] = Array.isArray(q.options) && q.options.length >= 2
          ? q.options.slice(0, 4).map((opt: any) => String(opt).trim())
          : ['Opsi A', 'Opsi B', 'Opsi C', 'Opsi D'];
        
        let correctIdx = 0;
        if (typeof q.correctIndex === 'number') {
          correctIdx = q.correctIndex;
        } else if (typeof q.answerIndex === 'number') {
          correctIdx = q.answerIndex;
        } else if (typeof q.correctAnswer === 'string') {
          const foundIdx = options.findIndex(o => o.toLowerCase() === q.correctAnswer.toLowerCase());
          if (foundIdx !== -1) correctIdx = foundIdx;
        }

        return {
          question: q.question || `Pertanyaan ${idx + 1}`,
          options,
          correctIndex: Math.min(Math.max(0, correctIdx), options.length - 1),
          explanation: q.explanation || 'Jawaban didasarkan pada materi catatan kuliah.',
        };
      });

      setQuizData(cleanQuestions);
      setSelectedAnswers({});

      if (noteId && user) {
        const currentNotes = await getCachedNotes(user.id);
        const updated = currentNotes.map(n => n.id === noteId ? { ...n, quiz_data: cleanQuestions, updated_at: new Date().toISOString() } : n);
        await cacheNotesLocally(user.id, updated);
      }

      if (shouldLaunch) {
        setShowQuizBattleModal(true);
      } else {
        showAlert(
          'Kuis Siap',
          `${cleanQuestions.length} soal kuis telah berhasil dibuat. Ingin langsung menantang Monster Bos dalam Mode RPG Battle?`,
          {
            confirmText: 'Mulai Boss Battle ⚔️',
            onClose: () => {
              setShowQuizBattleModal(true);
            }
          }
        );
      }
    } catch (e: any) {
      showAlert('Gagal', e.message || 'Terjadi kesalahan saat menyusun kuis AI.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Feature 2.1: Delete Quiz from Note
  const handleDeleteQuiz = () => {
    confirmAction(
      'Hapus Kuis Latihan?',
      'Semua daftar soal kuis ini akan dihapus dari catatan.',
      async () => {
        setQuizData([]);
        setSelectedAnswers({});
        if (noteId && user) {
          const currentNotes = await getCachedNotes(user.id);
          const updated = currentNotes.map(n => n.id === noteId ? { ...n, quiz_data: [], updated_at: new Date().toISOString() } : n);
          await cacheNotesLocally(user.id, updated);
        }
      },
      'Hapus Kuis'
    );
  };

  // Feature 2.2: Reset Quiz Answers
  const handleResetQuizAnswers = () => {
    setSelectedAnswers({});
  };

  // Feature 2.3: Handle Interactive Quiz Answer Selection
  const handleSelectQuizOption = (qIndex: number, optIndex: number) => {
    if (selectedAnswers[qIndex] !== undefined) return;
    const isCorrect = optIndex === quizData[qIndex]?.correctIndex;

    setSelectedAnswers(prev => {
      const updated = { ...prev, [qIndex]: optIndex };

      if (isCorrect) {
        setXpAmount(10);
        setShowXpPopup(false);
        setTimeout(() => setShowXpPopup(true), 50);
      } else {
        setShakeQuestionIndex(qIndex);
        setTimeout(() => setShakeQuestionIndex(null), 500);
      }

      // Check if all questions are answered
      const answeredTotal = Object.keys(updated).length;
      if (answeredTotal === quizData.length) {
        const correctTotal = Object.entries(updated).filter(
          ([idx, ans]) => ans === quizData[Number(idx)]?.correctIndex
        ).length;
        if (correctTotal >= Math.ceil(quizData.length * 0.6)) {
          setTimeout(() => {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3500);
          }, 350);
        }
      }

      return updated;
    });
  };

  // Save or Update Note
  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      showAlert('Perhatian', 'Judul dan isi catatan kuliah wajib diisi.');
      return;
    }
    const finalSubject = subject.trim() || (subjects.length > 0 ? subjects[0].name : 'Umum');
    if (finalSubject && !subjects.some(s => s.name.toLowerCase().trim() === finalSubject.toLowerCase())) {
      addSubject(finalSubject);
    }
    setLoading(true);

    isSavedRef.current = true;
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }

    if (user) {
      const currentNotes = await getCachedNotes(user.id);
      const targetId = noteId || `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newNoteObj: StudyNote = {
        id: targetId,
        user_id: user.id,
        title: title.trim(),
        subject: finalSubject,
        content: content.trim(),
        summary,
        quiz_data: quizData,
        flashcards: flashcards.length > 0 ? flashcards : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        created_at: createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const idx = currentNotes.findIndex(n => n.id === targetId);
      let updated: StudyNote[];
      if (idx >= 0) {
        updated = [...currentNotes];
        updated[idx] = newNoteObj;
      } else {
        updated = [newNoteObj, ...currentNotes];
      }
      await cacheNotesLocally(user.id, updated);
      try {
        const draftKey = getDraftKey();
        await AsyncStorage.removeItem(draftKey);
        setHasRestoredDraft(false);
        setDraftSavedTime(null);
      } catch (e) {}
    }

    setLoading(false);
    if (!noteId) {
      addWaterDrops(1).catch(() => {});
      addChest(1).catch(() => {});
      awardWheelTicketForActivity().catch(() => {});
      addGrowthPoints(25).catch(() => {});
      showAlert('Catatan Berhasil Disimpan! 🎉', 'Kamu mendapatkan +1 Tetes Air 💧 untuk Taman, +1 Kotak Hadiah 🎁, dan +1 Tiket Roda Keberuntungan 🎰!');
    } else {
      showAlert('Tersimpan', 'Catatan kuliah berhasil diperbarui.');
    }
    if (noteId) {
      setViewMode('reader');
    } else {
      setTitle('');
      setContent('');
      setSummary(null);
      setQuizData([]);
      setFlashcards([]);
      setSelectedAnswers({});
      navigation.goBack();
    }
  };

  // Delete Note
  const handleDeleteCurrentNote = () => {
    if (!noteId) return;
    confirmAction(
      'Hapus Catatan?',
      'Catatan materi kuliah ini akan dihapus permanen.',
      async () => {
        if (user) {
          const currentNotes = await getCachedNotes(user.id);
          const updated = currentNotes.filter(n => n.id !== noteId);
          await cacheNotesLocally(user.id, updated);
        }
        showAlert('Terhapus', 'Catatan kuliah berhasil dihapus.');
        navigation.goBack();
      },
      'Hapus'
    );
  };

  // Export Note & Quiz to PDF
  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (!title.trim() && !content.trim()) {
      showAlert('Perhatian', 'Catatan masih kosong untuk diekspor ke PDF.');
      return;
    }
    setExportingPdf(true);
    try {
      const currentNote: StudyNote = {
        id: noteId || 'temp_note',
        user_id: user?.id || 'anonymous',
        title: title.trim() || 'Catatan Kuliah',
        subject: subject || 'Umum',
        content: content.trim() || '',
        summary,
        quiz_data: quizData,
        created_at: createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const authorName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Mahasiswa';
      await exportStudyNoteToPdf(currentNote, authorName);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Copy Note Content
  const handleCopyNote = async () => {
    const fullText = `${title}\n\nMata Kuliah: ${subject}\n\n${content}${summary ? `\n\n---\nRangkuman AI:\n${summary}` : ''}`;
    const ok = await copyToClipboard(fullText);
    if (ok) {
      showAlert('Tersalin 📋', 'Materi catatan kuliah berhasil disalin ke clipboard.');
    } else {
      showAlert('Info', 'Gagal menyalin teks ke clipboard.');
    }
  };

  // Reading Stats
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 160));

  // Quiz Score Calculation
  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = quizData.reduce((acc, q, idx) => {
    return selectedAnswers[idx] === q.correctIndex ? acc + 1 : acc;
  }, 0);
  const scorePercent = quizData.length > 0 ? Math.round((correctCount / quizData.length) * 100) : 0;

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main', { screen: 'Study' });
    }
  };

  if (fetching) {
    return <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.accentLight} /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Duolingo Animations Overlay ── */}
      <ConfettiBurst visible={showConfetti} count={50} onDone={() => setShowConfetti(false)} />
      <XpPopup
        xp={xpAmount}
        visible={showXpPopup}
        color="#FBBF24"
        onDone={() => setShowXpPopup(false)}
      />

      {/* Top Header with Back Button */}
      <View style={[styles.topHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.headerBackBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <Text style={[styles.topHeaderTitle, { color: theme.text }]} numberOfLines={1}>
            {viewMode === 'edit'
              ? (noteId ? 'Edit Catatan Kuliah' : 'Catatan Kuliah Baru')
              : (title || 'Detail Materi Kuliah')}
          </Text>
          <Text style={[styles.topHeaderSub, { color: theme.subtext }]} numberOfLines={1}>
            {viewMode === 'edit' ? (subject ? `Mata Kuliah: ${subject}` : 'Mode Pengeditan') : (subject ? `Mata Kuliah: ${subject}` : 'Mode Baca Rapi')}
          </Text>
        </View>

        {/* Right Actions */}
        <View style={styles.headerRightActions}>
          {noteId && (
            <View style={[styles.segmentedWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.segmentBtn, viewMode === 'reader' && [styles.segmentBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]]}
                onPress={() => setViewMode('reader')}
              >
                <Ionicons name="book-outline" size={13} color={viewMode === 'reader' ? theme.accentLight : theme.subtext} />
                <Text style={[styles.segmentText, { color: theme.subtext }, viewMode === 'reader' && [styles.segmentTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                  Detail
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, viewMode === 'edit' && [styles.segmentBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]]}
                onPress={() => setViewMode('edit')}
              >
                <Ionicons name="create-outline" size={13} color={viewMode === 'edit' ? theme.accentLight : theme.subtext} />
                <Text style={[styles.segmentText, { color: theme.subtext }, viewMode === 'edit' && [styles.segmentTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                  Edit
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {viewMode === 'edit' ? (
            <TouchableOpacity
              style={[styles.headerSaveBtn, { backgroundColor: theme.primary }, (!title.trim() || !content.trim()) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={loading || !title.trim() || !content.trim()}
            >
              {loading ? (
                <ActivityIndicator color={primaryBtnTextColor} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color={primaryBtnTextColor} />
                  <Text style={[styles.headerSaveText, { color: primaryBtnTextColor }]}>Simpan</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, exportingPdf && { opacity: 0.6 }]}
                onPress={handleExportPdf}
                disabled={exportingPdf}
                accessibilityLabel="Cetak Catatan PDF"
              >
                {exportingPdf ? (
                  <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                ) : (
                  <Ionicons name="print-outline" size={17} color={theme.accentLight} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={() => setShowShareModal(true)}
                accessibilityLabel="Bagikan Catatan ke Teman"
              >
                <Ionicons name="share-social-outline" size={17} color={theme.accentLight} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={handleCopyNote} accessibilityLabel="Salin Teks">
                <Ionicons name="copy-outline" size={17} color={theme.subtext} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={[styles.innerContent, isWide && styles.innerContentWide]}>

          {/* ========================================================================= */}
          {/* MODE 1: CLEAN & BEAUTIFUL READER VIEW (DETAIL MATERI) */}
          {/* ========================================================================= */}
          {viewMode === 'reader' ? (
            isWide ? (
              /* ── DESKTOP 2-COLUMN LAYOUT ── */
              <View style={styles.desktopTwoColRow}>
                {/* Left Main Column: Document Paper & Quiz */}
                <View style={styles.desktopLeftMainCol}>
                  <View style={[styles.documentPaper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    
                    {/* Meta Top Info Bar */}
                    <View style={styles.documentMetaRow}>
                      <View style={[styles.readerSubjectBadge, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="school" size={13} color={theme.accentLight} />
                        <Text style={[styles.readerSubjectText, { color: theme.accentLight }]}>{subject || 'Kuliah Umum'}</Text>
                      </View>

                      <View style={styles.readerStatsPills}>
                        <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <Ionicons name="calendar-outline" size={11} color={theme.muted} />
                          <Text style={[styles.statPillText, { color: theme.subtext }]}>
                            {createdAt ? new Date(createdAt).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Catatan Baru'}
                          </Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <Ionicons name="time-outline" size={11} color={theme.muted} />
                          <Text style={[styles.statPillText, { color: theme.subtext }]}>{readingTimeMin} mnt baca</Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <Ionicons name="document-text-outline" size={11} color={theme.muted} />
                          <Text style={[styles.statPillText, { color: theme.subtext }]}>{wordCount} kata</Text>
                        </View>
                      </View>
                    </View>

                    {/* Big Document Title */}
                    <Text style={[styles.documentTitle, { color: theme.text }]} selectable>
                      {title || 'Materi Catatan Tanpa Judul'}
                    </Text>

                    {/* Audio Lecture Player for Desktop */}
                    {showAudioPlayer && (
                      <AudioLecturePlayer
                        noteId={noteId}
                        title={title || 'Materi Catatan'}
                        summaryText={summary}
                        fullContentText={content}
                        onClose={() => setShowAudioPlayer(false)}
                      />
                    )}

                    <View style={[styles.documentDivider, { backgroundColor: theme.border }]} />

                    {/* Main Content Article Body */}
                    <View style={styles.documentBody}>
                      <MarkdownRenderer content={content || 'Belum ada isi materi catatan.'} fontSize={16} textColor={theme.text} />
                      {attachments.length > 0 && (
                        <View style={{ marginTop: 20 }}>
                          <AttachmentManager
                            attachments={attachments}
                            onUpdateAttachment={handleUpdateAttachment}
                            isEditable={false}
                            title="Lampiran Dokumen & Foto Materi"
                          />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Interactive Quiz Section on Desktop */}
                  {quizData.length > 0 ? (
                    <View style={[styles.quizCard, { backgroundColor: theme.card, borderColor: isLightMode ? '#A7F3D0' : '#192C23' }]}>
                      <View style={styles.quizTopRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="school" size={18} color={isLightMode ? '#059669' : '#34D399'} />
                          <Text style={[styles.quizHeaderTitle, { color: isLightMode ? '#059669' : '#34D399' }]}>
                            Kuis Pemahaman ({quizData.length} Soal)
                          </Text>
                        </View>
                        <View style={styles.quizHeaderActions}>
                          <TouchableOpacity onPress={handleResetQuizAnswers} style={[styles.miniBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                            <Text style={[styles.miniBtnText, { color: theme.subtext }]}>Reset</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={handleDeleteQuiz} style={[styles.miniBtnDanger, { backgroundColor: isLightMode ? '#FEE2E2' : '#331215', borderColor: isLightMode ? '#FECACA' : '#591D24' }]}>
                            <Text style={[styles.miniBtnDangerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* RPG Boss Battle Hero Launch Banner */}
                      <TouchableOpacity
                        style={[
                          styles.rpgBossLaunchBanner,
                          { backgroundColor: isLightMode ? '#FEF2F2' : '#230E12', borderColor: isLightMode ? '#FECACA' : '#6B1D28' }
                        ]}
                        onPress={() => setShowQuizBattleModal(true)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.rpgBossIconBox, { backgroundColor: '#EF4444' + '22' }]}>
                          <Ionicons name="flash" size={18} color="#EF4444" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.rpgBossLaunchTitle, { color: isLightMode ? '#991B1B' : '#FCA5A5' }]}>
                              Mode Boss Battle RPG
                            </Text>
                            <View style={styles.rpgNewBadge}>
                              <Text style={styles.rpgNewBadgeText}>GAME</Text>
                            </View>
                          </View>
                          <Text style={[styles.rpgBossLaunchSub, { color: isLightMode ? '#B91C1C' : '#F87171' }]}>
                            Tantang Monster Bos materi ini dengan HP Bar & efek serangan!
                          </Text>
                        </View>
                        <View style={[styles.rpgPlayBtnCapsule, { backgroundColor: '#EF4444' }]}>
                          <Ionicons name="play" size={12} color="#FFFFFF" />
                          <Text style={styles.rpgPlayBtnText}>Mainkan</Text>
                        </View>
                      </TouchableOpacity>

                      {/* Score Progress Bar */}
                      <View style={[styles.scoreBarCard, { backgroundColor: isLightMode ? '#ECFDF5' : '#131D19', borderColor: isLightMode ? '#A7F3D0' : '#1D3B2D' }]}>
                        <View style={styles.scoreTopInfo}>
                          <Text style={[styles.scoreLabel, { color: isLightMode ? '#065F46' : theme.subtext }]}>
                            Progres: {answeredCount} dari {quizData.length} Soal Dijawab
                          </Text>
                          <Text style={[styles.scoreValueText, { color: isLightMode ? '#059669' : theme.accentLight }]}>
                            Skor: {correctCount}/{quizData.length} ({scorePercent}%)
                          </Text>
                        </View>
                        <View style={[styles.progressTrack, { backgroundColor: isLightMode ? '#D1FAE5' : theme.border }]}>
                          <View style={[styles.progressFill, { backgroundColor: isLightMode ? '#10B981' : theme.primary, width: `${(answeredCount / quizData.length) * 100}%` }]} />
                        </View>
                      </View>

                      {/* Questions List */}
                      {quizData.map((q, qIndex) => {
                        const isAnswered = selectedAnswers[qIndex] !== undefined;
                        const chosenIndex = selectedAnswers[qIndex];
                        const isCorrect = chosenIndex === q.correctIndex;

                        return (
                          <ShakeView key={qIndex} trigger={shakeQuestionIndex === qIndex}>
                            <View style={[styles.questionBlock, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                              <Text style={[styles.questionNum, { color: isLightMode ? '#2563EB' : theme.accentLight }]}>Soal {qIndex + 1}:</Text>
                              <Text style={[styles.questionText, { color: theme.text }]}>{q.question}</Text>

                              <View style={styles.optionsList}>
                                {q.options.map((opt, optIndex) => {
                                  const isChosen = chosenIndex === optIndex;
                                  const isTheRightAnswer = optIndex === q.correctIndex;

                                  return (
                                    <TouchableOpacity
                                      key={optIndex}
                                      style={[
                                        styles.optionBtn,
                                        { backgroundColor: theme.card, borderColor: theme.border },
                                        isChosen && [styles.optionBtnSelected, { backgroundColor: theme.accentBg, borderColor: theme.accent }],
                                        isAnswered && isTheRightAnswer && [
                                          styles.optionBtnCorrect,
                                          { backgroundColor: isLightMode ? '#DCFCE7' : '#0D281E', borderColor: isLightMode ? '#22C55E' : '#10B981' }
                                        ],
                                        isAnswered && isChosen && !isTheRightAnswer && [
                                          styles.optionBtnWrong,
                                          { backgroundColor: isLightMode ? '#FEE2E2' : '#261214', borderColor: isLightMode ? '#EF4444' : '#EF4444' }
                                        ],
                                      ]}
                                      onPress={() => handleSelectQuizOption(qIndex, optIndex)}
                                      activeOpacity={0.7}
                                    >
                                      <View style={[styles.optionIndexBadge, { backgroundColor: isLightMode ? '#E2E8F0' : theme.cardInner, borderColor: theme.border }]}>
                                        <Text style={[styles.optionIndexText, { color: theme.text }]}>
                                          {String.fromCharCode(65 + optIndex)}
                                        </Text>
                                      </View>
                                      <Text
                                        style={[
                                          styles.optionText,
                                          { color: theme.text },
                                          isAnswered && isTheRightAnswer && [styles.optionTextCorrect, { color: isLightMode ? '#15803D' : '#34D399' }],
                                          isAnswered && isChosen && !isTheRightAnswer && [styles.optionTextWrong, { color: isLightMode ? '#DC2626' : '#F87171' }],
                                        ]}
                                      >
                                        {opt}
                                      </Text>
                                      {isAnswered && isTheRightAnswer && (
                                        <Ionicons name="checkmark-circle" size={16} color={isLightMode ? '#16A34A' : '#34D399'} style={{ marginLeft: 'auto' }} />
                                      )}
                                      {isAnswered && isChosen && !isTheRightAnswer && (
                                        <Ionicons name="close-circle" size={16} color="#EF4444" style={{ marginLeft: 'auto' }} />
                                      )}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              {isAnswered && (
                                <View style={[
                                  styles.explanationCard,
                                  isCorrect
                                    ? [styles.explanationCardCorrect, { backgroundColor: isLightMode ? '#DCFCE7' : '#0A2118', borderColor: isLightMode ? '#86EFAC' : '#144634' }]
                                    : [styles.explanationCardWrong, { backgroundColor: isLightMode ? '#FEF3C7' : '#241D10', borderColor: isLightMode ? '#FCD34D' : '#4D3B16' }]
                                ]}>
                                  <Ionicons
                                    name={isCorrect ? 'sparkles' : 'information-circle'}
                                    size={15}
                                    color={isCorrect ? (isLightMode ? '#16A34A' : '#34D399') : (isLightMode ? '#D97706' : '#FBBF24')}
                                  />
                                  <Text style={[styles.explanationText, { color: theme.text }]}>
                                    {q.explanation}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </ShakeView>
                        );
                      })}
                    </View>
                  ) : null}
                </View>

                {/* Right Sidebar Column: AI Studio & Summary & Meta */}
                <View style={styles.desktopRightSideCol}>
                  {/* AI Study Assistant Studio Card */}
                  <View style={[styles.sideStudioCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.sideStudioHeader}>
                      <Ionicons name="sparkles" size={17} color={theme.accentLight} />
                      <Text style={[styles.sideStudioTitle, { color: theme.text }]}>Asisten Belajar AI</Text>
                    </View>
                    <Text style={[styles.sideStudioDesc, { color: theme.subtext }]}>
                      Tingkatkan retensi materi dengan ringkasan pintar dan kuis interaktif.
                    </Text>

                    <View style={styles.sideStudioBtnList}>
                      {/* Audio Lecture Player Button */}
                      <TouchableOpacity
                        style={[
                          styles.sideStudioBtn,
                          { backgroundColor: isLightMode ? '#F0FDF4' : '#14251D', borderColor: isLightMode ? '#BBF7D0' : '#234C38' },
                          showAudioPlayer && { borderWidth: 2, borderColor: '#10B981' }
                        ]}
                        onPress={() => setShowAudioPlayer(prev => !prev)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="mic-outline" size={15} color="#10B981" />
                        <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                          {showAudioPlayer ? 'Tutup AI Podcast & Audio' : '🎙️ AI Podcast & Audio'}
                        </Text>
                      </TouchableOpacity>

                      {/* Flashcard AI (3D Flip & Spaced Repetition) with Count Selector */}
                      <View style={[styles.sideQuizSelectorBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={[styles.sideQuizLabel, { color: theme.subtext }]}>Jumlah Flashcard:</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {FLASHCARD_COUNT_OPTIONS.map(cnt => (
                              <TouchableOpacity
                                key={cnt}
                                style={[
                                  styles.sideQuizChip,
                                  { backgroundColor: theme.card },
                                  flashcardCount === cnt && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }
                                ]}
                                onPress={() => setFlashcardCount(cnt)}
                              >
                                <Text style={[styles.sideQuizChipText, { color: theme.subtext }, flashcardCount === cnt && { color: '#FFFFFF', fontWeight: '800' }]}>
                                  {cnt}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={[
                              styles.sideStudioBtn,
                              { flex: 1, backgroundColor: isLightMode ? '#F5F3FF' : '#211838', borderColor: isLightMode ? '#DDD6FE' : '#4C3077' },
                              generatingFlashcards && { opacity: 0.6 }
                            ]}
                            onPress={() => handleGenerateFlashcards()}
                            disabled={generatingFlashcards}
                            activeOpacity={0.75}
                          >
                            {generatingFlashcards ? (
                              <ActivityIndicator size="small" color="#A855F7" />
                            ) : (
                              <Ionicons name="sparkles" size={15} color="#A855F7" />
                            )}
                            <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#7E22CE' : '#C084FC' }]}>
                              {flashcards.length > 0 ? `Buat Ulang (${flashcardCount})` : `Buat (${flashcardCount} Kartu)`}
                            </Text>
                          </TouchableOpacity>

                          {flashcards.length > 0 && (
                            <TouchableOpacity
                              style={[
                                styles.sideStudioBtn,
                                { backgroundColor: isLightMode ? '#EDE9FE' : '#2E1065', borderColor: '#8B5CF6', paddingHorizontal: 10 }
                              ]}
                              onPress={() => setShowFlashcardModal(true)}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="eye-outline" size={15} color="#A855F7" />
                              <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#7E22CE' : '#C084FC' }]}>
                                Buka ({flashcards.length})
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Rangkum AI */}
                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#FEF3C7' : '#281E0B', borderColor: isLightMode ? '#FDE68A' : '#533C14' }, generatingSummary && { opacity: 0.6 }]}
                        onPress={handleGenerateSummary}
                        disabled={generatingSummary}
                        activeOpacity={0.75}
                      >
                        {generatingSummary ? (
                          <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                          <Ionicons name="sparkles" size={15} color="#F59E0B" />
                        )}
                        <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>
                          {summary ? 'Ulang Rangkuman AI' : 'Rangkum Materi (AI)'}
                        </Text>
                      </TouchableOpacity>

                      {/* Buat Kuis Interaktif */}
                      <View style={[styles.sideQuizSelectorBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={[styles.sideQuizLabel, { color: theme.subtext }]}>Jumlah Soal Kuis:</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {QUIZ_COUNT_OPTIONS.map(cnt => (
                              <TouchableOpacity
                                key={cnt}
                                style={[
                                  styles.sideQuizChip,
                                  { backgroundColor: theme.card },
                                  quizCount === cnt && { backgroundColor: theme.accent, borderColor: theme.accent }
                                ]}
                                onPress={() => setQuizCount(cnt)}
                              >
                                <Text style={[styles.sideQuizChipText, { color: theme.subtext }, quizCount === cnt && { color: '#FFFFFF', fontWeight: '800' }]}>
                                  {cnt}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#DCFCE7' : '#0E241B', borderColor: isLightMode ? '#86EFAC' : '#1C4A36' }, generatingQuiz && { opacity: 0.6 }]}
                          onPress={handleGenerateQuiz}
                          disabled={generatingQuiz}
                          activeOpacity={0.75}
                        >
                          {generatingQuiz ? (
                            <ActivityIndicator size="small" color="#10B981" />
                          ) : (
                            <Ionicons name="school" size={15} color="#10B981" />
                          )}
                          <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                            {quizData.length > 0 ? `Buat Ulang Kuis (${quizCount} Soal)` : `Buat Kuis AI (${quizCount} Soal)`}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Scan Foto AI */}
                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#EEF2FF' : '#191A3E', borderColor: isLightMode ? '#C7D2FE' : '#313470' }]}
                        onPress={() => setShowScanModal(true)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="camera" size={15} color="#818CF8" />
                        <Text style={[styles.sideStudioBtnText, { color: '#818CF8' }]}>Scan & Rewrite Foto</Text>
                      </TouchableOpacity>

                      {/* Cetak PDF */}
                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, exportingPdf && { opacity: 0.6 }]}
                        onPress={handleExportPdf}
                        disabled={exportingPdf}
                        activeOpacity={0.75}
                      >
                        {exportingPdf ? (
                          <ActivityIndicator size="small" color={theme.accentLight} />
                        ) : (
                          <Ionicons name="print-outline" size={15} color={theme.accentLight} />
                        )}
                        <Text style={[styles.sideStudioBtnText, { color: theme.accentLight }]}>Cetak / Ekspor PDF</Text>
                      </TouchableOpacity>

                      {/* Salin Teks */}
                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={handleCopyNote}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="copy-outline" size={15} color={theme.subtext} />
                        <Text style={[styles.sideStudioBtnText, { color: theme.subtext }]}>Salin Seluruh Catatan</Text>
                      </TouchableOpacity>

                      {/* Hapus Catatan */}
                      {noteId ? (
                        <TouchableOpacity
                          style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418', borderColor: isLightMode ? '#FECACA' : '#5C1D24' }]}
                          onPress={handleDeleteCurrentNote}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="trash-outline" size={15} color="#EF4444" />
                          <Text style={[styles.sideStudioBtnText, { color: '#EF4444' }]}>Hapus Catatan Ini</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Summary Card in Sidebar (If Generated) */}
                  {summary ? (
                    <View style={[styles.readerSummaryCard, { backgroundColor: isLightMode ? '#EFF6FF' : '#111A2E', borderColor: isLightMode ? '#BFDBFE' : '#1D3256' }]}>
                      <View style={styles.summaryTopRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="sparkles" size={16} color={isLightMode ? '#1D4ED8' : theme.accentLight} />
                          <Text style={[styles.summaryTitle, { color: isLightMode ? '#1D4ED8' : theme.text }]}>Intisari & Rangkuman</Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleAppendSummaryToContent}
                          style={[styles.appendBtn, { backgroundColor: isLightMode ? '#DBEAFE' : theme.accentBg }]}
                        >
                          <Text style={[styles.appendBtnText, { color: isLightMode ? '#1D4ED8' : theme.accentLight }]}>+ Sisipkan</Text>
                        </TouchableOpacity>
                      </View>
                      <MarkdownRenderer content={summary} fontSize={13.5} textColor={isLightMode ? '#1E3A8A' : theme.text} />
                    </View>
                  ) : null}

                  {/* Metadata Specs Card */}
                  <View style={[styles.sideMetaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.sideMetaCardTitle, { color: theme.text }]}>📌 Rincian Dokumen</Text>
                    <View style={styles.sideMetaList}>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Mata Kuliah</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>{subject || 'Kuliah Umum'}</Text>
                      </View>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Waktu Baca</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>~{readingTimeMin} menit</Text>
                      </View>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Total Kata</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>{wordCount} kata</Text>
                      </View>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Total Karakter</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>{charCount} karakter</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              /* ── MOBILE SINGLE-COLUMN LAYOUT ── */
              <View style={styles.readerContainer}>
                {/* Mobile Document Paper Canvas */}
                <View style={[styles.documentPaper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {/* Meta Top Info Bar */}
                  <View style={styles.documentMetaRow}>
                    <View style={[styles.readerSubjectBadge, { backgroundColor: theme.accentBg }]}>
                      <Ionicons name="school" size={12} color={theme.accentLight} />
                      <Text style={[styles.readerSubjectText, { color: theme.accentLight }]}>{subject || 'Kuliah Umum'}</Text>
                    </View>

                    <View style={styles.readerStatsPills}>
                      <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <Ionicons name="calendar-outline" size={11} color={theme.muted} />
                        <Text style={[styles.statPillText, { color: theme.subtext }]}>
                          {createdAt ? new Date(createdAt).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Catatan Baru'}
                        </Text>
                      </View>
                      <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <Ionicons name="time-outline" size={11} color={theme.muted} />
                        <Text style={[styles.statPillText, { color: theme.subtext }]}>{readingTimeMin} mnt baca</Text>
                      </View>
                      <View style={[styles.statPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <Ionicons name="document-text-outline" size={11} color={theme.muted} />
                        <Text style={[styles.statPillText, { color: theme.subtext }]}>{wordCount} kata</Text>
                      </View>
                    </View>
                  </View>

                  {/* Big Document Title */}
                  <Text style={[styles.documentTitle, { color: theme.text }]} selectable>
                    {title || 'Materi Catatan Tanpa Judul'}
                  </Text>

                  {/* Sleek Action Toolbar Bar */}
                  <View style={[styles.documentActionBar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.documentActionScroll}>
                      {/* Audio Lecture Player Pill */}
                      <TouchableOpacity
                        style={[
                          styles.docActionPill,
                          { backgroundColor: isLightMode ? '#F0FDF4' : '#14251D', borderColor: isLightMode ? '#BBF7D0' : '#234C38' },
                          showAudioPlayer && { borderWidth: 1.5, borderColor: '#10B981' }
                        ]}
                        onPress={() => setShowAudioPlayer(prev => !prev)}
                      >
                        <Ionicons name="mic-outline" size={13} color="#10B981" />
                        <Text style={[styles.docActionPillText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                          {showAudioPlayer ? 'Tutup Audio' : '🎙️ AI Podcast'}
                        </Text>
                      </TouchableOpacity>

                      {/* Flashcard AI with integrated card count selector & Buat Ulang on mobile */}
                      <View style={[styles.docActionPillCombo, { backgroundColor: isLightMode ? '#F5F3FF' : '#211838', borderColor: isLightMode ? '#DDD6FE' : '#4C3077' }]}>
                        <TouchableOpacity
                          style={[styles.docActionPillComboBtn, generatingFlashcards && { opacity: 0.6 }]}
                          onPress={() => {
                            if (flashcards.length > 0) {
                              setShowFlashcardModal(true);
                            } else {
                              handleGenerateFlashcards();
                            }
                          }}
                          disabled={generatingFlashcards}
                        >
                          {generatingFlashcards ? (
                            <ActivityIndicator size="small" color="#A855F7" style={{ transform: [{ scale: 0.7 }] }} />
                          ) : (
                            <Ionicons name="card-outline" size={13} color="#A855F7" />
                          )}
                          <Text style={[styles.docActionPillText, { color: isLightMode ? '#7E22CE' : '#C084FC' }]}>
                            {flashcards.length > 0 ? `Buka (${flashcards.length})` : 'Buat Flashcard'}
                          </Text>
                        </TouchableOpacity>

                        <View style={[styles.comboDivider, { backgroundColor: isLightMode ? '#DDD6FE' : '#4C3077' }]} />

                        <View style={styles.comboChipsWrap}>
                          {FLASHCARD_COUNT_OPTIONS.map(cnt => (
                            <TouchableOpacity
                              key={cnt}
                              style={[
                                styles.miniComboChip,
                                { backgroundColor: isLightMode ? '#FFFFFF' : '#2D1F4C' },
                                flashcardCount === cnt && { backgroundColor: '#8B5CF6' }
                              ]}
                              onPress={() => setFlashcardCount(cnt)}
                            >
                              <Text style={[styles.miniComboChipText, { color: isLightMode ? '#6B7280' : '#A78BFA' }, flashcardCount === cnt && { color: '#FFFFFF', fontWeight: '800' }]}>
                                {cnt}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {flashcards.length > 0 && (
                          <>
                            <View style={[styles.comboDivider, { backgroundColor: isLightMode ? '#DDD6FE' : '#4C3077' }]} />
                            <TouchableOpacity
                              style={[styles.docActionPillComboBtn, { paddingHorizontal: 6 }, generatingFlashcards && { opacity: 0.6 }]}
                              onPress={() => handleGenerateFlashcards()}
                              disabled={generatingFlashcards}
                              accessibilityLabel="Buat Ulang Flashcard"
                            >
                              <Ionicons name="refresh" size={12} color="#A855F7" />
                              <Text style={[styles.docActionPillText, { color: isLightMode ? '#7E22CE' : '#C084FC', fontSize: 11 }]}>
                                Ulang
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>

                      {/* Rangkum AI */}
                      <TouchableOpacity
                        style={[styles.docActionPill, { backgroundColor: theme.card, borderColor: theme.border }, generatingSummary && { opacity: 0.6 }]}
                        onPress={handleGenerateSummary}
                        disabled={generatingSummary}
                      >
                        {generatingSummary ? (
                          <ActivityIndicator size="small" color="#FBBF24" style={{ transform: [{ scale: 0.7 }] }} />
                        ) : (
                          <Ionicons name="sparkles" size={13} color="#FBBF24" />
                        )}
                        <Text style={[styles.docActionPillText, { color: '#FBBF24' }]}>
                          {summary ? 'Ulang Rangkuman' : 'Rangkum AI'}
                        </Text>
                      </TouchableOpacity>

                      {/* Kuis AI with integrated question count selector & Buat Ulang on mobile */}
                      <View style={[styles.docActionPillCombo, { backgroundColor: isLightMode ? '#ECFDF5' : '#0F291E', borderColor: isLightMode ? '#A7F3D0' : '#1E4D38' }]}>
                        <TouchableOpacity
                          style={[styles.docActionPillComboBtn, generatingQuiz && { opacity: 0.6 }]}
                          onPress={handleGenerateQuiz}
                          disabled={generatingQuiz}
                        >
                          {generatingQuiz ? (
                            <ActivityIndicator size="small" color="#10B981" style={{ transform: [{ scale: 0.7 }] }} />
                          ) : (
                            <Ionicons name="school-outline" size={13} color="#10B981" />
                          )}
                          <Text style={[styles.docActionPillText, { color: isLightMode ? '#047857' : '#34D399' }]}>
                            {quizData.length > 0 ? `Kuis (${quizData.length})` : 'Buat Kuis'}
                          </Text>
                        </TouchableOpacity>

                        <View style={[styles.comboDivider, { backgroundColor: isLightMode ? '#A7F3D0' : '#1E4D38' }]} />

                        <View style={styles.comboChipsWrap}>
                          {QUIZ_COUNT_OPTIONS.map(cnt => (
                            <TouchableOpacity
                              key={cnt}
                              style={[
                                styles.miniComboChip,
                                { backgroundColor: isLightMode ? '#FFFFFF' : '#14382A' },
                                quizCount === cnt && { backgroundColor: '#10B981' }
                              ]}
                              onPress={() => setQuizCount(cnt)}
                            >
                              <Text style={[styles.miniComboChipText, { color: isLightMode ? '#6B7280' : '#6EE7B7' }, quizCount === cnt && { color: '#FFFFFF', fontWeight: '800' }]}>
                                {cnt}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {quizData.length > 0 && (
                          <>
                            <View style={[styles.comboDivider, { backgroundColor: isLightMode ? '#A7F3D0' : '#1E4D38' }]} />
                            <TouchableOpacity
                              style={[styles.docActionPillComboBtn, { paddingHorizontal: 6 }, generatingQuiz && { opacity: 0.6 }]}
                              onPress={handleGenerateQuiz}
                              disabled={generatingQuiz}
                              accessibilityLabel="Buat Ulang Kuis"
                            >
                              <Ionicons name="refresh" size={12} color="#10B981" />
                              <Text style={[styles.docActionPillText, { color: isLightMode ? '#047857' : '#34D399', fontSize: 11 }]}>
                                Ulang
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>

                      {/* Boss Battle RPG Mode Pill */}
                      <TouchableOpacity
                        style={[
                          styles.docActionPill,
                          { backgroundColor: isLightMode ? '#FEF2F2' : '#2D1216', borderColor: isLightMode ? '#FECACA' : '#6B1D28' }
                        ]}
                        onPress={() => {
                          if (quizData.length > 0) {
                            setShowQuizBattleModal(true);
                          } else {
                            confirmAction(
                              'Mulai Boss Battle RPG? ⚔️',
                              'Catatan ini belum memiliki soal kuis. Apakah kamu ingin AI langsung menyusun soal dan membuka arena pertarungan?',
                              async () => {
                                await handleGenerateQuiz(true);
                              }
                            );
                          }
                        }}
                      >
                        <Ionicons name="flash" size={13} color="#EF4444" />
                        <Text style={[styles.docActionPillText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>
                          Boss Battle RPG
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.docActionPill, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => setShowScanModal(true)}
                      >
                        <Ionicons name="camera-outline" size={13} color="#818CF8" />
                        <Text style={[styles.docActionPillText, { color: '#818CF8' }]}>Scan Foto AI</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.docActionPill, { backgroundColor: theme.card, borderColor: theme.border }, exportingPdf && { opacity: 0.6 }]}
                        onPress={handleExportPdf}
                        disabled={exportingPdf}
                      >
                        {exportingPdf ? (
                          <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                        ) : (
                          <Ionicons name="print-outline" size={13} color={theme.accentLight} />
                        )}
                        <Text style={[styles.docActionPillText, { color: theme.accentLight }]}>Cetak PDF</Text>
                      </TouchableOpacity>

                      {noteId ? (
                        <TouchableOpacity
                          style={[styles.docActionPill, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418', borderColor: isLightMode ? '#FECACA' : '#5C1D24' }]}
                          onPress={handleDeleteCurrentNote}
                        >
                          <Ionicons name="trash-outline" size={13} color="#EF4444" />
                          <Text style={[styles.docActionPillText, { color: '#EF4444' }]}>Hapus</Text>
                        </TouchableOpacity>
                      ) : null}
                    </ScrollView>
                  </View>

                  {/* Audio Lecture Player for Mobile */}
                  {showAudioPlayer && (
                    <AudioLecturePlayer
                      noteId={noteId}
                      title={title || 'Materi Catatan'}
                      summaryText={summary}
                      fullContentText={content}
                      onClose={() => setShowAudioPlayer(false)}
                    />
                  )}

                  <View style={[styles.documentDivider, { backgroundColor: theme.border }]} />

                  {/* Main Content Article Body */}
                  <View style={styles.documentBody}>
                    <MarkdownRenderer content={content || 'Belum ada isi materi catatan.'} fontSize={15.5} textColor={theme.text} />
                    {attachments.length > 0 && (
                      <View style={{ marginTop: 20 }}>
                        <AttachmentManager
                          attachments={attachments}
                          onUpdateAttachment={handleUpdateAttachment}
                          isEditable={false}
                          title="Lampiran Dokumen & Foto Materi"
                        />
                      </View>
                    )}
                  </View>
                </View>

                {/* Summary Section (If Generated) */}
                {summary ? (
                  <View style={[styles.readerSummaryCard, { backgroundColor: isLightMode ? '#EFF6FF' : '#111A2E', borderColor: isLightMode ? '#BFDBFE' : '#1D3256' }]}>
                    <View style={styles.summaryTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="sparkles" size={16} color={isLightMode ? '#1D4ED8' : theme.accentLight} />
                        <Text style={[styles.summaryTitle, { color: isLightMode ? '#1D4ED8' : theme.text }]}>Intisari & Rangkuman AI</Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleAppendSummaryToContent}
                        style={[styles.appendBtn, { backgroundColor: isLightMode ? '#DBEAFE' : theme.accentBg }]}
                      >
                        <Text style={[styles.appendBtnText, { color: isLightMode ? '#1D4ED8' : theme.accentLight }]}>+ Sisipkan</Text>
                      </TouchableOpacity>
                    </View>
                    <MarkdownRenderer content={summary} fontSize={14} textColor={isLightMode ? '#1E3A8A' : theme.text} />
                  </View>
                ) : null}

                {/* Quiz Section (If Generated) */}
                {quizData.length > 0 ? (
                  <View style={[styles.quizCard, { backgroundColor: theme.card, borderColor: isLightMode ? '#A7F3D0' : '#192C23' }]}>
                    <View style={styles.quizTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="school" size={18} color={isLightMode ? '#059669' : '#34D399'} />
                        <Text style={[styles.quizHeaderTitle, { color: isLightMode ? '#059669' : '#34D399' }]}>
                          Kuis Pemahaman ({quizData.length} Soal)
                        </Text>
                      </View>
                      <View style={styles.quizHeaderActions}>
                        <TouchableOpacity onPress={handleResetQuizAnswers} style={[styles.miniBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <Text style={[styles.miniBtnText, { color: theme.subtext }]}>Reset</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDeleteQuiz} style={[styles.miniBtnDanger, { backgroundColor: isLightMode ? '#FEE2E2' : '#331215', borderColor: isLightMode ? '#FECACA' : '#591D24' }]}>
                          <Text style={[styles.miniBtnDangerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* RPG Boss Battle Hero Launch Banner */}
                    <TouchableOpacity
                      style={[
                        styles.rpgBossLaunchBanner,
                        { backgroundColor: isLightMode ? '#FEF2F2' : '#230E12', borderColor: isLightMode ? '#FECACA' : '#6B1D28' }
                      ]}
                      onPress={() => setShowQuizBattleModal(true)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.rpgBossIconBox, { backgroundColor: '#EF4444' + '22' }]}>
                        <Ionicons name="flash" size={18} color="#EF4444" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.rpgBossLaunchTitle, { color: isLightMode ? '#991B1B' : '#FCA5A5' }]}>
                            Mode Boss Battle RPG
                          </Text>
                          <View style={styles.rpgNewBadge}>
                            <Text style={styles.rpgNewBadgeText}>GAME</Text>
                          </View>
                        </View>
                        <Text style={[styles.rpgBossLaunchSub, { color: isLightMode ? '#B91C1C' : '#F87171' }]}>
                          Tantang Monster Bos materi ini dengan HP Bar & efek serangan!
                        </Text>
                      </View>
                      <View style={[styles.rpgPlayBtnCapsule, { backgroundColor: '#EF4444' }]}>
                        <Ionicons name="play" size={12} color="#FFFFFF" />
                        <Text style={styles.rpgPlayBtnText}>Mainkan</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Score Progress Bar */}
                    <View style={[styles.scoreBarCard, { backgroundColor: isLightMode ? '#ECFDF5' : '#131D19', borderColor: isLightMode ? '#A7F3D0' : '#1D3B2D' }]}>
                      <View style={styles.scoreTopInfo}>
                        <Text style={[styles.scoreLabel, { color: isLightMode ? '#065F46' : theme.subtext }]}>
                          Progres: {answeredCount} dari {quizData.length} Soal Dijawab
                        </Text>
                        <Text style={[styles.scoreValueText, { color: isLightMode ? '#059669' : theme.accentLight }]}>
                          Skor: {correctCount}/{quizData.length} ({scorePercent}%)
                        </Text>
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: isLightMode ? '#D1FAE5' : theme.border }]}>
                        <View style={[styles.progressFill, { backgroundColor: isLightMode ? '#10B981' : theme.primary, width: `${(answeredCount / quizData.length) * 100}%` }]} />
                      </View>
                    </View>

                    {/* Questions List */}
                    {quizData.map((q, qIndex) => {
                      const isAnswered = selectedAnswers[qIndex] !== undefined;
                      const chosenIndex = selectedAnswers[qIndex];
                      const isCorrect = chosenIndex === q.correctIndex;

                      return (
                        <ShakeView key={qIndex} trigger={shakeQuestionIndex === qIndex}>
                          <View style={[styles.questionBlock, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                            <Text style={[styles.questionNum, { color: isLightMode ? '#2563EB' : theme.accentLight }]}>Soal {qIndex + 1}:</Text>
                            <Text style={[styles.questionText, { color: theme.text }]}>{q.question}</Text>

                            <View style={styles.optionsList}>
                              {q.options.map((opt, optIndex) => {
                                const isChosen = chosenIndex === optIndex;
                                const isTheRightAnswer = optIndex === q.correctIndex;

                                return (
                                  <TouchableOpacity
                                    key={optIndex}
                                    style={[
                                      styles.optionBtn,
                                      { backgroundColor: theme.card, borderColor: theme.border },
                                      isChosen && [styles.optionBtnSelected, { backgroundColor: theme.accentBg, borderColor: theme.accent }],
                                      isAnswered && isTheRightAnswer && [
                                        styles.optionBtnCorrect,
                                        { backgroundColor: isLightMode ? '#DCFCE7' : '#0D281E', borderColor: isLightMode ? '#22C55E' : '#10B981' }
                                      ],
                                      isAnswered && isChosen && !isTheRightAnswer && [
                                        styles.optionBtnWrong,
                                        { backgroundColor: isLightMode ? '#FEE2E2' : '#261214', borderColor: isLightMode ? '#EF4444' : '#EF4444' }
                                      ],
                                    ]}
                                    onPress={() => handleSelectQuizOption(qIndex, optIndex)}
                                    activeOpacity={0.7}
                                  >
                                    <View style={[styles.optionIndexBadge, { backgroundColor: isLightMode ? '#E2E8F0' : theme.cardInner, borderColor: theme.border }]}>
                                      <Text style={[styles.optionIndexText, { color: theme.text }]}>
                                        {String.fromCharCode(65 + optIndex)}
                                      </Text>
                                    </View>
                                    <Text
                                      style={[
                                        styles.optionText,
                                        { color: theme.text },
                                        isAnswered && isTheRightAnswer && [styles.optionTextCorrect, { color: isLightMode ? '#15803D' : '#34D399' }],
                                        isAnswered && isChosen && !isTheRightAnswer && [styles.optionTextWrong, { color: isLightMode ? '#DC2626' : '#F87171' }],
                                      ]}
                                    >
                                      {opt}
                                    </Text>
                                    {isAnswered && isTheRightAnswer && (
                                      <Ionicons name="checkmark-circle" size={16} color={isLightMode ? '#16A34A' : '#34D399'} style={{ marginLeft: 'auto' }} />
                                    )}
                                    {isAnswered && isChosen && !isTheRightAnswer && (
                                      <Ionicons name="close-circle" size={16} color="#EF4444" style={{ marginLeft: 'auto' }} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            {isAnswered && (
                              <View style={[
                                styles.explanationCard,
                                isCorrect
                                  ? [styles.explanationCardCorrect, { backgroundColor: isLightMode ? '#DCFCE7' : '#0A2118', borderColor: isLightMode ? '#86EFAC' : '#144634' }]
                                  : [styles.explanationCardWrong, { backgroundColor: isLightMode ? '#FEF3C7' : '#241D10', borderColor: isLightMode ? '#FCD34D' : '#4D3B16' }]
                              ]}>
                                <Ionicons
                                  name={isCorrect ? 'sparkles' : 'information-circle'}
                                  size={15}
                                  color={isCorrect ? (isLightMode ? '#16A34A' : '#34D399') : (isLightMode ? '#D97706' : '#FBBF24')}
                                />
                                <Text style={[styles.explanationText, { color: theme.text }]}>
                                  {q.explanation}
                                </Text>
                              </View>
                            )}
                          </View>
                        </ShakeView>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            )
          ) : (

            /* ========================================================================= */
            /* MODE 2: FULL EDIT / INPUT FORM */
            /* ========================================================================= */
            isWide ? (
              /* ── DESKTOP EDIT 2-COLUMN LAYOUT ── */
              <View style={styles.desktopTwoColRow}>
                {/* Left Main Column: Form Inputs */}
                <View style={styles.desktopLeftMainCol}>
                  <View style={[styles.documentPaper, { backgroundColor: theme.card, borderColor: theme.border }]}>

                    {/* Draft Status Banner */}
                    {!noteId && (draftSavedTime || hasRestoredDraft) ? (
                      <View style={[styles.draftBannerRow, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F1E19', borderColor: isLightMode ? '#86EFAC' : '#1D4537' }]}>
                        <View style={[styles.draftStatusPill, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F2618', borderColor: isLightMode ? '#86EFAC' : '#1C4A2E' }]}>
                          <Ionicons name="cloud-done" size={13} color="#10B981" />
                          <Text style={[styles.draftStatusText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                            {draftSavedTime ? `Draf tersimpan otomatis (${draftSavedTime})` : 'Draf dipulihkan'}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={handleDiscardDraft} style={[styles.discardDraftBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2B1215', borderColor: isLightMode ? '#FECACA' : '#571F26' }]}>
                          <Ionicons name="trash-outline" size={12} color="#EF4444" />
                          <Text style={[styles.discardDraftText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus Draf</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {/* Title Input */}
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Judul Materi Kuliah:</Text>
                    <TextInput
                      style={[styles.titleInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                      placeholder="Misal: Struktur Data & Algoritma Tree..."
                      placeholderTextColor={theme.muted}
                      value={title}
                      onChangeText={setTitle}
                    />

                    {/* Course / Subject Picker */}
                    <View style={styles.subjectHeaderRow}>
                      <Text style={[styles.inputLabel, { color: theme.text }]}>Pilih Mata Kuliah:</Text>
                      <TouchableOpacity
                        style={[styles.manageSubjBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => setShowSubjectModal(true)}
                      >
                        <Ionicons name="settings-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.manageSubjBtnText, { color: theme.accentLight }]}>Kelola Matkul</Text>
                      </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
                      {subjects.map(s => {
                        const isSel = subject.toLowerCase() === s.name.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.subjectChip,
                              { backgroundColor: theme.cardInner, borderColor: theme.border },
                              isSel && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                            ]}
                            onPress={() => setSubject(s.name)}
                          >
                            <Text style={[styles.subjectChipText, { color: theme.subtext }, isSel && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                              {s.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Main Content Input Header */}
                    <View style={styles.contentHeaderRow}>
                      <Text style={[styles.inputLabel, { color: theme.text }]}>Isi Catatan Materi:</Text>
                      
                      <View style={styles.contentHeaderRightGroup}>
                        <TouchableOpacity
                          style={[
                            styles.scanHeaderQuickBtn,
                            {
                              backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B',
                              borderColor: isLightMode ? '#C7D2FE' : '#3730A3',
                            }
                          ]}
                          onPress={() => setShowScanModal(true)}
                        >
                          <Ionicons name="camera" size={13} color={isLightMode ? '#4F46E5' : '#A5B4FC'} />
                          <Text style={[styles.scanHeaderQuickText, { color: isLightMode ? '#4F46E5' : '#A5B4FC' }]}>
                            Scan Foto AI
                          </Text>
                        </TouchableOpacity>

                        {/* Write vs Live Preview Toggle */}
                        <View style={[styles.editModeToggleWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <TouchableOpacity
                            style={[styles.editToggleBtn, editTab === 'write' && [styles.editToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
                            onPress={() => setEditTab('write')}
                          >
                            <Ionicons name="create-outline" size={13} color={editTab === 'write' ? theme.accentLight : theme.subtext} />
                            <Text style={[styles.editToggleText, { color: theme.subtext }, editTab === 'write' && [styles.editToggleTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                              Tulis
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.editToggleBtn, editTab === 'preview' && [styles.editToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
                            onPress={() => setEditTab('preview')}
                          >
                            <Ionicons name="eye-outline" size={13} color={editTab === 'preview' ? theme.accentLight : theme.subtext} />
                            <Text style={[styles.editToggleText, { color: theme.subtext }, editTab === 'preview' && [styles.editToggleTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                              Pratinjau
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {editTab === 'write' ? (
                      <>
                        {/* Formatting Toolbar */}
                        <View
                          style={[styles.toolbarWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                          {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
                        >
                          <View style={styles.toolbarRow}>
                            <TouchableOpacity
                              style={[
                                styles.toolBtn,
                                {
                                  backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B',
                                  borderColor: isLightMode ? '#C7D2FE' : '#3730A3',
                                }
                              ]}
                              onPress={() => setShowScanModal(true)}
                            >
                              <Ionicons name="camera" size={14} color={isLightMode ? '#4F46E5' : '#A5B4FC'} />
                            </TouchableOpacity>
                            <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('**', '**', 'teks tebal')}>
                              <Text style={[styles.toolBtnBold, { color: theme.text }]}>B</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('*', '*', 'teks miring')}>
                              <Text style={[styles.toolBtnItalic, { color: theme.text }]}>I</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('__', '__', 'teks garis bawah')}>
                              <Text style={[styles.toolBtnUnderline, { color: theme.text }]}>U</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('~~', '~~', 'teks coret')}>
                              <Text style={[styles.toolBtnItalic, { textDecorationLine: 'line-through', color: theme.text }]}>S</Text>
                            </TouchableOpacity>
                            <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('## ', 'Judul Bagian')}>
                              <Text style={[styles.toolBtnH3, { color: theme.text }]}>H2</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('### ', 'Judul Sub Bagian')}>
                              <Text style={[styles.toolBtnH3, { color: theme.text }]}>H3</Text>
                            </TouchableOpacity>
                            <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('- ', 'Item list')}>
                              <Ionicons name="list" size={15} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('1. ', 'Item numerik')}>
                              <Text style={[styles.toolBtnH3, { color: theme.text }]}>1.</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('> ', 'Kutipan')}>
                              <Ionicons name="chatbubble-outline" size={14} color={theme.text} />
                            </TouchableOpacity>
                            <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('`', '`', 'kode')}>
                              <Ionicons name="code-slash" size={15} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('```\n', '\n```', 'blok kode')}>
                              <Ionicons name="terminal-outline" size={15} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('---\n', '')}>
                              <Ionicons name="remove-outline" size={15} color={theme.text} />
                            </TouchableOpacity>
                          </View>

                          {/* Font Size Selector */}
                          <View style={[styles.fontSizeRow, { borderTopColor: theme.border }]}>
                            <Ionicons name="text-outline" size={13} color={theme.muted} />
                            <Text style={[styles.fontSizeChipText, { color: theme.muted }]}>Ukuran Teks:</Text>
                            {FONT_SIZES.map(size => (
                              <TouchableOpacity
                                key={size}
                                style={[
                                  styles.fontSizeChip,
                                  { backgroundColor: isLightMode ? '#F1F5F9' : '#1A1F2E' },
                                  editorFontSize === size && [styles.fontSizeChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                                ]}
                                onPress={() => setEditorFontSize(size)}
                              >
                                <Text style={[styles.fontSizeChipText, { color: theme.subtext }, editorFontSize === size && [styles.fontSizeChipTextActive, { color: theme.accentLight }]]}>
                                  {size}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <TextInput
                          ref={contentInputRef}
                          style={[styles.contentInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text, fontSize: editorFontSize, lineHeight: editorFontSize + 8, minHeight: contentHeight }]}
                          placeholder="Tulis atau tempel materi kuliah, rumus, bab ujian, atau ringkasan dosen di sini..."
                          placeholderTextColor={theme.muted}
                          value={content}
                          onChangeText={setContent}
                          multiline
                          textAlignVertical="top"
                          selection={selection}
                          onSelectionChange={(e) => {
                            const sel = e.nativeEvent.selection;
                            if (sel) {
                              lastSelectionRef.current = sel;
                              setSelection(sel);
                            }
                          }}
                          onContentSizeChange={(e) => {
                            const h = e.nativeEvent.contentSize.height;
                            if (h > 260) setContentHeight(Math.min(h + 20, 600));
                            else setContentHeight(260);
                          }}
                        />
                      </>
                    ) : (
                      <View style={[styles.livePreviewCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <View style={styles.livePreviewHeader}>
                          <Ionicons name="sparkles" size={14} color={theme.accentLight} />
                          <Text style={[styles.livePreviewTitle, { color: theme.text }]}>Pratinjau Hasil Format:</Text>
                        </View>
                        {content.trim() ? (
                          <MarkdownRenderer content={content} fontSize={editorFontSize} textColor={theme.text} />
                        ) : (
                          <Text style={[styles.livePreviewEmpty, { color: theme.subtext }]}>
                            Belum ada teks materi. Ketik catatan di tab "Tulis" untuk melihat hasil formatnya di sini.
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Attachments Section in Desktop Edit Mode */}
                    <View style={{ marginTop: 16 }}>
                      <AttachmentManager
                        attachments={attachments}
                        onAddAttachments={newItems => setAttachments(prev => [...prev, ...newItems])}
                        onRemoveAttachment={id => setAttachments(prev => prev.filter(a => a.id !== id))}
                        onUpdateAttachment={handleUpdateAttachment}
                        isEditable={true}
                        title="Lampiran Dokumen & Foto Materi"
                      />
                    </View>

                  </View>
                </View>

                {/* Right Sidebar Column on Desktop Edit Mode */}
                <View style={styles.desktopRightSideCol}>
                  {/* Save Card */}
                  <View style={[styles.sideStudioCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.sideStudioHeader}>
                      <Ionicons name="save-outline" size={17} color={theme.accentLight} />
                      <Text style={[styles.sideStudioTitle, { color: theme.text }]}>Aksi Catatan</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.saveBtnFull, { backgroundColor: theme.primary, marginTop: 4 }, (!title.trim() || !content.trim()) && { opacity: 0.5 }]}
                      onPress={handleSave}
                      disabled={loading || !title.trim() || !content.trim()}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="save" size={17} color="#FFFFFF" />
                          <Text style={styles.saveBtnFullText}>Simpan Catatan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* AI Study Tools in Edit Mode */}
                  <View style={[styles.sideStudioCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.sideStudioHeader}>
                      <Ionicons name="sparkles" size={17} color={theme.accentLight} />
                      <Text style={[styles.sideStudioTitle, { color: theme.text }]}>Studio AI Pintar</Text>
                    </View>
                    <Text style={[styles.sideStudioDesc, { color: theme.subtext }]}>
                      Fitur AI untuk otomatisasi perangkuman & kuis dari teks catatanmu.
                    </Text>

                    <View style={styles.sideStudioBtnList}>
                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#EEF2FF' : '#191A3E', borderColor: isLightMode ? '#C7D2FE' : '#313470' }]}
                        onPress={() => setShowScanModal(true)}
                      >
                        <Ionicons name="camera" size={14} color="#818CF8" />
                        <Text style={[styles.sideStudioBtnText, { color: '#818CF8' }]}>Scan & Rewrite Foto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#FEF3C7' : '#281E0B', borderColor: isLightMode ? '#FDE68A' : '#533C14' }, generatingSummary && { opacity: 0.7 }]}
                        onPress={handleGenerateSummary}
                        disabled={generatingSummary}
                      >
                        {generatingSummary ? (
                          <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                          <>
                            <Ionicons name="sparkles" size={14} color="#F59E0B" />
                            <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>Rangkum AI</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#DCFCE7' : '#0E241B', borderColor: isLightMode ? '#86EFAC' : '#1C4A36' }, generatingQuiz && { opacity: 0.7 }]}
                        onPress={handleGenerateQuiz}
                        disabled={generatingQuiz}
                      >
                        {generatingQuiz ? (
                          <ActivityIndicator size="small" color="#10B981" />
                        ) : (
                          <>
                            <Ionicons name="school" size={14} color="#10B981" />
                            <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#15803D' : '#34D399' }]}>Buat Kuis AI</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.sideStudioBtn, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554', borderColor: isLightMode ? '#BFDBFE' : '#1E40AF' }]}
                        onPress={() => {
                          if (!content.trim()) {
                            showAlert('Catatan Masih Kosong', 'Tulis materi terlebih dahulu sebelum membahasnya di chat.');
                            return;
                          }
                          navigation.navigate('Main', {
                            screen: 'Chat',
                            params: {
                              initialMessage: `Halo Ara, bantu aku bedah materi dan diskusikan catatan kuliah '${title || 'Catatan'}' untuk mata kuliah '${subject || 'Kuliah'}' ini ya!\n\nIsi Catatan:\n${content}`,
                              autoSend: true,
                              timestamp: Date.now(),
                            },
                          });
                        }}
                      >
                        <Ionicons name="chatbubbles" size={14} color="#3B82F6" />
                        <Text style={[styles.sideStudioBtnText, { color: isLightMode ? '#1D4ED8' : '#60A5FA' }]}>Bahas di Chat AI</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Stats Card */}
                  <View style={[styles.sideMetaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.sideMetaCardTitle, { color: theme.text }]}>📊 Statistik Teks</Text>
                    <View style={styles.sideMetaList}>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Total Kata</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>{wordCount} kata</Text>
                      </View>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Total Karakter</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>{charCount} karakter</Text>
                      </View>
                      <View style={styles.sideMetaRow}>
                        <Text style={[styles.sideMetaKey, { color: theme.subtext }]}>Estimasi Baca</Text>
                        <Text style={[styles.sideMetaVal, { color: theme.text }]}>~{Math.max(1, Math.ceil(wordCount / 160))} mnt</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              /* ── MOBILE SINGLE-COLUMN EDIT LAYOUT ── */
              <View style={styles.editContainer}>
                <View style={[styles.documentPaper, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {/* Draft Status Banner */}
                  {!noteId && (draftSavedTime || hasRestoredDraft) ? (
                    <View style={[styles.draftBannerRow, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F1E19', borderColor: isLightMode ? '#86EFAC' : '#1D4537' }]}>
                      <View style={[styles.draftStatusPill, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F2618', borderColor: isLightMode ? '#86EFAC' : '#1C4A2E' }]}>
                        <Ionicons name="cloud-done" size={13} color="#10B981" />
                        <Text style={[styles.draftStatusText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                          {draftSavedTime ? `Draf tersimpan otomatis (${draftSavedTime})` : 'Draf dipulihkan'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handleDiscardDraft} style={[styles.discardDraftBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2B1215', borderColor: isLightMode ? '#FECACA' : '#571F26' }]}>
                        <Ionicons name="trash-outline" size={12} color="#EF4444" />
                        <Text style={[styles.discardDraftText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus Draf</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Title Input */}
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Judul Materi Kuliah:</Text>
                  <TextInput
                    style={[styles.titleInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    placeholder="Misal: Struktur Data & Algoritma Tree..."
                    placeholderTextColor={theme.muted}
                    value={title}
                    onChangeText={setTitle}
                  />

                  {/* Course / Subject Picker */}
                  <View style={styles.subjectHeaderRow}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Pilih Mata Kuliah:</Text>
                    <TouchableOpacity
                      style={[styles.manageSubjBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={() => setShowSubjectModal(true)}
                    >
                      <Ionicons name="settings-outline" size={13} color={theme.accentLight} />
                      <Text style={[styles.manageSubjBtnText, { color: theme.accentLight }]}>Kelola Matkul</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
                    {subjects.map(s => {
                      const isSel = subject.toLowerCase() === s.name.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[
                            styles.subjectChip,
                            { backgroundColor: theme.cardInner, borderColor: theme.border },
                            isSel && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => setSubject(s.name)}
                        >
                          <Text style={[styles.subjectChipText, { color: theme.subtext }, isSel && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Main Content Input Header */}
                  <View style={styles.contentHeaderRow}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Isi Catatan Materi:</Text>
                    
                    <View style={styles.contentHeaderRightGroup}>
                      <TouchableOpacity
                        style={[
                          styles.scanHeaderQuickBtn,
                          {
                            backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B',
                            borderColor: isLightMode ? '#C7D2FE' : '#3730A3',
                          }
                        ]}
                        onPress={() => setShowScanModal(true)}
                      >
                        <Ionicons name="camera" size={13} color={isLightMode ? '#4F46E5' : '#A5B4FC'} />
                        <Text style={[styles.scanHeaderQuickText, { color: isLightMode ? '#4F46E5' : '#A5B4FC' }]}>
                          Scan Foto AI
                        </Text>
                      </TouchableOpacity>

                      {/* Write vs Live Preview Toggle */}
                      <View style={[styles.editModeToggleWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <TouchableOpacity
                          style={[styles.editToggleBtn, editTab === 'write' && [styles.editToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
                          onPress={() => setEditTab('write')}
                        >
                          <Ionicons name="create-outline" size={13} color={editTab === 'write' ? theme.accentLight : theme.subtext} />
                          <Text style={[styles.editToggleText, { color: theme.subtext }, editTab === 'write' && [styles.editToggleTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                            Tulis
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.editToggleBtn, editTab === 'preview' && [styles.editToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
                          onPress={() => setEditTab('preview')}
                        >
                          <Ionicons name="eye-outline" size={13} color={editTab === 'preview' ? theme.accentLight : theme.subtext} />
                          <Text style={[styles.editToggleText, { color: theme.subtext }, editTab === 'preview' && [styles.editToggleTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                            Pratinjau
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {editTab === 'write' ? (
                    <>
                      {/* Formatting Toolbar */}
                      <View
                        style={[styles.toolbarWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
                      >
                        <View style={styles.toolbarRow}>
                          <TouchableOpacity
                            style={[
                              styles.toolBtn,
                              {
                                backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B',
                                borderColor: isLightMode ? '#C7D2FE' : '#3730A3',
                              }
                            ]}
                            onPress={() => setShowScanModal(true)}
                          >
                            <Ionicons name="camera" size={14} color={isLightMode ? '#4F46E5' : '#A5B4FC'} />
                          </TouchableOpacity>
                          <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('**', '**', 'teks tebal')}>
                            <Text style={[styles.toolBtnBold, { color: theme.text }]}>B</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('*', '*', 'teks miring')}>
                            <Text style={[styles.toolBtnItalic, { color: theme.text }]}>I</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('__', '__', 'teks garis bawah')}>
                            <Text style={[styles.toolBtnUnderline, { color: theme.text }]}>U</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('~~', '~~', 'teks coret')}>
                            <Text style={[styles.toolBtnItalic, { textDecorationLine: 'line-through', color: theme.text }]}>S</Text>
                          </TouchableOpacity>
                          <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('## ', 'Judul Bagian')}>
                            <Text style={[styles.toolBtnH3, { color: theme.text }]}>H2</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('### ', 'Judul Sub Bagian')}>
                            <Text style={[styles.toolBtnH3, { color: theme.text }]}>H3</Text>
                          </TouchableOpacity>
                          <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('- ', 'Item list')}>
                            <Ionicons name="list" size={15} color={theme.text} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('1. ', 'Item numerik')}>
                            <Text style={[styles.toolBtnH3, { color: theme.text }]}>1.</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('> ', 'Kutipan')}>
                            <Ionicons name="chatbubble-outline" size={14} color={theme.text} />
                          </TouchableOpacity>
                          <View style={[styles.toolDivider, { backgroundColor: theme.border }]} />
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('`', '`', 'kode')}>
                            <Ionicons name="code-slash" size={15} color={theme.text} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => wrapSelection('```\n', '\n```', 'blok kode')}>
                            <Ionicons name="terminal-outline" size={15} color={theme.text} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isLightMode ? '#E2E8F0' : '#1A1F2E' }]} onPress={() => prefixLine('---\n', '')}>
                            <Ionicons name="remove-outline" size={15} color={theme.text} />
                          </TouchableOpacity>
                        </View>

                        {/* Font Size Selector */}
                        <View style={[styles.fontSizeRow, { borderTopColor: theme.border }]}>
                          <Ionicons name="text-outline" size={13} color={theme.muted} />
                          <Text style={[styles.fontSizeChipText, { color: theme.muted }]}>Ukuran Teks:</Text>
                          {FONT_SIZES.map(size => (
                            <TouchableOpacity
                              key={size}
                              style={[
                                styles.fontSizeChip,
                                { backgroundColor: isLightMode ? '#F1F5F9' : '#1A1F2E' },
                                editorFontSize === size && [styles.fontSizeChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                              ]}
                              onPress={() => setEditorFontSize(size)}
                            >
                              <Text style={[styles.fontSizeChipText, { color: theme.subtext }, editorFontSize === size && [styles.fontSizeChipTextActive, { color: theme.accentLight }]]}>
                                {size}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <TextInput
                        ref={contentInputRef}
                        style={[styles.contentInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text, fontSize: editorFontSize, lineHeight: editorFontSize + 8, minHeight: contentHeight }]}
                        placeholder="Tulis atau tempel materi kuliah, rumus, bab ujian, atau ringkasan dosen di sini..."
                        placeholderTextColor={theme.muted}
                        value={content}
                        onChangeText={setContent}
                        multiline
                        textAlignVertical="top"
                        selection={selection}
                        onSelectionChange={(e) => {
                          const sel = e.nativeEvent.selection;
                          if (sel) {
                            lastSelectionRef.current = sel;
                            setSelection(sel);
                          }
                        }}
                        onContentSizeChange={(e) => {
                          const h = e.nativeEvent.contentSize.height;
                          if (h > 260) setContentHeight(Math.min(h + 20, 600));
                          else setContentHeight(260);
                        }}
                      />
                    </>
                  ) : (
                    <View style={[styles.livePreviewCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                      <View style={styles.livePreviewHeader}>
                        <Ionicons name="sparkles" size={14} color={theme.accentLight} />
                        <Text style={[styles.livePreviewTitle, { color: theme.text }]}>Pratinjau Hasil Format:</Text>
                      </View>
                      {content.trim() ? (
                        <MarkdownRenderer content={content} fontSize={editorFontSize} textColor={theme.text} />
                      ) : (
                        <Text style={[styles.livePreviewEmpty, { color: theme.subtext }]}>
                          Belum ada teks materi. Ketik catatan di tab "Tulis" untuk melihat hasil formatnya di sini.
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Attachments Section in Mobile Edit Mode */}
                  <View style={{ marginTop: 14 }}>
                    <AttachmentManager
                      attachments={attachments}
                      onAddAttachments={newItems => setAttachments(prev => [...prev, ...newItems])}
                      onRemoveAttachment={id => setAttachments(prev => prev.filter(a => a.id !== id))}
                      onUpdateAttachment={handleUpdateAttachment}
                      isEditable={true}
                      title="Lampiran Dokumen & Foto Materi"
                    />
                  </View>
                </View>

                {/* Word & Char Count */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Ionicons name="document-text-outline" size={12} color={theme.muted} />
                    <Text style={[styles.statText, { color: theme.muted }]}>{wordCount} kata</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="text-outline" size={12} color={theme.muted} />
                    <Text style={[styles.statText, { color: theme.muted }]}>{charCount} karakter</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="time-outline" size={12} color={theme.muted} />
                    <Text style={[styles.statText, { color: theme.muted }]}>~{Math.max(1, Math.ceil(wordCount / 160))} mnt baca</Text>
                  </View>
                </View>

                {/* AI Study Tools in Mobile Edit Mode */}
                <View style={[styles.aiStudioCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="sparkles" size={16} color={theme.accentLight} />
                    <Text style={[styles.aiStudioTitle, { color: theme.text }]}>Studio Fitur AI Pintar</Text>
                  </View>
                  <Text style={[styles.aiStudioSub, { color: theme.subtext }]}>
                    Otomatisasi perangkuman intisari ujian & kuis latihan interaktif dengan AI Gemini.
                  </Text>

                  {/* Mobile Quiz Question Count Selector */}
                  <View style={[styles.mobileQuizSelectorRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Text style={[styles.mobileQuizSelectorLabel, { color: theme.subtext }]}>Jumlah Soal Kuis:</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {QUIZ_COUNT_OPTIONS.map(cnt => (
                        <TouchableOpacity
                          key={cnt}
                          style={[
                            styles.mobileQuizChip,
                            { backgroundColor: theme.card, borderColor: theme.border },
                            quizCount === cnt && { backgroundColor: '#10B981', borderColor: '#10B981' }
                          ]}
                          onPress={() => setQuizCount(cnt)}
                        >
                          <Text style={[styles.mobileQuizChipText, { color: theme.subtext }, quizCount === cnt && { color: '#FFFFFF', fontWeight: '800' }]}>
                            {cnt} Soal
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.aiBtnRow}>
                    <TouchableOpacity
                      style={[styles.aiToolBtnScan, { backgroundColor: isLightMode ? '#4F46E5' : '#4338CA' }]}
                      onPress={() => setShowScanModal(true)}
                    >
                      <Ionicons name="camera" size={14} color="#FFFFFF" />
                      <Text style={styles.aiToolBtnText}>Scan & Rewrite Foto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.aiToolBtn, { backgroundColor: theme.primary }, generatingSummary && { opacity: 0.7 }]}
                      onPress={handleGenerateSummary}
                      disabled={generatingSummary}
                    >
                      {generatingSummary ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                          <Text style={styles.aiToolBtnText}>Rangkum AI</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.aiToolBtnQuiz, { backgroundColor: isLightMode ? '#059669' : '#065F46' }, generatingQuiz && { opacity: 0.7 }]}
                      onPress={handleGenerateQuiz}
                      disabled={generatingQuiz}
                    >
                      {generatingQuiz ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="school" size={14} color="#FFFFFF" />
                          <Text style={styles.aiToolBtnText}>Kuis ({quizCount} Soal)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bottom Save Action Button on Mobile */}
                <TouchableOpacity
                  style={[styles.saveBtnFull, { backgroundColor: theme.primary }, (!title.trim() || !content.trim()) && { opacity: 0.5 }]}
                  onPress={handleSave}
                  disabled={loading || !title.trim() || !content.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="save" size={17} color="#FFFFFF" />
                      <Text style={styles.saveBtnFullText}>Simpan Catatan Kuliah</Text>
                    </>
                  )}
                </TouchableOpacity>

              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* Subject Manager Modal */}
      <SubjectManagerModal
        visible={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSelectSubject={(subjName) => setSubject(subjName)}
      />

      {/* AI Scan & Rewrite Modal */}
      <ScanNoteModal
        visible={showScanModal}
        onClose={() => setShowScanModal(false)}
        onApply={handleApplyScanResult}
        hasExistingContent={!!content.trim()}
        availableSubjects={subjects}
      />

      {/* 3D Interactive Flashcards Modal */}
      <Flashcard3DModal
        visible={showFlashcardModal}
        onClose={() => setShowFlashcardModal(false)}
        title={title || 'Materi Catatan'}
        flashcards={flashcards}
        onSaveFlashcards={handleSaveFlashcardsState}
      />

      {/* AI Quiz RPG Boss Battle Arena Modal */}
      <QuizBattleModal
        visible={showQuizBattleModal}
        onClose={() => setShowQuizBattleModal(false)}
        noteTitle={title || 'Catatan Kuliah'}
        subject={subject}
        quizQuestions={quizData}
        onBattleWon={(earnedXp) => {
          setXpAmount(earnedXp);
          setShowXpPopup(true);
          addWaterDrops(1).catch(() => {});
          addChest(1).catch(() => {});
          awardWheelTicketForActivity().catch(() => {});
          defeatBossEvent().catch(() => {});
        }}
      />

      {/* Share Note to Friends Modal */}
      <ShareNoteModal
        visible={showShareModal}
        note={{
          id: noteId || 'temp_note',
          user_id: user?.id || 'guest',
          title: title || 'Catatan Kuliah',
          subject: subject || 'Kuliah Umum',
          content: content || '',
          summary,
          quiz_data: quizData,
          created_at: createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }}
        onClose={() => setShowShareModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#161B24',
    backgroundColor: '#0E1117',
  },
  headerBackBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  topHeaderSub: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#161B24',
  },
  segmentedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B24',
    borderRadius: 9,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  segmentBtnActive: {
    backgroundColor: '#1E2636',
  },
  segmentText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  headerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerIconBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#161B24',
  },
  scroll: {
    flex: 1,
  },
  innerContent: {
    padding: 16,
  },
  innerContentWide: {
    maxWidth: 1380,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  /* ========================================================================= */
  /* DOCUMENT CANVAS / PAPER STYLES */
  /* ========================================================================= */
  documentPaper: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    minHeight: 460,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  documentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  documentTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  documentActionBar: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  documentActionScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  docActionPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  documentDivider: {
    height: 1,
    width: '100%',
    marginVertical: 2,
    opacity: 0.6,
  },
  documentBody: {
    minHeight: 280,
    paddingVertical: 4,
  },
  /* ========================================================================= */
  /* READER VIEW STYLES */
  /* ========================================================================= */
  readerContainer: {
    gap: 16,
  },
  readerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  readerSubjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  readerSubjectText: {
    fontSize: 12,
    fontWeight: '700',
  },
  readerStatsPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  readerArticleContent: {
    color: '#E2E8F0',
    fontSize: 14.5,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
  },
  readerSummaryCard: {
    backgroundColor: '#111A2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1D3256',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryTitle: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700',
  },
  appendBtn: {
    backgroundColor: '#1E2F4D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  appendBtnText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryContent: {
    color: '#DBEAFE',
    fontSize: 13,
    lineHeight: 20,
  },
  /* ========================================================================= */
  /* EDIT VIEW STYLES */
  /* ========================================================================= */
  editContainer: {
    gap: 12,
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  draftBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1E19',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#1D4537',
    marginBottom: 10,
  },
  draftStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  draftStatusText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '600',
  },
  discardDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#2D1518',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4E1D24',
  },
  discardDraftText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  titleInput: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 14,
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 10,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  manageSubjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#141822',
  },
  manageSubjBtnText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  subjectRow: {
    gap: 8,
    marginBottom: 12,
  },
  subjectChip: {
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  subjectChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  subjectChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  subjectChipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  contentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  contentHeaderRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanHeaderQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  scanHeaderQuickText: {
    fontSize: 11,
    fontWeight: '700',
  },
  editModeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#141822',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#202634',
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editToggleBtnActive: {
    backgroundColor: '#1E293B',
  },
  editToggleText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  editToggleTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  livePreviewCard: {
    backgroundColor: '#0E1117',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 8,
    minHeight: 200,
  },
  livePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2130',
  },
  livePreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  livePreviewEmpty: {
    color: '#6B7280',
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 20,
    textAlign: 'center',
  },
  contentInput: {
    backgroundColor: '#0E1117',
    borderRadius: 12,
    padding: 14,
    color: '#F3F4F6',
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 6,
  },
  toolbarWrap: {
    backgroundColor: '#141822',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 8,
    overflow: 'hidden',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 2,
    flexWrap: 'wrap',
  },
  toolBtn: {
    width: 32,
    height: 30,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
  },
  toolBtnBold: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
  },
  toolBtnItalic: {
    color: '#E5E7EB',
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  toolBtnUnderline: {
    color: '#E5E7EB',
    fontSize: 14,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  toolBtnH3: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '800',
  },
  toolDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#2A3040',
    marginHorizontal: 3,
  },
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1E2430',
  },
  fontSizeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#1A1F2E',
  },
  fontSizeChipActive: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  fontSizeChipText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  fontSizeChipTextActive: {
    color: '#60A5FA',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  aiStudioCard: {
    backgroundColor: '#0E1117',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 14,
  },
  aiStudioTitle: {
    color: '#F9FAFB',
    fontSize: 13.5,
    fontWeight: '700',
  },
  aiStudioSub: {
    color: '#6B7280',
    fontSize: 11.5,
    marginBottom: 12,
  },
  aiBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  aiToolBtnScan: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  aiToolBtn: {
    flex: 1,
    minWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  aiToolBtnQuiz: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  aiToolBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  quizCountSelector: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#161B24',
    padding: 3,
    borderRadius: 8,
  },
  cntChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cntChipActive: {
    backgroundColor: '#059669',
  },
  cntChipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  cntChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 6,
  },
  saveBtnFullText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  /* ========================================================================= */
  /* QUIZ COMPONENT STYLES */
  /* ========================================================================= */
  quizCard: {
    backgroundColor: '#0E1117',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#192C23',
    gap: 14,
    marginTop: 6,
  },
  quizTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quizHeaderTitle: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '700',
  },
  quizHeaderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  miniBtn: {
    backgroundColor: '#141822',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#202634',
  },
  miniBtnText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  miniBtnDanger: {
    backgroundColor: '#201214',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A1D24',
  },
  miniBtnDangerText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  rpgBossLaunchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 10,
  },
  rpgBossIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpgBossLaunchTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rpgNewBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rpgNewBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  rpgBossLaunchSub: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  rpgPlayBtnCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rpgPlayBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  scoreBarCard: {
    backgroundColor: '#131D19',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1D3B2D',
  },
  scoreTopInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreLabel: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  scoreValueText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1C2E26',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  questionBlock: {
    backgroundColor: '#12161F',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2533',
    gap: 8,
  },
  questionNum: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  questionText: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  optionsList: {
    gap: 6,
    marginTop: 4,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 8,
  },
  optionBtnSelected: {
    backgroundColor: '#16233B',
    borderColor: '#3B82F6',
  },
  optionBtnCorrect: {
    backgroundColor: '#0D281E',
    borderColor: '#10B981',
  },
  optionBtnWrong: {
    backgroundColor: '#261214',
    borderColor: '#EF4444',
  },
  optionIndexBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#161B24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionIndexText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  optionText: {
    color: '#D1D5DB',
    fontSize: 12.5,
    flex: 1,
  },
  optionTextCorrect: {
    color: '#34D399',
    fontWeight: '600',
    fontSize: 12.5,
    flex: 1,
  },
  optionTextWrong: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 12.5,
    flex: 1,
  },
  explanationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
  },
  explanationCardCorrect: {
    backgroundColor: '#0A2118',
    borderColor: '#144634',
  },
  explanationCardWrong: {
    backgroundColor: '#241D10',
    borderColor: '#4D3B16',
  },
  explanationText: {
    color: '#E5E7EB',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  /* ========================================================================= */
  /* DESKTOP 2-COLUMN LAYOUT STYLES */
  /* ========================================================================= */
  desktopTwoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
    width: '100%',
  },
  desktopLeftMainCol: {
    flex: 1,
    gap: 18,
    minWidth: 0,
  },
  desktopRightSideCol: {
    width: 360,
    gap: 16,
    flexShrink: 0,
  },
  sideStudioCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  sideStudioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sideStudioTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sideStudioDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  sideStudioBtnList: {
    gap: 8,
  },
  sideStudioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  sideStudioBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sideQuizSelectorBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  sideQuizLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  sideQuizChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sideQuizChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sideMetaCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sideMetaCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  sideMetaList: {
    gap: 8,
  },
  sideMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideMetaKey: {
    fontSize: 12,
  },
  sideMetaVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  /* ========================================================================= */
  /* MOBILE QUIZ SELECTOR STYLES */
  /* ========================================================================= */
  docActionPillCombo: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 6,
  },
  docActionPillComboBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  comboDivider: {
    width: 1,
    height: 16,
    opacity: 0.5,
  },
  comboChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniComboChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  miniComboChipText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  mobileQuizSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  mobileQuizSelectorLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  mobileQuizChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  mobileQuizChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
