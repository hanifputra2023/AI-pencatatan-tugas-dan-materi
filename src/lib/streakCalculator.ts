/**
 * Helper terpusat untuk menghitung Real Streak Keaktifan Pengguna
 * Menggabungkan aktivitas jurnal dan obrolan AI.
 * 
 * Aturan Streak:
 * 1. Jika hari ini user sudah aktif (jurnal/chat), streak dihitung dari hari ini ke belakang.
 * 2. Jika hari ini user BELUM aktif, tapi KEMARIN aktif, streak kemarin tetap dipertahankan
 *    (belum hangus sampai pergantian hari).
 * 3. Jika kemarin dan hari ini tidak aktif, streak = 0.
 */
export function calculateRealStreak(timestamps: string[]): number {
  if (!timestamps || timestamps.length === 0) {
    return 0;
  }

  const uniqueDateSet = new Set<string>();
  timestamps.forEach(ts => {
    if (ts) {
      uniqueDateSet.add(new Date(ts).toDateString());
    }
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
    checkDate.setDate(checkDate.getDate() - 1);
    if (!uniqueDateSet.has(checkDate.toDateString())) {
      return 0;
    }
  }

  while (uniqueDateSet.has(checkDate.toDateString())) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return currentStreak;
}
