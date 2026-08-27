import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trySpawnBossEvent, getCurrentBossEvent } from './bossEventStorage';
import { tryTriggerLuckyHour, getLuckyHourStatus } from './luckyHourStorage';
import { getChestCount } from './lootChestStorage';
import { sendImmediateNotification } from './notifications';

export const EVENTS_BACKGROUND_TASK = 'study-event-notifications';

const KEY_LAST_NOTIFIED_BOSS = '@last_notified_boss_event_id';
const KEY_LAST_NOTIFIED_CHEST = '@last_notified_chest_count';

async function getLastNotifiedBoss(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY_LAST_NOTIFIED_BOSS); } catch { return null; }
}
async function setLastNotifiedBoss(id: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY_LAST_NOTIFIED_BOSS, id); } catch {}
}
async function getLastNotifiedChest(): Promise<number> {
  try { return parseInt(await AsyncStorage.getItem(KEY_LAST_NOTIFIED_CHEST) || '0', 10); } catch { return 0; }
}
async function setLastNotifiedChest(count: number): Promise<void> {
  try { await AsyncStorage.setItem(KEY_LAST_NOTIFIED_CHEST, String(count)); } catch {}
}

/**
 * Menjalankan evaluasi event-inst lokasi (boss event, lucky hour, loot chest)
 * dari dalam perangkat secara berkala (~15 menit) tanpa perlu membuka aplikasi
 * maupun koneksi internet. State event tersimpan di AsyncStorage lokal.
 * Setelahnya memunculkan notifikasi OS jika ada event baru yang aktif.
 */
async function evaluateAndNotifyEvents() {
  let newData = false;

  // 1. Boss Event
  try {
    const current = await getCurrentBossEvent();
    const lastNotified = await getLastNotifiedBoss();
    if (!current) {
      // Belum ada boss aktif: coba spawn (peluang 30%, max sekali/4 jam)
      const spawned = await trySpawnBossEvent();
      if (spawned && lastNotified !== spawned.id) {
        newData = true;
        await setLastNotifiedBoss(spawned.id);
        sendImmediateNotification(
          '⚔️ Boss Event Terbatas Muncul!',
          `"${spawned.name}" menantangmu! Kalahkan dalam 24 jam untuk klaim Gelar Legendaris & Hadiah Langka!`
        );
      }
    } else if (lastNotified !== current.id) {
      // Jangan notif ulang boss yang sudah pernah dimunculkan
      await setLastNotifiedBoss(current.id);
    }
  } catch (e) {
    console.log('Boss event background eval error:', e);
  }

  // 2. Lucky Hour (peluang 18%, cooldown 4 jam)
  try {
    const status = await getLuckyHourStatus();
    if (!status.active) {
      const triggered = await tryTriggerLuckyHour();
      if (triggered) {
        newData = true;
        sendImmediateNotification(
          '🎲 LUCKY HOUR AKTIF! (10 Menit)',
          'Semua XP dari kuis, tugas, dan catatan dilipatgandakan ×2! Belajar sekarang sebelum waktu habis!'
        );
      }
    }
  } catch (e) {
    console.log('Lucky hour background eval error:', e);
  }

  // 3. Loot Chests menunggu
  try {
    const chestCount = await getChestCount();
    const lastNotified = await getLastNotifiedChest();
    if (chestCount > 0 && lastNotified < chestCount) {
      newData = true;
      await setLastNotifiedChest(chestCount);
      sendImmediateNotification(
        '📦 Kotak Hadiah Menunggumu!',
        `Kamu punya ${chestCount} Hadiah belum dibuka! Buka sekarang untuk kesempatan dapat Gelar RPG & Tetes Air.`
      );
    } else if (chestCount === 0) {
      await setLastNotifiedChest(0);
    }
  } catch (e) {
    console.log('Loot chest background eval error:', e);
  }

  return newData ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
}

export async function registerBackgroundEventsTask() {
  if (Platform.OS === 'web') return false;

  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status !== null &&
      status !== BackgroundFetch.BackgroundFetchStatus.Available &&
      status !== BackgroundFetch.BackgroundFetchStatus.Restricted
    ) {
      // Permission background belum diberikan — tidak bisa berjalan
      return false;
    }

    if (!TaskManager.isTaskDefined(EVENTS_BACKGROUND_TASK)) {
      TaskManager.defineTask(EVENTS_BACKGROUND_TASK, async () => {
        try {
          return await evaluateAndNotifyEvents();
        } catch (err) {
          console.log('Background events task error:', err);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });
    }

    const options: BackgroundFetch.BackgroundFetchOptions = {
      minimumInterval: 15, // menit (OS bisa membatasi lebih jarang)
      stopOnTerminate: false, // tetap jalan meski app di-swipe dari recents
      startOnBoot: true,
    };

    await BackgroundFetch.registerTaskAsync(EVENTS_BACKGROUND_TASK, options);

    return true;
  } catch (e) {
    console.log('Failed to register background events task:', e);
    return false;
  }
}
