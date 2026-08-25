import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_LAST_CLAIM = "@daily_reward_last_claim";
const KEY_STREAK = "@daily_reward_streak";
const KEY_ACHIEVEMENTS = "@achievements_unlocked";

export interface DailyReward {
  day: number;
  xp: number;
  label: string;
  isMega: boolean;
}

export const DAILY_REWARD_SCHEDULE: DailyReward[] = [
  { day: 1, xp: 20,  label: "Selamat Datang!",       isMega: false },
  { day: 2, xp: 30,  label: "Konsisten!",             isMega: false },
  { day: 3, xp: 45,  label: "Luar Biasa!",            isMega: false },
  { day: 4, xp: 60,  label: "Mantap Jiwa!",           isMega: false },
  { day: 5, xp: 75,  label: "Hampir Seminggu!",       isMega: false },
  { day: 6, xp: 90,  label: "Satu Langkah Lagi!",    isMega: false },
  { day: 7, xp: 150, label: "JACKPOT! Seminggu Penuh!", isMega: true },
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export async function checkDailyReward(): Promise<{ shouldShow: boolean; reward: DailyReward; streak: number }> {
  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  const lastClaim = await AsyncStorage.getItem(KEY_LAST_CLAIM);
  const storedStreak = parseInt(await AsyncStorage.getItem(KEY_STREAK) ?? "0", 10);

  if (lastClaim === today) {
    return { shouldShow: false, reward: DAILY_REWARD_SCHEDULE[0], streak: storedStreak };
  }

  let newStreak = 1;
  if (lastClaim === yesterday) newStreak = storedStreak + 1;

  const dayIndex = Math.min(newStreak - 1, DAILY_REWARD_SCHEDULE.length - 1);
  const reward = DAILY_REWARD_SCHEDULE[dayIndex];
  return { shouldShow: true, reward: { ...reward, day: newStreak }, streak: newStreak };
}

export async function claimDailyReward(streak: number): Promise<void> {
  await AsyncStorage.setItem(KEY_LAST_CLAIM, getTodayStr());
  await AsyncStorage.setItem(KEY_STREAK, String(streak));
}

export async function getDailyRewardStreak(): Promise<number> {
  return parseInt(await AsyncStorage.getItem(KEY_STREAK) ?? "0", 10);
}

export type AchievementRarity = "rare" | "epic" | "legendary" | "mythic";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  xpReward: number;
  rarity: AchievementRarity;
  category: "belajar" | "streak" | "boss" | "level";
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  // ── RARE (Langka) ──
  { id: "first_note",   title: "Penulis Pertama",    description: "Buat 1 catatan kuliah pertama",      icon: "document-text",    iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 30,  rarity: "rare", category: "belajar" },
  { id: "note_5",       title: "Arsiparis Kampus",   description: "Tulis 5 catatan kuliah terstruktur", icon: "bookmarks",        iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 50,  rarity: "rare", category: "belajar" },
  { id: "first_quiz",   title: "Petarung Perdana",   description: "Selesaikan 1 kuis RPG pertama",      icon: "flash",            iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 35,  rarity: "rare", category: "belajar" },
  { id: "streak_3",     title: "Langkah Awal",       description: "Pertahankan Streak 3 hari beruntun", icon: "flame",            iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 40,  rarity: "rare", category: "streak" },
  { id: "first_boss",   title: "Pembasmi Monster",   description: "Kalahkan 1 Boss AI pertama",         icon: "skull",            iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 60,  rarity: "rare", category: "boss" },
  { id: "level_3",      title: "Naik Pangkat",       description: "Capai Level 3 Penjelajah Ilmu",      icon: "arrow-up-circle",  iconColor: "#3B82F6", bgColor: "#DBEAFE", xpReward: 50,  rarity: "rare", category: "level" },

  // ── EPIC (Epik) ──
  { id: "note_15",      title: "Pengelola Pustaka",  description: "Koleksi 15 catatan kuliah lengkap",  icon: "library",          iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 100, rarity: "epic", category: "belajar" },
  { id: "quiz_perfect", title: "Akurasi Sempurna",   description: "Jawab seluruh soal kuis 100% benar", icon: "star",             iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 90,  rarity: "epic", category: "belajar" },
  { id: "streak_7",     title: "Pejuang Mingguan",   description: "Pertahankan Streak 7 hari penuh",    icon: "flame",            iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 120, rarity: "epic", category: "streak" },
  { id: "streak_14",    title: "Disiplin Baja",      description: "Pertahankan Streak 14 hari konsisten",icon: "shield",          iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 180, rarity: "epic", category: "streak" },
  { id: "boss_5",       title: "Penakluk Arena",     description: "Kalahkan 5 Boss AI berbeda",         icon: "shield-checkmark", iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 150, rarity: "epic", category: "boss" },
  { id: "level_7",      title: "Sarjana Tangguh",    description: "Capai Level 7 Pendekar Teori",       icon: "trophy",           iconColor: "#8B5CF6", bgColor: "#EDE9FE", xpReward: 150, rarity: "epic", category: "level" },

  // ── LEGENDARY (Legendaris) ──
  { id: "note_40",      title: "Ensiklopedia Hidup", description: "Tulis 40 catatan materi kuliah",     icon: "school",           iconColor: "#F59E0B", bgColor: "#FEF3C7", xpReward: 250, rarity: "legendary", category: "belajar" },
  { id: "streak_30",    title: "Legenda 1 Bulan",    description: "Pertahankan Streak 30 hari tanpa bolong",icon: "medal",         iconColor: "#F59E0B", bgColor: "#FEF3C7", xpReward: 350, rarity: "legendary", category: "streak" },
  { id: "boss_15",      title: "Gladiator Sejati",   description: "Taklukkan 15 Boss AI di Arena",      icon: "diamond",          iconColor: "#F59E0B", bgColor: "#FEF3C7", xpReward: 300, rarity: "legendary", category: "boss" },
  { id: "level_12",     title: "Profesor Kehormatan",description: "Capai Level 12 (15,500+ XP)",        icon: "ribbon",           iconColor: "#F59E0B", bgColor: "#FEF3C7", xpReward: 400, rarity: "legendary", category: "level" },

  // ── MYTHIC (Mitos / Prismatic) ──
  { id: "streak_100",   title: "Sang Dewa Konsistensi",description: "Streak 100 Hari berturut-turut!", icon: "infinite",        iconColor: "#EF4444", bgColor: "#FEE2E2", xpReward: 1000,rarity: "mythic", category: "streak" },
  { id: "note_100",     title: "Perpustakaan Alexandria",description: "Menulis 100 catatan komprehensif",icon: "library-outline", iconColor: "#EF4444", bgColor: "#FEE2E2", xpReward: 800, rarity: "mythic", category: "belajar" },
  { id: "boss_30",      title: "Dewa Perang Akademis",description: "Kalahkan 30 Boss AI tanpa ampun",  icon: "bonfire",          iconColor: "#EF4444", bgColor: "#FEE2E2", xpReward: 900, rarity: "mythic", category: "boss" },
  { id: "level_20",     title: "Ultima Transcendent", description: "Raih Puncak Level 20 (55,000+ XP)", icon: "crown",           iconColor: "#EF4444", bgColor: "#FEE2E2", xpReward: 1500,rarity: "mythic", category: "level" },
];

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
  xpAwarded: number;
}

export async function getUnlockedAchievements(): Promise<UnlockedAchievement[]> {
  const raw = await AsyncStorage.getItem(KEY_ACHIEVEMENTS);
  return raw ? JSON.parse(raw) : [];
}

export async function unlockAchievement(id: string, xp: number): Promise<boolean> {
  const current = await getUnlockedAchievements();
  if (current.find((a) => a.id === id)) return false;
  const updated = [...current, { id, unlockedAt: new Date().toISOString(), xpAwarded: xp }];
  await AsyncStorage.setItem(KEY_ACHIEVEMENTS, JSON.stringify(updated));
  return true;
}

export async function checkAndUnlockAchievements(params: {
  noteCount?: number;
  quizCompleted?: boolean;
  quizPerfect?: boolean;
  streak?: number;
  bossCount?: number;
  userLevel?: number;
}): Promise<Achievement[]> {
  const newlyUnlocked: Achievement[] = [];
  const tryUnlock = async (condition: boolean, ach: Achievement) => {
    if (!condition) return;
    const did = await unlockAchievement(ach.id, ach.xpReward);
    if (did) newlyUnlocked.push(ach);
  };
  const g = (id: string) => ALL_ACHIEVEMENTS.find((a) => a.id === id);
  if (params.noteCount !== undefined) {
    const n1 = g("first_note"); if (n1) await tryUnlock(params.noteCount >= 1, n1);
    const n5 = g("note_5"); if (n5) await tryUnlock(params.noteCount >= 5, n5);
    const n15 = g("note_15"); if (n15) await tryUnlock(params.noteCount >= 15, n15);
    const n40 = g("note_40"); if (n40) await tryUnlock(params.noteCount >= 40, n40);
    const n100 = g("note_100"); if (n100) await tryUnlock(params.noteCount >= 100, n100);
  }
  if (params.quizCompleted) { const q1 = g("first_quiz"); if (q1) await tryUnlock(true, q1); }
  if (params.quizPerfect)   { const qp = g("quiz_perfect"); if (qp) await tryUnlock(true, qp); }
  if (params.streak !== undefined) {
    const s3 = g("streak_3"); if (s3) await tryUnlock(params.streak >= 3, s3);
    const s7 = g("streak_7"); if (s7) await tryUnlock(params.streak >= 7, s7);
    const s14 = g("streak_14"); if (s14) await tryUnlock(params.streak >= 14, s14);
    const s30 = g("streak_30"); if (s30) await tryUnlock(params.streak >= 30, s30);
    const s100 = g("streak_100"); if (s100) await tryUnlock(params.streak >= 100, s100);
  }
  if (params.bossCount !== undefined) {
    const b1 = g("first_boss"); if (b1) await tryUnlock(params.bossCount >= 1, b1);
    const b5 = g("boss_5"); if (b5) await tryUnlock(params.bossCount >= 5, b5);
    const b15 = g("boss_15"); if (b15) await tryUnlock(params.bossCount >= 15, b15);
    const b30 = g("boss_30"); if (b30) await tryUnlock(params.bossCount >= 30, b30);
  }
  if (params.userLevel !== undefined) {
    const l3 = g("level_3"); if (l3) await tryUnlock(params.userLevel >= 3, l3);
    const l7 = g("level_7"); if (l7) await tryUnlock(params.userLevel >= 7, l7);
    const l12 = g("level_12"); if (l12) await tryUnlock(params.userLevel >= 12, l12);
    const l20 = g("level_20"); if (l20) await tryUnlock(params.userLevel >= 20, l20);
  }
  return newlyUnlocked;
}
