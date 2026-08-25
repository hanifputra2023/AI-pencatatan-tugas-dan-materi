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
  { level: 1,  minXp: 0,     maxXp: 150,   title: 'Mahasiswa Pemula',         icon: '🌱' },
  { level: 2,  minXp: 150,   maxXp: 400,   title: 'Pembelajar Aktif',         icon: '📖' },
  { level: 3,  minXp: 400,   maxXp: 800,   title: 'Penjelajah Ilmu',          icon: '🧭' },
  { level: 4,  minXp: 800,   maxXp: 1400,  title: 'Sarjana Fokus',            icon: '🎯' },
  { level: 5,  minXp: 1400,  maxXp: 2200,  title: 'Master Riset',             icon: '🔬' },
  { level: 6,  minXp: 2200,  maxXp: 3200,  title: 'Akademisi Hebat',          icon: '⚡' },
  { level: 7,  minXp: 3200,  maxXp: 4500,  title: 'Pendekar Teori',           icon: '⚔️' },
  { level: 8,  minXp: 4500,  maxXp: 6100,  title: 'Arsitek Solusi',           icon: '🏛️' },
  { level: 9,  minXp: 6100,  maxXp: 8000,  title: 'Pakar Multidisiplin',      icon: '🔮' },
  { level: 10, minXp: 8000,  maxXp: 10200, title: 'Cendekiawan Agung',        icon: '👑' },
  { level: 11, minXp: 10200, maxXp: 12700, title: 'Sang Maestro Analisis',    icon: '✨' },
  { level: 12, minXp: 12700, maxXp: 15500, title: 'Profesor Kehormatan',      icon: '🏆' },
  { level: 13, minXp: 15500, maxXp: 18700, title: 'Penjaga Perpustakaan Kuno',icon: '📜' },
  { level: 14, minXp: 18700, maxXp: 22300, title: 'Sage Pengetahuan Murni',  icon: '🌌' },
  { level: 15, minXp: 22300, maxXp: 26300, title: 'Grandmaster Akademik',     icon: '💎' },
  { level: 16, minXp: 26300, maxXp: 30800, title: 'Roh Pencerahan Global',    icon: '🔥' },
  { level: 17, minXp: 30800, maxXp: 35800, title: 'Archmage Filsafat',        icon: '🪐' },
  { level: 18, minXp: 35800, maxXp: 41400, title: 'Dewa Kebijaksanaan',       icon: '🌟' },
  { level: 19, minXp: 41400, maxXp: 47600, title: 'Legenda Abadi Universitas',icon: '🛡️' },
  { level: 20, minXp: 47600, maxXp: 55000, title: 'Ultima Transcendent',      icon: '👑' },
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
