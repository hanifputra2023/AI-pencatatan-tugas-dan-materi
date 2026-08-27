import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCachedTasks } from '../lib/offlineSync';
import { calculateRealStreak } from '../lib/streakCalculator';
import {
  scheduleDailyRoutineReminders,
  syncAllTaskDeadlines,
  scheduleStreakProtectionReminder,
} from '../lib/notifications';
import { registerBackgroundEventsTask } from '../lib/backgroundEvents';

/**
 * Mendaftarkan semua local scheduled notifications segera setelah login,
 * tanpa bergantung pada screen mana yang dibuka user pertama kali.
 *
 * Ini memastikan notifikasi terjadwal (rutin harian, deadline tugas, dan
 * streak protection) sudah terdaftar di sistem OS begitu app pernah dibuka,
 * sehingga tetap muncul meski app kemudian ditutup / dibersihkan dari recent.
 */
export default function NotificationBootstrapper() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;

    let cancelled = false;

    const bootstrap = async () => {
      // 0. Registrasi background task event-inst (boss, lucky hour, loot)
      //    supaya berjalan periodik tanpa perlu membuka app & tanpa internet.
      try {
        await registerBackgroundEventsTask();
      } catch (e) {
        console.log('Bootstrap: background events task', e);
      }

      // 1. Rutin harian (jadwal belajar dari admin / cache lokal)
      scheduleDailyRoutineReminders();

      // 2. Deadline tugas: ambil dari cache lokal & jadwalkan (cancels duplicates internally)
      try {
        const cachedTasks = await getCachedTasks(user.id);
        if (cachedTasks.length > 0 && !cancelled) {
          syncAllTaskDeadlines(cachedTasks);
        }
      } catch (e) {
        console.log('Bootstrap: error scheduling task deadlines', e);
      }

      // 3. Streak protection: hitung streak dari aktivitas terbaru
      try {
        const localMoodRaw = await AsyncStorage.getItem(`@mood_history_${user.id}`);
        const localMoodHistory: Array<{ created_at?: string; date?: string }> =
          localMoodRaw ? JSON.parse(localMoodRaw) : [];

        const [journalsRes, notesRes, tasksRes] = await Promise.all([
          supabase.from('journal_entries').select('created_at').eq('user_id', user.id).limit(1000),
          supabase.from('study_notes').select('created_at').eq('user_id', user.id).limit(1000),
          supabase.from('student_tasks').select('created_at').eq('user_id', user.id).limit(1000),
        ]);

        if (cancelled) return;

        const pick = (res: { data: Array<{ created_at?: string }> | null }) =>
          (res?.data || []).map((d) => d.created_at).filter(Boolean) as string[];

        const timestamps = [
          ...pick(journalsRes),
          ...pick(notesRes),
          ...pick(tasksRes),
          ...localMoodHistory.map((m) => m.created_at || m.date).filter(Boolean) as string[],
        ];

        const streak = calculateRealStreak(timestamps);
        if (streak > 0) {
          scheduleStreakProtectionReminder(streak);
        }
      } catch (e) {
        console.log('Bootstrap: error scheduling streak protection', e);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
