import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
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

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizQuestion[]>([]);

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
      showAlert('Rangkuman Selesai ✨', 'Intisari materi telah dibuat dengan struktur siap ujian.');
    } catch (e: any) {
      showAlert('Gagal Merangkum', e.message || 'Terjadi kesalahan pada AI.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Feature 1.1: Append Summary into Note Content
  const handleAppendSummaryToContent = () => {
    if (!summary) return;
    confirmAction(
      'Sisipkan ke Catatan?',
      'Rangkuman AI ini akan ditambahkan ke bagian bawah teks catatanmu.',
      () => {
        setContent(prev => `${prev.trim()}\n\n---\n### 📌 Rangkuman Intisari AI:\n${summary.trim()}`);
        showAlert('Berhasil Disisipkan', 'Rangkuman telah digabungkan ke dalam catatan kuliahmu.');
      },
      'Sisipkan'
    );
  };

  // AI Feature 2: Generate Comprehensive Interactive Quiz (3, 5, or 10 Questions)
  const handleGenerateQuiz = async () => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Isi catatan terlebih dahulu untuk membuat soal kuis.');
      return;
    }
    setGeneratingQuiz(true);
    try {
      const prompt = `Kamu adalah dosen penguji akademik universitas.
Buatkan ${quizCount} soal kuis pilihan ganda akademik (4 opsi A, B, C, D) yang bervariasi dari tingkat pemahaman hingga analisis kasus berdasarkan materi kuliah ini.
Berikan opsi pengecoh yang masuk akal dan penjelasan mendalam untuk tiap jawaban yang benar.

Format output HARUS HANYA berupa JSON valid murni tanpa markdown lain dengan format:
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

      const aiReply = await sendMessageToGemini([], prompt);
      const cleanJson = aiReply.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedQuiz: QuizQuestion[] = JSON.parse(cleanJson);
      setQuizData(parsedQuiz);
      setSelectedAnswers({});
      showAlert('Kuis Siap 🧠', `${parsedQuiz.length} soal latihan akademik telah dibuat. Uji pemahamanmu sekarang!`);
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
      () => {
        setQuizData([]);
        setSelectedAnswers({});
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
    navigation.goBack();
  };

  const handleSelectQuizOption = (qIndex: number, optIndex: number) => {
    setSelectedAnswers(prev => ({ ...prev, [qIndex]: optIndex }));
  };

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
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        {/* Title Input */}
        <TextInput
          style={styles.titleInput}
          placeholder="Judul Materi / Topik Kuliah..."
          placeholderTextColor="#4B5565"
          value={title}
          onChangeText={setTitle}
        />

        {/* Course / Subject Picker (1-Tap Selection from User's Registered Subjects) */}
        <View style={styles.subjectHeaderRow}>
          <Text style={styles.sectionLabel}>Pilih Mata Kuliah</Text>
          <TouchableOpacity
            style={styles.manageSubjBtn}
            onPress={() => setShowSubjectModal(true)}
          >
            <Ionicons name="settings-outline" size={13} color="#60A5FA" />
            <Text style={styles.manageSubjBtnText}>Kelola Matkul</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
          {subjects.map(s => {
            const isSelected = subject.toLowerCase() === s.name.toLowerCase();
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.subjectChip, isSelected && styles.subjectChipActive]}
                onPress={() => setSubject(s.name)}
              >
                <Text style={[styles.subjectChipText, isSelected && styles.subjectChipTextActive]}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          
          <TouchableOpacity
            style={styles.addNewSubjChip}
            onPress={() => setShowSubjectModal(true)}
          >
            <Ionicons name="add" size={14} color="#60A5FA" />
            <Text style={styles.addNewSubjText}>Tambah Matkul</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Responsive Dual Column Layout (Editor Left, AI Studio Right) */}
        <View style={[styles.editorLayout, isWide && styles.editorLayoutWide]}>
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Main Text Editor */}
          {/* ========================================================================= */}
          <View style={[styles.editorColumn, isWide && styles.editorColumnWide]}>
            <Text style={styles.sectionLabel}>Isi Catatan Pelajaran</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="Ketik poin materi kuliah, rumus, penjelasan dosen, atau rangkuman bab di sini..."
              placeholderTextColor="#4B5565"
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            {/* AI Action Trigger Section */}
            <View style={styles.aiControlBox}>
              <Text style={styles.aiControlTitle}>Alat Pintar AI Mahasiswa</Text>
              
              {/* Question Count Selector */}
              <View style={styles.quizCountRow}>
                <Text style={styles.quizCountLabel}>Jumlah Soal Kuis:</Text>
                <View style={styles.quizCountPills}>
                  {QUIZ_COUNT_OPTIONS.map(cnt => (
                    <TouchableOpacity
                      key={cnt}
                      style={[styles.countPill, quizCount === cnt && styles.countPillActive]}
                      onPress={() => setQuizCount(cnt)}
                    >
                      <Text style={[styles.countPillText, quizCount === cnt && styles.countPillTextActive]}>
                        {cnt} Soal
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.aiActionRow}>
                <TouchableOpacity
                  style={styles.aiBtn}
                  onPress={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <ActivityIndicator size="small" color="#60A5FA" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={15} color="#60A5FA" />
                      <Text style={styles.aiBtnText}>Rangkum dengan AI</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.aiBtn}
                  onPress={handleGenerateQuiz}
                  disabled={generatingQuiz}
                >
                  {generatingQuiz ? (
                    <ActivityIndicator size="small" color="#34D399" />
                  ) : (
                    <>
                      <Ionicons name="school" size={15} color="#34D399" />
                      <Text style={[styles.aiBtnText, { color: '#34D399' }]}>Buatkan {quizCount} Kuis</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{noteId ? 'Simpan Perubahan' : 'Simpan Catatan'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: AI Summary & Interactive Quiz Cards */}
          {/* ========================================================================= */}
          <View style={[styles.aiColumn, isWide && styles.aiColumnWide]}>
            
            {/* AI Summary Card with Append to Note & Clear */}
            {summary && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryBadge}>
                    <Ionicons name="sparkles" size={13} color="#60A5FA" />
                    <Text style={styles.summaryBadgeText}>Intisari Materi (AI Ara)</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={handleAppendSummaryToContent} style={styles.summaryActionBtn}>
                      <Ionicons name="add-circle-outline" size={15} color="#60A5FA" />
                      <Text style={styles.summaryActionText}>Sisipkan ke Catatan</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSummary(null)} style={{ padding: 2 }}>
                      <Ionicons name="close" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            )}

            {/* Interactive AI Quiz Studio */}
            {quizData && quizData.length > 0 ? (
              <View style={styles.quizSection}>
                <View style={styles.quizHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="school-outline" size={18} color="#34D399" />
                    <Text style={styles.quizSectionTitle}>Kuis Pemahaman ({quizData.length} Soal)</Text>
                  </View>
                  
                  {/* Delete / Clear Quiz Button */}
                  <TouchableOpacity onPress={handleClearQuiz} style={styles.deleteQuizBtn}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    <Text style={styles.deleteQuizText}>Hapus Kuis</Text>
                  </TouchableOpacity>
                </View>

                {/* Score & Progress Tracker */}
                <View style={styles.quizScoreBanner}>
                  <Text style={styles.scoreText}>
                    Progress: {answeredCount}/{quizData.length} Dijawab • Skor: {correctCount}/{quizData.length} ({scorePercent}%)
                  </Text>
                  {answeredCount > 0 && (
                    <TouchableOpacity onPress={handleResetQuizAnswers} style={styles.resetQuizBtn}>
                      <Ionicons name="refresh" size={12} color="#9CA3AF" />
                      <Text style={styles.resetQuizText}>Ulangi</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {quizData.map((q, qIndex) => {
                  const userAnswer = selectedAnswers[qIndex];
                  const isAnswered = userAnswer !== undefined;
                  return (
                    <View key={qIndex} style={styles.quizCard}>
                      <Text style={styles.quizQuestion}>
                        {qIndex + 1}. {q.question}
                      </Text>

                      <View style={styles.optionsList}>
                        {q.options.map((opt, optIndex) => {
                          const isSelected = userAnswer === optIndex;
                          const isCorrect = optIndex === q.correctIndex;
                          const isOptionCorrect = isAnswered && isCorrect;
                          const isOptionWrong = isAnswered && isSelected && !isCorrect;
                          const isOptionSelected = !isAnswered && isSelected;

                          return (
                            <TouchableOpacity
                              key={optIndex}
                              style={[
                                styles.optionItem,
                                isOptionCorrect && styles.optionCorrect,
                                isOptionWrong && styles.optionWrong,
                                isOptionSelected && styles.optionSelected,
                              ]}
                              onPress={() => handleSelectQuizOption(qIndex, optIndex)}
                            >
                              <Text
                                style={[
                                  styles.optionText,
                                  isOptionCorrect && styles.optionTextCorrect,
                                  isOptionWrong && styles.optionTextWrong,
                                ]}
                              >
                                {opt}
                              </Text>
                              {isOptionCorrect && (
                                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                              )}
                              {isOptionWrong && (
                                <Ionicons name="close-circle" size={16} color="#EF4444" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {isAnswered && q.explanation && (
                        <View style={styles.explanationBox}>
                          <Text style={styles.explanationText}>💡 {q.explanation}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : !summary ? (
              <View style={styles.emptyAiBox}>
                <Ionicons name="sparkles-outline" size={24} color="#4B5565" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyAiTitle}>AI Study Assistant</Text>
                <Text style={styles.emptyAiSub}>
                  Pilih jumlah soal (3, 5, atau 10 soal) lalu klik "Buatkan Kuis" atau "Rangkum dengan AI" untuk membuat simulasi belajar cerdas.
                </Text>
              </View>
            ) : null}

          </View>

        </View>

      </ScrollView>

      {/* Subject Manager Modal */}
      <SubjectManagerModal
        visible={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSelectSubject={(chosenName) => setSubject(chosenName)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1117',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0E1117',
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  titleInput: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
    paddingVertical: 10,
    marginBottom: 14,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manageSubjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  manageSubjBtnText: {
    color: '#60A5FA',
    fontSize: 10.5,
    fontWeight: '600',
  },
  subjectRow: {
    gap: 6,
    marginBottom: 16,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#202634',
  },
  subjectChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  subjectChipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  subjectChipTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  addNewSubjChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#26334A',
  },
  addNewSubjText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  editorLayout: {
    gap: 16,
  },
  editorLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  editorColumn: {
    width: '100%',
  },
  editorColumnWide: {
    flex: 1.2,
    minWidth: 320,
  },
  aiColumn: {
    width: '100%',
  },
  aiColumnWide: {
    flex: 1,
    minWidth: 300,
  },
  contentInput: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    color: '#F3F4F6',
    fontSize: 13.5,
    lineHeight: 22,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  aiControlBox: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  aiControlTitle: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  quizCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quizCountLabel: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  quizCountPills: {
    flexDirection: 'row',
    gap: 6,
  },
  countPill: {
    backgroundColor: '#0E1117',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#222836',
  },
  countPillActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1C3B2F',
  },
  countPillText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  countPillTextActive: {
    color: '#34D399',
    fontWeight: '600',
  },
  aiActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  aiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0E1117',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222836',
  },
  aiBtnText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#101624',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#19263B',
    marginBottom: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryBadgeText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  summaryActionText: {
    color: '#60A5FA',
    fontSize: 10.5,
    fontWeight: '600',
  },
  summaryText: {
    color: '#E2E8F0',
    fontSize: 12.5,
    lineHeight: 20,
  },
  quizSection: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  quizHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quizSectionTitle: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '700',
  },
  deleteQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deleteQuizText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '500',
  },
  quizScoreBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0E1726',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  scoreText: {
    color: '#93C5FD',
    fontSize: 11.5,
    fontWeight: '600',
  },
  resetQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetQuizText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  quizCard: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  quizQuestion: {
    color: '#F3F4F6',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  optionsList: {
    gap: 6,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#202634',
  },
  optionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#182338',
  },
  optionCorrect: {
    borderColor: '#10B981',
    backgroundColor: '#0E241B',
  },
  optionWrong: {
    borderColor: '#EF4444',
    backgroundColor: '#261316',
  },
  optionText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    flex: 1,
  },
  optionTextCorrect: {
    color: '#6EE7B7',
    fontWeight: '600',
  },
  optionTextWrong: {
    color: '#FCA5A5',
  },
  explanationBox: {
    marginTop: 8,
    backgroundColor: '#151922',
    padding: 8,
    borderRadius: 6,
  },
  explanationText: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 16,
  },
  emptyAiBox: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyAiTitle: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyAiSub: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
