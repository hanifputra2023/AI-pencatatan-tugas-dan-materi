/**
 * Helper terpusat untuk menghitung Real Streak Keaktifan Pengguna.
 * Menggabungkan semua aktivitas pengguna (Jurnal, Obrolan AI, Catatan Kuliah, dan Tugas).
 * 
 * Aturan Perhitungan Streak:
 * 1. Jika hari ini pengguna sudah beraktivitas, streak dihitung dari hari ini ke belakang.
 * 2. Jika hari ini pengguna BELUM beraktivitas, tetapi KEMARIN aktif, streak kemarin tetap dipertahankan
 *    (tidak langsung hangus sampai hari berganti).
 * 3. Jika kemarin dan hari ini sama sekali tidak aktif, streak = 0.
 * 4. Format tanggal distandarisasi lokal YYYY-MM-DD agar aman dari perbedaan timezone engine hermes/android/ios/web.
 */
export function calculateRealStreak(timestamps: string[]): number {
  if (!timestamps || timestamps.length === 0) {
    return 0;
  }

  const uniqueDateSet = new Set<string>();

  const formatDate = (dateObj: Date): string => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  timestamps.forEach(ts => {
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        uniqueDateSet.add(formatDate(d));
      }
    }
  });

  let currentStreak = 0;
  const checkDate = new Date();

  const todayStr = formatDate(checkDate);
  const hasToday = uniqueDateSet.has(todayStr);

  if (hasToday) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    // Periksa apakah kemarin aktif
    checkDate.setDate(checkDate.getDate() - 1);
    if (!uniqueDateSet.has(formatDate(checkDate))) {
      return 0;
    }
  }

  while (uniqueDateSet.has(formatDate(checkDate))) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return currentStreak;
}
