import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { StudyNote, QuizQuestion } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';
import SubjectManagerModal from '../components/SubjectManagerModal';

type StudyNoteRouteProp = RouteProp<RootStackParamList, 'StudyNoteDetail'>;

const QUIZ_COUNT_OPTIONS = [3, 5, 10];

export default function StudyNoteDetailScreen() {
  const { user } = useAuth();
  const { subjects, addSubject } = useSubjects();
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

  useEffect(() => {
    if (noteId) {
      fetchNote();
    } else if (subjects.length > 0 && !subject) {
      setSubject(subjects[0].name);
    }
  }, [noteId, subjects]);

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
      showAlert('Rangkuman Selesai ✨', 'Intisari materi telah dibuat dan otomatis tersimpan ke catatan.');
    } catch (e: any) {
      showAlert('Gagal Merangkum', e.message || 'Terjadi kesalahan pada AI.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Feature 1.1: Append Summary into Note Content
  const handleAppendSummaryToContent = async () => {
    if (!summary) return;
    const newContent = `${content.trim()}\n\n---\n### 📌 Rangkuman Intisari AI:\n${summary.trim()}`;
    setContent(newContent);
    if (noteId && user) {
      await supabase.from('study_notes').update({ content: newContent, updated_at: new Date().toISOString() }).eq('id', noteId);
    }
    showAlert('Berhasil Disisipkan 📋', 'Rangkuman telah digabungkan ke dalam catatan kuliah dan tersimpan.');
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
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 160));

  // Quiz Score Calculation
  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = quizData.reduce((acc, q, idx) => {
    return selectedAnswers[idx] === q.correctIndex ? acc + 1 : acc;
  }, 0);
  const scorePercent = quizData.length > 0 ? Math.round((correctCount / quizData.length) * 100) : 0;

  if (fetching) {
    return <View style={styles.loaderCenter}><ActivityIndicator size="small" color="#9CA3AF" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* Top Header Mode Switcher */}
      <View style={styles.topHeader}>
        {/* Segmented Mode Switcher */}
        <View style={styles.segmentedWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'reader' && styles.segmentBtnActive]}
            onPress={() => setViewMode('reader')}
          >
            <Ionicons name="book-outline" size={14} color={viewMode === 'reader' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.segmentText, viewMode === 'reader' && styles.segmentTextActive]}>
              Detail Materi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, viewMode === 'edit' && styles.segmentBtnActive]}
            onPress={() => setViewMode('edit')}
          >
            <Ionicons name="create-outline" size={14} color={viewMode === 'edit' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.segmentText, viewMode === 'edit' && styles.segmentTextActive]}>
              Edit Catatan
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right Action */}
        {viewMode === 'edit' ? (
          <TouchableOpacity
            style={[styles.headerSaveBtn, (!title.trim() || !content.trim()) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={loading || !title.trim() || !content.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                <Text style={styles.headerSaveText}>Simpan</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleCopyNote}>
            <Ionicons name="copy-outline" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
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
            <View style={styles.readerContainer}>

              {/* Subject Tag & Meta Stats Bar */}
              <View style={styles.readerMetaRow}>
                <View style={styles.readerSubjectBadge}>
                  <Ionicons name="school" size={12} color="#60A5FA" />
                  <Text style={styles.readerSubjectText}>{subject || 'Kuliah Umum'}</Text>
                </View>

                <View style={styles.readerStatsPills}>
                  <View style={styles.statPill}>
                    <Ionicons name="time-outline" size={11} color="#9CA3AF" />
                    <Text style={styles.statPillText}>{readingTimeMin} mnt baca</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Ionicons name="document-text-outline" size={11} color="#9CA3AF" />
                    <Text style={styles.statPillText}>{wordCount} kata</Text>
                  </View>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.readerTitle}>{title || 'Materi Catatan Tanpa Judul'}</Text>

              {/* Timestamp & Author Bar */}
              <View style={styles.readerDateRow}>
                <Ionicons name="calendar-outline" size={13} color="#6B7280" />
                <Text style={styles.readerDateText}>
                  {createdAt ? new Date(createdAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Catatan Baru'}
                </Text>
              </View>

              {/* Quick Action Floating Bar */}
              <View style={styles.readerActionBar}>
                <TouchableOpacity style={styles.readerActionBtn} onPress={() => setViewMode('edit')}>
                  <Ionicons name="create" size={14} color="#60A5FA" />
                  <Text style={styles.readerActionBtnText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.readerActionBtn, generatingSummary && { opacity: 0.6 }]}
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
                  style={[styles.readerActionBtn, generatingQuiz && { opacity: 0.6 }]}
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
                  <TouchableOpacity style={styles.readerActionDeleteBtn} onPress={handleDeleteCurrentNote}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Main Content Article Body */}
              <View style={styles.readerArticleCard}>
                <Text style={styles.readerArticleContent}>{content || 'Belum ada isi materi catatan.'}</Text>
              </View>

              {/* Summary Section (If Generated) */}
              {summary ? (
                <View style={styles.readerSummaryCard}>
                  <View style={styles.summaryTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sparkles" size={16} color="#60A5FA" />
                      <Text style={styles.summaryTitle}>📌 Intisari & Rangkuman AI</Text>
                    </View>
                    <TouchableOpacity onPress={handleAppendSummaryToContent} style={styles.appendBtn}>
                      <Text style={styles.appendBtnText}>+ Sisipkan</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.summaryContent}>{summary}</Text>
                </View>
              ) : null}

              {/* Interactive Quiz Section (If Generated) */}
              {quizData.length > 0 ? (
                <View style={styles.quizCard}>
                  <View style={styles.quizTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="school" size={18} color="#34D399" />
                      <Text style={styles.quizHeaderTitle}>🧠 Kuis Pemahaman ({quizData.length} Soal)</Text>
                    </View>
                    <View style={styles.quizHeaderActions}>
                      <TouchableOpacity onPress={handleResetQuizAnswers} style={styles.miniBtn}>
                        <Text style={styles.miniBtnText}>Reset</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleClearQuiz} style={styles.miniBtnDanger}>
                        <Text style={styles.miniBtnDangerText}>Hapus</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Score Progress Bar */}
                  <View style={styles.scoreBarCard}>
                    <View style={styles.scoreTopInfo}>
                      <Text style={styles.scoreLabel}>
                        Progres: {answeredCount} dari {quizData.length} Soal Dijawab
                      </Text>
                      <Text style={styles.scoreValueText}>
                        Skor: {correctCount}/{quizData.length} ({scorePercent}%)
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${(answeredCount / quizData.length) * 100}%` }]} />
                    </View>
                  </View>

                  {/* Questions List */}
                  {quizData.map((q, qIndex) => {
                    const isAnswered = selectedAnswers[qIndex] !== undefined;
                    const chosenIndex = selectedAnswers[qIndex];
                    const isCorrect = chosenIndex === q.correctIndex;

                    return (
                      <View key={qIndex} style={styles.questionBlock}>
                        <Text style={styles.questionNum}>Soal {qIndex + 1}:</Text>
                        <Text style={styles.questionText}>{q.question}</Text>

                        <View style={styles.optionsList}>
                          {q.options.map((opt, optIndex) => {
                            const isChosen = chosenIndex === optIndex;
                            const isTheRightAnswer = optIndex === q.correctIndex;

                            return (
                              <TouchableOpacity
                                key={optIndex}
                                style={[
                                  styles.optionBtn,
                                  isChosen && styles.optionBtnSelected,
                                  isAnswered && isTheRightAnswer && styles.optionBtnCorrect,
                                  isAnswered && isChosen && !isTheRightAnswer && styles.optionBtnWrong,
                                ]}
                                onPress={() => handleSelectQuizOption(qIndex, optIndex)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.optionIndexBadge}>
                                  <Text style={styles.optionIndexText}>
                                    {String.fromCharCode(65 + optIndex)}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.optionText,
                                    isAnswered && isTheRightAnswer && styles.optionTextCorrect,
                                    isAnswered && isChosen && !isTheRightAnswer && styles.optionTextWrong,
                                  ]}
                                >
                                  {opt}
                                </Text>
                                {isAnswered && isTheRightAnswer && (
                                  <Ionicons name="checkmark-circle" size={16} color="#34D399" style={{ marginLeft: 'auto' }} />
                                )}
                                {isAnswered && isChosen && !isTheRightAnswer && (
                                  <Ionicons name="close-circle" size={16} color="#EF4444" style={{ marginLeft: 'auto' }} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {isAnswered && (
                          <View style={[styles.explanationCard, isCorrect ? styles.explanationCardCorrect : styles.explanationCardWrong]}>
                            <Ionicons
                              name={isCorrect ? 'sparkles' : 'information-circle'}
                              size={15}
                              color={isCorrect ? '#34D399' : '#FBBF24'}
                            />
                            <Text style={styles.explanationText}>
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

              {/* Title Input */}
              <Text style={styles.inputLabel}>Judul Materi Kuliah:</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Misal: Struktur Data & Algoritma Tree..."
                placeholderTextColor="#4B5565"
                value={title}
                onChangeText={setTitle}
              />

              {/* Course / Subject Picker */}
              <View style={styles.subjectHeaderRow}>
                <Text style={styles.inputLabel}>Pilih Mata Kuliah:</Text>
                <TouchableOpacity
                  style={styles.manageSubjBtn}
                  onPress={() => setShowSubjectModal(true)}
                >
                  <Ionicons name="settings-outline" size={13} color="#60A5FA" />
                  <Text style={styles.manageSubjBtnText}>Kelola Matkul</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
                {subjects.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, subject.toLowerCase() === s.name.toLowerCase() && styles.subjectChipActive]}
                    onPress={() => setSubject(s.name)}
                  >
                    <Text style={[styles.subjectChipText, subject.toLowerCase() === s.name.toLowerCase() && styles.subjectChipTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Main Content Input */}
              <Text style={styles.inputLabel}>Isi Catatan Materi Lengkap:</Text>
              <TextInput
                style={styles.contentInput}
                placeholder="Tulis atau tempel materi kuliah, rumus, bab ujian, atau ringkasan dosen di sini..."
                placeholderTextColor="#4B5565"
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
              />

              {/* AI Study Tools in Edit Mode */}
              <View style={styles.aiStudioCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={16} color="#60A5FA" />
                  <Text style={styles.aiStudioTitle}>Studio Fitur AI Pintar</Text>
                </View>
                <Text style={styles.aiStudioSub}>
                  Otomatisasi perangkuman intisari ujian & kuis latihan interaktif dengan AI Gemini.
                </Text>

                <View style={styles.aiBtnRow}>
                  <TouchableOpacity
                    style={[styles.aiToolBtn, generatingSummary && { opacity: 0.7 }]}
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
                  <View style={styles.quizCountSelector}>
                    {QUIZ_COUNT_OPTIONS.map(cnt => (
                      <TouchableOpacity
                        key={cnt}
                        style={[styles.cntChip, quizCount === cnt && styles.cntChipActive]}
                        onPress={() => setQuizCount(cnt)}
                      >
                        <Text style={[styles.cntChipText, quizCount === cnt && styles.cntChipTextActive]}>
                          {cnt} Soal
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.aiToolBtnQuiz, generatingQuiz && { opacity: 0.7 }]}
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
                style={[styles.saveBtnFull, (!title.trim() || !content.trim()) && { opacity: 0.5 }]}
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
    backgroundColor: '#090B0E',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#161B24',
    backgroundColor: '#0E1117',
    gap: 10,
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
  contentInput: {
    backgroundColor: '#0E1117',
    borderRadius: 12,
    padding: 14,
    color: '#F3F4F6',
    fontSize: 14,
    lineHeight: 22,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 12,
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
