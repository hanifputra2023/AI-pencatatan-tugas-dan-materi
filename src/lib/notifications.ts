import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudentTask, DailyRoutineReminder, DEFAULT_DAILY_ROUTINES } from '../types';

let ExpoNotifications: any = null;
try {
  ExpoNotifications = require('expo-notifications');
  if (ExpoNotifications && typeof ExpoNotifications.setNotificationHandler === 'function') {
    ExpoNotifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }

  // Setup Android MAX Importance Channel for Heads-up & Background Notifications
  if (Platform.OS === 'android' && ExpoNotifications && typeof ExpoNotifications.setNotificationChannelAsync === 'function') {
    ExpoNotifications.setNotificationChannelAsync('default', {
      name: 'Pengingat Tugas & Belajar',
      importance: ExpoNotifications.AndroidImportance?.MAX ?? 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
      bypassDnd: false,
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
    }).catch((err: any) => {
      console.log('Error creating android notification channel:', err);
    });
  }
} catch (e) {
  // Expo notifications not available or running in web preview
}

/**
 * Play a synthesized chime sound (Web Audio API or fallback)
 */
export function playChimeSound(type: 'pomodoro' | 'deadline' = 'pomodoro') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        if (type === 'pomodoro') {
          // Double pleasant chime (Ding-Dong)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(587.33, now); // D5
          osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
          gain1.gain.setValueAtTime(0.3, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.6);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1174.66, now + 0.2); // D6
          gain2.gain.setValueAtTime(0.35, now + 0.2);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.2);
          osc2.stop(now + 1.2);
        } else {
          // Urgent chime for deadline
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(659.25, now); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.15); // G5
          osc.frequency.setValueAtTime(987.77, now + 0.3); // B5
          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.9);
        }
      }
    } catch (err) {
      console.log('Web audio chime error:', err);
    }
  }
}

/**
 * Get current notification permission status
 */
export function getNotificationPermissionStatus(): 'granted' | 'denied' | 'default' {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission as 'granted' | 'denied' | 'default';
  }
  return 'default';
}

// Concurrency mutex to prevent duplicate simultaneous routine scheduling
let isSchedulingInProgress = false;

/**
 * Schedule daily smart student routines:
 * Dynamically configured by Administrator and synced across all devices.
 * Uses exact Expo SDK 52 trigger formats with daily repetition and deduplication locks.
 */
export async function scheduleDailyRoutineReminders(customList?: DailyRoutineReminder[], forceRefresh = false) {
  if (Platform.OS === 'web' || !ExpoNotifications) return;

  // Prevent concurrent duplicate executions on app start / login
  if (isSchedulingInProgress && !forceRefresh) return;
  isSchedulingInProgress = true;

  try {
    let routines = customList;
    if (!routines || routines.length === 0) {
      const cached = await AsyncStorage.getItem('@custom_daily_routine_reminders');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            routines = parsed;
          }
        } catch (e) {}
      }
    }

    if (!routines || routines.length === 0) {
      routines = DEFAULT_DAILY_ROUTINES;
    }

    // Check if the exact routine list has already been scheduled to avoid canceling & re-scheduling on every login
    const routinesHash = JSON.stringify(routines.map(r => ({ id: r.id, h: r.hour, m: r.minute, en: r.enabled })));
    const lastHash = await AsyncStorage.getItem('@last_scheduled_routine_hash');
    if (lastHash === routinesHash && !forceRefresh) {
      isSchedulingInProgress = false;
      return;
    }

    // Cancel all previously scheduled routine reminders first
    const allKnownIds = ['morning', 'afternoon', 'evening', ...routines.map(r => r.id)];
    for (const id of allKnownIds) {
      await ExpoNotifications.cancelScheduledNotificationAsync(`daily-routine-${id}`).catch(() => {});
    }

    // Schedule each active routine with valid Expo trigger format
    for (const r of routines) {
      if (r.enabled !== false && typeof r.hour === 'number' && typeof r.minute === 'number') {
        const triggerInput = Platform.OS === 'android'
          ? {
              type: ExpoNotifications.SchedulableTriggerInputTypes?.DAILY || 'daily',
              hour: Number(r.hour),
              minute: Number(r.minute),
              channelId: 'default',
            }
          : {
              type: ExpoNotifications.SchedulableTriggerInputTypes?.CALENDAR || 'calendar',
              hour: Number(r.hour),
              minute: Number(r.minute),
              repeats: true,
            };

        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `daily-routine-${r.id}`,
          content: {
            title: r.title || '🔔 Pengingat Belajar',
            body: r.body || 'Waktunya cek aktivitas belajarmu hari ini!',
            sound: true,
            channelId: 'default',
          },
          trigger: triggerInput,
        }).catch((err: any) => console.log(`Error scheduling ${r.id}:`, err));
      }
    }

    await AsyncStorage.setItem('@last_scheduled_routine_hash', routinesHash);
  } catch (e) {
    console.log('Error scheduling daily routine reminders:', e);
  } finally {
    isSchedulingInProgress = false;
  }
}

/**
 * Request notification permissions across Mobile and Web
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  // 1. Mobile (Expo Notifications)
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await ExpoNotifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        // Schedule daily recurring smart reminders
        scheduleDailyRoutineReminders();
      }

      return finalStatus === 'granted';
    } catch (e) {
      console.log('Mobile notification permission error:', e);
      return false;
    }
  }

  // 2. Web Browser Notification
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
    } catch (e) {
      console.log('Web notification permission error:', e);
    }
  }

  return false;
}

/**
 * Send an immediate notification (Mobile push / Web desktop notification)
 */
export async function sendImmediateNotification(title: string, body: string) {
  playChimeSound('pomodoro');

  // 1. Mobile (Expo)
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      await ExpoNotifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          vibrate: [0, 250, 250, 250],
          channelId: 'default',
        },
        trigger: null, // immediate
      });
      return;
    } catch (e) {
      console.log('Error sending mobile notification:', e);
    }
  }

  // 2. Web Browser
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3208/3208726.png',
          requireInteraction: true,
          silent: false,
          tag: 'pomodoro-alert-' + Date.now(),
        });
        notif.onclick = () => {
          try {
            window.focus();
          } catch (err) {}
          notif.close();
        };
      }
    } catch (e) {
      console.log('Error sending web notification:', e);
    }
  }
}

/**
 * Schedule smart reminders for a task deadline:
 * - 1 Day Before (if target is > 24 hours away)
 * - 2 Hours Before (if target is > 2 hours away)
 * - At exact deadline (in the future)
 * Uses exact Date trigger objects to ensure Android AlarmManager registers in the background.
 */
export async function scheduleTaskDeadlineNotification(task: StudentTask) {
  if (!task.due_date || task.is_completed) return;

  const targetDate = new Date(task.due_date);
  if (isNaN(targetDate.getTime())) return;

  const nowTime = Date.now();
  const targetTime = targetDate.getTime();

  // If deadline has already passed, do NOT schedule anything
  if (targetTime <= nowTime) return;

  // Mobile Expo Notifications
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      // Cancel previous scheduled notifications for this task first to avoid duplicates
      await cancelTaskNotification(task.id);

      // Notification 1: Exact Deadline (in future, at least 10 seconds from now)
      if (targetTime - nowTime > 10 * 1000) {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `task-deadline-${task.id}-exact`,
          content: {
            title: `🚨 Waktu Deadline Habis!`,
            body: `Tugas "${task.title}" (${task.subject || 'Kuliah'}) sudah mencapai batas waktu pengumpulan!`,
            sound: true,
            channelId: 'default',
            data: { taskId: task.id },
          },
          trigger: {
            type: ExpoNotifications.SchedulableTriggerInputTypes?.DATE || 'date',
            date: targetDate,
            channelId: 'default',
          },
        });
      }

      // Notification 2: 2 Hours Before (if time left > 2 hours)
      const twoHoursBefore = new Date(targetTime - 2 * 60 * 60 * 1000);
      if (twoHoursBefore.getTime() > nowTime + 60 * 1000) {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `task-deadline-${task.id}-2h`,
          content: {
            title: `⏳ 2 Jam Menuju Deadline!`,
            body: `Tugas "${task.title}" (${task.subject || 'Kuliah'}) harus segera dikumpulkan dalam 2 jam.`,
            sound: true,
            channelId: 'default',
            data: { taskId: task.id },
          },
          trigger: {
            type: ExpoNotifications.SchedulableTriggerInputTypes?.DATE || 'date',
            date: twoHoursBefore,
            channelId: 'default',
          },
        });
      }

      // Notification 3: 1 Day Before (if time left > 24 hours)
      const oneDayBefore = new Date(targetTime - 24 * 60 * 60 * 1000);
      if (oneDayBefore.getTime() > nowTime + 60 * 1000) {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `task-deadline-${task.id}-1d`,
          content: {
            title: `⏰ Pengingat Tugas (Besok Deadline)`,
            body: `Tugas "${task.title}" (${task.subject || 'Kuliah'}) jatuh tempo besok. Siapkan pengerjaanmu!`,
            sound: true,
            channelId: 'default',
            data: { taskId: task.id },
          },
          trigger: {
            type: ExpoNotifications.SchedulableTriggerInputTypes?.DATE || 'date',
            date: oneDayBefore,
            channelId: 'default',
          },
        });
      }
    } catch (e) {
      console.log('Error scheduling task notification on mobile:', e);
    }
  }
}

/**
 * Safely sync all active task deadlines without duplicates
 */
export async function syncAllTaskDeadlines(tasks: StudentTask[]) {
  if (Platform.OS === 'web' || !ExpoNotifications) return;

  try {
    for (const task of tasks) {
      if (!task.is_completed && task.due_date) {
        await scheduleTaskDeadlineNotification(task);
      } else {
        await cancelTaskNotification(task.id);
      }
    }
  } catch (e) {
    console.log('Error syncing all task deadlines:', e);
  }
}

/**
 * Cancel scheduled notifications for a task (when completed or deleted)
 */
export async function cancelTaskNotification(taskId: string) {
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-exact`).catch(() => {});
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-2h`).catch(() => {});
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-1d`).catch(() => {});
    } catch (e) {
      console.log('Error cancelling task notification:', e);
    }
  }
}

/**
 * Schedule an exact background OS alarm notification when a Pomodoro timer starts.
 * This ensures that even if the app is minimized, locked, or closed, the OS will ring and vibrate at the exact second.
 */
export async function schedulePomodoroAlarmNotification(secondsLeft: number, taskTitle?: string, isBreak = false) {
  if (Platform.OS === 'web' || !ExpoNotifications) return;

  try {
    // Cancel any previous pomodoro alarm first
    await cancelPomodoroAlarmNotification();

    if (secondsLeft <= 0) return;

    const title = isBreak ? '☕ Waktu Istirahat Selesai!' : '🎉 Sesi Fokus Selesai!';
    const body = isBreak
      ? 'Waktunya kembali produktif dan melanjutkan tugas kuliahmu.'
      : taskTitle
      ? `Hebat! Kamu telah menyelesaikan sesi fokus untuk tugas "${taskTitle}".`
      : 'Hebat! Satu sesi fokus Pomodoro telah selesai. Istirahat sejenak 5 menit ya.';

    await ExpoNotifications.scheduleNotificationAsync({
      identifier: 'pomodoro-timer-alarm',
      content: {
        title,
        body,
        sound: true,
        channelId: 'default',
        data: { type: 'pomodoro' },
      },
      trigger: {
        type: ExpoNotifications.SchedulableTriggerInputTypes?.TIME_INTERVAL || 'timeInterval',
        seconds: Math.max(1, Math.round(secondsLeft)),
        repeats: false,
        channelId: 'default',
      },
    });
  } catch (e) {
    console.log('Error scheduling pomodoro alarm notification:', e);
  }
}

/**
 * Cancel the Pomodoro background alarm notification when timer is paused or reset
 */
export async function cancelPomodoroAlarmNotification() {
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      await ExpoNotifications.cancelScheduledNotificationAsync('pomodoro-timer-alarm').catch(() => {});
    } catch (e) {
      console.log('Error cancelling pomodoro alarm notification:', e);
    }
  }
}

/**
 * Notify when a Pomodoro timer session finishes
 */
export function notifyPomodoroFinished(taskTitle?: string, isBreak = false) {
  const title = isBreak ? '☕ Waktu Istirahat Selesai!' : '🎉 Sesi Fokus Selesai!';
  const body = isBreak
    ? 'Waktunya kembali produktif dan melanjutkan tugas kuliahmu.'
    : taskTitle
    ? `Hebat! Kamu telah menyelesaikan sesi fokus untuk tugas "${taskTitle}".`
    : 'Hebat! Satu sesi fokus Pomodoro telah selesai. Istirahat sejenak 5 menit ya.';

  sendImmediateNotification(title, body);
}

/**
 * Schedule daily streak protection reminder at 20:00 (8 PM)
 */
export async function scheduleStreakProtectionReminder(streakDays: number) {
  if (Platform.OS === 'web' || !ExpoNotifications) return;
  try {
    // Cancel existing reminder if any
    await ExpoNotifications.cancelScheduledNotificationAsync('streak-protection-reminder').catch(() => {});

    await ExpoNotifications.scheduleNotificationAsync({
      identifier: 'streak-protection-reminder',
      content: {
        title: '🔥 Streakmu Terancam Putus!',
        body: streakDays > 0
          ? `Streak ${streakDays} harimu akan hilang malam ini! Buka catatan atau selesaikan 1 tugas untuk menyelamatkannya!`
          : 'Belum belajar hari ini? Selesaikan 1 aktivitas singkat sebelum malam berakhir!',
        sound: true,
        channelId: 'default',
        data: { type: 'streak_protection' },
      },
      trigger: {
        type: ExpoNotifications.SchedulableTriggerInputTypes?.DAILY || 'daily',
        hour: 20,
        minute: 0,
        repeats: true,
        channelId: 'default',
      },
    });
  } catch (e) {
    console.log('Error scheduling streak protection reminder:', e);
  }
}

/**
 * Notify when a Limited 24h Boss Event spawns
 */
export function notifyBossEventSpawned(bossName: string) {
  sendImmediateNotification(
    '⚔️ Boss Event Terbatas Muncul!',
    `"${bossName}" menantangmu! Kalahkan dalam 24 jam untuk klaim Gelar Legendaris & Hadiah Langka!`
  );
}

/**
 * Notify when Lucky Hour (2x XP) triggers
 */
export function notifyLuckyHourActivated() {
  playChimeSound('pomodoro');
  sendImmediateNotification(
    '🎲 LUCKY HOUR AKTIF! (10 Menit)',
    'Semua XP dari kuis, tugas, dan catatan dilipatgandakan ×2! Belajar sekarang sebelum waktu habis!'
  );
}

/**
 * Notify when user has unopened Loot Chests waiting
 */
export function notifyLootChestsWaiting(chestCount: number) {
  if (chestCount <= 0) return;
  sendImmediateNotification(
    '📦 Kotak Hadiah Menunggumu!',
    `Kamu punya ${chestCount} Hadiah belum dibuka! Buka sekarang untuk kesempatan dapat Gelar RPG & Tetes Air.`
  );
}


