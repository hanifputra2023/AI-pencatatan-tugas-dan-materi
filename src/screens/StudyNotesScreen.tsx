import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, FlatList, Modal, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { useTheme, isColorLight } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { StudyNote, StudentTask, TaskSubtask, NoteAttachment, ChatAttachment } from '../types';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { confirmAction, showAlert } from '../lib/alert';
import SubjectManagerModal from '../components/SubjectManagerModal';
import DateTimePickerModal from '../components/DateTimePickerModal';
import TaskWorkpadModal from '../components/TaskWorkpadModal';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { compressImage, uriToBase64 } from '../lib/imageCompressor';
import { processPickedFile } from '../lib/fileReader';
import { exportTaskToPdf, exportAllTasksSummaryToPdf, exportMultipleNotesToPdf } from '../lib/pdfExporter';
import {
  XpPopup,
  ConfettiBurst,
  FloatingBadge,
  FadeSlideIn,
  StreakFlamePulse,
} from '../components/DuolingoAnimations';
import VirtualGardenModal from '../components/VirtualGardenModal';
import QuizBattleModal from '../components/QuizBattleModal';
import { addGrowthPoints, addWaterDrops } from '../lib/gardenStorage';
import { addChest, awardWheelTicketForActivity, unlockTitle } from '../lib/lootChestStorage';
import { BossEvent, getCurrentBossEvent, defeatBossEvent } from '../lib/bossEventStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseDeadline, getDeadlinePresets } from '../lib/dateUtils';
import {
  requestNotificationPermissions,
  scheduleTaskDeadlineNotification,
  syncAllTaskDeadlines,
  cancelTaskNotification,
  notifyPomodoroFinished,
  schedulePomodoroAlarmNotification,
  cancelPomodoroAlarmNotification,
  sendImmediateNotification
} from '../lib/notifications';
import {
  isDeviceOnline,
  subscribeNetworkStatus,
  cacheTasksLocally,
  getCachedTasks,
  cacheNotesLocally,
  getCachedNotes,
  queueOfflineAction,
  processOfflineSyncQueue,
} from '../lib/offlineSync';

const POMODORO_DURATIONS = [
  { label: '25 Menit (Fokus)', value: 25 * 60 },
  { label: '50 Menit (Deep Work)', value: 50 * 60 },
  { label: '5 Menit (Istirahat)', value: 5 * 60 },
];

function DeadlineSelector({
  value,
  onChange,
  onOpenCalendar,
  theme,
  isLightMode,
}: {
  value: string;
  onChange: (val: string) => void;
  onOpenCalendar: () => void;
  theme: any;
  isLightMode: boolean;
}) {
  const presets = getDeadlinePresets();
  const parsed = parseDeadline(value);

  return (
    <View style={styles.deadlineSelectorBox}>
      {/* Main Interactive Calendar Button */}
      <TouchableOpacity
        style={[
          styles.deadlineInputRow,
          { backgroundColor: theme.cardInner, borderColor: parsed ? theme.accent : theme.border }
        ]}
        onPress={onOpenCalendar}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color={parsed ? theme.accentLight : theme.subtext} />
        
        <View style={{ flex: 1 }}>
          {parsed ? (
            <View>
              <Text style={[styles.deadlineSelectedMainText, { color: theme.text }]}>
                {parsed.formattedText}
              </Text>
              <Text style={[styles.deadlineSelectedSubText, { color: theme.accentLight }]}>
                {parsed.badgeLabel} • Klik untuk ubah
              </Text>
            </View>
          ) : (
            <Text style={[styles.deadlinePlaceholderText, { color: theme.muted }]}>
              Pilih batas tanggal & jam di kalender...
            </Text>
          )}
        </View>

        <View style={styles.deadlinePickerActionIcons}>
          {value ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                onChange('');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={18} color={theme.muted} />
            </TouchableOpacity>
          ) : null}
          <View style={[styles.pickCalendarMiniBtn, { backgroundColor: theme.accentBg }]}>
            <Text style={[styles.pickCalendarMiniBtnText, { color: theme.accentLight }]}>
              {parsed ? 'Ubah' : 'Pilih'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Quick Presets Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deadlinePresetRow}>
        {presets.map((p, idx) => {
          const isSelected = value === p.iso;
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.deadlinePresetChip,
                { backgroundColor: theme.cardInner, borderColor: theme.border },
                isSelected && [styles.deadlinePresetChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
              ]}
              onPress={() => onChange(p.iso)}
            >
              <Text style={[styles.deadlinePresetText, { color: theme.subtext }, isSelected && [styles.deadlinePresetTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function StudyNotesScreen() {
  const { user } = useAuth();
  const { subjects, addSubject } = useSubjects();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Study'>>();
  const { isDesktop, isTablet, isMobile } = useResponsive();
  const isWide = isDesktop || isTablet;

  const primaryBtnTextColor = isColorLight(theme.primary) ? '#0F172A' : '#FFFFFF';

  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'pomodoro'>(
    route.params?.initialTab || 'notes'
  );

  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'create' | 'edit'>('create');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  // Notes state
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [draftNote, setDraftNote] = useState<any>(null);
  const [selectedSubject, setSelectedSubject] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Subject Manager Modal
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [taskSubjectFilter, setTaskSubjectFilter] = useState('Semua');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskAttachments, setNewTaskAttachments] = useState<NoteAttachment[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [extractingTaskNotes, setExtractingTaskNotes] = useState(false);
  const aiGeneratedNotesRef = useRef<boolean>(false);

  // Weekly Boss Event State
  const [activeBossEvent, setActiveBossEvent] = useState<BossEvent | null>(null);
  const [showBossBattleModal, setShowBossBattleModal] = useState(false);
  const [bossQuizQuestions, setBossQuizQuestions] = useState<any[]>([]);
  const [loadingBossBattle, setLoadingBossBattle] = useState(false);

  // Advanced Tasks state (AI Breakdown & Subtasks & Edit & Pomodoro & Workpad)
  const [breakingDownTaskId, setBreakingDownTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<Record<string, string>>({});
  const [activePomodoroTask, setActivePomodoroTask] = useState<StudentTask | null>(null);
  const [activeWorkpadTask, setActiveWorkpadTask] = useState<StudentTask | null>(null);

  // Edit Task Modal State
  const [editingTask, setEditingTask] = useState<StudentTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTaskAttachments, setEditTaskAttachments] = useState<NoteAttachment[]>([]);

  // Pomodoro state
  const [pomoTimeLeft, setPomoTimeLeft] = useState(25 * 60);
  const [pomoTotalTime, setPomoTotalTime] = useState(25 * 60);
  const [pomoActive, setPomoActive] = useState(false);
  const pomoTimerRef = useRef<any>(null);
  const pomoEndTimestampRef = useRef<number | null>(null);

  // Duolingo-style Animation States
  const [showXpPopup, setShowXpPopup] = useState(false);
  const [xpAmount, setXpAmount] = useState(20);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showGardenModal, setShowGardenModal] = useState(false);

  useEffect(() => {
    if (subjects.length > 0 && !newTaskSubject) {
      setNewTaskSubject(subjects[0].name);
    }
  }, [subjects]);

  const checkDraft = useCallback(async () => {
    try {
      const key = `@study_note_draft_${user?.id || 'anonymous'}`;
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.title?.trim() || parsed.content?.trim())) {
          setDraftNote(parsed);
          return;
        }
      }
    } catch (e) {}
    setDraftNote(null);
  }, [user]);

  const handleDiscardDraft = () => {
    confirmAction(
      'Hapus Draf Catatan?',
      'Draf catatan yang belum disimpan ini akan dibersihkan.',
      async () => {
        try {
          const key = `@study_note_draft_${user?.id || 'anonymous'}`;
          await AsyncStorage.removeItem(key);
          setDraftNote(null);
          showAlert('Draf Dihapus', 'Draf catatan berhasil dibersihkan.');
        } catch (e) {}
      },
      'Hapus Draf'
    );
  };

  const fetchNotes = useCallback(async () => {
    if (!user) {
      setLoadingNotes(false);
      return;
    }
    try {
      const cached = await getCachedNotes(user.id);
      setNotes(cached || []);
    } catch (e) {
      console.log('fetchNotes error:', e);
    } finally {
      setLoadingNotes(false);
    }
  }, [user]);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setLoadingTasks(false);
      return;
    }
    try {
      const cached = await getCachedTasks(user.id);
      setTasks(cached || []);
      syncAllTaskDeadlines(cached || []);
    } catch (e) {
      console.log('fetchTasks error:', e);
    } finally {
      setLoadingTasks(false);
    }
  }, [user]);

  const persistTaskSubtasks = async (taskId: string, newSubtasks: TaskSubtask[]) => {
    if (!user) return;
    try {
      const localSubtasksKey = `@student_tasks_subtasks_${user.id}`;
      const raw = await AsyncStorage.getItem(localSubtasksKey);
      const map: Record<string, TaskSubtask[]> = raw ? JSON.parse(raw) : {};
      map[taskId] = newSubtasks;
      await AsyncStorage.setItem(localSubtasksKey, JSON.stringify(map));
    } catch (e) {
      console.log('Error persisting subtasks:', e);
    }
  };

  const handleSaveTaskNotes = async (taskId: string, newNotes: string, newAttachments?: NoteAttachment[]) => {
    const updated = tasks.map(t => t.id === taskId ? {
      ...t,
      notes: newNotes,
      attachments: newAttachments !== undefined ? newAttachments : t.attachments,
    } : t);
    setTasks(updated);
    if (user) cacheTasksLocally(user.id, updated);
    if (activeWorkpadTask && activeWorkpadTask.id === taskId) {
      setActiveWorkpadTask(prev => prev ? {
        ...prev,
        notes: newNotes,
        attachments: newAttachments !== undefined ? newAttachments : prev.attachments,
      } : null);
    }
    if (!user) return;
    try {
      const localNotesKey = `@student_tasks_notes_${user.id}`;
      const raw = await AsyncStorage.getItem(localNotesKey);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      map[taskId] = newNotes;
      await AsyncStorage.setItem(localNotesKey, JSON.stringify(map));

      // Attempt supabase update if column exists
    } catch (e) {
      console.log('Error persisting task notes:', e);
    }
  };

  const checkBossEvent = useCallback(async () => {
    try {
      const bEvent = await getCurrentBossEvent();
      if (bEvent && !bEvent.defeated) {
        setActiveBossEvent(bEvent);
      } else {
        setActiveBossEvent(null);
      }
    } catch {}
  }, []);

  const handleChallengeBoss = async () => {
    if (!activeBossEvent) return;

    setLoadingBossBattle(true);
    try {
      // 1. Build summary of all available notes
      let notesContext = '';
      if (notes && notes.length > 0) {
        notesContext = notes
          .map((n, i) => `Catatan ${i + 1} [${n.subject || 'Umum'} - ${n.title}]:\n${(n.content || '').substring(0, 450)}`)
          .join('\n\n');
      } else {
        notesContext = 'Materi umum sains, teknologi, matematika, logika, sejarah, dan wawasan akademik mahasiswa.';
      }

      // 2. Prompt AI to craft grand boss raid quiz
      const prompt = `Kamu adalah Game Master RPG Akademik. Buatkan 5 soal kuis pilihan ganda yang seru, berkualitas tinggi, dan menantang untuk Event Boss Battle "${activeBossEvent.name}" (${activeBossEvent.title}) berdasarkan rangkuman seluruh catatan kuliah mahasiswa berikut:\n\n${notesContext}\n\nATURAN:\n1. Buat soal yang menguji pemahaman konsep dari catatan di atas.\n2. Berikan 4 pilihan jawaban untuk setiap soal.\n3. Berikan correctIndex (0, 1, 2, atau 3) yang tepat.\n4. Format jawaban WAJIB HANYA JSON array valid tanpa teks pengantar:\n[\n  {\n    "question": "Pertanyaan soal...",\n    "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],\n    "correctIndex": 0,\n    "explanation": "Penjelasan singkat jawaban benar..."\n  }\n]`;

      const aiReply = await sendMessageToGemini([], prompt);
      const parsed: any = extractJsonFromText(aiReply);

      let questions: any[] = [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        questions = parsed;
      } else if (parsed && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else {
        questions = [
          {
            question: `Apa strategi belajar paling efektif untuk menaklukkan ${activeBossEvent.name}?`,
            options: ['Active Recall & Spaced Repetition', 'Sistem Kebut Semalam', 'Hafalan tanpa paham', 'Membaca pasif tanpa latihan'],
            correctIndex: 0,
            explanation: 'Active Recall dan Spaced Repetition terbukti secara ilmiah paling efektif dalam retensi jangka panjang.',
          },
          {
            question: 'Dalam manajemen waktu akademik, teknik fokus 25 menit diselingi 5 menit istirahat disebut teknik apa?',
            options: ['Teknik Pomodoro', 'Teknik Feynman', 'Metode Pareto', 'Teknik Eisenhower'],
            correctIndex: 0,
            explanation: 'Teknik Pomodoro membagi waktu belajar menjadi interval 25 menit fokus dan 5 menit jeda.',
          },
          {
            question: 'Manakah cara terbaik untuk memahami konsep materi yang rumit?',
            options: ['Menjelaskannya dengan bahasa sederhana seolah mengajarkannya ke orang lain', 'Menghafal rumus di luar kepala tanpa tahu asal-usulnya', 'Membaca berulang kali tanpa mencatat', 'Menghindari materi tersebut'],
            correctIndex: 0,
            explanation: 'Teknik Feynman mengajarkan bahwa jika kamu bisa menjelaskan suatu konsep secara sederhana, berarti kamu benar-benar memahaminya.',
          }
        ];
      }

      setBossQuizQuestions(questions);
      setShowBossBattleModal(true);
    } catch (e: any) {
      showAlert('Gagal Memulai Pertarungan', e?.message || 'Server AI sedang sibuk. Silakan coba sesaat lagi.');
    } finally {
      setLoadingBossBattle(false);
    }
  };

  const handleBossBattleWon = async (earnedXp: number) => {
    if (!activeBossEvent) return;

    const currentEvent = activeBossEvent;
    await defeatBossEvent();

    // Rewards
    await addGrowthPoints(currentEvent.rewards.xp);
    await addWaterDrops(currentEvent.rewards.water);
    await addChest(currentEvent.rewards.chests);
    await awardWheelTicketForActivity();
    await unlockTitle(currentEvent.rewards.titleId);

    // Refresh UI states
    setXpAmount(currentEvent.rewards.xp);
    setShowXpPopup(false);
    setTimeout(() => setShowXpPopup(true), 50);

    setActiveBossEvent(null);
    setShowBossBattleModal(false);

    setTimeout(() => {
      showAlert(
        `🏆 Kemenangan Akbar! ${currentEvent.name} Berhasil Ditaklukkan!`,
        `Luar biasa! Seluruh pengetahuan dari catatan kuliahmu telah menumbangkan ${currentEvent.name}!\n\n` +
        `🎁 Hadiah Event Diterima:\n` +
        `• +${currentEvent.rewards.xp} XP Tambahan ⚡\n` +
        `• +${currentEvent.rewards.water} Tetes Air Taman 💧\n` +
        `• +${currentEvent.rewards.chests} Kotak Hadiah 🎁\n` +
        `• +1 Tiket Roda Keberuntungan 🎰\n` +
        `• Gelar Eksklusif: "${currentEvent.rewards.titleLabel}" 🏅\n\n` +
        `Event Bos Mingguan telah terselesaikan!`
      );
    }, 400);
  };

  useEffect(() => {
    fetchNotes();
    fetchTasks();
    checkDraft();
    checkBossEvent();

    if (Platform.OS !== 'web') {
      requestNotificationPermissions();
    }
  }, [user, fetchNotes, fetchTasks, checkDraft, checkBossEvent]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
      fetchTasks();
      checkDraft();
      checkBossEvent();
    }, [fetchNotes, fetchTasks, checkDraft, checkBossEvent])
  );

  // Pomodoro Timer Controller (Timestamp-based for background tab persistence)
  useEffect(() => {
    if (pomoActive) {
      if (!pomoEndTimestampRef.current) {
        pomoEndTimestampRef.current = Date.now() + pomoTimeLeft * 1000;
      }

      pomoTimerRef.current = setInterval(() => {
        if (!pomoEndTimestampRef.current) return;
        const remaining = Math.max(0, Math.ceil((pomoEndTimestampRef.current - Date.now()) / 1000));
        
        setPomoTimeLeft(prev => {
          if (prev !== remaining) return remaining;
          return prev;
        });

        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          document.title = `[ ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ] ⏱️ Fokus Belajar`;
        }

        if (remaining <= 0) {
          clearInterval(pomoTimerRef.current);
          pomoEndTimestampRef.current = null;
          setPomoActive(false);
          cancelPomodoroAlarmNotification();
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.title = '🔔 Sesi Selesai! - Belajar & Kuliah';
          }
          notifyPomodoroFinished(activePomodoroTask?.title, pomoTotalTime < 10 * 60);

          // XP Popup + Confetti Animasi + Water Garden + Loot Chest
          setXpAmount(30);
          setShowXpPopup(false);
          setTimeout(() => setShowXpPopup(true), 50);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3500);
          addGrowthPoints(25).catch(() => {});
          addWaterDrops(2).catch(() => {});
          addChest(1).catch(() => {});
          awardWheelTicketForActivity().catch(() => {});

          showAlert('Sesi Fokus Selesai! (+30 XP, +2 💧 & +1 🎁)', 'Kerja luar biasa! Sesi fokus berhasil diselesaikan, tanaman disiram (+25 XP Pertumbuhan), kamu mendapatkan +30 XP, +2 Tetes Air, +1 Kotak Hadiah, dan +1 Tiket Roda Keberuntungan!');
        }
      }, 500);
    } else {
      if (pomoTimerRef.current) clearInterval(pomoTimerRef.current);
    }
    return () => {
      if (pomoTimerRef.current) clearInterval(pomoTimerRef.current);
    };
  }, [pomoActive, pomoTotalTime, activePomodoroTask]);

  const togglePomodoro = () => {
    if (!pomoActive) {
      pomoEndTimestampRef.current = Date.now() + pomoTimeLeft * 1000;
      setPomoActive(true);
      schedulePomodoroAlarmNotification(pomoTimeLeft, activePomodoroTask?.title, pomoTotalTime < 10 * 60);
    } else {
      pomoEndTimestampRef.current = null;
      setPomoActive(false);
      cancelPomodoroAlarmNotification();
    }
  };

  const resetPomodoro = () => {
    pomoEndTimestampRef.current = null;
    setPomoActive(false);
    cancelPomodoroAlarmNotification();
    setPomoTimeLeft(pomoTotalTime);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'AI Curhat & Belajar Pintar';
    }
  };

  const setPomoDuration = (seconds: number) => {
    pomoEndTimestampRef.current = null;
    setPomoActive(false);
    cancelPomodoroAlarmNotification();
    setPomoTotalTime(seconds);
    setPomoTimeLeft(seconds);
  };

  const formatPomoTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Add Task
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      showAlert('Perhatian', 'Judul tugas wajib diisi.');
      return;
    }
    if (!user) return;

    const chosenSubject = newTaskSubject.trim() || (subjects.length > 0 ? subjects[0].name : 'Umum');
    const tempId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const initialTask: StudentTask = {
      id: tempId,
      user_id: user.id,
      title: newTaskTitle.trim(),
      subject: chosenSubject,
      priority: newTaskPriority,
      due_date: newTaskDueDate.trim() || null,
      is_completed: false,
      created_at: new Date().toISOString(),
      subtasks: [],
      notes: newTaskNotes.trim(),
      attachments: newTaskAttachments.length > 0 ? newTaskAttachments : undefined,
    };
    if (newTaskNotes.trim() || newTaskAttachments.length > 0) {
      handleSaveTaskNotes(tempId, newTaskNotes.trim(), newTaskAttachments);
    }
    scheduleTaskDeadlineNotification(initialTask);
    const updated = [initialTask, ...tasks];
    setTasks(updated);
    cacheTasksLocally(user.id, updated);
    setNewTaskTitle('');
    setNewTaskDueDate('');
    setNewTaskNotes('');
    setNewTaskAttachments([]);
    if (isMobile) setShowTaskForm(false);

    // Reset AI extraction tracker
    aiGeneratedNotesRef.current = false;

    // Reward for adding task
    addWaterDrops(1).catch(() => {});
    addChest(1).catch(() => {});
    awardWheelTicketForActivity().catch(() => {});
    showAlert('Tugas Berhasil Ditambahkan! 🎉', 'Kamu mendapatkan +1 Tetes Air 💧, +1 Kotak Hadiah 🎁, dan +1 Tiket Roda Keberuntungan 🎰!');
  };

  // Direct AI Extraction without saving/storing bulky attachment files
  const runDirectTaskAiExtraction = async (chatAttachments: ChatAttachment[]) => {
    if (chatAttachments.length === 0) return;

    setExtractingTaskNotes(true);
    try {
      const prompt = `Analisis seluruh dokumen dan foto soal tugas kuliah yang dilampirkan ini.
Tugasmu adalah MENULISKAN ULANG isi soal menjadi Lembar Kerja Tugas Kuliah yang SANGAT JELAS, ENAK DIBACA, DAN MUDAH DICERNA MAHASISWA.

${newTaskTitle.trim() ? `Judul Tugas: "${newTaskTitle.trim()}"\n` : ''}
${newTaskSubject.trim() ? `Mata Kuliah: "${newTaskSubject.trim()}"\n` : ''}

ATURAN FORMAT RAMAH PEMBACA (SANGAT PENTING):
1. JANGAN PERNAH menampilkan kode LaTeX mentah (seperti \\frac, \\vec, \\int, \\begin{matrix}, \\sqrt, dll). Ubah semua rumus matematika dan fisika menjadi teks biasa dan simbol Unicode yang mudah dibaca (contoh: a = F / m, Vektor v = (x, y), x² + y² = r²).
2. Tuliskan dalam struktur yang bersih dan enak dibaca:
   - 📌 **Ringkasan Inti Soal / Tugas**: Jelaskan dalam 1-2 kalimat apa yang diminta oleh dosen.
   - 📋 **Daftar Pertanyaan / Instruksi Soal**: Buat poin-poin bernomor (1, 2, 3...) yang jelas.
   - 💡 **Petunjuk & Konsep Penting**: Rumus utama yang dipakai, definisi variabel, atau kriteria penilaian.
   - 📝 **Langkah Pengerjaan / Panduan Penyelesaian**: Saran langkah logis untuk menjawabnya.
3. JANGAN PERNAH membuat basa-basi ("Halo...", "Sebagai asisten AI...").
4. Awali baris pertama dengan:
JUDUL: [Tuliskan judul tugas yang singkat, spesifik, dan representatif]
---
[Langsung tuliskan isi lembar kerja tugas yang rapi di sini]`;

      const reply = await sendMessageToGemini(
        [],
        prompt,
        chatAttachments,
        'Kamu adalah asisten akademik cerdas yang mengekstrak soal dokumen menjadi teks lembar kerja Markdown yang sangat rapi dan mudah dicerna tanpa basa-basi.'
      );

      let cleanReply = reply;
      const titleMatch = reply.match(/^JUDUL\s*:\s*([^\n\r]+)/i);
      if (titleMatch && titleMatch[1]) {
        if (!newTaskTitle.trim()) {
          setNewTaskTitle(titleMatch[1].trim());
        }
        cleanReply = cleanReply.replace(/^JUDUL\s*:[^\n\r]+\n*(?:---|===|\*\*\*)?\s*/i, '').trim();
      }

      setNewTaskNotes(cleanReply);
      showAlert('Soal Berhasil Diekstrak! ✨', 'Isi soal dari dokumen/foto telah otomatis dituliskan ulang ke Lembar Tugas dalam format yang rapi dan mudah dipahami.');
    } catch (e: any) {
      showAlert('Gagal Mengekstrak Soal', e?.message || 'Terjadi kesalahan saat memproses dokumen tugas.');
    } finally {
      setExtractingTaskNotes(false);
    }
  };

  const handlePickDocumentAndExtract = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const chatAttachments: ChatAttachment[] = [];
        for (const file of res.assets) {
          try {
            const processed = await processPickedFile(file);
            chatAttachments.push({
              type: processed.type === 'image' ? 'image' : 'document',
              uri: file.uri,
              name: file.name || 'Dokumen_Soal',
              base64: processed.base64,
              textContent: processed.textContent,
              mimeType: processed.mimeType,
            });
          } catch {
            chatAttachments.push({
              type: 'document',
              uri: file.uri,
              name: file.name || 'Dokumen_Soal',
            });
          }
        }
        await runDirectTaskAiExtraction(chatAttachments);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Dokumen', e?.message || 'Terjadi kesalahan.');
    }
  };

  const handlePickPhotosAndExtract = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 10,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const chatAttachments: ChatAttachment[] = [];
        for (const asset of res.assets) {
          try {
            const compressed = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
            const b64 = await uriToBase64(compressed);
            chatAttachments.push({
              type: 'image',
              uri: compressed,
              name: asset.fileName || 'Foto_Soal.jpg',
              base64: b64,
              mimeType: asset.mimeType || 'image/jpeg',
            });
          } catch {
            chatAttachments.push({
              type: 'image',
              uri: asset.uri,
              name: asset.fileName || 'Foto_Soal.jpg',
              mimeType: 'image/jpeg',
            });
          }
        }
        await runDirectTaskAiExtraction(chatAttachments);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Foto', e?.message || 'Terjadi kesalahan.');
    }
  };

  const handleTakePhotoAndExtract = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Izin Kamera Ditolak', 'Aplikasi memerlukan izin kamera untuk memotret soal tugas.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const compressed = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
        const b64 = await uriToBase64(compressed);
        const chatAttachments: ChatAttachment[] = [{
          type: 'image',
          uri: compressed,
          name: 'Foto_Soal_Kamera.jpg',
          base64: b64,
          mimeType: 'image/jpeg',
        }];
        await runDirectTaskAiExtraction(chatAttachments);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Kamera', e?.message || 'Terjadi kesalahan.');
    }
  };

  // Toggle Task Completion
  const toggleTask = async (task: StudentTask) => {
    const newStatus = !task.is_completed;
    if (newStatus) {
      cancelTaskNotification(task.id);
      // XP Pop-up animasi + Water Drop + Chest + Ticket
      setXpAmount(20);
      setShowXpPopup(false);
      setTimeout(() => setShowXpPopup(true), 50);
      addWaterDrops(1).catch(() => {});
      addChest(1).catch(() => {});
      awardWheelTicketForActivity().catch(() => {});
      showAlert('Tugas Selesai! 🎉', '+20 XP, +1 Tetes Air 💧, +1 Kotak Hadiah 🎁, dan +1 Tiket Roda 🎰!');
    } else {
      scheduleTaskDeadlineNotification({ ...task, is_completed: false });
    }
    const updated = tasks.map(t => t.id === task.id ? { ...t, is_completed: newStatus } : t);
    setTasks(updated);
    if (user) {
      cacheTasksLocally(user.id, updated);
    }
  };

  // AI Task Breakdown: Generate 3-5 Subtasks
  const handleAiBreakdown = async (task: StudentTask) => {
    setBreakingDownTaskId(task.id);
    try {
      const prompt = `Pecah tugas kuliah berikut menjadi 3 sampai 5 langkah pengerjaan (subtasks) konkret, terstruktur, dan jelas untuk mahasiswa:
Judul Tugas: "${task.title}"
Mata Kuliah: "${task.subject}"

Kembalikan HANYA format JSON valid array murni berisi string langkah-langkah:
[
  "1. Cari minimal 3 jurnal referensi materi",
  "2. Susun kerangka bab dan rumusan masalah",
  "3. Tulis naskah laporan & analisis data",
  "4. Buat kesimpulan dan periksa daftar pustaka"
]`;

      const aiReply = await sendMessageToGemini([], prompt, null, 'Kamu adalah asisten pengurai tugas akademik berformat JSON array string murni.', {
        isJsonMode: true,
      });

      const parsed: any = extractJsonFromText(aiReply);
      let stepStrings: string[] = [];
      if (Array.isArray(parsed)) {
        stepStrings = parsed.map(s => typeof s === 'string' ? s : (s.title || s.step || JSON.stringify(s)));
      } else if (parsed && Array.isArray(parsed.subtasks)) {
        stepStrings = parsed.subtasks.map((s: any) => typeof s === 'string' ? s : (s.title || s.step || JSON.stringify(s)));
      } else if (parsed && Array.isArray(parsed.steps)) {
        stepStrings = parsed.steps.map((s: any) => typeof s === 'string' ? s : (s.title || s.step || JSON.stringify(s)));
      }

      if (stepStrings.length === 0) {
        throw new Error('AI tidak mengembalikan langkah tugas. Coba klik sekali lagi.');
      }

      const generatedSubtasks: TaskSubtask[] = stepStrings.map((step, idx) => ({
        id: `sub_${Date.now()}_${idx}`,
        title: step,
        is_completed: false,
      }));

      const updated = tasks.map(t => {
        if (t.id === task.id) {
          const merged = [...(t.subtasks || []), ...generatedSubtasks];
          persistTaskSubtasks(t.id, merged);
          return { ...t, subtasks: merged };
        }
        return t;
      });

      setTasks(updated);
      if (user) cacheTasksLocally(user.id, updated);
      showAlert('Langkah Terurai ✨', `${generatedSubtasks.length} subtask telah otomatis ditambahkan ke tugas ini!`);
    } catch (e: any) {
      showAlert('Gagal Mengurai Tugas', e.message || 'AI sedang sibuk. Silakan coba sesaat lagi.');
    } finally {
      setBreakingDownTaskId(null);
    }
  };

  // Add Manual Subtask
  const handleAddManualSubtask = (taskId: string) => {
    const inputVal = (newSubtaskInputs[taskId] || '').trim();
    if (!inputVal) return;

    const newSub: TaskSubtask = {
      id: `st_man_${Date.now()}`,
      title: inputVal,
      is_completed: false,
    };

    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const current = t.subtasks || [];
        const combined = [...current, newSub];
        persistTaskSubtasks(taskId, combined);
        return { ...t, subtasks: combined };
      }
      return t;
    });

    setTasks(updated);
    if (user) cacheTasksLocally(user.id, updated);
    setNewSubtaskInputs(prev => ({ ...prev, [taskId]: '' }));
  };

  // Toggle Subtask Completion
  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const currentList = t.subtasks || [];
        const targetSub = currentList.find(st => st.id === subtaskId);
        const willComplete = targetSub && !targetSub.is_completed;

        const updatedSubtasks = currentList.map(st =>
          st.id === subtaskId ? { ...st, is_completed: !st.is_completed } : st
        );
        persistTaskSubtasks(taskId, updatedSubtasks);

        if (willComplete) {
          setXpAmount(10);
          setShowXpPopup(false);
          setTimeout(() => setShowXpPopup(true), 50);
        }

        const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(st => st.is_completed);
        if (allDone && !t.is_completed) {
          toggleTask({ ...t, is_completed: false });
        }

        return { ...t, subtasks: updatedSubtasks };
      }
      return t;
    });
    setTasks(updated);
    if (user) cacheTasksLocally(user.id, updated);
  };

  // Delete Subtask
  const handleDeleteSubtask = (taskId: string, subtaskId: string) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const merged = (t.subtasks || []).filter(s => s.id !== subtaskId);
        persistTaskSubtasks(taskId, merged);
        return { ...t, subtasks: merged };
      }
      return t;
    });
    setTasks(updated);
    if (user) cacheTasksLocally(user.id, updated);
  };

  // Toggle Subtasks Accordion Expand/Collapse
  const toggleExpandTask = (taskId: string) => {
    setExpandedTaskIds(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Discuss Task in AI Chat (Automatic Ask)
  const handleDiscussTaskWithAi = (task: StudentTask) => {
    let taskContext = `Halo Ara, bantu aku beri ide konsep, penjelasan teori, dan panduan langkah pengerjaan untuk tugas kuliah berikut:\n\n` +
      `📌 *Judul Tugas:* ${task.title}\n` +
      `📚 *Mata Kuliah:* ${task.subject || 'Umum'}\n` +
      `${task.due_date ? `⏰ *Tenggat:* ${task.due_date}\n` : ''}` +
      `${task.subtasks && task.subtasks.length > 0 ? `\n📋 *Langkah/Subtasks:*\n${task.subtasks.map((st, i) => `${i + 1}. ${st.title}`).join('\n')}\n` : ''}` +
      `${task.notes ? `\n📝 *Petunjuk & Catatan Soal:*\n${task.notes}\n` : ''}` +
      `\nTolong berikan penjelasan yang mudah dipahami, sistematis, dan langsung bisa kupraktekkan ya!`;

    navigation.navigate('Main', {
      screen: 'Chat',
      params: {
        initialMessage: taskContext,
        autoSend: true,
        timestamp: Date.now(),
      },
    });
  };

  // Focus Task in Pomodoro Timer
  const handleFocusTaskWithPomodoro = (task: StudentTask) => {
    setActivePomodoroTask(task);
    setActiveTab('pomodoro');
    resetPomodoro();
    showAlert('Target Fokus Diatur ⏱️', `Timer Pomodoro disetel untuk tugas "${task.title}".`);
  };

  // Start Edit Task
  const handleStartEditTask = (task: StudentTask) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditSubject(task.subject || (subjects.length > 0 ? subjects[0].name : 'Umum'));
    setEditPriority(task.priority || 'medium');
    setEditDueDate(task.due_date || '');
    setEditNotes(task.notes || '');
    setEditTaskAttachments(task.attachments || []);
  };

  // Save Edit Task
  const handleSaveEditTask = async () => {
    if (!editingTask || !editTitle.trim()) {
      showAlert('Perhatian', 'Judul tugas kuliah tidak boleh kosong.');
      return;
    }

    const updatedTask: StudentTask = {
      ...editingTask,
      title: editTitle.trim(),
      subject: editSubject.trim() || (subjects.length > 0 ? subjects[0].name : 'Umum'),
      priority: editPriority,
      due_date: editDueDate.trim() || null,
      notes: editNotes.trim(),
      attachments: editTaskAttachments.length > 0 ? editTaskAttachments : undefined,
    };

    const updated = tasks.map(t => (t.id === editingTask.id ? updatedTask : t));
    setTasks(updated);
    handleSaveTaskNotes(editingTask.id, editNotes.trim(), editTaskAttachments);
    if (updatedTask.due_date && !updatedTask.is_completed) {
      scheduleTaskDeadlineNotification(updatedTask);
    } else {
      cancelTaskNotification(updatedTask.id);
    }
    setEditingTask(null);

    if (user) {
      cacheTasksLocally(user.id, updated);
    }
    showAlert('Tersimpan', 'Perubahan tugas berhasil disimpan.');
  };

  // Delete Task
  const deleteTask = (taskId: string) => {
    confirmAction('Hapus Tugas?', 'Tugas ini akan dihapus dari daftar.', async () => {
      cancelTaskNotification(taskId);
      const updated = tasks.filter(t => t.id !== taskId);
      setTasks(updated);
      if (activePomodoroTask?.id === taskId) {
        setActivePomodoroTask(null);
      }
      if (user) {
        cacheTasksLocally(user.id, updated);
      }
    }, 'Hapus');
  };

  // Delete Note
  const deleteNote = (noteId: string) => {
    confirmAction('Hapus Catatan?', 'Catatan kuliah ini akan dihapus permanen.', async () => {
      const updated = notes.filter(n => n.id !== noteId);
      setNotes(updated);
      if (user) {
        cacheNotesLocally(user.id, updated);
      }
    }, 'Hapus');
  };

  // Export Single Task to PDF
  const handleExportSingleTaskPdf = async (task: StudentTask) => {
    try {
      const authorName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Mahasiswa';
      await exportTaskToPdf(task, task.subtasks || [], task.notes || '', authorName);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    }
  };

  // Export Single Task to PDF
  const handleExportTaskPdf = async (taskItem: StudentTask) => {
    try {
      const authorName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Mahasiswa';
      const workpadText = taskItem.notes || '';
      await exportTaskToPdf(taskItem, taskItem.subtasks || [], workpadText, authorName);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    }
  };

  // Export All Tasks Summary to PDF
  const handleExportAllTasksPdf = async () => {
    if (tasks.length === 0) {
      showAlert('Perhatian', 'Belum ada daftar tugas kuliah untuk diekspor ke PDF.');
      return;
    }
    try {
      const authorName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Mahasiswa';
      await exportAllTasksSummaryToPdf(tasks, authorName);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    }
  };

  // Export Multiple / All Filtered Notes to PDF Booklet
  const handleExportAllNotesPdf = async () => {
    if (filteredNotes.length === 0) {
      showAlert('Perhatian', 'Tidak ada catatan materi untuk diekspor ke PDF.');
      return;
    }
    try {
      const authorName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Mahasiswa';
      await exportMultipleNotesToPdf(filteredNotes, selectedSubject, authorName);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    }
  };

  // Toggle & Request Notification Permission
  const handleToggleNotifications = async () => {
    const granted = await requestNotificationPermissions();
    if (granted) {
      sendImmediateNotification(
        '🔔 Notifikasi Berhasil Diaktifkan!',
        'Pengingat batas waktu tugas dan alarm Pomodoro siap digunakan.'
      );
      showAlert('Notifikasi Aktif 🔔', 'Izin notifikasi telah aktif! Notifikasi pengingat tugas dan alarm timer Pomodoro akan berbunyi dan muncul otomatis.');
    } else {
      showAlert(
        'Izin Notifikasi Ditolak / Diblokir ⚠️',
        'Untuk mengaktifkannya di browser, klik ikon gembok di sebelah URL address bar (kiri atas), lalu ubah izin Notifikasi menjadi "Izinkan (Allow)".'
      );
    }
  };

  const filteredNotes = notes.filter(n => {
    const matchSubject = selectedSubject === 'Semua' || n.subject?.toLowerCase() === selectedSubject.toLowerCase();
    const matchSearch = !searchQuery || n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSubject && matchSearch;
  });

  const filteredTasks = tasks.filter(t => {
    const matchStatus = taskFilter === 'all' || (taskFilter === 'pending' ? !t.is_completed : t.is_completed);
    const matchSubject = taskSubjectFilter === 'Semua' || t.subject?.toLowerCase() === taskSubjectFilter.toLowerCase();
    const matchSearch = !taskSearchQuery || t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) || (t.subject && t.subject.toLowerCase().includes(taskSearchQuery.toLowerCase()));
    return matchStatus && matchSubject && matchSearch;
  });

  // Progressive Lazy-Loading on Scroll
  const NOTES_PAGE_SIZE = 12;
  const [visibleNotesLimit, setVisibleNotesLimit] = useState(NOTES_PAGE_SIZE);

  const TASKS_PAGE_SIZE = 15;
  const [visibleTasksLimit, setVisibleTasksLimit] = useState(TASKS_PAGE_SIZE);

  const displayedNotes = useMemo(() => {
    return filteredNotes.slice(0, visibleNotesLimit);
  }, [filteredNotes, visibleNotesLimit]);

  const displayedTasks = useMemo(() => {
    return filteredTasks.slice(0, visibleTasksLimit);
  }, [filteredTasks, visibleTasksLimit]);

  const hasMoreNotes = filteredNotes.length > visibleNotesLimit;
  const hasMoreTasks = filteredTasks.length > visibleTasksLimit;

  const handleLoadMoreNotes = () => {
    setVisibleNotesLimit(prev => Math.min(filteredNotes.length, prev + NOTES_PAGE_SIZE));
  };

  const handleLoadMoreTasks = () => {
    setVisibleTasksLimit(prev => Math.min(filteredTasks.length, prev + TASKS_PAGE_SIZE));
  };

  // Collect all active subject names from Kelola Mata Kuliah for top category filters
  const allFilterSubjects = ['Semua', ...Array.from(new Set(subjects.map(s => s.name)))];

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
      <VirtualGardenModal
        visible={showGardenModal}
        onClose={() => setShowGardenModal(false)}
      />

      <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Belajar & Kuliah</Text>
          <Text style={[styles.subtitle, { color: isLightMode ? theme.text : theme.accentLight }]}>Catatan pintar AI, manajemen tugas & fokus nugas</Text>
        </View>

        <View style={styles.topActionBtnGroup}>
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.headerNotifBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={handleToggleNotifications}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="notifications-outline" size={16} color={theme.accentLight} />
              <Text style={[styles.headerNotifBtnText, { color: theme.text }]}>Notifikasi</Text>
            </TouchableOpacity>
          )}

          {activeTab === 'notes' && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              onPress={() => navigation.navigate('StudyNoteDetail', {})}
            >
              <Ionicons name="add" size={17} color={primaryBtnTextColor} />
              <Text style={[styles.addBtnText, { color: primaryBtnTextColor }]}>Catatan Baru</Text>
            </TouchableOpacity>
          )}

          {activeTab === 'tasks' && isMobile && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowTaskForm(!showTaskForm)}
            >
              <Ionicons name={showTaskForm ? 'close' : 'add'} size={17} color={primaryBtnTextColor} />
              <Text style={[styles.addBtnText, { color: primaryBtnTextColor }]}>{showTaskForm ? 'Tutup' : 'Tugas Baru'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Offline Status Warning Banner */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: isLightMode ? '#FEF3C7' : '#2D2008', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
          <Ionicons name="cloud-offline" size={15} color="#D97706" />
          <Text style={[styles.offlineBannerText, { color: isLightMode ? '#92400E' : '#FCD34D' }]}>
            Mode Offline Aktif • Catatan & tugas tersimpan di HP & otomatis di-upload ke database saat online.
          </Text>
        </View>
      )}

      {/* Mode Switcher Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'notes' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('notes')}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text-outline" size={16} color={activeTab === 'notes' ? theme.accentLight : theme.subtext} />
          <Text style={[styles.tabText, { color: activeTab === 'notes' ? theme.accentLight : theme.subtext }, activeTab === 'notes' && { fontWeight: '700' }]}>
            Catatan ({notes.length}){draftNote ? ' • 📝' : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'tasks' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('tasks')}
          activeOpacity={0.8}
        >
          <Ionicons name="checkbox-outline" size={16} color={activeTab === 'tasks' ? theme.accentLight : theme.subtext} />
          <Text style={[styles.tabText, { color: activeTab === 'tasks' ? theme.accentLight : theme.subtext }, activeTab === 'tasks' && { fontWeight: '700' }]}>
            Tugas ({tasks.filter(t => !t.is_completed).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pomodoro' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('pomodoro')}
          activeOpacity={0.8}
        >
          <Ionicons name="timer-outline" size={16} color={activeTab === 'pomodoro' ? theme.accentLight : theme.subtext} />
          <Text style={[styles.tabText, { color: activeTab === 'pomodoro' ? theme.accentLight : theme.subtext }, activeTab === 'pomodoro' && { fontWeight: '700' }]}>
            Fokus Pomodoro
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* TAB 1: STUDY NOTES (RESPONSIVE MASONRY GRID) */}
      {/* ========================================================================= */}
      {activeTab === 'notes' && (
        <View style={{ flex: 1 }}>

          {/* Controls Area (Clean Search Bar + Filter Pills) */}
          <View style={styles.controlsArea}>

            {/* Active Boss Raid Banner in Study Notes */}
            {activeBossEvent && (
              <TouchableOpacity
                style={[
                  styles.notesBossRaidBanner,
                  { backgroundColor: (activeBossEvent.color || '#DC2626') + '15', borderColor: activeBossEvent.color || '#DC2626' }
                ]}
                onPress={handleChallengeBoss}
                activeOpacity={0.85}
              >
                <View style={[styles.notesBossRaidIcon, { backgroundColor: (activeBossEvent.color || '#DC2626') + '25' }]}>
                  <Text style={{ fontSize: 20 }}>{activeBossEvent.emoji || '⚔️'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.notesBossRaidTitle, { color: activeBossEvent.color || '#DC2626' }]}>
                      Tantangan Event: {activeBossEvent.name}
                    </Text>
                    <View style={[styles.notesBossRaidBadge, { backgroundColor: activeBossEvent.color || '#DC2626' }]}>
                      <Text style={styles.notesBossRaidBadgeText}>RAID</Text>
                    </View>
                  </View>
                  <Text style={[styles.notesBossRaidSub, { color: theme.subtext }]} numberOfLines={1}>
                    Lawan Boss dengan kuis AI dari seluruh catatanmu! (+{activeBossEvent.rewards.xp} XP)
                  </Text>
                </View>
                <View style={[styles.notesBossRaidPlayBtn, { backgroundColor: activeBossEvent.color || '#DC2626' }]}>
                  <Ionicons name="flash" size={12} color="#FFFFFF" />
                  <Text style={styles.notesBossRaidPlayBtnText}>Lawan!</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Dedicated Search Input Bar */}
            <View style={[styles.searchBar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={16} color={theme.subtext} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Cari materi kuliah, rumus, judul bab, atau isi catatan..."
                placeholderTextColor={theme.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={16} color={theme.subtext} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Search feedback info badge when searching */}
            {searchQuery ? (
              <View style={[
                styles.searchFeedbackRow,
                {
                  backgroundColor: isLightMode ? '#EFF6FF' : '#101726',
                  borderColor: isLightMode ? '#BFDBFE' : '#1D2A42',
                }
              ]}>
                <Text style={[
                  styles.searchFeedbackText,
                  { color: isLightMode ? '#1D4ED8' : '#93C5FD' }
                ]}>
                  Menemukan {filteredNotes.length} catatan untuk "{searchQuery}"
                </Text>
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={[styles.resetSearchText, { color: theme.accentLight }]}>Reset</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Subject Filter Row + Manage Courses Button */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
              {draftNote ? (
                <TouchableOpacity
                  style={[styles.subjectChip, { backgroundColor: isLightMode ? '#FEF3C7' : '#261C08', borderColor: isLightMode ? '#FCD34D' : '#F59E0B' }]}
                  onPress={() => navigation.navigate('StudyNoteDetail', {})}
                >
                  <Text style={[styles.subjectChipText, { color: isLightMode ? '#B45309' : '#FBBF24', fontWeight: '700' }]}>
                    Draf Aktif (1)
                  </Text>
                </TouchableOpacity>
              ) : null}

              {allFilterSubjects.map(s => {
                const isSelected = selectedSubject.toLowerCase() === s.toLowerCase();
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.subjectChip,
                      { backgroundColor: theme.card, borderColor: theme.border },
                      isSelected && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setSelectedSubject(s)}
                  >
                    <Text style={[styles.subjectChipText, { color: theme.subtext }, isSelected && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.manageSubjFilterBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={() => setShowSubjectModal(true)}
              >
                <Ionicons name="settings-outline" size={13} color={theme.accentLight} />
                <Text style={[styles.manageSubjFilterText, { color: theme.accentLight }]}>Kelola Matkul</Text>
              </TouchableOpacity>

              {filteredNotes.length > 0 && (
                <TouchableOpacity
                  style={[styles.manageSubjFilterBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={handleExportAllNotesPdf}
                >
                  <Ionicons name="print-outline" size={13} color={theme.accentLight} />
                  <Text style={[styles.manageSubjFilterText, { color: theme.accentLight, fontWeight: '700' }]}>
                    Rekap PDF ({filteredNotes.length})
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {loadingNotes ? (
            <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.subtext} /></View>
          ) : filteredNotes.length === 0 ? (
            <View style={styles.emptyWrap}>
              {/* If draft exists, show draft card even if note list is empty */}
              {draftNote ? (
                <View style={[styles.draftCard, { backgroundColor: isLightMode ? '#FFFBEB' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#B45309', width: '100%', marginBottom: 20 }]}>
                  <View style={styles.draftCardHeader}>
                    <View style={[styles.draftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#382806', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
                      <Ionicons name="document-text" size={12} color="#FBBF24" />
                      <Text style={[styles.draftBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>DRAF BELUM TERSIMPAN</Text>
                    </View>
                    <TouchableOpacity onPress={handleDiscardDraft} style={[styles.draftDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418' }]}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.draftTitle, { color: isLightMode ? '#78350F' : '#FEF3C7' }]} numberOfLines={1}>
                    {draftNote.title || 'Catatan Baru (Tanpa Judul)'}
                  </Text>
                  <Text style={[styles.draftSnippet, { color: theme.subtext }]} numberOfLines={2}>
                    {draftNote.content || 'Belum ada isi materi...'}
                  </Text>

                  <View style={[styles.draftFooter, { borderTopColor: isLightMode ? '#FDE68A' : '#2C220E' }]}>
                    <View style={styles.draftMetaRow}>
                      <Ionicons name="school-outline" size={12} color={isLightMode ? '#B45309' : theme.muted} />
                      <Text style={[styles.draftSubjectText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>{draftNote.subject || 'Umum'}</Text>
                      {draftNote.savedAt ? (
                        <Text style={[styles.draftTimeText, { color: theme.muted }]}>
                          • {new Date(draftNote.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={[styles.draftContinueBtn, { backgroundColor: theme.primary }]}
                      onPress={() => navigation.navigate('StudyNoteDetail', {})}
                    >
                      <Ionicons name="create" size={13} color={primaryBtnTextColor} />
                      <Text style={[styles.draftContinueText, { color: primaryBtnTextColor }]}>Lanjutkan Menulis</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={[styles.emptyIconBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Ionicons name="book-outline" size={28} color={theme.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Belum ada catatan kuliah</Text>
              <Text style={[styles.emptySub, { color: theme.subtext }]}>Catat materi kuliah dan biarkan AI merangkumnya jadi poin ujian.</Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('StudyNoteDetail', {})}
              >
                <Text style={[styles.emptyAddText, { color: primaryBtnTextColor }]}>+ Buat Catatan Pertama</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={displayedNotes}
              keyExtractor={item => item.id}
              numColumns={isWide ? 2 : 1}
              key={isWide ? 'grid-2' : 'list-1'}
              columnWrapperStyle={isWide ? { gap: 12 } : undefined}
              contentContainerStyle={styles.notesList}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMoreNotes}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                hasMoreNotes ? (
                  <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.accentLight} />
                  </View>
                ) : null
              }
              ListHeaderComponent={
                draftNote ? (
                  <View style={[styles.draftCard, { backgroundColor: isLightMode ? '#FFFBEB' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#B45309' }]}>
                    <View style={styles.draftCardHeader}>
                      <View style={[styles.draftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#382806', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
                        <Ionicons name="document-text" size={12} color="#FBBF24" />
                        <Text style={[styles.draftBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>DRAF BELUM TERSIMPAN</Text>
                      </View>
                      <TouchableOpacity onPress={handleDiscardDraft} style={[styles.draftDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418' }]}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.draftTitle, { color: isLightMode ? '#78350F' : '#FEF3C7' }]} numberOfLines={1}>
                      {draftNote.title || 'Catatan Baru (Tanpa Judul)'}
                    </Text>
                    <Text style={[styles.draftSnippet, { color: theme.subtext }]} numberOfLines={2}>
                      {draftNote.content || 'Belum ada isi materi...'}
                    </Text>

                    <View style={[styles.draftFooter, { borderTopColor: isLightMode ? '#FDE68A' : '#2C220E' }]}>
                      <View style={styles.draftMetaRow}>
                        <Ionicons name="school-outline" size={12} color={isLightMode ? '#B45309' : theme.muted} />
                        <Text style={[styles.draftSubjectText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>{draftNote.subject || 'Umum'}</Text>
                        {draftNote.savedAt ? (
                          <Text style={[styles.draftTimeText, { color: theme.muted }]}>
                            • {new Date(draftNote.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={[styles.draftContinueBtn, { backgroundColor: '#D97706' }]}
                        onPress={() => navigation.navigate('StudyNoteDetail', {})}
                      >
                        <Ionicons name="create" size={13} color="#FFFFFF" />
                        <Text style={styles.draftContinueText}>Lanjutkan Menulis</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const words = item.content?.trim() ? item.content.trim().split(/\s+/).length : 0;
                const readMin = Math.max(1, Math.ceil(words / 160));
                return (
                  <TouchableOpacity
                    style={[styles.noteCard, { backgroundColor: theme.card, borderColor: theme.border }, isWide && styles.noteCardWide]}
                    onPress={() => navigation.navigate('StudyNoteDetail', { noteId: item.id })}
                    onLongPress={() => deleteNote(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.noteTopRow}>
                      <View style={[styles.subjectBadge, { backgroundColor: theme.accentBg }]}>
                        <Text style={[styles.subjectBadgeText, { color: theme.accentLight }]}>{item.subject}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.noteReadTime, { color: theme.muted }]}>⏱️ {readMin} mnt</Text>
                        <Text style={[styles.noteDate, { color: theme.muted }]}>
                          {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.noteSnippet, { color: theme.subtext }]} numberOfLines={3}>{item.content}</Text>

                    {/* AI Badges & Open Detail Action */}
                    <View style={styles.noteAiFooter}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        {item.summary ? (
                          <View style={[styles.aiBadge, { backgroundColor: theme.accentBg }]}>
                            <Ionicons name="sparkles" size={11} color={theme.accentLight} />
                            <Text style={[styles.aiBadgeText, { color: theme.accentLight }]}>Rangkuman AI</Text>
                          </View>
                        ) : null}
                        {item.quiz_data && item.quiz_data.length > 0 ? (
                          <View style={[styles.aiBadge, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B' }]}>
                            <Ionicons name="school" size={11} color={isLightMode ? '#16A34A' : '#34D399'} />
                            <Text style={[styles.aiBadgeText, { color: isLightMode ? '#16A34A' : '#34D399' }]}>{item.quiz_data.length} Soal</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={[styles.openDetailPill, { backgroundColor: theme.accentBg }]}>
                        <Text style={[styles.openDetailText, { color: theme.accentLight }]}>Detail</Text>
                        <Ionicons name="arrow-forward" size={11} color={theme.accentLight} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TASKS & DEADLINES (RESPONSIVE DUAL-COLUMN DESKTOP) */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Top Filter Bar: Subject Filter & Search */}
          <View style={[styles.taskTopFilterBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.taskSearchBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={16} color={theme.subtext} />
              <TextInput
                style={[styles.taskSearchInput, { color: theme.text }]}
                placeholder="Cari tugas atau mata kuliah..."
                placeholderTextColor={theme.muted}
                value={taskSearchQuery}
                onChangeText={setTaskSearchQuery}
              />
              {taskSearchQuery ? (
                <TouchableOpacity onPress={() => setTaskSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={theme.subtext} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Subject horizontal filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskSubjectFilterScroll}>
              {allFilterSubjects.map(sName => {
                const isSel = taskSubjectFilter.toLowerCase() === sName.toLowerCase();
                const taskCount = sName === 'Semua' ? tasks.length : tasks.filter(t => t.subject?.toLowerCase() === sName.toLowerCase()).length;
                return (
                  <TouchableOpacity
                    key={sName}
                    style={[
                      styles.subjectFilterChip,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                      isSel && [styles.subjectFilterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setTaskSubjectFilter(sName)}
                  >
                    <Text style={[styles.subjectFilterText, { color: theme.subtext }, isSel && [styles.subjectFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                      {sName} ({taskCount})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={[styles.taskLayout, isWide && styles.taskLayoutWide]}>

            {/* Left Column (Create Task Form - Permanent on Desktop, Collapsible on Mobile) */}
            {(isWide || showTaskForm) && (
              <View style={[styles.taskFormColumn, isWide && styles.taskFormColumnWide]}>
                <View style={[styles.taskFormCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.formHeaderRow}>
                    <Text style={[styles.taskFormTitle, { color: theme.text }]}>Tambah Tugas Kuliah</Text>
                    {isMobile && (
                      <TouchableOpacity onPress={() => setShowTaskForm(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color={theme.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={[styles.taskInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    placeholder="Nama tugas (misal: Makalah AI & Etika Bab 1)"
                    placeholderTextColor={theme.muted}
                    value={newTaskTitle}
                    onChangeText={setNewTaskTitle}
                  />

                  {/* Course Picker for Task */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Pilih Mata Kuliah:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.subjectRow, { marginBottom: 10 }]}>
                    {subjects.map(s => {
                      const isSel = newTaskSubject.toLowerCase() === s.name.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[
                            styles.subjectChip,
                            { backgroundColor: theme.cardInner, borderColor: theme.border },
                            isSel && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => setNewTaskSubject(s.name)}
                        >
                          <Text style={[styles.subjectChipText, { color: theme.subtext }, isSel && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.addNewSubjChip, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                      onPress={() => setShowSubjectModal(true)}
                    >
                      <Ionicons name="add" size={13} color={theme.accentLight} />
                      <Text style={[styles.addNewSubjText, { color: theme.accentLight }]}>Matkul Baru</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {/* Deadline Date & Time Picker */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tenggat / Deadline Tugas:</Text>
                  <DeadlineSelector
                    value={newTaskDueDate}
                    onChange={setNewTaskDueDate}
                    onOpenCalendar={() => {
                      setDatePickerTarget('create');
                      setShowDatePickerModal(true);
                    }}
                    theme={theme}
                    isLightMode={isLightMode}
                  />

                  {/* Priority Picker */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tingkat Prioritas:</Text>
                  <View style={styles.priorityRow}>
                    {(['high', 'medium', 'low'] as const).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.priorityChip,
                          { backgroundColor: theme.cardInner, borderColor: theme.border },
                          newTaskPriority === p && [styles.priorityChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                        ]}
                        onPress={() => setNewTaskPriority(p)}
                      >
                        <Text style={[styles.priorityText, { color: theme.subtext }, newTaskPriority === p && [styles.priorityTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                          {p === 'high' ? '🔥 Mendesak' : p === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* AI Quick Soal Importer Action Bar */}
                  <View style={{ marginTop: 8, marginBottom: 4 }}>
                    <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>
                      Ekstrak Soal Otomatis dengan AI:
                    </Text>
                    <View style={styles.aiImportActionRow}>
                      <TouchableOpacity
                        style={[
                          styles.aiImportBtn,
                          { backgroundColor: isLightMode ? '#EFF6FF' : '#172554', borderColor: isLightMode ? '#BFDBFE' : '#1E40AF' },
                          extractingTaskNotes && { opacity: 0.6 }
                        ]}
                        onPress={handlePickDocumentAndExtract}
                        disabled={extractingTaskNotes}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="document-text" size={13} color={isLightMode ? '#2563EB' : '#60A5FA'} />
                        <Text style={[styles.aiImportBtnText, { color: isLightMode ? '#1D4ED8' : '#93C5FD' }]}>
                          Impor Dokumen (PDF/Word/TXT)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.aiImportBtn,
                          { backgroundColor: isLightMode ? '#FEF3C7' : '#2D2006', borderColor: isLightMode ? '#FDE68A' : '#78350F' },
                          extractingTaskNotes && { opacity: 0.6 }
                        ]}
                        onPress={handlePickPhotosAndExtract}
                        disabled={extractingTaskNotes}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="images" size={13} color={isLightMode ? '#D97706' : '#FBBF24'} />
                        <Text style={[styles.aiImportBtnText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>
                          Impor Foto Soal
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.aiImportBtnSmall,
                          { backgroundColor: theme.cardInner, borderColor: theme.border },
                          extractingTaskNotes && { opacity: 0.6 }
                        ]}
                        onPress={handleTakePhotoAndExtract}
                        disabled={extractingTaskNotes}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="camera" size={13} color={theme.accentLight} />
                        <Text style={[styles.aiImportBtnSmallText, { color: theme.text }]}>Kamera</Text>
                      </TouchableOpacity>
                    </View>

                    {extractingTaskNotes && (
                      <View style={[styles.aiExtractingBanner, { backgroundColor: isLightMode ? '#FEF3C7' : '#451A03', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
                        <ActivityIndicator size="small" color={isLightMode ? '#D97706' : '#FBBF24'} />
                        <Text style={[styles.aiExtractingBannerText, { color: isLightMode ? '#92400E' : '#FEF3C7' }]}>
                          AI sedang membaca & menuliskan ulang soal ke format rapi...
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Task Notes / Lembar Kerja */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Catatan / Lembar Tugas (Opsional):</Text>
                    {newTaskNotes.trim().length > 0 && (
                      <TouchableOpacity onPress={() => setNewTaskNotes('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: 10.5, color: '#EF4444', fontWeight: '600' }}>Hapus Lembar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[styles.taskNotesFormInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    placeholder="Tulis instruksi soal dosen, draft jawaban, atau catatan referensi..."
                    placeholderTextColor={theme.muted}
                    value={newTaskNotes}
                    onChangeText={setNewTaskNotes}
                    multiline
                    numberOfLines={4}
                  />

                  <TouchableOpacity style={[styles.saveTaskBtn, { backgroundColor: theme.primary }]} onPress={handleAddTask}>
                    <Text style={[styles.saveTaskBtnText, { color: primaryBtnTextColor }]}>+ Simpan Tugas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Right Column (Tasks Filter & Lists) */}
            <View style={[styles.taskListColumn, isWide && styles.taskListColumnWide]}>

              {/* Filter Tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.taskFilterRow}
                style={{ marginBottom: 12 }}
              >
                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'pending' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('pending')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'pending' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Belum Selesai ({tasks.filter(t => !t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'completed' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('completed')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'completed' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Selesai ({tasks.filter(t => t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'all' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('all')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'all' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Semua ({tasks.length})
                  </Text>
                </TouchableOpacity>

                {/* Export All Tasks Summary to PDF Button */}
                <TouchableOpacity
                  style={[styles.taskFilterChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={handleExportAllTasksPdf}
                >
                  
                  <Text style={[styles.taskFilterText, { color: theme.accentLight, fontWeight: '700' }]}>
                    Rekap PDF
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {loadingTasks ? (
                <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.subtext} /></View>
              ) : filteredTasks.length === 0 ? (
                <View style={[styles.emptyTaskWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Ionicons name="checkbox-outline" size={32} color={theme.muted} style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>Tidak ada tugas dalam kategori ini</Text>
                  <Text style={[styles.emptySub, { color: theme.subtext }]}>Semua rapi atau coba ubah kata kunci filter pencarian.</Text>
                </View>
              ) : (
                <View style={styles.taskListContainer}>
                  {filteredTasks.map(t => {
                    const isHigh = t.priority === 'high';
                    const isMedium = t.priority === 'medium';
                    const subtasks = t.subtasks || [];
                    const hasSubtasks = subtasks.length > 0;
                    const completedSubtasksCount = subtasks.filter(st => st.is_completed).length;
                    const subtaskPercent = hasSubtasks ? Math.round((completedSubtasksCount / subtasks.length) * 100) : 0;
                    const isExpanded = !!expandedTaskIds[t.id];
                    const isBreakingDown = breakingDownTaskId === t.id;

                    const isDueDateUrgent = !t.is_completed && t.due_date && (t.due_date.toLowerCase().includes('hari ini') || t.due_date.toLowerCase().includes('besok') || isHigh);

                    return (
                      <View
                        key={t.id}
                        style={[
                          styles.taskCard,
                          { backgroundColor: theme.card, borderColor: theme.border },
                          t.is_completed && styles.taskCardDone
                        ]}
                      >
                        {/* Top-Right Corner Action Buttons (Edit & Delete) */}
                        <View style={styles.taskCardCornerActions}>
                          <TouchableOpacity
                            style={[styles.taskCornerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                            onPress={() => handleStartEditTask(t)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Edit Tugas"
                          >
                            <Ionicons name="pencil-outline" size={12} color={theme.subtext} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.taskCornerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                            onPress={() => deleteTask(t.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Hapus Tugas"
                          >
                            <Ionicons name="trash-outline" size={12} color={theme.muted} />
                          </TouchableOpacity>
                        </View>

                        {/* Task Main Header Row */}
                        <View style={[styles.taskMainRow, { paddingRight: 64 }]}>
                          <TouchableOpacity onPress={() => toggleTask(t)} style={styles.taskCheckbox}>
                            <View style={[styles.taskCircle, { borderColor: theme.border }, t.is_completed && [styles.taskCircleActive, { backgroundColor: theme.primary, borderColor: theme.primary }]]}>
                              {t.is_completed && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                            </View>
                          </TouchableOpacity>

                          <View style={{ flex: 1 }}>
                            <View style={styles.taskHeaderRow}>
                              <View style={[styles.taskSubjectBadge, { backgroundColor: theme.accentBg }]}>
                                <Text style={[styles.taskSubjectText, { color: theme.accentLight }]}>{t.subject}</Text>
                              </View>

                              {/* Priority Chip */}
                              <View style={[
                                styles.taskPriorityBadge,
                                { backgroundColor: isHigh ? (isLightMode ? '#FEE2E2' : '#2D1418') : isMedium ? (isLightMode ? '#FEF3C7' : '#2E2008') : (isLightMode ? '#F0FDF4' : '#0B291B') }
                              ]}>
                                <Text style={[
                                  styles.taskPriorityBadgeText,
                                  { color: isHigh ? (isLightMode ? '#DC2626' : '#F87171') : isMedium ? (isLightMode ? '#D97706' : '#FBBF24') : (isLightMode ? '#16A34A' : '#34D399') }
                                ]}>
                                  {t.priority === 'high' ? 'Mendesak' : t.priority === 'medium' ? 'Sedang' : 'Santai'}
                                </Text>
                              </View>

                              {/* Smart Dynamic Due Date Badge */}
                              {(() => {
                                if (t.is_completed) {
                                  return (
                                    <View style={[
                                      styles.dueBadge,
                                      {
                                        backgroundColor: isLightMode ? '#F0FDF4' : '#0B291B',
                                        borderColor: isLightMode ? '#DCFCE7' : '#14532D',
                                        borderWidth: 1,
                                      }
                                    ]}>
                                      <Ionicons name="checkmark-circle" size={11} color={isLightMode ? '#16A34A' : '#34D399'} />
                                      <Text style={[
                                        styles.dueText,
                                        { color: isLightMode ? '#16A34A' : '#34D399', fontWeight: '700' }
                                      ]}>
                                        Selesai
                                      </Text>
                                    </View>
                                  );
                                }

                                const deadlineInfo = parseDeadline(t.due_date);
                                if (!deadlineInfo) return null;

                                const isOverdue = deadlineInfo.badgeType === 'overdue';
                                const isToday = deadlineInfo.badgeType === 'today';
                                const isTomorrow = deadlineInfo.badgeType === 'tomorrow';

                                return (
                                  <View style={[
                                    styles.dueBadge,
                                    { backgroundColor: theme.cardInner },
                                    isOverdue && {
                                      backgroundColor: isLightMode ? '#FEE2E2' : '#2B1417',
                                      borderColor: isLightMode ? '#FECACA' : '#451A20',
                                      borderWidth: 1,
                                    },
                                    isToday && {
                                      backgroundColor: isLightMode ? '#FEF3C7' : '#2E2008',
                                      borderColor: isLightMode ? '#FDE68A' : '#78350F',
                                      borderWidth: 1,
                                    },
                                    isTomorrow && {
                                      backgroundColor: isLightMode ? '#E0F2FE' : '#0C2A44',
                                      borderColor: isLightMode ? '#BAE6FD' : '#164E63',
                                      borderWidth: 1,
                                    },
                                  ]}>
                                    <Ionicons
                                      name={isOverdue ? 'alert-circle' : isToday ? 'flash' : 'calendar-outline'}
                                      size={11}
                                      color={
                                        isOverdue ? (isLightMode ? '#DC2626' : '#EF4444') :
                                        isToday ? (isLightMode ? '#D97706' : '#FBBF24') :
                                        isTomorrow ? (isLightMode ? '#0284C7' : '#38BDF8') : theme.subtext
                                      }
                                    />
                                    <Text style={[
                                      styles.dueText,
                                      { color: theme.subtext },
                                      isOverdue && { color: isLightMode ? '#DC2626' : '#EF4444', fontWeight: '700' },
                                      isToday && { color: isLightMode ? '#D97706' : '#FBBF24', fontWeight: '700' },
                                      isTomorrow && { color: isLightMode ? '#0284C7' : '#38BDF8', fontWeight: '600' },
                                    ]}>
                                      {deadlineInfo.badgeLabel}
                                    </Text>
                                  </View>
                                );
                              })()}
                            </View>

                            <Text style={[styles.taskTitle, { color: theme.text }, t.is_completed && [styles.taskTitleDone, { color: theme.muted }]]}>
                              {t.title}
                            </Text>

                            {/* Subtasks Mini Progress Bar */}
                            {hasSubtasks && (
                              <View style={styles.subtasksProgressWrap}>
                                <View style={[styles.subtasksProgressBarBg, { backgroundColor: theme.cardInner }]}>
                                  <View style={[styles.subtasksProgressBarFill, { width: `${subtaskPercent}%`, backgroundColor: subtaskPercent === 100 ? '#10B981' : theme.accent }]} />
                                </View>
                                <Text style={[styles.subtasksProgressText, { color: theme.subtext }]}>
                                  {completedSubtasksCount}/{subtasks.length} langkah ({subtaskPercent}%)
                                </Text>
                              </View>
                            )}

                            {/* Task Notes Snippet Box (If task has notes) */}
                            {t.notes ? (
                              <TouchableOpacity
                                style={[styles.taskNotesSnippetBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                                onPress={() => setActiveWorkpadTask(t)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.taskNotesSnippetHeader}>
                                  <Ionicons name="document-text" size={11} color={theme.accentLight} />
                                  <Text style={[styles.taskNotesSnippetHeaderTitle, { color: theme.accentLight }]}>
                                    Lembar Kerja Tugas
                                  </Text>
                                  <Text style={[styles.taskNotesSnippetWordCount, { color: theme.muted }]}>
                                    {t.notes.trim().split(/\s+/).length} kata • Buka ↗
                                  </Text>
                                </View>
                                <Text style={[styles.taskNotesSnippetText, { color: theme.subtext }]} numberOfLines={2}>
                                  {t.notes}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        {/* Task Action Buttons Toolbar */}
                        <View style={[styles.taskActionToolbar, { borderTopColor: theme.cardInner }]}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.taskActionScrollContent}
                          >
                            {/* Workpad / Task Notes Action Button */}
                            <TouchableOpacity
                              style={[
                                styles.taskActionBtn,
                                { backgroundColor: t.notes ? theme.accentBg : theme.cardInner, borderColor: t.notes ? theme.accent : theme.border }
                              ]}
                              onPress={() => setActiveWorkpadTask(t)}
                            >
                              <Ionicons name="document-text-outline" size={12} color={t.notes ? theme.accentLight : theme.subtext} />
                              <Text style={[styles.taskActionBtnText, { color: t.notes ? theme.accentLight : theme.subtext }]}>
                                {t.notes ? 'Lembar Kerja ✍️' : 'Tulis Tugas'}
                              </Text>
                            </TouchableOpacity>

                            {/* AI Breakdown Action Button */}
                            <TouchableOpacity
                              style={[styles.taskActionBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                              onPress={() => handleAiBreakdown(t)}
                              disabled={isBreakingDown}
                            >
                              {isBreakingDown ? (
                                <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                              ) : (
                                <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                              )}
                              <Text style={[styles.taskActionBtnText, { color: theme.accentLight }]}>
                                {hasSubtasks ? 'Pecah Ulang AI' : 'Pecah Tugas (AI)'}
                              </Text>
                            </TouchableOpacity>

                            {/* Subtasks Toggle Accordion */}
                            <TouchableOpacity
                              style={[
                                styles.taskActionBtn,
                                { backgroundColor: theme.cardInner, borderColor: theme.border },
                                isExpanded && { backgroundColor: theme.accentBg, borderColor: theme.accent }
                              ]}
                              onPress={() => toggleExpandTask(t.id)}
                            >
                              <Ionicons name="list-outline" size={12} color={isExpanded ? theme.accentLight : theme.subtext} />
                              <Text style={[styles.taskActionBtnText, { color: isExpanded ? theme.accentLight : theme.subtext }]}>
                                Langkah ({subtasks.length})
                              </Text>
                              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={11} color={isExpanded ? theme.accentLight : theme.subtext} />
                            </TouchableOpacity>

                            {/* Focus with Pomodoro */}
                            <TouchableOpacity
                              style={[styles.taskActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                              onPress={() => handleFocusTaskWithPomodoro(t)}
                            >
                              <Ionicons name="timer-outline" size={12} color="#F59E0B" />
                              <Text style={[styles.taskActionBtnText, { color: theme.subtext }]}>Fokus Nugas</Text>
                            </TouchableOpacity>

                            {/* Print / Export Task to PDF */}
                            <TouchableOpacity
                              style={[styles.taskActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                              onPress={() => handleExportTaskPdf(t)}
                            >
                              <Ionicons name="print-outline" size={12} color={theme.accentLight} />
                              <Text style={[styles.taskActionBtnText, { color: theme.accentLight }]}>Cetak PDF</Text>
                            </TouchableOpacity>

                            {/* Discuss with AI Chat */}
                            <TouchableOpacity
                              style={[styles.taskActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                              onPress={() => handleDiscussTaskWithAi(t)}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={12} color={theme.subtext} />
                              <Text style={[styles.taskActionBtnText, { color: theme.subtext }]}>Bahas AI</Text>
                            </TouchableOpacity>
                          </ScrollView>
                        </View>

                        {/* Expanded Subtasks Checklist Section */}
                        {isExpanded && (
                          <View style={[styles.expandedSubtasksBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                            <Text style={[styles.subtaskSectionTitle, { color: theme.text }]}>
                              📌 Rincian Langkah Pengerjaan:
                            </Text>

                            {subtasks.length === 0 ? (
                              <Text style={[styles.subtaskEmptyText, { color: theme.subtext }]}>
                                Belum ada langkah. Klik "Pecah Tugas (AI)" di atas atau tambahkan langkah manual di bawah.
                              </Text>
                            ) : (
                              <View style={styles.subtasksList}>
                                {subtasks.map((st, sIdx) => (
                                  <View key={st.id || sIdx} style={[styles.subtaskItemRow, { borderBottomColor: theme.card }]}>
                                    <TouchableOpacity
                                      onPress={() => handleToggleSubtask(t.id, st.id)}
                                      style={styles.subtaskCheckbox}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                      <View style={[
                                        styles.subtaskSquare,
                                        { borderColor: theme.border },
                                        st.is_completed && [styles.subtaskSquareActive, { backgroundColor: theme.accent, borderColor: theme.accent }]
                                      ]}>
                                        {st.is_completed && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
                                      </View>
                                    </TouchableOpacity>

                                    <Text
                                      style={[
                                        styles.subtaskTitleText,
                                        { color: theme.text },
                                        st.is_completed && [styles.subtaskTitleDone, { color: theme.muted }]
                                      ]}
                                    >
                                      {st.title}
                                    </Text>

                                    <TouchableOpacity
                                      onPress={() => handleDeleteSubtask(t.id, st.id)}
                                      style={styles.subtaskDeleteBtn}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                      <Ionicons name="close" size={13} color={theme.muted} />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </View>
                            )}

                            {/* Add Manual Subtask Input Form */}
                            <View style={styles.addSubtaskRow}>
                              <TextInput
                                style={[styles.addSubtaskInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                                placeholder="Tambah langkah manual..."
                                placeholderTextColor={theme.muted}
                                value={newSubtaskInputs[t.id] || ''}
                                onChangeText={(val) => setNewSubtaskInputs(prev => ({ ...prev, [t.id]: val }))}
                                onSubmitEditing={() => handleAddManualSubtask(t.id)}
                              />
                              <TouchableOpacity
                                style={[styles.addSubtaskBtn, { backgroundColor: theme.primary }]}
                                onPress={() => handleAddManualSubtask(t.id)}
                              >
                                <Ionicons name="add" size={14} color="#FFFFFF" />
                                <Text style={styles.addSubtaskBtnText}>Tambah</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                      </View>
                    );
                  })}

                  {hasMoreTasks ? (
                    <TouchableOpacity
                      style={[styles.loadMoreTasksBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={handleLoadMoreTasks}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-down-circle-outline" size={15} color={theme.accentLight} />
                      <Text style={[styles.loadMoreTasksBtnText, { color: theme.accentLight }]}>
                        Tampilkan Tugas Lainnya ({filteredTasks.length - visibleTasksLimit} tersisa)
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: POMODORO FOCUS TIMER (CENTERED CONTAINER) */}
      {/* ========================================================================= */}
      {activeTab === 'pomodoro' && (
        <ScrollView contentContainerStyle={styles.pomodoroContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.pomodoroCenterBox}>

            {/* Active Focus Target Banner (If Selected from Tasks) */}
            {activePomodoroTask ? (
              <View style={[styles.pomoTargetCard, { backgroundColor: theme.card, borderColor: theme.accent }]}>
                <View style={styles.pomoTargetHeader}>
                  <View style={[styles.pomoTargetTag, { backgroundColor: theme.accentBg }]}>
                    <Ionicons name="radio-button-on" size={12} color={theme.accentLight} />
                    <Text style={[styles.pomoTargetTagText, { color: theme.accentLight }]}>TARGET FOKUS AKTIF</Text>
                  </View>
                  <TouchableOpacity onPress={() => setActivePomodoroTask(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={16} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.pomoTargetTitle, { color: theme.text }]}>
                  {activePomodoroTask.title}
                </Text>
                <Text style={[styles.pomoTargetSub, { color: theme.subtext }]}>
                  Mata Kuliah: {activePomodoroTask.subject} {activePomodoroTask.due_date ? `• Deadline: ${activePomodoroTask.due_date}` : ''}
                </Text>

                <View style={styles.pomoTargetActions}>
                  <TouchableOpacity
                    style={[styles.pomoDoneBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => {
                      toggleTask(activePomodoroTask);
                      showAlert('Hebat! 🎉', `Tugas "${activePomodoroTask.title}" telah ditandai selesai!`);
                    }}
                  >
                    <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                    <Text style={styles.pomoDoneBtnText}>Tandai Tugas Selesai</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.pomoChangeTargetBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={() => setActiveTab('tasks')}
                  >
                    <Text style={[styles.pomoChangeTargetText, { color: theme.subtext }]}>Ganti Tugas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.pomoPickTargetCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setActiveTab('tasks')}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.accentLight} />
                <Text style={[styles.pomoPickTargetText, { color: theme.accentLight }]}>
                  Pilih tugas kuliah untuk difokuskan di Pomodoro ini
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.pomoHeader, { color: theme.text }]}>Studio Fokus Belajar</Text>
            <Text style={[styles.pomoSub, { color: theme.subtext }]}>Tingkatkan konsentrasi belajar dengan teknik Pomodoro teruji.</Text>

            {/* Virtual Garden Plant Banner Link */}
            <TouchableOpacity
              style={[styles.pomoGardenPillBanner, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setShowGardenModal(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.pomoGardenIconBox, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="leaf-outline" size={15} color={theme.accentLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pomoGardenTitle, { color: theme.text }]}>Taman Fokus Mahasiswa</Text>
                <Text style={[styles.pomoGardenSub, { color: theme.subtext }]}>Selesaikan sesi untuk menyiram & menumbuhkan pohonmu</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={theme.subtext} />
            </TouchableOpacity>

            {/* Duration Selector */}
            <View style={styles.pomoPresetsRow}>
              {POMODORO_DURATIONS.map(d => (
                <TouchableOpacity
                  key={d.value}
                  style={[
                    styles.pomoPresetChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    pomoTotalTime === d.value && [styles.pomoPresetActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setPomoDuration(d.value)}
                >
                  <Text style={[styles.pomoPresetText, { color: theme.subtext }, pomoTotalTime === d.value && [styles.pomoPresetTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Big Timer Circle Display */}
            <View style={[styles.pomoClockCircle, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.pomoTimerText, { color: theme.text }]}>{formatPomoTime(pomoTimeLeft)}</Text>
              <Text style={[styles.pomoStatusText, { color: theme.subtext }]}>
                {pomoActive ? (activePomodoroTask ? `Fokus: ${activePomodoroTask.title}` : 'Sedang Fokus Belajar...') : 'Siap Mulai'}
              </Text>
            </View>

            {/* Controller Buttons */}
            <View style={styles.pomoControlsRow}>
              <TouchableOpacity style={[styles.pomoResetBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={resetPomodoro}>
                <Ionicons name="refresh" size={16} color={theme.subtext} />
                <Text style={[styles.pomoResetText, { color: theme.subtext }]}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pomoPlayBtn, { backgroundColor: theme.primary }, pomoActive && styles.pomoPlayBtnPause]}
                onPress={togglePomodoro}
              >
                <Ionicons name={pomoActive ? 'pause' : 'play'} size={18} color="#FFFFFF" />
                <Text style={styles.pomoPlayText}>{pomoActive ? 'Jeda' : 'Mulai Fokus'}</Text>
              </TouchableOpacity>
            </View>

            {/* Focus Mindful Tip */}
            <View style={[styles.pomoTipCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={[styles.pomoTipText, { color: theme.subtext }]}>
                “Fokus pada satu langkah kecil di depanmu. Setiap langkah membawamu lebih dekat pada keberhasilan.”
              </Text>
            </View>

          </View>
        </ScrollView>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <Modal
          visible={!!editingTask}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingTask(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.editTaskModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Tugas Kuliah</Text>
                <TouchableOpacity onPress={() => setEditingTask(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={theme.subtext} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Nama Tugas:</Text>
              <TextInput
                style={[styles.taskInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Nama tugas..."
                placeholderTextColor={theme.muted}
              />

              <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Pilih Mata Kuliah:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.subjectRow, { marginBottom: 10 }]}>
                {subjects.map(s => {
                  const isSel = editSubject.toLowerCase() === s.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.subjectChip,
                        { backgroundColor: theme.cardInner, borderColor: theme.border },
                        isSel && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                      ]}
                      onPress={() => setEditSubject(s.name)}
                    >
                      <Text style={[styles.subjectChipText, { color: theme.subtext }, isSel && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tenggat / Deadline:</Text>
              <DeadlineSelector
                value={editDueDate}
                onChange={setEditDueDate}
                onOpenCalendar={() => {
                  setDatePickerTarget('edit');
                  setShowDatePickerModal(true);
                }}
                theme={theme}
                isLightMode={isLightMode}
              />

              <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tingkat Prioritas:</Text>
              <View style={styles.priorityRow}>
                {(['high', 'medium', 'low'] as const).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityChip,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                      editPriority === p && [styles.priorityChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setEditPriority(p)}
                  >
                    <Text style={[styles.priorityText, { color: theme.subtext }, editPriority === p && [styles.priorityTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                      {p === 'high' ? '🔥 Mendesak' : p === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Catatan / Lembar Tugas:</Text>
              <TextInput
                style={[styles.taskNotesFormInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                placeholder="Tulis catatan, instruksi, atau draft tugas..."
                placeholderTextColor={theme.muted}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                numberOfLines={4}
              />

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={() => setEditingTask(null)}
                >
                  <Text style={[styles.modalCancelBtnText, { color: theme.subtext }]}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveEditTask}
                >
                  <Text style={[styles.modalSaveBtnText, { color: primaryBtnTextColor }]}>Simpan Perubahan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Subject Manager Modal */}
      <SubjectManagerModal
        visible={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSelectSubject={(name) => setSelectedSubject(name)}
      />

      {/* Interactive Calendar & Time Picker Modal */}
      <DateTimePickerModal
        visible={showDatePickerModal}
        onClose={() => setShowDatePickerModal(false)}
        value={datePickerTarget === 'create' ? newTaskDueDate : editDueDate}
        onSelect={(val) => {
          if (datePickerTarget === 'create') {
            setNewTaskDueDate(val);
          } else {
            setEditDueDate(val);
          }
        }}
      />

      {/* Task Workpad & Notes Modal */}
      <TaskWorkpadModal
        visible={!!activeWorkpadTask}
        task={activeWorkpadTask}
        onClose={() => setActiveWorkpadTask(null)}
        onSaveNotes={handleSaveTaskNotes}
      />

      {/* Grand Boss Raid Battle Modal */}
      <QuizBattleModal
        visible={showBossBattleModal}
        onClose={() => setShowBossBattleModal(false)}
        noteTitle={activeBossEvent?.name || 'Sphinx Pengetahuan'}
        subject={activeBossEvent?.title || 'Boss Event Mingguan'}
        quizQuestions={bossQuizQuestions}
        onBattleWon={handleBossBattleWon}
      />

      {/* Loading Boss Raid Quiz Modal */}
      <Modal visible={loadingBossBattle} transparent animationType="fade">
        <View style={styles.bossLoadingOverlay}>
          <View style={[styles.bossLoadingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.bossLoadingIconCircle, { backgroundColor: (activeBossEvent?.color || '#DC2626') + '25' }]}>
              <Text style={{ fontSize: 32 }}>{activeBossEvent?.emoji || '⚔️'}</Text>
            </View>
            <Text style={[styles.bossLoadingTitle, { color: theme.text }]}>
              Mempersiapkan Arena Boss!
            </Text>
            <Text style={[styles.bossLoadingSub, { color: theme.subtext }]}>
              AI sedang meramu soal pertarungan dari seluruh catatan kuliahmu untuk menantang {activeBossEvent?.name || 'Boss Event'}...
            </Text>
            <ActivityIndicator size="large" color={activeBossEvent?.color || theme.accentLight} style={{ marginTop: 6 }} />
          </View>
        </View>
      </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  innerContainer: {
    flex: 1,
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1440,
    alignSelf: 'center',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  topActionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanQuickTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
  },
  scanQuickTopText: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerNotifBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  headerNotifBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 3,
    marginHorizontal: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#202634',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 9,
    gap: 2,
  },
  tabBtnActive: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 10.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsArea: {
    paddingHorizontal: 18,
    marginBottom: 14,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  clearSearchBtn: {
    padding: 2,
  },
  searchFeedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#101726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1D2A42',
  },
  searchFeedbackText: {
    color: '#93C5FD',
    fontSize: 11.5,
    fontWeight: '500',
  },
  resetSearchText: {
    color: '#60A5FA',
    fontSize: 11.5,
    fontWeight: '600',
  },
  subjectRow: {
    gap: 6,
    paddingVertical: 2,
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
  manageSubjFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16233B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  manageSubjFilterText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  addNewSubjChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  notesList: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 10,
  },
  draftCard: {
    backgroundColor: '#1C1608',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#B45309',
    marginBottom: 12,
  },
  draftCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#382806',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#78350F',
  },
  draftBadgeText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  draftDeleteBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#2D1418',
  },
  draftTitle: {
    color: '#FEF3C7',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  draftSnippet: {
    color: '#D1D5DB',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  draftFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C220E',
  },
  draftMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  draftSubjectText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '600',
  },
  draftTimeText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  draftContinueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  draftContinueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  noteCard: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
  },
  noteCardWide: {
    minHeight: 140,
  },
  noteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectBadge: {
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subjectBadgeText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  noteDate: {
    color: '#6B7280',
    fontSize: 11,
  },
  noteTitle: {
    color: '#F3F4F6',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  noteSnippet: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  noteAiFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  noteReadTime: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1726',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  aiBadgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '500',
  },
  openDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#253856',
  },
  openDetailText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollArea: {
    paddingHorizontal: 18,
  },
  taskLayout: {
    gap: 14,
  },
  taskLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  taskFormColumn: {
    width: '100%',
  },
  taskFormColumnWide: {
    flex: 1,
    minWidth: 300,
  },
  taskListColumn: {
    width: '100%',
  },
  taskListColumnWide: {
    flex: 1.4,
    minWidth: 340,
  },
  taskFormCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 12,
  },
  taskFormTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  taskInput: {
    backgroundColor: '#0E1117',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F4F6',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#222836',
    marginBottom: 10,
  },
  formMiniLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    marginTop: 2,
  },
  priorityChip: {
    flex: 1,
    backgroundColor: '#0E1117',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222836',
  },
  priorityChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  priorityText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  priorityTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  taskNotesFormInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
    minHeight: 60,
  },
  saveTaskBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveTaskBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  taskTopFilterBar: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
  },
  taskSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
  },
  taskSearchInput: {
    flex: 1,
    fontSize: 12.5,
  },
  taskSubjectFilterScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  subjectFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#202634',
  },
  subjectFilterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  subjectFilterText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  subjectFilterTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  deadlineSelectorBox: {
    marginBottom: 12,
    gap: 8,
  },
  deadlinePresetRow: {
    gap: 6,
    paddingVertical: 2,
  },
  deadlinePresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  deadlinePresetChipActive: {
    borderWidth: 1,
  },
  deadlinePresetText: {
    fontSize: 11,
    fontWeight: '500',
  },
  deadlinePresetTextActive: {
    fontWeight: '700',
  },
  deadlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  deadlineSelectedMainText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deadlineSelectedSubText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  deadlinePlaceholderText: {
    fontSize: 12,
    fontWeight: '500',
  },
  deadlinePickerActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickCalendarMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pickCalendarMiniBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  taskFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#202634',
  },
  taskFilterActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  taskFilterText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  taskFilterTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  taskListContainer: {
    gap: 10,
  },
  taskCard: {
    position: 'relative',
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
  },
  taskCardCornerActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 3,
  },
  taskCornerIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCardDone: {
    opacity: 0.6,
  },
  loadMoreTasksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 16,
  },
  loadMoreTasksBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  taskMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  taskCheckbox: {
    paddingTop: 2,
  },
  taskCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#263042',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCircleActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  taskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  taskSubjectBadge: {
    backgroundColor: '#1C2230',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  taskSubjectText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  taskPriorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  taskPriorityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141822',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dueText: {
    color: '#6B7280',
    fontSize: 11,
  },
  taskTitle: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  subtasksProgressWrap: {
    marginTop: 6,
    gap: 4,
  },
  subtasksProgressBarBg: {
    height: 4,
    backgroundColor: '#1E2430',
    borderRadius: 2,
    overflow: 'hidden',
  },
  subtasksProgressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  subtasksProgressText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  taskNotesSnippetBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  taskNotesSnippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  taskNotesSnippetHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskNotesSnippetWordCount: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  taskNotesSnippetText: {
    fontSize: 11,
    lineHeight: 16,
  },
  taskActionToolbar: {
    paddingTop: 8,
    borderTopWidth: 1,
  },
  taskActionScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
  },
  taskActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  taskActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  taskIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedSubtasksBox: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  subtaskSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  subtaskEmptyText: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  subtasksList: {
    gap: 6,
  },
  subtaskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  subtaskCheckbox: {
    padding: 2,
  },
  subtaskSquare: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#3B475D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtaskSquareActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  subtaskTitleText: {
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  subtaskTitleDone: {
    textDecorationLine: 'line-through',
  },
  subtaskDeleteBtn: {
    padding: 2,
  },
  addSubtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  addSubtaskInput: {
    flex: 1,
    fontSize: 11.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  addSubtaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addSubtaskBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  /* Pomodoro Active Target */
  pomoTargetCard: {
    width: '100%',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 6,
  },
  pomoTargetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pomoTargetTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pomoTargetTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pomoTargetTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  pomoTargetSub: {
    fontSize: 11,
  },
  pomoTargetActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  pomoDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pomoDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pomoChangeTargetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  pomoChangeTargetText: {
    fontSize: 11,
    fontWeight: '500',
  },
  pomoPickTargetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  pomoPickTargetText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  pomoGardenPillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
  },
  pomoGardenIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pomoGardenTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pomoGardenSub: {
    fontSize: 10.5,
    marginTop: 1,
  },

  /* Edit Task Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editTaskModalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 4,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  emptyTaskWrap: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253856',
  },
  emptyAddText: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
  },
  pomodoroContainer: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  pomodoroCenterBox: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  pomoHeader: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  pomoSub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  pomoPresetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  pomoPresetChip: {
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  pomoPresetActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  pomoPresetText: {
    color: '#6B7280',
    fontSize: 11,
  },
  pomoPresetTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  pomoClockCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#141822',
    borderWidth: 3,
    borderColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  pomoTimerText: {
    color: '#F3F4F6',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pomoStatusText: {
    color: '#60A5FA',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 4,
  },
  pomoControlsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  pomoResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#181E29',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  pomoResetText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '500',
  },
  pomoPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pomoPlayBtnPause: {
    backgroundColor: '#DC2626',
  },
  pomoPlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pomoTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141822',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
    width: '100%',
  },
  pomoTipText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    lineHeight: 17,
    flex: 1,
  },
  aiImportActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  aiImportBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  aiImportBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  aiImportBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  aiImportBtnSmallText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  aiExtractingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  aiExtractingBannerText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
  notesBossRaidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
    marginBottom: 10,
  },
  notesBossRaidIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBossRaidTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  notesBossRaidBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  notesBossRaidBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  notesBossRaidSub: {
    fontSize: 11,
    marginTop: 2,
  },
  notesBossRaidPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  notesBossRaidPlayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  bossLoadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bossLoadingCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    gap: 12,
  },
  bossLoadingIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  bossLoadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  bossLoadingSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
