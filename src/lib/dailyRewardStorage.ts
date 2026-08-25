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

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  xpReward: number;
  category: "belajar" | "streak" | "boss" | "level";
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: "first_note",   title: "Penulis Pertama",    description: "Buat catatan pertama",              icon: "document-text",    iconColor: "#60A5FA", bgColor: "#DBEAFE", xpReward: 25,  category: "belajar" },
  { id: "note_10",      title: "Pengelola Ilmu",     description: "Buat 10 catatan",                   icon: "library",          iconColor: "#818CF8", bgColor: "#E0E7FF", xpReward: 50,  category: "belajar" },
  { id: "note_50",      title: "Perpustakaan Hidup", description: "Buat 50 catatan",                   icon: "school",           iconColor: "#6366F1", bgColor: "#EEF2FF", xpReward: 150, category: "belajar" },
  { id: "first_quiz",  title: "Pejuang Pertama",    description: "Selesaikan kuis pertama",            icon: "flash",            iconColor: "#F59E0B", bgColor: "#FEF3C7", xpReward: 30,  category: "belajar" },
  { id: "quiz_perfect", title: "Sempurna!",          description: "Jawab semua soal benar",             icon: "star",             iconColor: "#FBBF24", bgColor: "#FEF3C7", xpReward: 75,  category: "belajar" },
  { id: "streak_3",    title: "Pemula Konsisten",   description: "Streak 3 hari berturut",             icon: "flame",            iconColor: "#F97316", bgColor: "#FFEDD5", xpReward: 30,  category: "streak" },
  { id: "streak_7",    title: "Petarung Mingguan",  description: "Streak 7 hari berturut",             icon: "flame",            iconColor: "#EF4444", bgColor: "#FEE2E2", xpReward: 75,  category: "streak" },
  { id: "streak_30",   title: "Legenda Belajar",    description: "Streak 30 hari berturut",            icon: "trophy",           iconColor: "#FBBF24", bgColor: "#FEF9C3", xpReward: 300, category: "streak" },
  { id: "first_boss",  title: "Pembunuh Bos",       description: "Kalahkan bos pertama",               icon: "skull",            iconColor: "#A78BFA", bgColor: "#EDE9FE", xpReward: 50,  category: "boss" },
  { id: "boss_5",      title: "Penakluk Arena",     description: "Kalahkan 5 bos berbeda",             icon: "shield-checkmark", iconColor: "#10B981", bgColor: "#D1FAE5", xpReward: 100, category: "boss" },
  { id: "boss_10",     title: "Dewa Pertarungan",   description: "Kalahkan 10 bos",                    icon: "diamond",          iconColor: "#06B6D4", bgColor: "#CFFAFE", xpReward: 250, category: "boss" },
  { id: "level_5",     title: "Naik Kelas",         description: "Capai Level 5",                      icon: "arrow-up-circle",  iconColor: "#34D399", bgColor: "#D1FAE5", xpReward: 100, category: "level" },
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
  const g = (id: string) => ALL_ACHIEVEMENTS.find((a) => a.id === id)!;
  if (params.noteCount !== undefined) {
    await tryUnlock(params.noteCount >= 1,  g("first_note"));
    await tryUnlock(params.noteCount >= 10, g("note_10"));
    await tryUnlock(params.noteCount >= 50, g("note_50"));
  }
  if (params.quizCompleted) await tryUnlock(true, g("first_quiz"));
  if (params.quizPerfect)   await tryUnlock(true, g("quiz_perfect"));
  if (params.streak !== undefined) {
    await tryUnlock(params.streak >= 3,  g("streak_3"));
    await tryUnlock(params.streak >= 7,  g("streak_7"));
    await tryUnlock(params.streak >= 30, g("streak_30"));
  }
  if (params.bossCount !== undefined) {
    await tryUnlock(params.bossCount >= 1,  g("first_boss"));
    await tryUnlock(params.bossCount >= 5,  g("boss_5"));
    await tryUnlock(params.bossCount >= 10, g("boss_10"));
  }
  if (params.userLevel !== undefined) {
    await tryUnlock(params.userLevel >= 5, g("level_5"));
  }
  return newlyUnlocked;
}
