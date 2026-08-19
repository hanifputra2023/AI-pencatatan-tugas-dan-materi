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
import { supabase } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
import { JournalEntry } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert } from '../lib/alert';

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [username, setUsername] = useState('');
  const [todayMood, setTodayMood] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
        } catch (e) {}
      } else if (user?.user_metadata?.[`quests_${today}`]) {
        const cloudQuests = user.user_metadata[`quests_${today}`];
        if (Array.isArray(cloudQuests)) {
          currentQuests = currentQuests.map(def => {
            const found = cloudQuests.find((p: any) => p.id === def.id);
            return found ? { ...def, completed: !!found.completed } : def;
          });
        }
      }

      // Auto-mark completed if student performed actions today
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

  // -------------------------------------------------------------
  // Save Daily Quests to Local Storage & Supabase Cloud
  // -------------------------------------------------------------
  const saveDailyQuests = async (updated: typeof DEFAULT_DAILY_QUESTS) => {
    const today = getTodayDateString();
    const storageKey = getQuestStorageKey(user?.id, today);
    setQuests(updated);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}
  };

  const fetchData = useCallback(async () => {
    if (!user) {
      setUsername('Sobat');
      loadDailyQuests();
      setLoading(false);
      return;
    }
    const [profileRes, recentRes, journalDatesRes, chatDatesRes] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', user.id).single(),
      supabase.from('journal_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6),
      supabase.from('journal_entries').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('chat_messages').select('created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(100),
    ]);

    if (profileRes.data) setUsername(profileRes.data.username || 'Kamu');
    
    let hasTodayJournal = false;
    let hasTodayChat = false;

    if (recentRes.data) {
      const entries = recentRes.data as JournalEntry[];
      setRecentEntries(entries);
      const todayStr = new Date().toDateString();
      const todayEntry = entries.find(e => new Date(e.created_at).toDateString() === todayStr);
      setTodayMood(todayEntry ? todayEntry.mood : null);
      hasTodayJournal = !!todayEntry;
    }

    if (chatDatesRes.data) {
      const todayStr = new Date().toDateString();
      hasTodayChat = chatDatesRes.data.some(c => new Date(c.created_at).toDateString() === todayStr);
    }

    // Combine all active dates from journals + chat messages
    const allTimestamps: string[] = [
      ...(journalDatesRes.data?.map(d => d.created_at) || []),
      ...(chatDatesRes.data?.map(d => d.created_at) || []),
    ];
    calculateRealStreak(allTimestamps);

    loadDailyQuests(hasTodayChat, hasTodayJournal);
    setLoading(false);
  }, [user, loadDailyQuests]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const calculateRealStreak = (timestamps: string[]) => {
    if (timestamps.length === 0) {
      setStreak(0);
      return;
    }

    const uniqueDateSet = new Set<string>();
    timestamps.forEach(ts => {
      uniqueDateSet.add(new Date(ts).toDateString());
    });

    let currentStreak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const todayStr = checkDate.toDateString();
    const hasToday = uniqueDateSet.has(todayStr);

    if (hasToday) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // Check yesterday (grace period)
      checkDate.setDate(checkDate.getDate() - 1);
      if (!uniqueDateSet.has(checkDate.toDateString())) {
        setStreak(0);
        return;
      }
    }

    // Count backward consecutive days
    while (uniqueDateSet.has(checkDate.toDateString())) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    setStreak(currentStreak);
  };

  // Toggle Quest (Persists immediately to storage & cloud)
  const toggleQuest = (id: string) => {
    const updated = quests.map(q => q.id === id ? { ...q, completed: !q.completed } : q);
    saveDailyQuests(updated);
  };

  const completedQuestsCount = quests.filter(q => q.completed).length;
  const questPercentage = Math.round((completedQuestsCount / quests.length) * 100);

  // Request new AI Wisdom
  const refreshWisdomWithAI = async () => {
    setLoadingWisdom(true);
    try {
      const prompt = `Berikan 1 kalimat kutipan motivasi/mindfulness yang sangat menenangkan, mendalam, dan hangat dalam Bahasa Indonesia untuk seseorang yang ingin menenangkan pikiran. Cukup 1-2 kalimat langsung tanpa basa-basi.`;
      const aiReply = await sendMessageToGemini([], prompt);
      setWisdom(aiReply.trim());
    } catch (e) {
      const randomIndex = Math.floor(Math.random() * WISDOM_PRESETS.length);
      setWisdom(WISDOM_PRESETS[randomIndex]);
    } finally {
      setLoadingWisdom(false);
    }
  };

  // Save Quick Gratitude Note directly to Journal
  const handleSaveGratitude = async () => {
    if (!gratitudeText.trim()) return;
    setSavingGratitude(true);
    try {
      if (user) {
        await supabase.from('journal_entries').insert({
          user_id: user.id,
          title: '✨ Rasa Syukur Hari Ini',
          content: gratitudeText.trim(),
          mood: 'happy',
          tags: ['syukur', 'mindfulness'],
        });
      }
      setGratitudeText('');
      showAlert('Tersimpan 🤍', 'Catatan rasa syukur kamu berhasil disimpan ke Jurnal.');
      const updated = quests.map(q => q.id === '4' ? { ...q, completed: true } : q);
      saveDailyQuests(updated);
    } catch (e: any) {
      showAlert('Gagal Menyimpan', e.message || 'Terjadi kesalahan.');
    } finally {
      setSavingGratitude(false);
    }
  };

  // Guided Breathwork Controller
  const startBreathwork = () => {
    if (isBreathing) {
      clearInterval(breathInterval.current);
      setIsBreathing(false);
      Animated.timing(breathAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      return;
    }

    // Auto mark quest 3 (Latihan pernapasan 1 menit) as completed!
    const updated = quests.map(q => q.id === '3' ? { ...q, completed: true } : q);
    saveDailyQuests(updated);

    setIsBreathing(true);
    let step = 0; // 0: inhale, 1: hold, 2: exhale
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

  const currentMoodOption = moods.find(m => m.type === todayMood);

  if (loading) {
    return (
      <View style={styles.loaderCenter}>
        <ActivityIndicator size="small" color="#9CA3AF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Top Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greetingText}>{greeting}</Text>
            <Text style={styles.usernameText}>{username || 'Teman'}</Text>
          </View>
          <TouchableOpacity
            style={styles.streakPill}
            onPress={() => showAlert('🔥 Streak Keaktifan', `Kamu sudah aktif ${streak} hari berturut-turut menulis jurnal atau bercerita ke Ara. Terus pertahankan konsistensimu!`)}
          >
            <Ionicons name="flame" size={16} color="#F59E0B" />
            <Text style={styles.streakNumber}>{streak} Hari</Text>
          </TouchableOpacity>
        </View>

        {/* Global Admin Broadcast Announcement Banner */}
        {globalAnnouncement && globalAnnouncement.trim().length > 0 ? (
          <View style={styles.announcementBanner}>
            <View style={styles.announcementIconWrap}>
              <Ionicons name="megaphone" size={15} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.announcementLabel}>PENGUMUMAN KAMPUS</Text>
              <Text style={styles.announcementText}>{globalAnnouncement.trim()}</Text>
            </View>
          </View>
        ) : null}

        {/* Dynamic AI Wisdom Banner */}
        <View style={styles.wisdomCard}>
          <View style={styles.wisdomTopRow}>
            <View style={styles.wisdomBadge}>
              <Ionicons name="sparkles" size={12} color="#60A5FA" />
              <Text style={styles.wisdomBadgeText}>Pesan Kebijaksanaan Hari Ini</Text>
            </View>
            <TouchableOpacity onPress={refreshWisdomWithAI} disabled={loadingWisdom} style={styles.refreshWisdomBtn}>
              {loadingWisdom ? (
                <ActivityIndicator size="small" color="#9CA3AF" />
              ) : (
                <Ionicons name="refresh-outline" size={15} color="#9CA3AF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.wisdomText}>{wisdom}</Text>
        </View>

        {/* Main Grid Layout (Desktop Dual-Column / Mobile Stack) */}
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          
          {/* ========================================================================= */}
          {/* LEFT / MAIN COLUMN */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>
            
            {/* 1. Daily Mood Check-In Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardCategory}>REFLEKSI HARI INI</Text>
                <Text style={styles.cardDate}>
                  {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </View>

              <Text style={styles.checkInTitle}>
                {todayMood
                  ? `Mood tercatat: ${currentMoodOption?.emoji || '•'} ${currentMoodOption?.label || todayMood}`
                  : 'Bagaimana perasaanmu sekarang?'}
              </Text>
              <Text style={styles.checkInSubtitle}>
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
                        isSelected && styles.moodOptionSelected,
                      ]}
                      onPress={() => {
                        setTodayMood(m.type);
                        navigation.navigate('JournalEntry', {});
                      }}
                    >
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodText, isSelected && styles.moodTextSelected]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Interactive Breathwork Studio (Pernapasan Relaksasi 1 Menit) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardCategory}>LATIHAN PERNAPASAN 4-4-4</Text>
                <View style={styles.calmPill}>
                  <Text style={styles.calmPillText}>Relaksasi</Text>
                </View>
              </View>

              <View style={styles.breathworkContainer}>
                <Animated.View style={[styles.breathCircle, { transform: [{ scale: breathAnim }] }]}>
                  <Ionicons name="leaf" size={24} color={isBreathing ? '#38BDF8' : '#64748B'} />
                </Animated.View>

                <View style={styles.breathTextContainer}>
                  <Text style={styles.breathPhaseText}>
                    {isBreathing ? `${breathPhase} (${breathSeconds}s)` : 'Tarik Napas & Rileks'}
                  </Text>
                  <Text style={styles.breathSubText}>
                    {isBreathing ? 'Fokuskan pikiran pada aliran napasmu' : 'Luangkan 1 menit untuk meredakan overthinking'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.breathBtn, isBreathing && styles.breathBtnActive]}
                  onPress={startBreathwork}
                >
                  <Ionicons name={isBreathing ? 'pause' : 'play'} size={15} color="#FFFFFF" />
                  <Text style={styles.breathBtnText}>{isBreathing ? 'Hentikan' : 'Mulai'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 3. Quick Action shortcuts */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.getParent()?.navigate('Chat')}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#E5E7EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>Cerita ke {aiBotName || 'Ara'}</Text>
                  <Text style={styles.actionDesc}>Mulai sesi refleksi baru</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color="#6B7280" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('JournalEntry', {})}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="create-outline" size={18} color="#E5E7EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>Tulis Jurnal</Text>
                  <Text style={styles.actionDesc}>Tuangkan catatan bebas</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color="#6B7280" />
              </TouchableOpacity>
            </View>

          </View>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1 }]}>
            
            {/* 4. Misi Ketenangan Harian (Daily Mindfulness Quests) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardCategory}>MISI HARIAN</Text>
                <Text style={styles.questProgressText}>{completedQuestsCount}/{quests.length} Selesai ({questPercentage}%)</Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.questProgressBarBg}>
                <View style={[styles.questProgressBarFill, { width: `${questPercentage}%` as any }]} />
              </View>

              <View style={styles.questList}>
                {quests.map(q => (
                  <TouchableOpacity
                    key={q.id}
                    style={[styles.questItem, q.completed && styles.questItemCompleted]}
                    onPress={() => toggleQuest(q.id)}
                  >
                    <View style={[styles.questCheckCircle, q.completed && styles.questCheckCircleActive]}>
                      {q.completed && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Ionicons name={q.icon as any} size={16} color={q.completed ? '#6B7280' : '#9CA3AF'} style={{ marginRight: 6 }} />
                    <Text style={[styles.questTitle, q.completed && styles.questTitleCompleted]}>
                      {q.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 5. Kotak Syukur Cepat (Quick Gratitude Box) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardCategory}>KOTAK RASA SYUKUR</Text>
                <Ionicons name="heart" size={14} color="#EC4899" />
              </View>
              <Text style={styles.gratitudePrompt}>Apa 1 hal baik atau kecil yang kamu syukuri hari ini?</Text>
              
              <View style={styles.gratitudeInputRow}>
                <TextInput
                  style={styles.gratitudeInput}
                  placeholder="Misal: Kopi hangat di pagi hari, teman yang peduli..."
                  placeholderTextColor="#4B5565"
                  value={gratitudeText}
                  onChangeText={setGratitudeText}
                />
                <TouchableOpacity
                  style={[styles.gratitudeSaveBtn, !gratitudeText.trim() && styles.gratitudeSaveDisabled]}
                  onPress={handleSaveGratitude}
                  disabled={!gratitudeText.trim() || savingGratitude}
                >
                  {savingGratitude ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={14} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* 6. Catatan Terakhir (Recent Journal Entries) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>CATATAN TERAKHIR</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Journal')}>
                <Text style={styles.seeAllText}>Lihat Semua</Text>
              </TouchableOpacity>
            </View>

            {recentEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="book-outline" size={24} color="#6B7280" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyCardTitle}>Belum ada jurnal</Text>
                <Text style={styles.emptyCardSub}>Mulai simpan kenangan dan keluh kesahmu hari ini.</Text>
              </View>
            ) : (
              recentEntries.slice(0, 3).map(entry => {
                const mood = moods.find(m => m.type === entry.mood);
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.recentItem}
                    onPress={() => navigation.navigate('JournalEntry', { entryId: entry.id })}
                  >
                    <View style={styles.recentTop}>
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {entry.title || 'Catatan Harian'}
                      </Text>
                      <Text style={styles.recentEmoji}>{mood?.emoji || '•'}</Text>
                    </View>
                    <Text style={styles.recentContent} numberOfLines={2}>{entry.content}</Text>
                    <Text style={styles.recentDate}>
                      {new Date(entry.created_at).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}

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
    backgroundColor: '#0E1117',
  },
  scroll: {
    paddingHorizontal: 18,
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
  announcementBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1E190E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3D3016',
    marginBottom: 12,
  },
  announcementIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#2E2310',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  announcementLabel: {
    color: '#FBBF24',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  announcementText: {
    color: '#FEF3C7',
    fontSize: 12,
    lineHeight: 18,
  },
  wisdomCard: {
    backgroundColor: '#131822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
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
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '600',
  },
  refreshWisdomBtn: {
    padding: 4,
  },
  wisdomText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  mainLayout: {
    gap: 14,
  },
  mainLayoutWide: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
  },
  column: {
    width: '100%',
  },
  card: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardCategory: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardDate: {
    color: '#6B7280',
    fontSize: 11,
  },
  checkInTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkInSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  moodOption: {
    width: '23%',
    backgroundColor: '#10131A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1D2330',
  },
  moodOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#182338',
  },
  moodEmoji: {
    fontSize: 20,
    marginBottom: 3,
  },
  moodText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  moodTextSelected: {
    color: '#F3F4F6',
    fontWeight: '700',
  },
  calmPill: {
    backgroundColor: '#0C2A3D',
    paddingHorizontal: 8,
    paddingVertical: 2,
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
    paddingVertical: 6,
    gap: 14,
  },
  breathCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#101F30',
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
    marginBottom: 2,
  },
  breathSubText: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 16,
  },
  breathBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  breathBtnActive: {
    backgroundColor: '#DC2626',
  },
  breathBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    gap: 8,
    marginBottom: 14,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 12,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1B212D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionDesc: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 1,
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
