import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Animated, Easing, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme, getSemanticColors } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
import { JournalEntry, StudyNote, StudentTask, MoodOption } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert } from '../lib/alert';
import { calculateRealStreak } from '../lib/streakCalculator';
import { parseDeadline } from '../lib/dateUtils';
import {
  isDeviceOnline,
  subscribeNetworkStatus,
  getCachedDashboard,
  cacheDashboardLocally,
  processOfflineSyncQueue,
  queueOfflineAction,
} from '../lib/offlineSync';
import { scheduleDailyRoutineReminders } from '../lib/notifications';
import { DashboardSkeleton } from '../components/DashboardSkeleton';

const DEFAULT_DAILY_QUESTS = [
  { id: '1', title: 'Curhat atau refleksi sejenak ke AI', completed: false, icon: 'chatbubble-ellipses-outline' },
  { id: '2', title: 'Minum 2 gelas air putih saat belajar', completed: false, icon: 'water-outline' },
  { id: '3', title: 'Latihan pernapasan relaksasi 1 menit', completed: false, icon: 'leaf-outline' },
  { id: '4', title: 'Tulis 1 hal bermakna yang disyukuri', completed: false, icon: 'heart-outline' },
];

const WISDOM_PRESETS = [
  'Kamu tidak harus mengendalikan semua pikiranmu. Cukup jangan biarkan pikiran itu mengendalikan dirimu.',
  'Setiap hari mungkin tidak sempurna, tetapi selalu ada kemajuan kecil di setiap langkah belajarmu.',
  'Tarik napas dalam-dalam. Hal-hal besar dan pemahaman mendalam membutuhkan waktu untuk tumbuh.',
  'Perasaan lelahmu valid. Beri dirimu izin untuk beristirahat sejenak tanpa rasa bersalah.',
];

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getQuestStorageKey = (userId?: string, dateStr?: string) =>
  `@daily_quests_${userId || 'guest'}_${dateStr || getTodayDateString()}`;

// Map mood types to clean vector icons
const getMoodIconName = (type: string): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'happy': return 'happy-outline';
    case 'excited': return 'sparkles-outline';
    case 'neutral': return 'ellipse-outline';
    case 'tired': return 'bed-outline';
    case 'anxious': return 'alert-circle-outline';
    case 'sad': return 'rainy-outline';
    case 'angry': return 'flame-outline';
    default: return 'heart-outline';
  }
};

export default function HomeScreen() {
  const { user } = useAuth();
  const { moods, globalAnnouncement, aiBotName } = useMoods();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;
  const sem = getSemanticColors(isLightMode);

  const [username, setUsername] = useState('');
  const [todayMood, setTodayMood] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<StudentTask[]>([]);
  const [recentStudyNotes, setRecentStudyNotes] = useState<StudyNote[]>([]);
  const [activeDraft, setActiveDraft] = useState<any>(null);
  const [totalNotesCount, setTotalNotesCount] = useState(0);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // Tab Filter Switcher for Mobile (Akademik vs Kesejahteraan)
  const [activeTab, setActiveTab] = useState<'academic' | 'wellness'>('academic');

  // Daily AI Wisdom State
  const [wisdom, setWisdom] = useState(WISDOM_PRESETS[0]);
  const [loadingWisdom, setLoadingWisdom] = useState(false);

  // Daily Quests State (Persistent per-date)
  const [quests, setQuests] = useState(DEFAULT_DAILY_QUESTS);

  // Quick Gratitude Note State
  const [gratitudeText, setGratitudeText] = useState('');
  const [savingGratitude, setSavingGratitude] = useState(false);

  // Breathwork State
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Tarik Napas' | 'Tahan' | 'Hembuskan'>('Tarik Napas');
  const [breathSeconds, setBreathSeconds] = useState(4);
  const breathAnim = useRef(new Animated.Value(1)).current;
  const breathInterval = useRef<any>(null);

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';

  // Load and refresh Daily Quests
  const loadDailyQuests = useCallback(async (hasChatToday = false, hasJournalToday = false) => {
    const today = getTodayDateString();
    const storageKey = getQuestStorageKey(user?.id, today);

    let currentQuests = DEFAULT_DAILY_QUESTS.map(q => ({
      ...q,
      title: q.id === '1' ? `Curhat atau refleksi sejenak ke ${aiBotName || 'Ara'}` : q.title,
    }));

    try {
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            currentQuests = currentQuests.map(def => {
              const found = parsed.find((p: any) => p.id === def.id);
              return found ? { ...def, completed: !!found.completed } : def;
            });
          }
        } catch (e) { }
      } else if (user?.user_metadata?.[`quests_${today}`]) {
        const cloudQuests = user.user_metadata[`quests_${today}`];
        if (Array.isArray(cloudQuests)) {
          currentQuests = currentQuests.map(def => {
            const found = cloudQuests.find((p: any) => p.id === def.id);
            return found ? { ...def, completed: !!found.completed } : def;
          });
        }
      }

      if (hasChatToday) {
        currentQuests = currentQuests.map(q => q.id === '1' ? { ...q, completed: true } : q);
      }
      if (hasJournalToday) {
        currentQuests = currentQuests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      }

      setQuests(currentQuests);
      await AsyncStorage.setItem(storageKey, JSON.stringify(currentQuests));
    } catch (e) {
      console.log('Error loading daily quests:', e);
    }
  }, [user, aiBotName]);

  const saveDailyQuests = async (updated: typeof DEFAULT_DAILY_QUESTS) => {
    const today = getTodayDateString();
    const storageKey = getQuestStorageKey(user?.id, today);
    setQuests(updated);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      if (user) {
        await supabase.auth.updateUser({
          data: { [`quests_${today}`]: updated },
        });
      }
    } catch (e) { }
  };

  const fetchData = useCallback(async () => {
    if (!user) {
      setUsername('Mahasiswa');
      loadDailyQuests();
      setLoading(false);
      return;
    }

    // 1. Instant load from local cache
    try {
      const cached = await getCachedDashboard(user.id);
      if (cached) {
        if (cached.username) setUsername(cached.username);
        if (typeof cached.streak === 'number') setStreak(cached.streak);
        if (cached.todayMood !== undefined) setTodayMood(cached.todayMood);
        if (cached.recentEntries) setRecentEntries(cached.recentEntries);
        if (cached.upcomingTasks) setUpcomingTasks(cached.upcomingTasks);
        if (cached.recentStudyNotes) setRecentStudyNotes(cached.recentStudyNotes);
        if (typeof cached.pendingTasksCount === 'number') setPendingTasksCount(cached.pendingTasksCount);
        if (typeof cached.totalNotesCount === 'number') setTotalNotesCount(cached.totalNotesCount);
        setLoading(false);
      }
    } catch (e) { }

    // 2. Fetch fresh data from Supabase
    try {
      const [profileRes, recentRes, journalDatesRes, chatDatesRes, tasksRes, notesRes, allTasksCountRes, allNotesCountRes] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).single(),
        supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('journal_entries').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('chat_messages').select('created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(100),
        supabase.from('student_tasks').select('*').eq('user_id', user.id).eq('is_completed', false).order('created_at', { ascending: false }).limit(6),
        supabase.from('study_notes').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(4),
        supabase.from('student_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_completed', false),
        supabase.from('study_notes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      const fetchedUsername = profileRes.data?.username || user.email?.split('@')[0] || 'Mahasiswa';
      setUsername(fetchedUsername);

      let hasTodayJournal = false;
      let hasTodayChat = false;
      let calculatedTodayMood: string | null = null;
      let fetchedEntries: JournalEntry[] = [];
      let fetchedTasks: StudentTask[] = [];
      let fetchedNotes: StudyNote[] = [];
      let fetchedPendingCount = 0;
      let fetchedTotalNotes = 0;

      if (recentRes.data) {
        fetchedEntries = recentRes.data as JournalEntry[];
        setRecentEntries(fetchedEntries);
        const todayStr = new Date().toDateString();
        const todayEntry = fetchedEntries.find(e => new Date(e.created_at).toDateString() === todayStr);
        calculatedTodayMood = todayEntry ? todayEntry.mood : null;
        setTodayMood(calculatedTodayMood);
        hasTodayJournal = !!todayEntry;
      }

      if (chatDatesRes.data) {
        const todayStr = new Date().toDateString();
        hasTodayChat = chatDatesRes.data.some(c => new Date(c.created_at).toDateString() === todayStr);
      }

      if (tasksRes.data) {
        fetchedTasks = tasksRes.data as StudentTask[];
        setUpcomingTasks(fetchedTasks);
      }

      if (notesRes.data) {
        fetchedNotes = notesRes.data as StudyNote[];
        setRecentStudyNotes(fetchedNotes);
      }

      fetchedPendingCount = typeof allTasksCountRes.count === 'number' ? allTasksCountRes.count : (tasksRes.data?.length || 0);
      setPendingTasksCount(fetchedPendingCount);

      fetchedTotalNotes = typeof allNotesCountRes.count === 'number' ? allNotesCountRes.count : (notesRes.data?.length || 0);
      setTotalNotesCount(fetchedTotalNotes);

      // Real streak calculator
      const allTimestamps: string[] = [
        ...(journalDatesRes.data?.map(d => d.created_at) || []),
        ...(chatDatesRes.data?.map(d => d.created_at) || []),
        ...(notesRes.data?.map(d => d.created_at) || []),
        ...(tasksRes.data?.map(d => d.created_at) || []),
      ];
      const calculatedStreak = calculateRealStreak(allTimestamps);
      setStreak(calculatedStreak);

      cacheDashboardLocally(user.id, {
        username: fetchedUsername,
        streak: calculatedStreak,
        todayMood: calculatedTodayMood,
        recentEntries: fetchedEntries,
        upcomingTasks: fetchedTasks,
        recentStudyNotes: fetchedNotes,
        pendingTasksCount: fetchedPendingCount,
        totalNotesCount: fetchedTotalNotes,
      });

      // Check Active Draft
      try {
        const draftKey = `@study_note_draft_${user.id}`;
        const rawDraft = await AsyncStorage.getItem(draftKey);
        if (rawDraft) {
          const parsed = JSON.parse(rawDraft);
          if (parsed && (parsed.title?.trim() || parsed.content?.trim())) {
            setActiveDraft(parsed);
          } else {
            setActiveDraft(null);
          }
        } else {
          setActiveDraft(null);
        }
      } catch (e) {
        setActiveDraft(null);
      }

      loadDailyQuests(hasTodayChat, hasTodayJournal);
    } catch (err) {
      console.log('Error fetching home dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, loadDailyQuests]);

  useEffect(() => {
    fetchData();
    scheduleDailyRoutineReminders();

    const unsubscribeNetwork = subscribeNetworkStatus(async (online) => {
      setIsOnline(online);
      if (online && user) {
        const { syncedCount } = await processOfflineSyncQueue(user.id);
        if (syncedCount > 0) {
          fetchData();
          showAlert('Sinkronisasi Sukses', `${syncedCount} aktivitas offline telah berhasil di-upload ke database!`);
        }
      }
    });

    if (!user) return () => unsubscribeNetwork();

    const channel = supabase
      .channel('home_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_tasks', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, () => fetchData())
      .subscribe();

    return () => {
      unsubscribeNetwork();
      supabase.removeChannel(channel);
    };
  }, [user, fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const toggleQuest = (id: string) => {
    const updated = quests.map(q => q.id === id ? { ...q, completed: !q.completed } : q);
    saveDailyQuests(updated);
  };

  const toggleTaskDirectly = async (taskId: string) => {
    setUpcomingTasks(prev => prev.filter(t => t.id !== taskId));
    setPendingTasksCount(prev => Math.max(0, prev - 1));
    showAlert('Tugas Selesai', 'Satu tugas kuliahmu berhasil diselesaikan.');
    try {
      await supabase.from('student_tasks').update({ is_completed: true }).eq('id', taskId);
    } catch (e) {
      console.log('Error updating task status:', e);
    }
  };

  const handleQuickSelectMood = (moodOption: MoodOption) => {
    setTodayMood(moodOption.type);
    navigation.navigate('JournalEntry', { initialMood: moodOption.type, mood: moodOption.type });
  };

  const refreshWisdomWithAI = async () => {
    setLoadingWisdom(true);
    try {
      const prompt = `Berikan 1 kalimat kutipan motivasi/mindfulness yang sangat menenangkan, mendalam, dan hangat dalam Bahasa Indonesia untuk mahasiswa yang sedang berjuang kuliah. Cukup 1-2 kalimat langsung tanpa basa-basi.`;
      const aiReply = await sendMessageToGemini([], prompt);
      setWisdom(aiReply.trim());
    } catch (e) {
      const randomIndex = Math.floor(Math.random() * WISDOM_PRESETS.length);
      setWisdom(WISDOM_PRESETS[randomIndex]);
    } finally {
      setLoadingWisdom(false);
    }
  };

  const handleSaveGratitude = async () => {
    if (!gratitudeText.trim()) return;
    setSavingGratitude(true);
    const content = gratitudeText.trim();
    const payload = {
      user_id: user?.id || 'anonymous',
      title: 'Refleksi Syukur Hari Ini',
      content,
      mood: 'happy',
      tags: ['syukur', 'mindfulness'],
    };

    const online = await isDeviceOnline();
    if (!online) {
      if (user) {
        queueOfflineAction({
          userId: user.id,
          type: 'CREATE_JOURNAL',
          payload,
        });
      }
      setGratitudeText('');
      setSavingGratitude(false);
      showAlert('Tersimpan Offline', 'Catatan rasa syukur disimpan di HP & otomatis di-sync saat online.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
      return;
    }

    try {
      if (user) {
        await supabase.from('journal_entries').insert(payload);
      }
      setGratitudeText('');
      showAlert('Tersimpan', 'Catatan rasa syukur berhasil disimpan ke Jurnal.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
    } catch (e: any) {
      if (user) {
        queueOfflineAction({
          userId: user.id,
          type: 'CREATE_JOURNAL',
          payload,
        });
      }
      setGratitudeText('');
      showAlert('Tersimpan Offline', 'Catatan rasa syukur disimpan di HP & otomatis di-sync saat online.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
    } finally {
      setSavingGratitude(false);
    }
  };

  const startBreathwork = () => {
    if (isBreathing) {
      if (breathInterval.current) {
        clearInterval(breathInterval.current);
        breathInterval.current = null;
      }
      setIsBreathing(false);
      Animated.timing(breathAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      return;
    }

    const updated = quests.map(q => q.id === '3' ? { ...q, completed: true } : q);
    saveDailyQuests(updated);

    setIsBreathing(true);

    const phases: Array<{ name: 'Tarik Napas' | 'Tahan' | 'Hembuskan'; duration: number }> = [
      { name: 'Tarik Napas', duration: 4 },
      { name: 'Tahan', duration: 4 },
      { name: 'Hembuskan', duration: 4 },
    ];

    let phaseIdx = 0;
    let seconds = 4;

    setBreathPhase(phases[0].name);
    setBreathSeconds(4);

    // Start Inhale animation (expand to 1.45 over 4s)
    Animated.timing(breathAnim, {
      toValue: 1.45,
      duration: 4000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();

    breathInterval.current = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        // Move to next breath phase
        phaseIdx = (phaseIdx + 1) % phases.length;
        const nextPhase = phases[phaseIdx];
        seconds = nextPhase.duration;

        setBreathPhase(nextPhase.name);
        setBreathSeconds(seconds);

        if (nextPhase.name === 'Tarik Napas') {
          Animated.timing(breathAnim, {
            toValue: 1.45,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }).start();
        } else if (nextPhase.name === 'Tahan') {
          Animated.timing(breathAnim, {
            toValue: 1.45,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else if (nextPhase.name === 'Hembuskan') {
          Animated.timing(breathAnim, {
            toValue: 1.0,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      } else {
        setBreathSeconds(seconds);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (breathInterval.current) clearInterval(breathInterval.current);
    };
  }, []);

  const completedQuestsCount = quests.filter(q => q.completed).length;
  const questPercentage = Math.round((completedQuestsCount / quests.length) * 100);
  const currentMoodOption = moods.find(m => m.type === todayMood);
  const isFirstTimeUser = totalNotesCount === 0 && pendingTasksCount === 0 && recentEntries.length === 0;

  if (loading) {
    return <DashboardSkeleton />;
  }

  // =========================================================================
  // SUB-COMPONENT: HERO CARD (FOKUS HARI INI & MOOD CHECK-IN)
  // =========================================================================
  const renderHeroFocusCard = () => {
    const nearestTask = upcomingTasks.find(t => t.due_date && !t.is_completed);
    const parsedDeadline = nearestTask?.due_date ? parseDeadline(nearestTask.due_date) : null;

    return (
      <View style={[styles.heroFocusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.heroTopRow}>
          <View style={[styles.heroBadge, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
            <Ionicons name="compass-outline" size={13} color={theme.accentLight} />
            <Text style={[styles.heroBadgeText, { color: theme.accentLight }]}>FOKUS HARI INI</Text>
          </View>
          <Text style={[styles.heroDateText, { color: theme.muted }]}>
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
          </Text>
        </View>

        <View style={styles.heroSummaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitleText, { color: theme.text }]}>
              {pendingTasksCount > 0
                ? `${pendingTasksCount} Tugas Menunggu Diselesaikan`
                : 'Semua Tugas Terkelola dengan Baik'}
            </Text>
            <Text style={[styles.heroSubText, { color: theme.subtext }]}>
              {upcomingTasks.length > 0 && nearestTask
                ? `Deadline terdekat: ${nearestTask.title} (${parsedDeadline ? `${parsedDeadline.formattedText}${parsedDeadline.badgeLabel ? ` • ${parsedDeadline.badgeLabel}` : ''}` : nearestTask.due_date})`
                : `${totalNotesCount} Catatan Tersimpan • Siap untuk sesi belajar hari ini.`}
            </Text>
          </View>
        </View>

        {/* Realtime Emoji Mood Selector from Admin Settings */}
        <View style={[styles.moodSectionWrap, { borderTopColor: theme.border }]}>
          <Text style={[styles.moodSectionPrompt, { color: theme.subtext }]}>
            {todayMood
              ? `${currentMoodOption?.emoji || '✨'} Suasana hati hari ini: ${currentMoodOption?.label || todayMood}`
              : 'Bagaimana kondisi energimu sekarang?'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodOptionsScrollRow}
          >
            {moods.map(m => {
              const isSelected = todayMood === m.type;
              return (
                <TouchableOpacity
                  key={m.type}
                  style={[
                    styles.moodPillBtn,
                    { backgroundColor: theme.cardInner, borderColor: isSelected ? theme.accent : theme.border },
                    isSelected && { backgroundColor: theme.accentBg, borderColor: theme.accentLight, borderWidth: 1.5 }
                  ]}
                  onPress={() => handleQuickSelectMood(m)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.moodEmojiText}>{m.emoji || '✨'}</Text>
                  <Text style={[
                    styles.moodPillLabel,
                    { color: isSelected ? theme.accentLight : theme.subtext },
                    isSelected && { fontWeight: '700' }
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SUB-COMPONENT: ACADEMIC & PRODUCTIVITY SECTION
  // =========================================================================
  const renderAcademicSection = () => (
    <View style={styles.sectionColumn}>

      {/* 1. Quick Hub Shortcut Bar */}
      <View style={styles.quickHubGrid}>
        <TouchableOpacity
          style={[styles.quickHubBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'notes' })}
          activeOpacity={0.7}
        >
          <View style={[styles.quickHubIconCircle, { backgroundColor: theme.accentBg }]}>
            <Ionicons name="document-text-outline" size={17} color={theme.accentLight} />
          </View>
          <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Catatan Kuliah</Text>
          <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>{totalNotesCount} Tersimpan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickHubBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'tasks' })}
          activeOpacity={0.7}
        >
          <View style={[styles.quickHubIconCircle, { backgroundColor: theme.accentBg }]}>
            <Ionicons name="checkbox-outline" size={17} color={theme.accentLight} />
          </View>
          <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Daftar Tugas</Text>
          <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>{pendingTasksCount} Menunggu</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickHubBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'pomodoro' })}
          activeOpacity={0.7}
        >
          <View style={[styles.quickHubIconCircle, { backgroundColor: theme.accentBg }]}>
            <Ionicons name="timer-outline" size={17} color={theme.accentLight} />
          </View>
          <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Fokus Pomodoro</Text>
          <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>25 Menit Sesi</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Upcoming Student Tasks */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="flag-outline" size={15} color={theme.accentLight} />
            <Text style={[styles.cardCategory, { color: theme.subtext }]}>TUGAS & DEADLINE MENDATANG</Text>
          </View>
          <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'tasks' })}>
            <Text style={[styles.cardActionLink, { color: theme.accentLight }]}>Kelola Semua →</Text>
          </TouchableOpacity>
        </View>

        {upcomingTasks.length === 0 ? (
          <View style={[styles.emptyInlineBox, { borderColor: theme.border }]}>
            <Ionicons name="checkmark-done-circle-outline" size={26} color={sem.success} />
            <Text style={[styles.emptyInlineTitle, { color: theme.text }]}>Semua tugas kuliah beres</Text>
            <Text style={[styles.emptyInlineSub, { color: theme.subtext }]}>Tidak ada deadline mendesak yang menunggu saat ini.</Text>
          </View>
        ) : (
          <View style={styles.tasksListWrap}>
            {upcomingTasks.map(task => {
              const isHigh = task.priority === 'high';
              const isLow = task.priority === 'low';
              return (
                <View
                  key={task.id}
                  style={[
                    styles.taskCardItem,
                    { backgroundColor: theme.cardInner, borderColor: theme.border },
                    task.is_completed && { opacity: 0.75 }
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.taskCheckCircle,
                      { borderColor: theme.border },
                      task.is_completed && { backgroundColor: theme.primary, borderColor: theme.primary }
                    ]}
                    onPress={() => toggleTaskDirectly(task.id)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Tandai tugas selesai"
                  >
                    <Ionicons name="checkmark" size={13} color={task.is_completed ? "#FFFFFF" : "transparent"} />
                  </TouchableOpacity>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[
                        styles.taskItemTitle,
                        { color: theme.text },
                        task.is_completed && { color: theme.muted, textDecorationLine: 'line-through' }
                      ]}
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>
                    <View style={styles.taskItemMetaRow}>
                      <Text style={[styles.taskSubjectBadge, { color: theme.accentLight, backgroundColor: theme.accentBg }]}>
                        {task.subject}
                      </Text>
                      {task.is_completed ? (
                        <Text style={[styles.taskDueDateBadge, { color: sem.success, fontWeight: '700' }]}>
                          ✓ Selesai
                        </Text>
                      ) : task.due_date ? (() => {
                        const parsed = parseDeadline(task.due_date);
                        return (
                          <Text style={[styles.taskDueDateBadge, { color: theme.subtext }]} numberOfLines={1}>
                            Jatuh tempo: {parsed ? `${parsed.formattedText}${parsed.badgeLabel ? ` (${parsed.badgeLabel})` : ''}` : task.due_date}
                          </Text>
                        );
                      })() : null}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.priorityBadge,
                      {
                        backgroundColor: isHigh ? sem.dangerBg : isLow ? sem.infoBg : sem.warningBg,
                        borderColor: isHigh ? sem.dangerBorder : isLow ? sem.infoBorder : sem.warningBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityBadgeText,
                        { color: isHigh ? sem.danger : isLow ? sem.info : sem.warning },
                      ]}
                    >
                      {isHigh ? 'Tinggi' : isLow ? 'Santai' : 'Sedang'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 3. Catatan Kuliah & Draf Aktif */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="book-outline" size={15} color={theme.accentLight} />
            <Text style={[styles.cardCategory, { color: theme.subtext }]}>CATATAN KULIAH TERKINI</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('StudyNoteDetail', {})}>
            <Text style={[styles.cardActionLink, { color: theme.accentLight }]}>+ Tulis Catatan</Text>
          </TouchableOpacity>
        </View>

        {/* Draft Note Banner if exists */}
        {activeDraft ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('StudyNoteDetail', {})}
            style={[styles.homeDraftCard, { backgroundColor: sem.warningBg, borderColor: sem.warningBorder }]}
            activeOpacity={0.8}
          >
            <View style={styles.homeDraftTop}>
              <View style={[styles.homeDraftBadge, { backgroundColor: sem.warningBorder }]}>
                <Ionicons name="create-outline" size={12} color={sem.warning} />
                <Text style={[styles.homeDraftBadgeText, { color: sem.warningStrong }]}>DRAF BELUM TERSIMPAN</Text>
              </View>
              <Text style={[styles.homeDraftTimeText, { color: sem.warningSoft }]}>Lanjutkan ➔</Text>
            </View>
            <Text style={[styles.homeDraftTitle, { color: sem.warningSoft }]} numberOfLines={1}>
              {activeDraft.title || 'Catatan Baru (Tanpa Judul)'}
            </Text>
            <Text style={[styles.homeDraftSnippet, { color: theme.subtext }]} numberOfLines={1}>
              {activeDraft.content || 'Belum ada isi catatan...'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {recentStudyNotes.length === 0 && !activeDraft ? (
          <View style={styles.emptyInlineBox}>
            <Ionicons name="reader-outline" size={26} color={theme.subtext} />
            <Text style={[styles.emptyInlineTitle, { color: theme.text }]}>Belum ada materi catatan</Text>
            <Text style={[styles.emptyInlineSub, { color: theme.subtext }]}>Tulis materi atau foto buku kuliah untuk dirangkum AI.</Text>
          </View>
        ) : (
          <View style={styles.notesMiniList}>
            {recentStudyNotes.slice(0, 4).map((note: StudyNote) => (
              <TouchableOpacity
                key={note.id}
                style={[styles.noteMiniCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={() => navigation.navigate('StudyNoteDetail', { noteId: note.id })}
                activeOpacity={0.7}
              >
                <View style={styles.noteMiniHeader}>
                  <View style={[styles.noteSubjectPill, { backgroundColor: theme.accentBg }]}>
                    <Text style={[styles.noteSubjectPillText, { color: theme.accentLight }]}>{note.subject}</Text>
                  </View>
                  <Text style={[styles.noteMiniDate, { color: theme.muted }]}>
                    {new Date(note.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={[styles.noteMiniTitle, { color: theme.text }]}>{note.title}</Text>

                <View style={styles.noteMiniBadges}>
                  {note.summary ? (
                    <View style={[styles.miniAiBadge, { backgroundColor: theme.accentBg }]}>
                      <Ionicons name="sparkles" size={10} color={theme.accentLight} />
                      <Text style={[styles.miniAiBadgeText, { color: theme.accentLight }]}>Rangkuman AI</Text>
                    </View>
                  ) : null}
                  {note.quiz_data && note.quiz_data.length > 0 ? (
                    <View style={[styles.miniAiBadge, { backgroundColor: sem.successBg }]}>
                      <Ionicons name="school-outline" size={10} color={sem.success} />
                      <Text style={[styles.miniAiBadgeText, { color: sem.success }]}>
                        {note.quiz_data.length} Soal
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 4. Kotak Rasa Syukur Cepat */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardCategory, { color: theme.subtext }]}>KOTAK RASA SYUKUR</Text>
          <Ionicons name="heart-outline" size={14} color={theme.accentLight} />
        </View>
        <Text style={[styles.gratitudePrompt, { color: theme.text }]}>Apa 1 hal baik atau kemajuan kecil yang kamu syukuri hari ini?</Text>

        <View style={styles.gratitudeInputRow}>
          <TextInput
            style={[styles.gratitudeInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
            placeholder="Contoh: Diskusi materi lancar, teman suportif..."
            placeholderTextColor={theme.muted}
            value={gratitudeText}
            onChangeText={setGratitudeText}
          />
          <TouchableOpacity
            style={[
              styles.gratitudeSaveBtn,
              { backgroundColor: theme.primary },
              !gratitudeText.trim() && { backgroundColor: isLightMode ? '#E2E8F0' : '#1C2330' }
            ]}
            onPress={handleSaveGratitude}
            disabled={!gratitudeText.trim() || savingGratitude}
            activeOpacity={0.8}
          >
            {savingGratitude ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={14} color={!gratitudeText.trim() ? theme.muted : '#FFFFFF'} />
            )}
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );

  // =========================================================================
  // SUB-COMPONENT: WELLNESS & REFLECTION SECTION
  // =========================================================================
  const renderWellnessSection = () => (
    <View style={styles.sectionColumn}>

      {/* 1. Dynamic AI Wisdom */}
      <View style={[styles.wisdomCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.wisdomTopRow}>
          <View style={[styles.wisdomBadge, { backgroundColor: theme.accentBg }]}>
            <Ionicons name="sparkles" size={12} color={theme.accentLight} />
            <Text style={[styles.wisdomBadgeText, { color: theme.accentLight }]}>Pesan Semangat Hari Ini</Text>
          </View>
          <TouchableOpacity
            onPress={refreshWisdomWithAI}
            disabled={loadingWisdom}
            style={styles.refreshWisdomBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {loadingWisdom ? (
              <ActivityIndicator size="small" color={theme.subtext} />
            ) : (
              <Ionicons name="refresh-outline" size={15} color={theme.subtext} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.wisdomText, { color: theme.text }]}>"{wisdom}"</Text>
      </View>

      {/* 2. Daily Mindfulness Quests */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardCategory, { color: theme.subtext }]}>MISI KETENANGAN HARIAN</Text>
          <Text style={[styles.questProgressText, { color: theme.accentLight }]}>
            {completedQuestsCount}/{quests.length} Selesai ({questPercentage}%)
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={[styles.questProgressBarBg, { backgroundColor: theme.cardInner }]}>
          <View style={[styles.questProgressBarFill, { backgroundColor: theme.primary, width: `${questPercentage}%` as any }]} />
        </View>

        <View style={styles.questList}>
          {quests.map(q => (
            <TouchableOpacity
              key={q.id}
              style={[
                styles.questItem,
                { backgroundColor: theme.cardInner, borderColor: theme.border },
                q.completed && {
                  backgroundColor: sem.successBg,
                  borderColor: sem.successBorder,
                }
              ]}
              onPress={() => toggleQuest(q.id)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.questCheckCircle,
                { borderColor: theme.border },
                q.completed && { backgroundColor: theme.primary, borderColor: theme.primary }
              ]}>
                {q.completed && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              <Ionicons name={q.icon as any} size={15} color={q.completed ? theme.muted : theme.subtext} style={{ marginRight: 6 }} />
              <Text style={[
                styles.questTitle,
                { color: theme.text },
                q.completed && { color: theme.muted, textDecorationLine: 'line-through' }
              ]}>
                {q.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 3. Latihan Pernapasan Relaksasi */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardCategory, { color: theme.subtext }]}>LATIHAN PERNAPASAN 4-4-4</Text>
          <View style={[styles.calmPill, { backgroundColor: theme.accentBg }]}>
            <Text style={[styles.calmPillText, { color: theme.accentLight }]}>Relaksasi Nugas</Text>
          </View>
        </View>

        <View style={styles.breathworkContainer}>
          <Animated.View style={[styles.breathCircle, { backgroundColor: theme.accentBg, borderColor: theme.border, transform: [{ scale: breathAnim }] }]}>
            <Ionicons name="leaf-outline" size={24} color={isBreathing ? theme.accentLight : theme.muted} />
          </Animated.View>

          <View style={styles.breathTextContainer}>
            <Text style={[styles.breathPhaseText, { color: theme.text }]}>
              {isBreathing ? `${breathPhase} (${breathSeconds} detik)` : 'Tarik Napas & Tenangkan Pikiran'}
            </Text>
            <Text style={[styles.breathSubText, { color: theme.subtext }]}>
              {isBreathing ? 'Fokuskan perhatian pada aliran napasmu' : 'Luangkan 1 menit untuk meredakan stres belajar'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.breathBtn, { backgroundColor: theme.primary }]}
            onPress={startBreathwork}
            activeOpacity={0.8}
          >
            <Ionicons name={isBreathing ? 'pause' : 'play'} size={14} color="#FFFFFF" />
            <Text style={styles.breathBtnText}>{isBreathing ? 'Hentikan' : 'Mulai'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. Catatan Jurnal Terakhir */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeader, { color: theme.subtext }]}>JURNAL TERAKHIR</Text>
        <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('Journal')}>
          <Text style={[styles.seeAllText, { color: theme.accentLight }]}>Buka Jurnal →</Text>
        </TouchableOpacity>
      </View>

      {recentEntries.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="book-outline" size={24} color={theme.muted} style={{ marginBottom: 6 }} />
          <Text style={[styles.emptyCardTitle, { color: theme.text }]}>Belum ada jurnal</Text>
          <Text style={[styles.emptyCardSub, { color: theme.subtext }]}>Mulai simpan kenangan dan refleksi harianmu.</Text>
        </View>
      ) : (
        recentEntries.slice(0, 3).map(entry => {
          const mood = moods.find(m => m.type === entry.mood);
          return (
            <TouchableOpacity
              key={entry.id}
              style={[styles.recentItem, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigation.navigate('JournalEntry', { entryId: entry.id })}
              activeOpacity={0.7}
            >
              <View style={styles.recentTop}>
                <Text style={[styles.recentTitle, { color: theme.text }]} numberOfLines={1}>
                  {entry.title || 'Catatan Harian'}
                </Text>
                <View style={[styles.recentMoodBadge, { backgroundColor: theme.accentBg }]}>
                  <Text style={{ fontSize: 13 }}>{mood?.emoji || '✨'}</Text>
                  <Text style={[styles.recentMoodText, { color: theme.accentLight }]}>{mood?.label || entry.mood}</Text>
                </View>
              </View>
              <Text style={[styles.recentContent, { color: theme.subtext }]} numberOfLines={2}>{entry.content}</Text>
              <Text style={[styles.recentDate, { color: theme.muted }]}>
                {new Date(entry.created_at).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

          {/* Top Bar Greeting & Streak Indicator */}
          <View style={styles.topBar}>
            <View>
              <Text style={[styles.greetingText, { color: theme.subtext }]}>{greeting}</Text>
              <Text style={[styles.usernameText, { color: theme.text }]}>{username || 'Mahasiswa'}</Text>
            </View>

            <TouchableOpacity
              style={[styles.streakPill, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => showAlert('Streak Keaktifan', `Kamu sudah aktif ${streak} hari berturut-turut belajar dan berefleksi. Pertahankan ritmemu!`)}
              activeOpacity={0.7}
            >
              <Ionicons name="flame" size={15} color={sem.warning} />
              <Text style={[styles.streakNumber, { color: theme.text }]}>{streak} Hari</Text>
            </TouchableOpacity>
          </View>

          {/* Offline Warning Banner */}
          {!isOnline && (
            <View style={[styles.offlineBanner, { backgroundColor: sem.warningBg, borderColor: sem.warningBorder }]}>
              <Ionicons name="cloud-offline" size={15} color={sem.warning} />
              <Text style={[styles.offlineBannerText, { color: sem.warningStrong }]}>
                Mode Offline Aktif • Seluruh catatan tersimpan lokal di perangkat dan otomatis tersinkron saat terhubung internet.
              </Text>
            </View>
          )}

          {/* Global Campus Announcement */}
          {globalAnnouncement && globalAnnouncement.trim().length > 0 ? (
            <View style={[styles.announcementBanner, { backgroundColor: sem.warningBg, borderColor: sem.warning }]}>
              <View style={[styles.announcementIconWrap, { backgroundColor: sem.warningBorder }]}>
                <Ionicons name="megaphone-outline" size={15} color={sem.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.announcementLabel, { color: sem.warningStrong }]}>PENGUMUMAN</Text>
                <Text style={[styles.announcementText, { color: sem.warningSoft }]}>{globalAnnouncement.trim()}</Text>
              </View>
            </View>
          ) : null}

          {/* Starter Onboarding Checklist for New Users */}
          {isFirstTimeUser && (
            <View style={[styles.starterCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.starterHeaderRow}>
                <View style={[styles.starterIconWrap, { backgroundColor: theme.accentBg }]}>
                  <Ionicons name="rocket-outline" size={16} color={theme.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.starterTitle, { color: theme.text }]}>Panduan Memulai Cepat Mahasiswa</Text>
                  <Text style={[styles.starterSub, { color: theme.subtext }]}>Ikuti 3 langkah awal ini untuk mengatur ritme belajarmu:</Text>
                </View>
              </View>

              <View style={styles.starterActionsList}>
                <TouchableOpacity
                  style={[styles.starterActionItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={() => navigation.navigate('StudyNoteDetail', {})}
                  activeOpacity={0.7}
                >
                  <View style={[styles.starterStepNumber, { backgroundColor: theme.accentBg }]}>
                    <Text style={[styles.starterStepText, { color: theme.accentLight }]}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.starterActionTitle, { color: theme.text }]}>Buat Catatan Materi Pertama atau Scan OCR</Text>
                    <Text style={[styles.starterActionDesc, { color: theme.subtext }]}>Tulis ringkasan bab kuliah atau foto catatan buku</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={theme.subtext} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.starterActionItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'tasks' })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.starterStepNumber, { backgroundColor: theme.accentBg }]}>
                    <Text style={[styles.starterStepText, { color: theme.accentLight }]}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.starterActionTitle, { color: theme.text }]}>Daftarkan Tugas & Tentukan Deadline</Text>
                    <Text style={[styles.starterActionDesc, { color: theme.subtext }]}>Bagi tugas berdasarkan tingkat urgensi (Tinggi, Sedang)</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={theme.subtext} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.starterActionItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'pomodoro' })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.starterStepNumber, { backgroundColor: theme.accentBg }]}>
                    <Text style={[styles.starterStepText, { color: theme.accentLight }]}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.starterActionTitle, { color: theme.text }]}>Coba Sesi Fokus Pomodoro 25 Menit</Text>
                    <Text style={[styles.starterActionDesc, { color: theme.subtext }]}>Belajar bebas distraksi dengan alarm pengingat istirahat</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={theme.subtext} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ========================================================================= */}
          {/* DESKTOP TOP HERO FOCUS & MOOD CHECK-IN BANNER */}
          {/* ========================================================================= */}
          {isWide && renderHeroFocusCard()}

          {/* ========================================================================= */}
          {/* DESKTOP 2-COLUMN EXPANSIVE GRID VIEW */}
          {/* ========================================================================= */}
          {isWide ? (
            <View style={styles.desktopTwoColRow}>
              {/* Left Column: Akademik & Produktivitas Belajar */}
              <View style={styles.desktopLeftCol}>
                {renderAcademicSection()}
              </View>

              {/* Right Column: Kesejahteraan, Mind & AI Companion */}
              <View style={styles.desktopRightCol}>
                {renderWellnessSection()}
              </View>
            </View>
          ) : (
            /* ========================================================================= */
            /* MOBILE SINGLE-COLUMN VIEW WITH TAB SWITCHER */
            /* ========================================================================= */
            <View style={{ gap: 14 }}>
              {/* Mobile Hero Focus Card */}
              {renderHeroFocusCard()}

              {/* Mobile Segmented Tab Switcher */}
              <View style={[styles.tabSwitcherRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <TouchableOpacity
                  style={[
                    styles.tabSwitchBtn,
                    activeTab === 'academic' && [styles.tabSwitchBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                  ]}
                  onPress={() => setActiveTab('academic')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="school-outline"
                    size={16}
                    color={activeTab === 'academic' ? theme.accentLight : theme.subtext}
                  />
                  <Text style={[
                    styles.tabSwitchBtnText,
                    { color: activeTab === 'academic' ? theme.text : theme.subtext },
                    activeTab === 'academic' && { fontWeight: '700' }
                  ]}>
                    Akademik & Tugas
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tabSwitchBtn,
                    activeTab === 'wellness' && [styles.tabSwitchBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                  ]}
                  onPress={() => setActiveTab('wellness')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="heart-outline"
                    size={16}
                    color={activeTab === 'wellness' ? theme.accentLight : theme.subtext}
                  />
                  <Text style={[
                    styles.tabSwitchBtnText,
                    { color: activeTab === 'wellness' ? theme.text : theme.subtext },
                    activeTab === 'wellness' && { fontWeight: '700' }
                  ]}>
                    Kesejahteraan & Refleksi
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mobile Tab Content */}
              {activeTab === 'academic' ? renderAcademicSection() : renderWellnessSection()}
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  scrollContentWide: {
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 56,
  },
  innerContainer: {
    width: '100%',
    gap: 14,
  },
  innerContainerWide: {
    maxWidth: 1380,
    alignSelf: 'center',
    gap: 20,
  },
  desktopTwoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
    width: '100%',
  },
  desktopLeftCol: {
    flex: 1,
    gap: 16,
  },
  desktopRightCol: {
    flex: 1,
    gap: 16,
  },
  sectionColumn: {
    gap: 14,
    width: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  greetingText: {
    fontSize: 11.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  usernameText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  streakNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  announcementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  announcementIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  announcementText: {
    fontSize: 12,
    lineHeight: 16,
  },
  heroFocusCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroDateText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  heroSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTitleText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  heroSubText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  moodSectionWrap: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  moodSectionPrompt: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  moodOptionsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  moodOptionsScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3,
  },
  moodPillBtn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 58,
  },
  moodEmojiText: {
    fontSize: 20,
    marginBottom: 2,
  },
  moodPillLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  starterCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  starterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  starterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starterTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  starterSub: {
    fontSize: 11.5,
  },
  starterActionsList: {
    gap: 8,
  },
  starterActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  starterStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starterStepText: {
    fontSize: 11,
    fontWeight: '800',
  },
  starterActionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 1,
  },
  starterActionDesc: {
    fontSize: 11,
  },
  tabSwitcherRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tabSwitchBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 9,
  },
  tabSwitchBtnActive: {
    borderWidth: 1,
  },
  tabSwitchBtnText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickHubGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickHubBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  quickHubIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  quickHubBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  quickHubBtnSub: {
    fontSize: 10.5,
  },
  card: {
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategory: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  cardActionLink: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  emptyInlineBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  emptyInlineTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyInlineSub: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  tasksListWrap: {
    gap: 8,
  },
  taskCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  taskCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  taskItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  taskSubjectBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taskDueDateBadge: {
    fontSize: 11,
    flexShrink: 1,
  },
  priorityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    alignSelf: 'center',
  },
  priorityBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  homeDraftCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  homeDraftTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  homeDraftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  homeDraftBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  homeDraftTimeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  homeDraftTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  homeDraftSnippet: {
    fontSize: 11,
  },
  notesMiniList: {
    gap: 8,
  },
  noteMiniCard: {
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  noteMiniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteSubjectPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noteSubjectPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  noteMiniDate: {
    fontSize: 10.5,
  },
  noteMiniTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  noteMiniBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  miniAiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniAiBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  wisdomCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  wisdomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wisdomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  wisdomBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  refreshWisdomBtn: {
    padding: 4,
  },
  wisdomText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  questProgressText: {
    fontSize: 11,
    fontWeight: '700',
  },
  questProgressBarBg: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  questProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  questList: {
    gap: 6,
  },
  questItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  questCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  questTitle: {
    fontSize: 12,
    flex: 1,
  },
  calmPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  calmPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  breathworkContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  breathCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  breathTextContainer: {
    alignItems: 'center',
    gap: 2,
  },
  breathPhaseText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  breathSubText: {
    fontSize: 11,
    textAlign: 'center',
  },
  breathBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 4,
  },
  breathBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  gratitudePrompt: {
    fontSize: 12,
    lineHeight: 16,
  },
  gratitudeInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gratitudeInput: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  gratitudeSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  seeAllText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyCardSub: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  recentItem: {
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    gap: 4,
  },
  recentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  recentMoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recentMoodText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  recentContent: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  recentDate: {
    fontSize: 10.5,
    marginTop: 2,
  },
});
