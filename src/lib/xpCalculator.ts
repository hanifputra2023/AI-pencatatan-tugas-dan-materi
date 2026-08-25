/**
 * xpCalculator.ts
 * Sistem Level & XP Gamifikasi Mahasiswa
 */

export interface UserLevelInfo {
  totalXp: number;
  level: number;
  levelTitle: string;
  levelIcon: string;
  nextLevelXp: number;
  currentLevelMinXp: number;
  progressPercent: number;
  xpToNextLevel: number;
}

export const LEVEL_TIERS = [
  { level: 1, minXp: 0, maxXp: 100, title: 'Mahasiswa Pemula', icon: '🌱' },
  { level: 2, minXp: 100, maxXp: 300, title: 'Pembelajar Aktif', icon: '📖' },
  { level: 3, minXp: 300, maxXp: 650, title: 'Penjelajah Ilmu', icon: '🧭' },
  { level: 4, minXp: 650, maxXp: 1100, title: 'Sarjana Fokus', icon: '🎯' },
  { level: 5, minXp: 1100, maxXp: 1700, title: 'Master Riset', icon: '🔬' },
  { level: 6, minXp: 1700, maxXp: 2500, title: 'Akademisi Hebat', icon: '⚡' },
  { level: 7, minXp: 2500, maxXp: 3500, title: 'Cendekiawan Agung', icon: '👑' },
  { level: 8, minXp: 3500, maxXp: 5000, title: 'Profesor Kehormatan', icon: '🏆' },
];

export function calculateUserXp(
  notesCount: number = 0,
  completedTasksCount: number = 0,
  journalsCount: number = 0,
  streak: number = 0,
  quizAnsweredCorrectly: number = 0,
  extraXp: number = 0
): UserLevelInfo {
  // Formula:
  // - Note dibuat: 25 XP
  // - Tugas diselesaikan: 20 XP
  // - Jurnal refleksi: 15 XP
  // - Kuis dijawab benar: 10 XP
  // - Streak harian: 30 XP per hari aktif
  // - Bonus Bos Pertarungan RPG / Quest: extraXp
  const totalXp = Math.max(
    0,
    notesCount * 25 +
    completedTasksCount * 20 +
    journalsCount * 15 +
    quizAnsweredCorrectly * 10 +
    streak * 30 +
    extraXp
  );

  let currentTier = LEVEL_TIERS[0];
  for (let i = 0; i < LEVEL_TIERS.length; i++) {
    if (totalXp >= LEVEL_TIERS[i].minXp) {
      currentTier = LEVEL_TIERS[i];
    }
  }

  const isMaxLevel = currentTier.level === LEVEL_TIERS[LEVEL_TIERS.length - 1].level;
  const currentLevelMinXp = currentTier.minXp;
  const nextLevelXp = isMaxLevel ? currentTier.maxXp + 1000 : currentTier.maxXp;
  const range = nextLevelXp - currentLevelMinXp;
  const earnedInRange = Math.max(0, totalXp - currentLevelMinXp);
  const progressPercent = Math.min(100, Math.round((earnedInRange / range) * 100));
  const xpToNextLevel = Math.max(0, nextLevelXp - totalXp);

  return {
    totalXp,
    level: currentTier.level,
    levelTitle: currentTier.title,
    levelIcon: currentTier.icon,
    nextLevelXp,
    currentLevelMinXp,
    progressPercent,
    xpToNextLevel,
  };
}
