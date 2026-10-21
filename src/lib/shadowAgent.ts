import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getCachedTasks, getCachedJournals } from './offlineSync';

// =============================================================================
// MIDNIGHT SHADOW AGENT (Autonomous Proactive Worker)
// =============================================================================
// Asisten proaktif yang bekerja di latar belakang untuk memberikan Morning Briefing
// jam 06.30 dan Daily Review jam 21.00 tanpa harus menunggu dipanggil pengguna.

const SHADOW_ENABLED_KEY = '@shadow_agent_enabled';
const LAST_MORNING_NUDGE_KEY = '@last_morning_nudge';
const LAST_EVENING_NUDGE_KEY = '@last_evening_nudge';

// Konfigurasi notifikasi Expo saat aplikasi aktif di foreground
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    // Ignore web/unsupported issues
  }
}

export async function isShadowAgentEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(SHADOW_ENABLED_KEY);
    return val === null ? true : val === 'true'; // Default aktif
  } catch {
    return true;
  }
}

export async function setShadowAgentEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SHADOW_ENABLED_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      await registerDailyShadowSchedules();
    } else {
      await cancelDailyShadowSchedules();
    }
  } catch (e) {
    console.warn('[ShadowAgent] Gagal menyimpan preferensi:', e);
  }
}

/**
 * Mendaftarkan jadwal notifikasi harian pukul 06.30 dan 21.00 WIB.
 */
export async function registerDailyShadowSchedules(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }

    // Bersihkan jadwal lama agar tidak duplikat
    await cancelDailyShadowSchedules();

    // 1. Morning Briefing: Jam 06.30 Pagi
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '☀️ Pagi! Ara di sini',
        body: 'Yuk cek tugas dan rencana belajarmu hari ini biar tetap santai dan teratur.',
        sound: true,
      },
      trigger: {
        hour: 6,
        minute: 30,
        repeats: true,
      } as any,
    });

    // 2. Evening Review & Curhat: Jam 21.00 Malam
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🌙 Waktunya Rehat & Refleksi',
        body: 'Gimana harimu tadi? Cerita sebentar yuk di Jurnal atau evaluasi tugasmu bareng Ara.',
        sound: true,
      },
      trigger: {
        hour: 21,
        minute: 0,
        repeats: true,
      } as any,
    });

    console.log('[ShadowAgent] Jadwal harian 06:30 & 21:00 berhasil didaftarkan.');
  } catch (err) {
    console.warn('[ShadowAgent] Gagal mendaftarkan notifikasi harian:', err);
  }
}

export async function cancelDailyShadowSchedules(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {}
}

/**
 * Pengecekan proaktif saat aplikasi dibuka.
 * Menghasilkan sapaan cerdas berdasarkan jam buka aplikasi & data tugas pengguna.
 */
export async function getProactiveBriefing(userId: string): Promise<string | null> {
  const enabled = await isShadowAgentEnabled();
  if (!enabled) return null;

  const now = new Date();
  const currentHour = now.getHours();
  const todayKey = now.toISOString().split('T')[0];

  try {
    // Sapaan Pagi (06:00 - 10:00)
    if (currentHour >= 6 && currentHour < 10) {
      const last = await AsyncStorage.getItem(LAST_MORNING_NUDGE_KEY);
      if (last !== todayKey) {
        await AsyncStorage.setItem(LAST_MORNING_NUDGE_KEY, todayKey);
        const tasks = await getCachedTasks(userId);
        const todayTasks = tasks.filter((t) => !t.is_completed && t.due_date && t.due_date.startsWith(todayKey));
        const pendingCount = tasks.filter((t) => !t.is_completed).length;

        if (todayTasks.length > 0) {
          return `☀️ **Pagi!** Hari ini ada **${todayTasks.length} tugas** yang jatuh tempo (misal: "${todayTasks[0].title}"). Mau cicil dari yang paling gampang dulu?`;
        } else if (pendingCount > 0) {
          return `☀️ **Semangat Pagi!** Ada **${pendingCount} tugas** yang masih terbuka di daftar To-Do. Siap produktif bareng Ara hari ini?`;
        }
        return `☀️ **Selamat pagi!** Belum ada deadline mendesak hari ini. Mau baca catatan santai atau buat target baru?`;
      }
    }

    // Sapaan Malam (20:00 - 23:00)
    if (currentHour >= 20 && currentHour <= 23) {
      const last = await AsyncStorage.getItem(LAST_EVENING_NUDGE_KEY);
      if (last !== todayKey) {
        await AsyncStorage.setItem(LAST_EVENING_NUDGE_KEY, todayKey);
        const tasks = await getCachedTasks(userId);
        const doneToday = tasks.filter((t) => t.is_completed).length;

        return `🌙 **Malam!** Kerja bagus hari ini! Sudah ada **${doneToday} tugas** yang terselesaikan. Luapkan perasaanmu di Jurnal yuk sebelum istirahat tidur.`;
      }
    }
  } catch (err) {
    console.warn('[ShadowAgent] Error in getProactiveBriefing:', err);
  }

  return null;
}
