import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Animated, Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
import { JournalEntry, StudyNote, StudentTask } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert } from '../lib/alert';
import { calculateRealStreak } from '../lib/streakCalculator';
import {
  isDeviceOnline,
  subscribeNetworkStatus,
  getCachedDashboard,
  cacheDashboardLocally,
  processOfflineSyncQueue,
  queueOfflineAction,
} from '../lib/offlineSync';
import { scheduleDailyRoutineReminders } from '../lib/notifications';

const DEFAULT_DAILY_QUESTS = [
  { id: '1', title: 'Curhat atau refleksi sejenak ke AI', completed: false, icon: 'chatbubble-ellipses-outline' },
  { id: '2', title: 'Minum 2 gelas air putih', completed: false, icon: 'water-outline' },
  { id: '3', title: 'Latihan pernapasan 1 menit', completed: false, icon: 'leaf-outline' },
  { id: '4', title: 'Tulis 1 hal kecil yang kamu syukuri', completed: false, icon: 'heart-outline' },
];

const WISDOM_PRESETS = [
  '“Kamu tidak harus mengendalikan semua pikiranmu. Cukup jangan biarkan pikiran itu mengendalikan dirimu.”',
  '“Setiap hari mungkin tidak baik, tapi selalu ada sesuatu yang baik di setiap hari.”',
  '“Tarik napas dalam-dalam. Hal-hal besar butuh waktu untuk tumbuh.”',
  '“Perasaanmu valid. Beri dirimu izin untuk beristirahat tanpa rasa bersalah.”',
];

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getQuestStorageKey = (userId?: string, dateStr?: string) =>
  `@daily_quests_${userId || 'guest'}_${dateStr || getTodayDateString()}`;

export default function HomeScreen() {
  const { user } = useAuth();
  const { moods, globalAnnouncement, aiBotName } = useMoods();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

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

  // -------------------------------------------------------------
  // Load and refresh Daily Quests (Resets automatically every day)
  // -------------------------------------------------------------
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
      setUsername('Sobat');
      loadDailyQuests();
      setLoading(false);
      return;
    }

    // 1. Instant load from local cache (0ms loading offline)
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
    } catch (e) {}

    // 2. Fetch fresh data from Supabase
    try {
      const [profileRes, recentRes, journalDatesRes, chatDatesRes, tasksRes, notesRes, allTasksCountRes, allNotesCountRes] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).single(),
        supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('journal_entries').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('chat_messages').select('created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(100),
        supabase.from('student_tasks').select('*').eq('user_id', user.id).eq('is_completed', false).order('created_at', { ascending: false }).limit(4),
        supabase.from('study_notes').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(2),
        supabase.from('student_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_completed', false),
        supabase.from('study_notes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      const fetchedUsername = profileRes.data?.username || 'Kamu';
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

      // Real streak calculator across all user activities (journals, chats, study notes, tasks)
      const allTimestamps: string[] = [
        ...(journalDatesRes.data?.map(d => d.created_at) || []),
        ...(chatDatesRes.data?.map(d => d.created_at) || []),
        ...(notesRes.data?.map(d => d.created_at) || []),
        ...(tasksRes.data?.map(d => d.created_at) || []),
      ];
      const calculatedStreak = calculateRealStreak(allTimestamps);
      setStreak(calculatedStreak);

      // Cache all dashboard data for instant offline loading
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

    // Subscribe to network online/offline and process queue
    const unsubscribeNetwork = subscribeNetworkStatus(async (online) => {
      setIsOnline(online);
      if (online && user) {
        const { syncedCount } = await processOfflineSyncQueue(user.id);
        if (syncedCount > 0) {
          fetchData();
          showAlert('Sinkronisasi Sukses 🔄', `${syncedCount} aktivitas offline telah berhasil di-upload ke database!`);
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
    showAlert('Tugas Selesai! 🎉', 'Kerja bagus, satu tugas kuliahmu berhasil diselesaikan.');
    try {
      await supabase.from('student_tasks').update({ is_completed: true }).eq('id', taskId);
    } catch (e) {
      console.log('Error updating task status:', e);
    }
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
      title: '✨ Rasa Syukur Hari Ini',
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
      showAlert('Tersimpan Offline 🤍', 'Catatan rasa syukur disimpan di HP & otomatis di-sync saat online.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
      return;
    }

    try {
      if (user) {
        await supabase.from('journal_entries').insert(payload);
      }
      setGratitudeText('');
      showAlert('Tersimpan 🤍', 'Catatan rasa syukur kamu berhasil disimpan ke Jurnal.');
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
      showAlert('Tersimpan Offline 🤍', 'Catatan rasa syukur disimpan di HP & otomatis di-sync saat online.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
    } finally {
      setSavingGratitude(false);
    }
  };

  const startBreathwork = () => {
    if (isBreathing) {
      clearInterval(breathInterval.current);
      setIsBreathing(false);
      Animated.timing(breathAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      return;
    }

    const updated = quests.map(q => q.id === '3' ? { ...q, completed: true } : q);
    saveDailyQuests(updated);

    setIsBreathing(true);
    let step = 0;
    let count = 4;
    setBreathPhase('Tarik Napas');
    setBreathSeconds(4);

    Animated.timing(breathAnim, {
      toValue: 1.45,
      duration: 4000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();

    breathInterval.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        step = (step + 1) % 3;
        count = 4;
        if (step === 0) {
          setBreathPhase('Tarik Napas');
          Animated.timing(breathAnim, {
            toValue: 1.45,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }).start();
        } else if (step === 1) {
          setBreathPhase('Tahan');
        } else {
          setBreathPhase('Hembuskan');
          Animated.timing(breathAnim, {
            toValue: 1,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      } else {
        setBreathSeconds(count);
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="small" color={theme.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

          {/* Top Header */}
          <View style={styles.topBar}>
            <View>
              <Text style={[styles.greetingText, { color: theme.subtext }]}>{greeting}</Text>
              <Text style={[styles.usernameText, { color: theme.text }]}>{username || 'Teman'}</Text>
            </View>
          <TouchableOpacity
            style={[styles.streakPill, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => showAlert('🔥 Streak Keaktifan', `Kamu sudah aktif ${streak} hari berturut-turut belajar dan refleksi. Terus pertahankan ritmemu!`)}
          >
            <Ionicons name="flame" size={16} color="#F59E0B" />
            <Text style={[styles.streakNumber, { color: theme.text }]}>{streak} Hari</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Status Warning Banner */}
        {!isOnline && (
          <View style={[styles.offlineBanner, { backgroundColor: isLightMode ? '#FEF3C7' : '#2D2008', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
            <Ionicons name="cloud-offline" size={15} color="#D97706" />
            <Text style={[styles.offlineBannerText, { color: isLightMode ? '#92400E' : '#FCD34D' }]}>
              Mode Offline Aktif • Beranda & aktivitas tersimpan di HP & otomatis di-upload saat online.
            </Text>
          </View>
        )}

        {/* Global Announcement Banner */}
        {globalAnnouncement && globalAnnouncement.trim().length > 0 ? (
          <View style={[styles.announcementBanner, { backgroundColor: isLightMode ? '#FEF3C7' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#78350F' }]}>
            <View style={styles.announcementIconWrap}>
              <Ionicons name="megaphone" size={15} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.announcementLabel, { color: isLightMode ? '#92400E' : '#FBBF24' }]}>PENGUMUMAN KAMPUS</Text>
              <Text style={[styles.announcementText, { color: isLightMode ? '#78350F' : '#FDE68A' }]}>{globalAnnouncement.trim()}</Text>
            </View>
          </View>
        ) : null}

        {/* Quick Hub - 4 Primary Features Grid with exact tab routing */}
        <View style={[styles.quickHubCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.quickHubTitle, { color: theme.subtext }]}>PINTASAN UTAMA MAHASISWA</Text>
          <View style={styles.quickHubGrid}>
            <TouchableOpacity
              style={[styles.quickHubBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={() => (navigation.getParent() as any)?.navigate('Chat')}
            >
              <View style={[styles.quickHubIconCircle, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="chatbubble-ellipses" size={18} color={theme.accentLight} />
              </View>
              <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Curhat AI</Text>
              <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>Tutor & Konseling</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickHubBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'notes' })}
            >
              <View style={[styles.quickHubIconCircle, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="school" size={18} color={theme.accentLight} />
              </View>
              <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Catatan AI</Text>
              <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>Materi & Kuis</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickHubBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'tasks' })}
            >
              <View style={[styles.quickHubIconCircle, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B' }]}>
                <Ionicons name="checkbox" size={18} color={isLightMode ? '#16A34A' : '#34D399'} />
              </View>
              <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Tugas Kuliah</Text>
              <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>Deadline & List</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickHubBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'pomodoro' })}
            >
              <View style={[styles.quickHubIconCircle, { backgroundColor: isLightMode ? '#FEF3C7' : '#78350F' }]}>
                <Ionicons name="timer" size={18} color={isLightMode ? '#D97706' : '#FBBF24'} />
              </View>
              <Text style={[styles.quickHubBtnText, { color: theme.text }]}>Fokus Nugas</Text>
              <Text style={[styles.quickHubBtnSub, { color: theme.subtext }]}>Timer Pomodoro</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Grid Layout (Desktop Dual-Column / Mobile Stack) */}
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>

          {/* ========================================================================= */}
          {/* LEFT / ACADEMIC & STUDY COLUMN */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>

            {/* 1. Widget: Upcoming Student Tasks & Deadlines */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calendar-outline" size={14} color="#F59E0B" />
                  <Text style={[styles.cardCategory, { color: theme.subtext }]}>TUGAS & DEADLINE MENDATANG</Text>
                </View>
                <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'tasks' })}>
                  <Text style={[styles.cardActionLink, { color: theme.accentLight }]}>Lihat Semua →</Text>
                </TouchableOpacity>
              </View>

              {upcomingTasks.length === 0 ? (
                <View style={[styles.emptyInlineBox, { borderColor: theme.border }]}>
                  <Ionicons name="checkmark-done-circle-outline" size={24} color="#10B981" />
                  <Text style={[styles.emptyInlineTitle, { color: theme.text }]}>Semua tugas kuliah beres!</Text>
                  <Text style={[styles.emptyInlineSub, { color: theme.subtext }]}>Tidak ada deadline mendesak yang menunggu.</Text>
                </View>
              ) : (
                <View style={styles.tasksListWrap}>
                  {upcomingTasks.map(task => {
                    const isHigh = task.priority === 'high';
                    const isLow = task.priority === 'low';
                    return (
                      <View key={task.id} style={[styles.taskCardItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <TouchableOpacity
                          style={[styles.taskCheckCircle, { borderColor: theme.border }]}
                          onPress={() => toggleTaskDirectly(task.id)}
                        >
                          <Ionicons name="checkmark" size={13} color="transparent" />
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.taskItemTitle, { color: theme.text }]} numberOfLines={1}>
                            {task.title}
                          </Text>
                          <View style={styles.taskItemMetaRow}>
                            <Text style={[styles.taskSubjectBadge, { color: theme.accentLight, backgroundColor: theme.accentBg }]}>{task.subject}</Text>
                            {task.due_date ? (
                              <Text style={[styles.taskDueDateBadge, { color: theme.subtext }]}>
                                ⏱️ {task.due_date}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                          <View
                          style={[
                            styles.priorityBadge,
                            {
                              backgroundColor: isHigh
                                ? (isLightMode ? '#FEE2E2' : '#2D1418')
                                : isLow
                                ? (isLightMode ? '#E0F2FE' : '#101B2E')
                                : (isLightMode ? '#FEF3C7' : '#261C08'),
                              borderColor: isHigh
                                ? (isLightMode ? '#FECACA' : '#451A20')
                                : isLow
                                ? (isLightMode ? '#BAE6FD' : '#1E2D4A')
                                : (isLightMode ? '#FDE68A' : '#3E2E10'),
                              borderWidth: 1,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.priorityBadgeText,
                              {
                                color: isHigh
                                  ? (isLightMode ? '#DC2626' : '#F87171')
                                  : isLow
                                  ? (isLightMode ? '#0284C7' : '#60A5FA')
                                  : (isLightMode ? '#D97706' : '#FBBF24'),
                              },
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

            {/* 2. Catatan Kuliah & Draf Terkini */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="book-outline" size={14} color={theme.accentLight} />
                  <Text style={[styles.cardCategory, { color: theme.subtext }]}>CATATAN KULIAH & DRAF</Text>
                </View>
                <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('Study', { initialTab: 'notes' })}>
                  <Text style={[styles.cardActionLink, { color: theme.accentLight }]}>+ Buat Catatan</Text>
                </TouchableOpacity>
              </View>

              {/* Draft Note Banner if exists */}
              {activeDraft ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('StudyNoteDetail', {})}
                  style={[styles.homeDraftCard, { backgroundColor: isLightMode ? '#FFFBEB' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#78350F' }]}
                >
                  <View style={styles.homeDraftTop}>
                    <View style={[styles.homeDraftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#3E2A0A' }]}>
                      <Ionicons name="create-outline" size={12} color="#FBBF24" />
                      <Text style={[styles.homeDraftBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>DRAF BELUM TERSIMPAN</Text>
                    </View>
                    <Text style={[styles.homeDraftTimeText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>Klik untuk lanjut ➔</Text>
                  </View>
                  <Text style={[styles.homeDraftTitle, { color: isLightMode ? '#78350F' : '#FEF3C7' }]} numberOfLines={1}>
                    {activeDraft.title || 'Catatan Baru (Tanpa Judul)'}
                  </Text>
                  <Text style={[styles.homeDraftSnippet, { color: theme.subtext }]} numberOfLines={1}>
                    {activeDraft.content || 'Belum ada isi catatan...'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {recentStudyNotes.length === 0 && !activeDraft ? (
                <View style={styles.emptyInlineBox}>
                  <Ionicons name="reader-outline" size={24} color={theme.subtext} />
                  <Text style={[styles.emptyInlineTitle, { color: theme.text }]}>Belum ada materi catatan</Text>
                  <Text style={[styles.emptyInlineSub, { color: theme.subtext }]}>Tulis rumus & bab kuliah untuk dirangkum AI.</Text>
                </View>
              ) : (
                <View style={styles.notesMiniList}>
                  {recentStudyNotes.slice(0, 3).map((note: StudyNote) => (
                    <TouchableOpacity
                      key={note.id}
                      style={[styles.noteMiniCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={() => navigation.navigate('StudyNoteDetail', { noteId: note.id })}
                    >
                      <View style={styles.noteMiniHeader}>
                        <View style={[styles.noteSubjectPill, { backgroundColor: theme.accentBg }]}>
                          <Text style={[styles.noteSubjectPillText, { color: theme.accentLight }]}>{note.subject}</Text>
                        </View>
                        <Text style={[styles.noteMiniDate, { color: theme.muted }]}>
                          {new Date(note.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <Text style={[styles.noteMiniTitle, { color: theme.text }]} numberOfLines={1}>{note.title}</Text>
                      
                      <View style={styles.noteMiniBadges}>
                        {note.summary ? (
                          <View style={[styles.miniAiBadge, { backgroundColor: theme.accentBg }]}>
                            <Ionicons name="sparkles" size={10} color={theme.accentLight} />
                            <Text style={[styles.miniAiBadgeText, { color: theme.accentLight }]}>Rangkuman AI</Text>
                          </View>
                        ) : null}
                        {note.quiz_data && note.quiz_data.length > 0 ? (
                          <View style={[styles.miniAiBadge, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B' }]}>
                            <Ionicons name="school" size={10} color={isLightMode ? '#16A34A' : '#34D399'} />
                            <Text style={[styles.miniAiBadgeText, { color: isLightMode ? '#16A34A' : '#34D399' }]}>
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

            {/* 3. Daily Mood Check-In Card */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardCategory, { color: theme.subtext }]}>REFLEKSI HARI INI</Text>
                <Text style={[styles.cardDate, { color: theme.muted }]}>
                  {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </View>

              <Text style={[styles.checkInTitle, { color: theme.text }]}>
                {todayMood
                  ? `Mood tercatat: ${currentMoodOption?.emoji || '•'} ${currentMoodOption?.label || todayMood}`
                  : 'Bagaimana perasaan & energimu sekarang?'}
              </Text>
              <Text style={[styles.checkInSubtitle, { color: theme.subtext }]}>
                {todayMood
                  ? 'Catatan emosi tersimpan. Klik untuk menulis detail.'
                  : 'Pilih satu emosi yang paling menggambarkan kondisimu:'}
              </Text>

              <View style={styles.moodGrid}>
                {moods.map(m => {
                  const isSelected = todayMood === m.type;
                  return (
                    <TouchableOpacity
                      key={m.type}
                      style={[
                        styles.moodOption,
                        { backgroundColor: theme.cardInner, borderColor: isSelected ? theme.accent : theme.border },
                        isSelected && [styles.moodOptionSelected, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                      ]}
                      onPress={() => {
                        setTodayMood(m.type);
                        navigation.navigate('JournalEntry', {});
                      }}
                    >
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodText, { color: isSelected ? theme.accentLight : theme.subtext }, isSelected && styles.moodTextSelected]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 4. Interactive Breathwork Studio (Pernapasan Relaksasi 4-4-4) */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardCategory, { color: theme.subtext }]}>LATIHAN PERNAPASAN 4-4-4</Text>
                <View style={[styles.calmPill, { backgroundColor: theme.accentBg }]}>
                  <Text style={[styles.calmPillText, { color: theme.accentLight }]}>Relaksasi Nugas</Text>
                </View>
              </View>

              <View style={styles.breathworkContainer}>
                <Animated.View style={[styles.breathCircle, { backgroundColor: theme.accentBg, borderColor: theme.border, transform: [{ scale: breathAnim }] }]}>
                  <Ionicons name="leaf" size={24} color={isBreathing ? theme.accentLight : theme.muted} />
                </Animated.View>

                <View style={styles.breathTextContainer}>
                  <Text style={[styles.breathPhaseText, { color: theme.text }]}>
                    {isBreathing ? `${breathPhase} (${breathSeconds}s)` : 'Tarik Napas & Rileks'}
                  </Text>
                  <Text style={[styles.breathSubText, { color: theme.subtext }]}>
                    {isBreathing ? 'Fokuskan pikiran pada aliran napasmu' : 'Luangkan 1 menit untuk meredakan stres tugas'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.breathBtn, { backgroundColor: theme.primary }, isBreathing && styles.breathBtnActive]}
                  onPress={startBreathwork}
                >
                  <Ionicons name={isBreathing ? 'pause' : 'play'} size={15} color="#FFFFFF" />
                  <Text style={styles.breathBtnText}>{isBreathing ? 'Hentikan' : 'Mulai'}</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* ========================================================================= */}
          {/* RIGHT / MOTIVATION & MINDFULNESS COLUMN */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1 }]}>

            {/* 5. Dynamic AI Wisdom Banner */}
            <View style={[styles.wisdomCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.wisdomTopRow}>
                <View style={[styles.wisdomBadge, { backgroundColor: theme.accentBg }]}>
                  <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                  <Text style={[styles.wisdomBadgeText, { color: theme.accentLight }]}>Pesan Semangat Hari Ini</Text>
                </View>
                <TouchableOpacity onPress={refreshWisdomWithAI} disabled={loadingWisdom} style={styles.refreshWisdomBtn}>
                  {loadingWisdom ? (
                    <ActivityIndicator size="small" color={theme.subtext} />
                  ) : (
                    <Ionicons name="refresh-outline" size={15} color={theme.subtext} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={[styles.wisdomText, { color: theme.text }]}>{wisdom}</Text>
            </View>

            {/* 6. Misi Ketenangan Harian (Daily Mindfulness Quests) */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardCategory, { color: theme.subtext }]}>MISI HARIAN</Text>
                <Text style={[styles.questProgressText, { color: theme.accentLight }]}>{completedQuestsCount}/{quests.length} Selesai ({questPercentage}%)</Text>
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
                        backgroundColor: isLightMode ? '#F0FDF4' : '#0D1A16',
                        borderColor: isLightMode ? '#BBF7D0' : '#192823',
                      }
                    ]}
                    onPress={() => toggleQuest(q.id)}
                  >
                    <View style={[styles.questCheckCircle, { borderColor: theme.border }, q.completed && [styles.questCheckCircleActive, { backgroundColor: theme.primary, borderColor: theme.primary }]]}>
                      {q.completed && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Ionicons name={q.icon as any} size={16} color={q.completed ? theme.muted : theme.subtext} style={{ marginRight: 6 }} />
                    <Text style={[styles.questTitle, { color: theme.text }, q.completed && [styles.questTitleCompleted, { color: theme.muted }]]}>
                      {q.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 7. Kotak Syukur Cepat (Quick Gratitude Box) */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardCategory, { color: theme.subtext }]}>KOTAK RASA SYUKUR</Text>
                <Ionicons name="heart" size={14} color="#EC4899" />
              </View>
              <Text style={[styles.gratitudePrompt, { color: theme.text }]}>Apa 1 hal baik atau kecil yang kamu syukuri hari ini?</Text>

              <View style={styles.gratitudeInputRow}>
                <TextInput
                  style={[styles.gratitudeInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Misal: Kuis lancar, teman suportif..."
                  placeholderTextColor={theme.muted}
                  value={gratitudeText}
                  onChangeText={setGratitudeText}
                />
                <TouchableOpacity
                  style={[
                    styles.gratitudeSaveBtn,
                    { backgroundColor: theme.primary },
                    !gratitudeText.trim() && { backgroundColor: isLightMode ? '#E2E8F0' : '#261F2C' }
                  ]}
                  onPress={handleSaveGratitude}
                  disabled={!gratitudeText.trim() || savingGratitude}
                >
                  {savingGratitude ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={14} color={!gratitudeText.trim() ? theme.muted : '#FFFFFF'} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* 8. Catatan Jurnal Terakhir (Recent Reflections) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { color: theme.subtext }]}>JURNAL TERAKHIR</Text>
              <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('Journal')}>
                <Text style={[styles.seeAllText, { color: theme.accentLight }]}>Lihat Semua →</Text>
              </TouchableOpacity>
            </View>

            {recentEntries.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="book-outline" size={24} color={theme.muted} style={{ marginBottom: 6 }} />
                <Text style={[styles.emptyCardTitle, { color: theme.text }]}>Belum ada jurnal</Text>
                <Text style={[styles.emptyCardSub, { color: theme.subtext }]}>Mulai simpan kenangan dan keluh kesahmu hari ini.</Text>
              </View>
            ) : (
              recentEntries.slice(0, 3).map(entry => {
                const mood = moods.find(m => m.type === entry.mood);
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.recentItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => navigation.navigate('JournalEntry', { entryId: entry.id })}
                  >
                    <View style={styles.recentTop}>
                      <Text style={[styles.recentTitle, { color: theme.text }]} numberOfLines={1}>
                        {entry.title || 'Catatan Harian'}
                      </Text>
                      <Text style={styles.recentEmoji}>{mood?.emoji || '•'}</Text>
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

        </View>

        </View>
      </ScrollView>
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
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 50,
  },
  scrollContentWide: {
    paddingHorizontal: 28,
  },
  innerContainer: {
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1440,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
  },
  greetingText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usernameText: {
    color: '#F3F4F6',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242C3B',
    gap: 6,
  },
  streakNumber: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
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
    gap: 12,
    backgroundColor: '#261C08',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  announcementIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#3E2A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementLabel: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  announcementText: {
    color: '#FEF3C7',
    fontSize: 12.5,
    lineHeight: 17,
  },
  quickHubCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  quickHubTitle: {
    color: '#6B7280',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  quickHubGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quickHubBtn: {
    flex: 1,
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1C2330',
  },
  quickHubIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickHubBtnText: {
    color: '#F3F4F6',
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickHubBtnSub: {
    color: '#6B7280',
    fontSize: 9,
    marginTop: 1,
    textAlign: 'center',
  },
  wisdomCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  wisdomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wisdomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wisdomBadgeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  refreshWisdomBtn: {
    padding: 4,
  },
  wisdomText: {
    color: '#E5E7EB',
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  mainLayout: {
    flexDirection: 'column',
    gap: 14,
  },
  mainLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    gap: 14,
  },
  card: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardCategory: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  cardDate: {
    color: '#4B5565',
    fontSize: 11,
  },
  cardActionLink: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
  },
  tasksListWrap: {
    gap: 8,
  },
  taskCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0E1117',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1C2330',
  },
  taskCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#4B5565',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskItemTitle: {
    color: '#F3F4F6',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 3,
  },
  taskItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskSubjectBadge: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: '#111A2E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taskDueDateBadge: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#261C08',
  },
  priorityBadgeHigh: {
    backgroundColor: '#2D1418',
  },
  priorityBadgeLow: {
    backgroundColor: '#101B2E',
  },
  priorityBadgeText: {
    color: '#FBBF24',
    fontSize: 9.5,
    fontWeight: '700',
  },
  homeDraftCard: {
    backgroundColor: '#1C1608',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#B45309',
    marginBottom: 10,
  },
  homeDraftTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  homeDraftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  homeDraftBadgeText: {
    color: '#FBBF24',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  homeDraftTimeText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '600',
  },
  homeDraftTitle: {
    color: '#FEF3C7',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  homeDraftSnippet: {
    color: '#D1D5DB',
    fontSize: 11,
  },
  notesMiniList: {
    gap: 8,
  },
  noteMiniCard: {
    backgroundColor: '#0E1117',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1C2330',
  },
  noteMiniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteSubjectPill: {
    backgroundColor: '#1A1830',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noteSubjectPillText: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '600',
  },
  noteMiniDate: {
    color: '#6B7280',
    fontSize: 10,
  },
  noteMiniTitle: {
    color: '#F3F4F6',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  noteMiniBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  miniAiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#111A2E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniAiBadgeText: {
    color: '#60A5FA',
    fontSize: 9.5,
    fontWeight: '600',
  },
  emptyInlineBox: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  emptyInlineTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyInlineSub: {
    color: '#6B7280',
    fontSize: 10.5,
    textAlign: 'center',
  },
  checkInTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkInSubtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 14,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodOption: {
    flex: 1,
    minWidth: 64,
    backgroundColor: '#10131A',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  moodOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#151D2A',
  },
  moodEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  moodText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  moodTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  calmPill: {
    backgroundColor: '#101B2E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  calmPillText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
  },
  breathworkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  breathCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#101B2E',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  breathTextContainer: {
    flex: 1,
  },
  breathPhaseText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
  },
  breathSubText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 1,
  },
  breathBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  breathBtnActive: {
    backgroundColor: '#DC2626',
  },
  breathBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  questProgressText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '600',
  },
  questProgressBarBg: {
    height: 5,
    backgroundColor: '#1E2430',
    borderRadius: 3,
    marginVertical: 10,
    overflow: 'hidden',
  },
  questProgressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  questList: {
    gap: 8,
  },
  questItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10131A',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  questItemCompleted: {
    borderColor: '#192823',
    backgroundColor: '#0D1A16',
  },
  questCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#263042',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  questCheckCircleActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  questTitle: {
    color: '#E5E7EB',
    fontSize: 12,
    flex: 1,
  },
  questTitleCompleted: {
    color: '#6B7280',
    textDecorationLine: 'line-through',
  },
  gratitudePrompt: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 10,
  },
  gratitudeInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gratitudeInput: {
    flex: 1,
    backgroundColor: '#10131A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F4F6',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  gratitudeSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EC4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gratitudeSaveDisabled: {
    backgroundColor: '#261F2C',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeader: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  seeAllText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyCardTitle: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCardSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  recentItem: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  recentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recentTitle: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  recentEmoji: {
    fontSize: 15,
  },
  recentContent: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  recentDate: {
    color: '#6B7280',
    fontSize: 10,
  },
});
