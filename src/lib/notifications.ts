import { Platform } from 'react-native';
import { StudentTask } from '../types';

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
      importance: ExpoNotifications.AndroidImportance?.MAX || 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility?.PUBLIC || 1,
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyRoutineReminder, DEFAULT_DAILY_ROUTINES } from '../types';

/**
 * Schedule daily smart student routines:
 * Dynamically configured by Administrator and synced in real-time across all devices.
 */
export async function scheduleDailyRoutineReminders(customList?: DailyRoutineReminder[]) {
  if (Platform.OS === 'web' || !ExpoNotifications) return;

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

    // Cancel all previously scheduled routine reminders first
    const allKnownIds = ['morning', 'afternoon', 'evening', ...routines.map(r => r.id)];
    for (const id of allKnownIds) {
      await ExpoNotifications.cancelScheduledNotificationAsync(`daily-routine-${id}`).catch(() => {});
    }

    // Schedule each active routine
    for (const r of routines) {
      if (r.enabled !== false && typeof r.hour === 'number' && typeof r.minute === 'number') {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `daily-routine-${r.id}`,
          content: {
            title: r.title || '🔔 Pengingat Belajar',
            body: r.body || 'Waktunya cek aktivitas belajarmu hari ini!',
            sound: true,
            channelId: 'default',
          },
          trigger: {
            hour: Number(r.hour),
            minute: Number(r.minute),
            repeats: true,
          },
        }).catch((err: any) => console.log(`Error scheduling ${r.id}:`, err));
      }
    }
  } catch (e) {
    console.log('Error scheduling daily routine reminders:', e);
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
 */
export async function scheduleTaskDeadlineNotification(task: StudentTask) {
  if (!task.due_date || task.is_completed) return;

  const targetDate = new Date(task.due_date);
  if (isNaN(targetDate.getTime())) return;

  const now = new Date();
  const timeDiffSeconds = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
  
  // If deadline has already passed, do NOT schedule anything
  if (timeDiffSeconds <= 0) return;

  // Mobile Expo Notifications
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      // Cancel previous scheduled notifications for this task first
      await cancelTaskNotification(task.id);

      // Notification 1: Exact Deadline (in future)
      if (timeDiffSeconds > 10) {
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
            seconds: timeDiffSeconds,
          },
        });
      }

      // Notification 2: 2 Hours Before (if time left > 2 hours)
      const twoHoursInSeconds = 2 * 60 * 60;
      if (timeDiffSeconds > twoHoursInSeconds + 60) {
        const secondsUntil2h = timeDiffSeconds - twoHoursInSeconds;
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
            seconds: secondsUntil2h,
          },
        });
      }

      // Notification 3: 1 Day Before (if time left > 24 hours)
      const oneDayInSeconds = 24 * 60 * 60;
      if (timeDiffSeconds > oneDayInSeconds + 60) {
        const secondsUntil1d = timeDiffSeconds - oneDayInSeconds;
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
            seconds: secondsUntil1d,
          },
        });
      }
    } catch (e) {
      console.log('Error scheduling task notification on mobile:', e);
    }
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
