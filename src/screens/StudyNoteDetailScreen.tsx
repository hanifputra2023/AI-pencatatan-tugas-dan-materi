import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Platform, AppState
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { StudyNote, QuizQuestion } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';
import SubjectManagerModal from '../components/SubjectManagerModal';
import MarkdownRenderer from '../components/MarkdownRenderer';

type StudyNoteRouteProp = RouteProp<RootStackParamList, 'StudyNoteDetail'>;

const QUIZ_COUNT_OPTIONS = [3, 5, 10];

export default function StudyNoteDetailScreen() {
  const { user } = useAuth();
  const { subjects, addSubject } = useSubjects();
  const { theme, isLightMode } = useTheme();
  const route = useRoute<StudyNoteRouteProp>();
  const navigation = useNavigation();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const noteId = route.params?.noteId;

  // View Mode: 'reader' (clean detail view) vs 'edit' (form input)
  const [viewMode, setViewMode] = useState<'reader' | 'edit'>(noteId ? 'reader' : 'edit');

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizQuestion[]>([]);
  const [createdAt, setCreatedAt] = useState<string>('');

  // Subject Manager Modal
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  // Interactive Quiz options & test answers state
  const [quizCount, setQuizCount] = useState<number>(5);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!noteId);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

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

  const getDraftKey = useCallback(() => {
    return `@study_note_draft_${user?.id || 'anonymous'}`;
  }, [user]);

  // Load Note from DB or Restore Local Draft on Mount
  useEffect(() => {
    if (noteId) {
      fetchNote();
      setViewMode('reader');
    } else {
      setViewMode('edit');
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
  }, [noteId, getDraftKey]);

  // Auto-Save Draft to Local Storage (Debounced 700ms)
  useEffect(() => {
    // Only auto-save for new notes
    if (noteId) return;

    // Only save if there's actual text
    if (!title.trim() && !content.trim()) {
      return;
    }

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(async () => {
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
    if (noteId) return;

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
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
    const { data } = await supabase.from('study_notes').select('*').eq('id', noteId).single();
    if (data) {
      const n = data as StudyNote;
      setTitle(n.title);
      setSubject(n.subject || (subjects.length > 0 ? subjects[0].name : 'Umum'));
      setContent(n.content);
      setSummary(n.summary || null);
      setQuizData(n.quiz_data || []);
      setCreatedAt(n.created_at);
    }
    setFetching(false);
  };

  // AI Feature 1: Advanced Structured Academic Summarizer
  const handleGenerateSummary = async () => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Tulis materi catatan terlebih dahulu untuk dirangkum AI.');
      return;
    }
    setGeneratingSummary(true);
    try {
      const prompt = `Kamu adalah Ara, asisten pintar profesor akademik dan tutor belajar terbaik untuk mahasiswa.
Rangkum materi kuliah berikut menjadi intisari yang sangat terstruktur, jelas, komprehensif, dan mudah dihafal untuk persiapan ujian kuliah.

Format ringkasan harus memuat:
📌 Konsep & Definisi Kunci
💡 Rumus / Logika / Alur Utama
⚠️ Poin Kritis yang Sering Keluar di Ujian
🎯 Kesimpulan Ringkas

Judul: ${title || 'Catatan Kuliah'}
Mata Kuliah: ${subject || 'Kuliah'}
Isi Catatan:
${content}`;

      const aiReply = await sendMessageToGemini([], prompt);
      setSummary(aiReply);
      if (noteId && user) {
        await supabase.from('study_notes').update({ summary: aiReply, updated_at: new Date().toISOString() }).eq('id', noteId);
      }
      showAlert('Rangkuman Selesai', 'Intisari materi telah dibuat dan otomatis tersimpan ke catatan.');
    } catch (e: any) {
      showAlert('Gagal Merangkum', e.message || 'Terjadi kesalahan pada AI.');
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
      await supabase.from('study_notes').update({ content: newContent, updated_at: new Date().toISOString() }).eq('id', noteId);
    }
    showAlert('Berhasil Disisipkan', 'Rangkuman telah digabungkan ke dalam catatan kuliah dan tersimpan.');
  };

  // AI Feature 2: Generate Comprehensive Interactive Quiz (3, 5, or 10 Questions)
  const handleGenerateQuiz = async () => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Isi catatan terlebih dahulu untuk membuat soal kuis.');
      return;
    }
    setGeneratingQuiz(true);
    try {
      const prompt = `Buatkan ${quizCount} soal kuis pilihan ganda akademik (4 opsi A, B, C, D) yang mendalam berdasarkan materi kuliah ini.
Berikan opsi pengecoh yang masuk akal dan penjelasan mendalam untuk tiap jawaban yang benar.

Format output HARUS HANYA berupa JSON valid array murni:
[
  {
    "question": "Pertanyaan soal",
    "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
    "correctIndex": 0,
    "explanation": "Penjelasan ilmiah kenapa opsi ini benar"
  }
]

Mata Kuliah: ${subject || 'Kuliah'}
Materi Catatan:
${content}`;

      const academicSystemPrompt = `Kamu adalah mesin pembuat kuis akademik berformat JSON murni.
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

      if (rawArray.length === 0) {
        throw new Error('AI tidak mengembalikan daftar pertanyaan kuis. Coba klik Buat Kuis sekali lagi.');
      }

      const cleanQuestions: QuizQuestion[] = rawArray.map((q: any, idx: number) => {
        let correctIdx = 0;
        if (typeof q.correctIndex === 'number') {
          correctIdx = q.correctIndex;
        } else if (typeof q.correctIndex === 'string') {
          const c = q.correctIndex.toUpperCase().trim();
          if (c === 'A' || c === '0') correctIdx = 0;
          else if (c === 'B' || c === '1') correctIdx = 1;
          else if (c === 'C' || c === '2') correctIdx = 2;
          else if (c === 'D' || c === '3') correctIdx = 3;
        } else if (typeof q.answer === 'string') {
          const c = q.answer.toUpperCase().trim();
          if (c === 'A' || c === '0') correctIdx = 0;
          else if (c === 'B' || c === '1') correctIdx = 1;
          else if (c === 'C' || c === '2') correctIdx = 2;
          else if (c === 'D' || c === '3') correctIdx = 3;
        }

        const options = Array.isArray(q.options) && q.options.length >= 2
          ? q.options.map((o: any) => String(o))
          : ['Opsi A', 'Opsi B', 'Opsi C', 'Opsi D'];

        return {
          question: q.question || `Pertanyaan Soal #${idx + 1}`,
          options,
          correctIndex: Math.min(Math.max(0, correctIdx), options.length - 1),
          explanation: q.explanation || 'Jawaban didasarkan pada materi catatan kuliah.',
        };
      });

      setQuizData(cleanQuestions);
      setSelectedAnswers({});

      if (noteId && user) {
        await supabase.from('study_notes').update({ quiz_data: cleanQuestions, updated_at: new Date().toISOString() }).eq('id', noteId);
      }

      showAlert('Kuis Siap 🧠', `${cleanQuestions.length} soal kuis telah dibuat dan otomatis tersimpan ke catatan!`);
    } catch (e: any) {
      showAlert('Gagal Membuat Kuis', e.message || 'Gagal men-generate kuis latihan.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Feature 2.1: Clear / Delete Quiz
  const handleClearQuiz = () => {
    confirmAction(
      'Hapus Kuis Latihan?',
      'Semua daftar soal kuis ini akan dihapus dari catatan.',
      async () => {
        setQuizData([]);
        setSelectedAnswers({});
        if (noteId && user) {
          await supabase.from('study_notes').update({ quiz_data: [], updated_at: new Date().toISOString() }).eq('id', noteId);
        }
      },
      'Hapus Kuis'
    );
  };

  // Feature 2.2: Reset Quiz Answers
  const handleResetQuizAnswers = () => {
    setSelectedAnswers({});
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

    const payload = {
      user_id: user?.id || 'anonymous',
      title: title.trim(),
      subject: finalSubject,
      content: content.trim(),
      summary,
      quiz_data: quizData,
      updated_at: new Date().toISOString(),
    };

    if (user) {
      if (noteId) {
        await supabase.from('study_notes').update(payload).eq('id', noteId);
      } else {
        await supabase.from('study_notes').insert(payload);
        // Clear local draft once saved to Supabase
        try {
          const draftKey = getDraftKey();
          await AsyncStorage.removeItem(draftKey);
          setHasRestoredDraft(false);
          setDraftSavedTime(null);
        } catch (e) {}
      }
    }
    setLoading(false);
    showAlert('Tersimpan', 'Catatan kuliah berhasil disimpan.');
    if (noteId) {
      setViewMode('reader');
    } else {
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
          await supabase.from('study_notes').delete().eq('id', noteId);
        }
        showAlert('Terhapus', 'Catatan kuliah berhasil dihapus.');
        navigation.goBack();
      },
      'Hapus'
    );
  };

  // Copy Note Content
  const handleCopyNote = () => {
    const fullText = `${title}\n\nMata Kuliah: ${subject}\n\n${content}${summary ? `\n\n---\nRangkuman AI:\n${summary}` : ''}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullText);
      showAlert('Tersalin 📋', 'Materi catatan kuliah berhasil disalin ke clipboard.');
    } else {
      showAlert('Info', 'Fitur salin aktif pada perangkatmu.');
    }
  };

  const handleSelectQuizOption = (qIndex: number, optIndex: number) => {
    setSelectedAnswers(prev => ({ ...prev, [qIndex]: optIndex }));
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
    return <View style={[styles.loaderCenter, { backgroundColor: theme.bg }]}><ActivityIndicator size="small" color={theme.accentLight} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>

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
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                  <Text style={styles.headerSaveText}>Simpan</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={handleCopyNote}>
              <Ionicons name="copy-outline" size={17} color={theme.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={[styles.innerContent, isWide && styles.innerContentWide]}>

          {/* ========================================================================= */}
          {/* MODE 1: CLEAN & BEAUTIFUL READER VIEW (DETAIL MATERI) */}
          {/* ========================================================================= */}
          {viewMode === 'reader' ? (
            <View style={styles.readerContainer}>

              {/* Subject Tag & Meta Stats Bar */}
              <View style={styles.readerMetaRow}>
                <View style={[styles.readerSubjectBadge, { backgroundColor: theme.accentBg }]}>
                  <Ionicons name="school" size={12} color={theme.accentLight} />
                  <Text style={[styles.readerSubjectText, { color: theme.accentLight }]}>{subject || 'Kuliah Umum'}</Text>
                </View>

                <View style={styles.readerStatsPills}>
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

              {/* Title */}
              <Text style={[styles.readerTitle, { color: theme.text }]}>{title || 'Materi Catatan Tanpa Judul'}</Text>

              {/* Timestamp & Author Bar */}
              <View style={styles.readerDateRow}>
                <Ionicons name="calendar-outline" size={13} color={theme.muted} />
                <Text style={[styles.readerDateText, { color: theme.muted }]}>
                  {createdAt ? new Date(createdAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Catatan Baru'}
                </Text>
              </View>

              {/* Quick Action Floating Bar */}
              <View style={[styles.readerActionBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TouchableOpacity style={[styles.readerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={() => setViewMode('edit')}>
                  <Ionicons name="create" size={14} color={theme.accentLight} />
                  <Text style={[styles.readerActionBtnText, { color: theme.accentLight }]}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.readerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, generatingSummary && { opacity: 0.6 }]}
                  onPress={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <ActivityIndicator size="small" color="#FBBF24" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={14} color="#FBBF24" />
                      <Text style={[styles.readerActionBtnText, { color: '#FBBF24' }]}>
                        {summary ? 'Ulang Rangkuman' : 'Rangkum AI'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.readerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, generatingQuiz && { opacity: 0.6 }]}
                  onPress={handleGenerateQuiz}
                  disabled={generatingQuiz}
                >
                  {generatingQuiz ? (
                    <ActivityIndicator size="small" color="#34D399" />
                  ) : (
                    <>
                      <Ionicons name="school" size={14} color="#34D399" />
                      <Text style={[styles.readerActionBtnText, { color: '#34D399' }]}>
                        {quizData.length > 0 ? `Kuis (${quizData.length})` : 'Buat Kuis'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {noteId ? (
                  <TouchableOpacity style={[styles.readerActionDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418', borderColor: isLightMode ? '#FECACA' : '#5C1D24' }]} onPress={handleDeleteCurrentNote}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Main Content Article Body */}
              <View style={[styles.readerArticleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <MarkdownRenderer content={content || 'Belum ada isi materi catatan.'} fontSize={15} textColor={theme.text} />
              </View>

              {/* Summary Section (If Generated) */}
              {summary ? (
                <View style={[
                  styles.readerSummaryCard,
                  {
                    backgroundColor: isLightMode ? '#EFF6FF' : '#111A2E',
                    borderColor: isLightMode ? '#BFDBFE' : '#1D3256',
                  }
                ]}>
                  <View style={styles.summaryTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sparkles" size={16} color={isLightMode ? '#1D4ED8' : theme.accentLight} />
                      <Text style={[styles.summaryTitle, { color: isLightMode ? '#1D4ED8' : theme.text }]}>📌 Intisari & Rangkuman AI</Text>
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

              {/* Interactive Quiz Section (If Generated) */}
              {quizData.length > 0 ? (
                <View style={[
                  styles.quizCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: isLightMode ? '#A7F3D0' : '#192C23',
                  }
                ]}>
                  <View style={styles.quizTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="school" size={18} color={isLightMode ? '#059669' : '#34D399'} />
                      <Text style={[styles.quizHeaderTitle, { color: isLightMode ? '#059669' : '#34D399' }]}>
                        🧠 Kuis Pemahaman ({quizData.length} Soal)
                      </Text>
                    </View>
                    <View style={styles.quizHeaderActions}>
                      <TouchableOpacity onPress={handleResetQuizAnswers} style={[styles.miniBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <Text style={[styles.miniBtnText, { color: theme.subtext }]}>Reset</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleClearQuiz} style={[styles.miniBtnDanger, { backgroundColor: isLightMode ? '#FEE2E2' : '#331215', borderColor: isLightMode ? '#FECACA' : '#591D24' }]}>
                        <Text style={[styles.miniBtnDangerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Score Progress Bar */}
                  <View style={[
                    styles.scoreBarCard,
                    {
                      backgroundColor: isLightMode ? '#ECFDF5' : '#131D19',
                      borderColor: isLightMode ? '#A7F3D0' : '#1D3B2D',
                    }
                  ]}>
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
                      <View key={qIndex} style={[styles.questionBlock, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
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
                    );
                  })}
                </View>
              ) : null}

            </View>
          ) : (

            /* ========================================================================= */
            /* MODE 2: FULL EDIT / INPUT FORM */
            /* ========================================================================= */
            <View style={styles.editContainer}>

              {/* Draft Status Banner (Auto-Save Indicator & Discard Option) */}
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
                style={[styles.titleInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
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
                        { backgroundColor: theme.card, borderColor: theme.border },
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

              {/* Main Content Input Header with Live Preview Switch */}
              <View style={styles.contentHeaderRow}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>Isi Catatan Materi:</Text>
                
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
                      Pratinjau Rapi
                    </Text>
                  </TouchableOpacity>
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
                    style={[styles.contentInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text, fontSize: editorFontSize, lineHeight: editorFontSize + 8, minHeight: contentHeight }]}
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
                <View style={[styles.livePreviewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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

              {/* AI Study Tools in Edit Mode */}
              <View style={[styles.aiStudioCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={16} color={theme.accentLight} />
                  <Text style={[styles.aiStudioTitle, { color: theme.text }]}>Studio Fitur AI Pintar</Text>
                </View>
                <Text style={[styles.aiStudioSub, { color: theme.subtext }]}>
                  Otomatisasi perangkuman intisari ujian & kuis latihan interaktif dengan AI Gemini.
                </Text>

                <View style={styles.aiBtnRow}>
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
                        <Text style={styles.aiToolBtnText}>Rangkum Intisari Ujian</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Quiz Count Selector */}
                  <View style={[styles.quizCountSelector, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    {QUIZ_COUNT_OPTIONS.map(cnt => (
                      <TouchableOpacity
                        key={cnt}
                        style={[
                          styles.cntChip,
                          { backgroundColor: theme.cardInner },
                          quizCount === cnt && [styles.cntChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                        ]}
                        onPress={() => setQuizCount(cnt)}
                      >
                        <Text style={[styles.cntChipText, { color: theme.subtext }, quizCount === cnt && [styles.cntChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                          {cnt} Soal
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

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
                        <Text style={styles.aiToolBtnText}>Buat {quizCount} Kuis</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom Save Action Button */}
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
          )}

        </View>
      </ScrollView>

      {/* Subject Manager Modal */}
      <SubjectManagerModal
        visible={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSelectSubject={(subjName) => setSubject(subjName)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B0E',
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
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
  },
  /* ========================================================================= */
  /* READER VIEW STYLES */
  /* ========================================================================= */
  readerContainer: {
    gap: 14,
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
    backgroundColor: '#16233B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#253856',
  },
  readerSubjectText: {
    color: '#60A5FA',
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
    backgroundColor: '#141822',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statPillText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  readerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  readerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readerDateText: {
    color: '#6B7280',
    fontSize: 12,
  },
  readerActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#161B24',
    flexWrap: 'wrap',
  },
  readerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  readerActionBtnText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  readerActionDeleteBtn: {
    padding: 7,
    backgroundColor: '#201214',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A1D24',
    marginLeft: 'auto',
  },
  readerArticleCard: {
    backgroundColor: '#0E1117',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1C2330',
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
    fontSize: 10,
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
    fontSize: 10,
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
    fontSize: 10,
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
    fontSize: 10.5,
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
  aiToolBtn: {
    flex: 1,
    minWidth: 140,
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
    minWidth: 140,
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
    fontSize: 10.5,
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
});
