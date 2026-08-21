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
 * - 1 Day Before (if still in future)
 * - 2 Hours Before
 * - At exact deadline
 */
export async function scheduleTaskDeadlineNotification(task: StudentTask) {
  if (!task.due_date || task.is_completed) return;

  const targetDate = new Date(task.due_date);
  if (isNaN(targetDate.getTime())) return;

  const now = new Date();
  const timeDiffMs = targetDate.getTime() - now.getTime();
  if (timeDiffMs <= 0) return; // Already passed

  // 1. Mobile Expo Notifications
  if (Platform.OS !== 'web' && ExpoNotifications) {
    try {
      // Cancel previous scheduled notifications for this task first
      await cancelTaskNotification(task.id);

      // Notification 1: Exact Deadline
      await ExpoNotifications.scheduleNotificationAsync({
        identifier: `task-deadline-${task.id}-exact`,
        content: {
          title: `🚨 Waktu Deadline Habis!`,
          body: `Tugas "${task.title}" (${task.subject}) sudah mencapai batas waktu pengumpulan!`,
          sound: true,
          data: { taskId: task.id },
        },
        trigger: { date: targetDate },
      });

      // Notification 2: 2 Hours Before (if time left > 2 hours)
      const twoHoursBefore = new Date(targetDate.getTime() - 2 * 60 * 60 * 1000);
      if (twoHoursBefore.getTime() > now.getTime()) {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `task-deadline-${task.id}-2h`,
          content: {
            title: `⏳ 2 Jam Menuju Deadline!`,
            body: `Tugas "${task.title}" (${task.subject}) harus segera dikumpulkan dalam 2 jam.`,
            sound: true,
            data: { taskId: task.id },
          },
          trigger: { date: twoHoursBefore },
        });
      }

      // Notification 3: 1 Day Before (if time left > 24 hours)
      const oneDayBefore = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
      if (oneDayBefore.getTime() > now.getTime()) {
        await ExpoNotifications.scheduleNotificationAsync({
          identifier: `task-deadline-${task.id}-1d`,
          content: {
            title: `⏰ Pengingat Tugas (Besok Deadline)`,
            body: `Tugas "${task.title}" (${task.subject}) jatuh tempo besok. Siapkan pengerjaanmu!`,
            sound: true,
            data: { taskId: task.id },
          },
          trigger: { date: oneDayBefore },
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
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-exact`);
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-2h`);
      await ExpoNotifications.cancelScheduledNotificationAsync(`task-deadline-${taskId}-1d`);
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
