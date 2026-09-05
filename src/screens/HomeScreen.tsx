import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, Animated, Easing, Platform, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme, getSemanticColors } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
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
  getCachedNotes,
  getCachedTasks,
  getCachedJournals,
  cacheTasksLocally,
  cacheJournalsLocally,
  processOfflineSyncQueue,
  queueOfflineAction,
} from '../lib/offlineSync';
import {
  scheduleDailyRoutineReminders,
  scheduleStreakProtectionReminder,
  notifyBossEventSpawned,
  notifyLuckyHourActivated,
} from '../lib/notifications';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import {
  XpPopup,
  ConfettiBurst,
  StreakFlamePulse,
  QuestBounceWrapper,
  MilestoneCelebrate,
  FloatingBadge,
  FadeSlideIn,
  AnimatedProgressBar,
} from '../components/DuolingoAnimations';
import { calculateUserXp } from '../lib/xpCalculator';
import { getGamificationConfig, GamificationConfig } from '../lib/gamificationConfig';
import VirtualGardenModal from '../components/VirtualGardenModal';
import { getExtraUserXp, addExtraUserXp } from '../lib/rpgStorage';
import DailyRewardModal from '../components/DailyRewardModal';
import { checkDailyReward, claimDailyReward, DailyReward, DAILY_REWARD_SCHEDULE } from '../lib/dailyRewardStorage';
import LootChestModal from '../components/LootChestModal';
import LuckyWheelModal from '../components/LuckyWheelModal';
import {
  getChestCount,
  getWheelTickets,
  getActiveTitle,
  unlockTitle,
  addChest,
  awardWheelTicketForActivity,
  RpgTitle,
  LootResult,
} from '../lib/lootChestStorage';
import { addWaterDrops } from '../lib/gardenStorage';
import BossEventBanner from '../components/BossEventBanner';
import BattlePassModal from '../components/BattlePassModal';
import LuckyHourBanner from '../components/LuckyHourBanner';
import QuizBattleModal from '../components/QuizBattleModal';
import { BossEvent, trySpawnBossEvent, defeatBossEvent } from '../lib/bossEventStorage';
import { LuckyHourStatus, getLuckyHourStatus, tryTriggerLuckyHour, LUCKY_HOUR_MULTIPLIER } from '../lib/luckyHourStorage';
import { getBattlePassProgress, addBattlePassXp } from '../lib/battlePassStorage';

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

  // Duolingo-style Animation States
  const [showXpPopup, setShowXpPopup] = useState(false);
  const [xpAmount, setXpAmount] = useState(10);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showGardenModal, setShowGardenModal] = useState(false);
  const [extraXp, setExtraXp] = useState(0);
  const [gameConfig, setGameConfig] = useState<GamificationConfig | null>(null);
  const [streakJustIncreased] = useState(false);

  // Daily Reward Modal State
  const [showDailyRewardModal, setShowDailyRewardModal] = useState(false);
  const [pendingDailyReward, setPendingDailyReward] = useState(false);
  const [dailyRewardData, setDailyRewardData] = useState<DailyReward>(DAILY_REWARD_SCHEDULE[0]);
  const [dailyRewardStreak, setDailyRewardStreak] = useState(1);

  // Loot Chest & Lucky Wheel State
  const [showChestModal, setShowChestModal] = useState(false);
  const [showWheelModal, setShowWheelModal] = useState(false);
  const [chestCount, setChestCount] = useState(0);
  const [wheelTickets, setWheelTickets] = useState(0);
  const [activeTitle, setActiveTitle] = useState<RpgTitle | null>(null);

  // Boss Event State
  const [activeBossEvent, setActiveBossEvent] = useState<BossEvent | null>(null);
  const [showBossEventDismissed, setShowBossEventDismissed] = useState(false);
  const [showBossBattleModal, setShowBossBattleModal] = useState(false);
  const [bossQuizQuestions, setBossQuizQuestions] = useState<any[]>([]);
  const [loadingBossBattle, setLoadingBossBattle] = useState(false);

  // Battle Pass State
  const [showBattlePassModal, setShowBattlePassModal] = useState(false);
  const [battlePassTier, setBattlePassTier] = useState(1);

  // Lucky Hour State
  const [luckyHour, setLuckyHour] = useState<LuckyHourStatus>({ active: false, expiresAt: 0, remainingMs: 0 });

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
    // Always load local gamification resources (Hadiah, Tiket Roda, Gelar)
    try {
      const [chests, tickets, title] = await Promise.all([
        getChestCount(),
        getWheelTickets(),
        getActiveTitle(),
      ]);
      setChestCount(chests);
      setWheelTickets(tickets);
      setActiveTitle(title);
    } catch (e) {
      console.log('Error loading gamification storage:', e);
    }

    // Sync admin gamification config (XP difficulty multiplier, dsb.)
    try {
      const cfg = await getGamificationConfig();
      setGameConfig(cfg);
    } catch (e) {
      console.log('Error loading gamification config:', e);
    }

    if (!user) {
      setUsername('Mahasiswa');
      loadDailyQuests();
      setLoading(false);
      return;
    }

    try {
      const [notes, tasks, journals, cachedProfile, localMoodHistoryRaw] = await Promise.all([
        getCachedNotes(user.id),
        getCachedTasks(user.id),
        getCachedJournals(user.id),
        AsyncStorage.getItem('@user_profile_cache_' + user.id).then(r => r ? JSON.parse(r) : null),
        AsyncStorage.getItem(`@mood_history_${user.id}`).then(r => r ? JSON.parse(r) : []),
      ]);

      const fetchedUsername = cachedProfile?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'Mahasiswa';
      setUsername(fetchedUsername);

      const activeTasks = (tasks || []).filter((t: StudentTask) => !t.is_completed);
      setUpcomingTasks(activeTasks.slice(0, 6));
      setPendingTasksCount(activeTasks.length);

      setRecentStudyNotes((notes || []).slice(0, 4));
      setTotalNotesCount((notes || []).length);

      const journalList: JournalEntry[] = journals || [];
      setRecentEntries(journalList.slice(0, 4));

      const todayStr = new Date().toDateString();
      const todayEntry = journalList.find((e: JournalEntry) => new Date(e.created_at).toDateString() === todayStr);
      const todayMoodHistory = (localMoodHistoryRaw || []).find((m: any) => new Date(m.created_at || m.date).toDateString() === todayStr);
      const calculatedTodayMood = todayEntry?.mood || todayMoodHistory?.mood || null;
      setTodayMood(calculatedTodayMood);

      const hasTodayJournal = !!todayEntry;
      const hasTodayChat = false;

      const allTimestamps: string[] = [
        ...journalList.map((d: JournalEntry) => d.created_at),
        ...(notes || []).map((d: StudyNote) => d.created_at),
        ...(tasks || []).map((d: StudentTask) => d.created_at),
        ...(localMoodHistoryRaw || []).map((m: any) => m.created_at || m.date),
      ].filter(Boolean);

      const calculatedStreak = calculateRealStreak(allTimestamps);
      setStreak(calculatedStreak);

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

      const earnedExtraXp = await getExtraUserXp();
      setExtraXp(earnedExtraXp);

      // Check Daily Login Reward
      try {
        const rewardCheck = await checkDailyReward();
        if (rewardCheck.shouldShow) {
          setDailyRewardData(rewardCheck.reward);
          setDailyRewardStreak(rewardCheck.streak);
          // Tunda tampilan modal sampai loading utama selesai
          setPendingDailyReward(true);
        }
      } catch (e) {
        console.log('Daily reward check error:', e);
      }

      // Check Loot Chests, Wheel Tickets, Active Title, Battle Pass & Boss Event
      try {
        const [chests, tickets, title, bp, bEvent, lhStatus] = await Promise.all([
          getChestCount(),
          getWheelTickets(),
          getActiveTitle(),
          getBattlePassProgress(),
          trySpawnBossEvent(),
          getLuckyHourStatus(),
        ]);
        setChestCount(chests);
        setWheelTickets(tickets);
        setActiveTitle(title);
        if (bp) setBattlePassTier(bp.currentTier);
        if (bEvent && !bEvent.defeated) {
          setActiveBossEvent(bEvent);
        } else {
          setActiveBossEvent(null);
        }

        if (lhStatus.active) {
          setLuckyHour(lhStatus);
        } else {
          // Attempt random Lucky Hour trigger (18% chance)
          const triggered = await tryTriggerLuckyHour();
          if (triggered) {
            const freshLh = await getLuckyHourStatus();
            setLuckyHour(freshLh);
            notifyLuckyHourActivated();
          }
        }
      } catch (e) {
        console.log('Error loading gamification storage:', e);
      }

      loadDailyQuests(hasTodayChat, hasTodayJournal);
    } catch (e) {
      console.log('HomeScreen fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, loadDailyQuests]);

  useEffect(() => {
    fetchData();
    scheduleDailyRoutineReminders();
    if (streak > 0) {
      scheduleStreakProtectionReminder(streak);
    }

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

  // Tampilkan modal Daily Reward hanya setelah loading utama selesai
  useEffect(() => {
    if (!loading && pendingDailyReward) {
      setPendingDailyReward(false);
      setShowDailyRewardModal(true);
    }
  }, [loading, pendingDailyReward]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const toggleQuest = (id: string) => {
    const target = quests.find(q => q.id === id);
    const willComplete = target && !target.completed;

    const updated = quests.map(q => q.id === id ? { ...q, completed: !q.completed } : q);
    saveDailyQuests(updated);

    if (willComplete) {
      // XP Pop-up animasi
      const earned = 10 + Math.floor(Math.random() * 6) * 5; // 10-35 XP
      setXpAmount(earned);
      setShowXpPopup(false);
      setTimeout(() => setShowXpPopup(true), 50);

      // Kalau semua quest selesai → confetti!
      const nowCompleted = updated.filter(q => q.completed).length;
      if (nowCompleted === updated.length) {
        setTimeout(() => {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }, 400);
      }
    }
  };

  const toggleTaskDirectly = async (taskId: string) => {
    setUpcomingTasks(prev => prev.filter(t => t.id !== taskId));
    setPendingTasksCount(prev => Math.max(0, prev - 1));
    if (user) {
      const currentTasks = await getCachedTasks(user.id);
      const updated = currentTasks.map(t => t.id === taskId ? { ...t, is_completed: true } : t);
      await cacheTasksLocally(user.id, updated);
    }

    // XP calculation with 2x Lucky Hour bonus
    const baseTaskXp = 20;
    const isLh = luckyHour.active && luckyHour.expiresAt > Date.now();
    const finalXp = isLh ? baseTaskXp * LUCKY_HOUR_MULTIPLIER : baseTaskXp;

    // XP Pop-up animasi + Water + Chest + Ticket + Battle Pass
    setXpAmount(finalXp);
    setShowXpPopup(false);
    setTimeout(() => setShowXpPopup(true), 50);
    await addWaterDrops(1).catch(() => {});
    await addChest(1).catch(() => {});
    await awardWheelTicketForActivity().catch(() => {});
    const bpResult = await addBattlePassXp(finalXp).catch(() => null);
    if (bpResult && bpResult.newTier > bpResult.prevTier) {
      setBattlePassTier(bpResult.newTier);
    }

    getChestCount().then(setChestCount);
    getWheelTickets().then(setWheelTickets);
    showAlert(
      isLh ? '⚡ LUCKY HOUR BONUS! Tugas Selesai! 🎉' : 'Tugas Selesai! 🎉',
      `+${finalXp} XP ${isLh ? '(2X XP Aktif! 🔥)' : ''}, +1 Tetes Air 💧, +1 Kotak Hadiah 🎁, dan +1 Tiket Roda 🎰!`
    );
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

    if (user) {
      const cached = await getCachedJournals(user.id);
      const newEntry: JournalEntry = {
        id: `journal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: user.id,
        title: 'Refleksi Syukur Hari Ini',
        content,
        mood: 'happy',
        tags: ['syukur', 'mindfulness'],
        image_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await cacheJournalsLocally(user.id, [newEntry, ...cached]);
    }
    setGratitudeText('');
    setSavingGratitude(false);
    showAlert('Tersimpan', 'Catatan rasa syukur berhasil disimpan ke Jurnal.');
  };

  // Grand Boss Raid Battle from all Study Notes
  const handleChallengeBoss = async () => {
    if (!activeBossEvent) return;

    setLoadingBossBattle(true);
    try {
      // 1. Fetch user's study notes across all subjects
      let notesData: StudyNote[] = [];
      if (user) {
        try {
          const { data } = await supabase
            .from('study_notes')
            .select('title, subject, content')
            .eq('user_id', user.id)
            .limit(12);
          if (data && data.length > 0) {
            notesData = data as any;
          } else {
            notesData = await getCachedNotes(user.id);
          }
        } catch {
          notesData = await getCachedNotes(user.id);
        }
      }

      // 2. Build comprehensive summary across all notes
      let notesContext = '';
      if (notesData && notesData.length > 0) {
        notesContext = notesData
          .map((n, i) => `Catatan ${i + 1} [${n.subject || 'Umum'} - ${n.title}]:\n${(n.content || '').substring(0, 450)}`)
          .join('\n\n');
      } else {
        notesContext = 'Materi umum sains, teknologi, matematika, logika, sejarah, dan wawasan akademik mahasiswa.';
      }

      // 3. Prompt AI to craft grand boss raid quiz
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
          },
          {
            question: 'Mengapa membuat catatan dalam bentuk poin terstruktur lebih baik daripada menyalin satu buku?',
            options: ['Memaksa otak memproses dan menyaring informasi penting', 'Agar tulisan terlihat lebih sedikit saja', 'Supaya tidak menghabiskan tinta pulpen', 'Tidak ada bedanya dengan menyalin buku'],
            correctIndex: 0,
            explanation: 'Menyusun poin terstruktur melatih otak memilah konsep esensial dari materi.',
          },
          {
            question: 'Apa kunci utama konsistensi belajar jangka panjang?',
            options: ['Ritme harian yang realistis dan istirahat teratur', 'Belajar 18 jam sehari tanpa tidur', 'Hanya belajar saat mood sedang sangat bagus', 'Menunggu sehari sebelum ujian'],
            correctIndex: 0,
            explanation: 'Kebiasaan kecil yang konsisten setiap hari jauh lebih berdampak daripada ledakan belajar yang sporadis.',
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
    await addExtraUserXp(currentEvent.rewards.xp);
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

    // Refresh user gamification counts
    getChestCount().then(setChestCount);
    getWheelTickets().then(setWheelTickets);
    getActiveTitle().then(setActiveTitle);

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
  const userLevel = calculateUserXp(totalNotesCount, 0, recentEntries.length, streak, 0, extraXp, gameConfig || undefined);

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
            <QuestBounceWrapper
              key={q.id}
              completed={q.completed}
              onPress={() => toggleQuest(q.id)}
            >
              <View
                style={[
                  styles.questItem,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  q.completed && {
                    backgroundColor: sem.successBg,
                    borderColor: sem.successBorder,
                  }
                ]}
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
              </View>
            </QuestBounceWrapper>
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
        <Text style={[styles.sectionHeader, { color: isLightMode ? theme.text : theme.subtext }]}>JURNAL TERAKHIR</Text>
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
      {/* Container utama dengan position relative agar overlay animasi bekerja */}
      <View style={{ flex: 1, position: 'relative' }}>

        {/* ── Duolingo Animations Overlay ── */}
        <ConfettiBurst visible={showConfetti} count={50} onDone={() => setShowConfetti(false)} />
        <XpPopup
          xp={xpAmount}
          visible={showXpPopup}
          color={isLightMode ? '#D97706' : '#FBBF24'}
          bgColor={isLightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.96)'}
          borderColor={isLightMode ? '#F59E0B' : '#FBBF24'}
          textColor={isLightMode ? '#B45309' : '#FBBF24'}
          onDone={() => setShowXpPopup(false)}
        />
        <MilestoneCelebrate
          visible={showMilestone}
          streak={streak}
          onClose={() => setShowMilestone(false)}
          accentColor={theme.accent}
          cardBg={theme.card}
          textColor={theme.text}
          subtextColor={theme.subtext}
          borderColor={theme.border}
        />
        <VirtualGardenModal
          visible={showGardenModal}
          onClose={() => setShowGardenModal(false)}
        />
        <DailyRewardModal
          visible={showDailyRewardModal}
          reward={dailyRewardData}
          streak={dailyRewardStreak}
          onClaim={async () => {
            await claimDailyReward(dailyRewardStreak);
            setShowDailyRewardModal(false);
            if (dailyRewardData.xp > 0) {
              await addExtraUserXp(dailyRewardData.xp);
              await addBattlePassXp(dailyRewardData.xp);
              setExtraXp(prev => prev + dailyRewardData.xp);
              setXpAmount(dailyRewardData.xp);
              setShowXpPopup(true);
            }
          }}
        />
        <LootChestModal
          visible={showChestModal}
          onClose={() => {
            setShowChestModal(false);
            getChestCount().then(setChestCount);
            getActiveTitle().then(setActiveTitle);
            getExtraUserXp().then(setExtraXp);
          }}
          onRewardClaimed={async (rew) => {
            if (rew.xpAmount && rew.xpAmount > 0) {
              await addExtraUserXp(rew.xpAmount);
              await addBattlePassXp(rew.xpAmount);
              setExtraXp(prev => prev + (rew.xpAmount || 0));
              setXpAmount(rew.xpAmount);
              setShowXpPopup(true);
            }
            if (rew.waterAmount && rew.waterAmount > 0) {
              await addWaterDrops(rew.waterAmount);
            }
            if (rew.titleId) {
              await unlockTitle(rew.titleId);
            }
            getChestCount().then(setChestCount);
            getActiveTitle().then(setActiveTitle);
            getExtraUserXp().then(setExtraXp);
          }}
        />
        <LuckyWheelModal
          visible={showWheelModal}
          onClose={() => {
            setShowWheelModal(false);
            getWheelTickets().then(setWheelTickets);
            getActiveTitle().then(setActiveTitle);
            getExtraUserXp().then(setExtraXp);
          }}
          onRewardClaimed={async (rew) => {
            if (rew.xpAmount && rew.xpAmount > 0) {
              await addExtraUserXp(rew.xpAmount);
              await addBattlePassXp(rew.xpAmount);
              setExtraXp(prev => prev + (rew.xpAmount || 0));
              setXpAmount(rew.xpAmount);
              setShowXpPopup(true);
            }
            if (rew.waterAmount && rew.waterAmount > 0) {
              await addWaterDrops(rew.waterAmount);
            }
            if (rew.titleId) {
              await unlockTitle(rew.titleId);
            }
            getWheelTickets().then(setWheelTickets);
            getActiveTitle().then(setActiveTitle);
            getExtraUserXp().then(setExtraXp);
          }}
        />
        <BattlePassModal
          visible={showBattlePassModal}
          onClose={() => {
            setShowBattlePassModal(false);
            getBattlePassProgress().then(p => p && setBattlePassTier(p.currentTier));
          }}
          currentXp={userLevel.totalXp}
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
              <View style={[styles.bossLoadingIconCircle, { backgroundColor: (activeBossEvent?.color || '#D97706') + '25' }]}>
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

        <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

          {/* Top Bar Greeting, Garden & Streak Indicator */}
          <View style={styles.topBar}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <Text style={[styles.greetingText, { color: isLightMode ? theme.text : theme.accentLight }]}>{greeting}</Text>
              <Text style={[styles.usernameText, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{username || 'Mahasiswa'}</Text>
              {activeTitle && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name={activeTitle.icon as any} size={11} color={activeTitle.color} />
                  <Text style={{ color: activeTitle.color, fontSize: 10.5, fontWeight: '800' }} numberOfLines={1}>
                    [{activeTitle.label}]
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.streakPill, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setShowGardenModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="leaf" size={14} color="#10B981" />
                <Text style={[styles.streakNumber, { color: theme.text }]}>Taman</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.streakPill, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => {
                  // Tampilkan milestone kalau streak cocok
                  if ([7, 14, 30, 60, 100].includes(streak)) {
                    setShowMilestone(true);
                  } else {
                    showAlert('Streak Keaktifan', `Kamu sudah aktif ${streak} hari berturut-turut belajar dan berefleksi. Pertahankan ritmemu!`);
                  }
                }}
                activeOpacity={0.7}
              >
                <StreakFlamePulse streak={streak} color={sem.warning} size={15} isActive={streakJustIncreased} />
                <Text style={[styles.streakNumber, { color: theme.text }]}>{streak} Hari</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Lucky Hour Banner */}
          {luckyHour.active && (
            <LuckyHourBanner
              expiresAt={luckyHour.expiresAt}
              remainingMs={luckyHour.remainingMs}
              onClose={() => setLuckyHour({ active: false, expiresAt: 0, remainingMs: 0 })}
            />
          )}

          {/* Boss Event 24h Limited Banner */}
          {activeBossEvent && !activeBossEvent.defeated && !showBossEventDismissed && (
            <BossEventBanner
              event={activeBossEvent}
              onChallenge={handleChallengeBoss}
              onDismiss={() => setShowBossEventDismissed(true)}
            />
          )}

          {/* Level & XP Gamification Card */}
          <FadeSlideIn delay={150}>
            <TouchableOpacity
              style={[styles.levelCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setShowLevelModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.levelTopRow}>
                <View style={styles.levelBadge}>
                  <FloatingBadge distance={3} duration={1800}>
                    <Text style={styles.levelEmoji}>{userLevel.levelIcon}</Text>
                  </FloatingBadge>
                  <View>
                    <Text style={[styles.levelNameText, { color: theme.text }]}>
                      Level {userLevel.level}: {userLevel.levelTitle}
                    </Text>
                    <Text style={[styles.levelXpSub, { color: theme.subtext }]}>
                      {userLevel.totalXp} XP • {userLevel.progressPercent}% menuju Lv.{userLevel.level + 1}
                    </Text>
                  </View>
                </View>
                <View style={[styles.levelTierBadge, { backgroundColor: theme.accentBg }]}>
                  <Text style={[styles.levelTierText, { color: theme.accentLight }]}>
                    +{userLevel.xpToNextLevel} XP
                  </Text>
                </View>
              </View>

              <AnimatedProgressBar
                percent={userLevel.progressPercent}
                height={6}
                trackColor={theme.cardInner}
                fillColor={theme.primary}
                borderRadius={3}
              />
            </TouchableOpacity>
          </FadeSlideIn>

          {/* Mini-Games / Zona Hadiah 3-Card Row */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            {/* Kotak Hadiah Card */}
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.card,
                borderColor: chestCount > 0 ? '#F59E0B' : theme.border,
                borderWidth: 1,
                borderRadius: 14,
                padding: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              onPress={() => {
                getChestCount().then(setChestCount);
                setShowChestModal(true);
              }}
              activeOpacity={0.8}
            >
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#F59E0B20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="gift" size={16} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }} numberOfLines={1}>Hadiah</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: chestCount > 0 ? '#F59E0B' : theme.subtext }} numberOfLines={1}>
                  {chestCount > 0 ? `${chestCount} 🎁` : 'Habis'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Roda Keberuntungan Card */}
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.card,
                borderColor: wheelTickets > 0 ? theme.card : theme.border,
                borderWidth: 1,
                borderRadius: 14,
                padding: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              onPress={() => {
                getWheelTickets().then(setWheelTickets);
                setShowWheelModal(true);
              }}
              activeOpacity={0.8}
            >
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#EC489920', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="radio-button-on" size={16} color="#EC4899" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }} numberOfLines={1}>Roda</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: wheelTickets > 0 ? '#EC4899' : theme.subtext }} numberOfLines={1}>
                  {wheelTickets > 0 ? `${wheelTickets} 🎰` : 'Habis'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Battle Pass Card */}
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: theme.card,
                borderColor: theme.card,
                borderWidth: 1,
                borderRadius: 14,
                padding: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
              onPress={() => setShowBattlePassModal(true)}
              activeOpacity={0.8}
            >
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#7C3AED20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14 }}>🎖️</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.text }} numberOfLines={1}>Pass</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#A78BFA' }} numberOfLines={1}>
                  Tier {battlePassTier}
                </Text>
              </View>
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
      </View>

      {/* ── Gamified Level Detail Modal ── */}
      <Modal
        visible={showLevelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLevelModal(false)}
      >
        <TouchableOpacity
          style={styles.levelModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowLevelModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.levelModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Modal Top Hero */}
            <View style={styles.levelModalTop}>
              <View style={[styles.levelModalEmojiWrap, { backgroundColor: theme.accentBg }]}>
                <Text style={styles.levelModalBigEmoji}>{userLevel.levelIcon}</Text>
              </View>
              <Text style={[styles.levelModalTitle, { color: theme.text }]}>
                Level {userLevel.level}: {userLevel.levelTitle}
              </Text>
              <Text style={[styles.levelModalSubtitle, { color: theme.subtext }]}>
                Total XP: <Text style={{ color: theme.accentLight, fontWeight: '800' }}>{userLevel.totalXp} XP</Text> • Butuh <Text style={{ color: theme.accentLight, fontWeight: '800' }}>{userLevel.xpToNextLevel} XP</Text> lagi menuju Lv.{userLevel.level + 1}
              </Text>

              <View style={{ width: '100%', marginTop: 12 }}>
                <AnimatedProgressBar
                  percent={userLevel.progressPercent}
                  height={8}
                  trackColor={theme.cardInner}
                  fillColor={theme.primary}
                  borderRadius={4}
                />
              </View>
            </View>

            {/* Left-Aligned Clean XP Breakdown Guide */}
            <View style={[styles.xpGuideBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="information-circle" size={15} color={theme.accentLight} />
                <Text style={[styles.xpGuideHeader, { color: theme.text }]}>Cara Mengumpulkan XP:</Text>
              </View>

              <View style={styles.xpGuideItem}>
                <View style={[styles.xpGuideIconCircle, { backgroundColor: '#6366F115' }]}>
                  <Ionicons name="radio-button-on" size={16} color="#818CF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.xpGuideTitle, { color: theme.text }]}>Misi Ketenangan Harian</Text>
                  <Text style={[styles.xpGuideSub, { color: theme.subtext }]}>Selesaikan 4 misi relaksasi & refleksi</Text>
                </View>
                <Text style={[styles.xpEarnBadge, { color: '#10B981' }]}>+10-35 XP</Text>
              </View>

              <View style={styles.xpGuideItem}>
                <View style={[styles.xpGuideIconCircle, { backgroundColor: '#3B82F615' }]}>
                  <Ionicons name="document-text" size={16} color="#60A5FA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.xpGuideTitle, { color: theme.text }]}>Buat Catatan Materi Kuliah</Text>
                  <Text style={[styles.xpGuideSub, { color: theme.subtext }]}>Tulis ringkasan atau scan foto buku</Text>
                </View>
                <Text style={[styles.xpEarnBadge, { color: '#10B981' }]}>+25 XP</Text>
              </View>

              <View style={styles.xpGuideItem}>
                <View style={[styles.xpGuideIconCircle, { backgroundColor: '#10B98115' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.xpGuideTitle, { color: theme.text }]}>Selesaikan Tugas Kuliah</Text>
                  <Text style={[styles.xpGuideSub, { color: theme.subtext }]}>Centang tugas atau subtask pengerjaan</Text>
                </View>
                <Text style={[styles.xpEarnBadge, { color: '#10B981' }]}>+20 XP</Text>
              </View>

              <View style={styles.xpGuideItem}>
                <View style={[styles.xpGuideIconCircle, { backgroundColor: '#8B5CF615' }]}>
                  <Ionicons name="chatbubble-ellipses" size={16} color="#A78BFA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.xpGuideTitle, { color: theme.text }]}>Tulis Jurnal Refleksi</Text>
                  <Text style={[styles.xpGuideSub, { color: theme.subtext }]}>Refleksikan perasaan & mood harian</Text>
                </View>
                <Text style={[styles.xpEarnBadge, { color: '#10B981' }]}>+15 XP</Text>
              </View>

              <View style={[styles.xpGuideItem, { borderBottomWidth: 0 }]}>
                <View style={[styles.xpGuideIconCircle, { backgroundColor: '#F59E0B15' }]}>
                  <Ionicons name="flame" size={16} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.xpGuideTitle, { color: theme.text }]}>Jaga Streak Keaktifan</Text>
                  <Text style={[styles.xpGuideSub, { color: theme.subtext }]}>Aktif belajar berturut-turut setiap hari</Text>
                </View>
                <Text style={[styles.xpEarnBadge, { color: '#F59E0B' }]}>+30 XP/hari</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.levelModalCloseBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowLevelModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.levelModalCloseBtnText}>Mengerti, Siap Belajar! 🚀</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  usernameText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 1,
    flexShrink: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  streakNumber: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  levelCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginVertical: 4,
  },
  levelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  levelEmoji: {
    fontSize: 22,
  },
  levelNameText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  levelXpSub: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  levelTierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelTierText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  levelModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 15, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  levelModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  levelModalTop: {
    alignItems: 'center',
    marginBottom: 20,
  },
  levelModalEmojiWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelModalBigEmoji: {
    fontSize: 34,
  },
  levelModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 4,
  },
  levelModalSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  xpGuideBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  xpGuideHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  xpGuideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  xpGuideIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpGuideTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  xpGuideSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  xpEarnBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  levelModalCloseBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  levelModalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
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
