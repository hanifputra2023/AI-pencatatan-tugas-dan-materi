import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { StudentTask, StudyNote, JournalEntry } from '../types';

export interface OfflineAction {
  id: string;
  userId: string;
  type:
    | 'CREATE_TASK'
    | 'UPDATE_TASK'
    | 'DELETE_TASK'
    | 'CREATE_NOTE'
    | 'UPDATE_NOTE'
    | 'DELETE_NOTE'
    | 'CREATE_JOURNAL'
    | 'UPDATE_JOURNAL'
    | 'DELETE_JOURNAL';
  payload: any;
  timestamp: number;
}

export interface CachedDashboardData {
  username: string;
  streak: number;
  todayMood: string | null;
  recentEntries: JournalEntry[];
  upcomingTasks: StudentTask[];
  recentStudyNotes: StudyNote[];
  pendingTasksCount: number;
  totalNotesCount: number;
}

/**
 * Check if the device currently has active internet connectivity
 */
export async function isDeviceOnline(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      if (!navigator.onLine) return false;
    }
  }

  // Quick light ping to verify real connectivity
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
      mode: 'no-cors',
    });
    clearTimeout(timeoutId);
    return true;
  } catch (e) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      return navigator.onLine ?? false;
    }
    return false;
  }
}

/**
 * Subscribe to online/offline network changes
 */
export function subscribeNetworkStatus(callback: (isOnline: boolean) => void): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  // Fallback for mobile
  let intervalId = setInterval(async () => {
    const online = await isDeviceOnline();
    callback(online);
  }, 10000);

  return () => clearInterval(intervalId);
}

/**
 * Cache Tasks locally
 */
export async function cacheTasksLocally(userId: string, tasks: StudentTask[]): Promise<void> {
  try {
    const key = `@offline_cached_tasks_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(tasks));
  } catch (e) {
    console.log('Error caching tasks locally:', e);
  }
}

export async function getCachedTasks(userId: string): Promise<StudentTask[]> {
  try {
    const key = `@offline_cached_tasks_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

/**
 * Cache Notes locally
 */
export async function cacheNotesLocally(userId: string, notes: StudyNote[]): Promise<void> {
  try {
    const key = `@offline_cached_notes_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(notes));
  } catch (e) {
    console.log('Error caching notes locally:', e);
  }
}

export async function getCachedNotes(userId: string): Promise<StudyNote[]> {
  try {
    const key = `@offline_cached_notes_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

/**
 * Cache Journal Entries locally
 */
export async function cacheJournalsLocally(userId: string, journals: JournalEntry[]): Promise<void> {
  try {
    const key = `@offline_cached_journals_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(journals));
  } catch (e) {
    console.log('Error caching journals locally:', e);
  }
}

export async function getCachedJournals(userId: string): Promise<JournalEntry[]> {
  try {
    const key = `@offline_cached_journals_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

/**
 * Cache Dashboard Data locally (for instant HomeScreen load offline)
 */
export async function cacheDashboardLocally(userId: string, data: CachedDashboardData): Promise<void> {
  try {
    const key = `@offline_cached_dashboard_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.log('Error caching dashboard data:', e);
  }
}

export async function getCachedDashboard(userId: string): Promise<CachedDashboardData | null> {
  try {
    const key = `@offline_cached_dashboard_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

/**
 * Add an action to the Offline Sync Queue
 */
export async function queueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>): Promise<void> {
  try {
    const key = `@offline_sync_queue_${action.userId}`;
    const raw = await AsyncStorage.getItem(key);
    const currentQueue: OfflineAction[] = raw ? JSON.parse(raw) : [];

    const newAction: OfflineAction = {
      ...action,
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };

    currentQueue.push(newAction);
    await AsyncStorage.setItem(key, JSON.stringify(currentQueue));
    console.log(`[Offline Sync] Action queued: ${action.type}`, action.payload);
  } catch (e) {
    console.log('Error queuing offline action:', e);
  }
}

/**
 * Process and flush the Offline Sync Queue to Supabase
 */
export async function processOfflineSyncQueue(userId: string): Promise<{ syncedCount: number }> {
  if (!userId) return { syncedCount: 0 };

  const online = await isDeviceOnline();
  if (!online) return { syncedCount: 0 };

  const key = `@offline_sync_queue_${userId}`;
  let queue: OfflineAction[] = [];

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return { syncedCount: 0 };
    queue = JSON.parse(raw);
  } catch (e) {
    return { syncedCount: 0 };
  }

  if (queue.length === 0) return { syncedCount: 0 };

  console.log(`[Offline Sync] Processing ${queue.length} offline actions...`);
  let syncedCount = 0;
  const remainingQueue: OfflineAction[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'CREATE_TASK') {
        const { user_id, title, subject, priority, due_date, is_completed } = item.payload;
        await supabase.from('student_tasks').insert({
          user_id,
          title,
          subject,
          priority,
          due_date,
          is_completed: !!is_completed,
        });
        syncedCount++;
      } else if (item.type === 'UPDATE_TASK') {
        const { id, title, subject, priority, due_date, is_completed } = item.payload;
        await supabase.from('student_tasks').update({
          title,
          subject,
          priority,
          due_date,
          is_completed,
        }).eq('id', id);
        syncedCount++;
      } else if (item.type === 'DELETE_TASK') {
        const { id } = item.payload;
        await supabase.from('student_tasks').delete().eq('id', id);
        syncedCount++;
      } else if (item.type === 'CREATE_NOTE') {
        const { user_id, title, subject, content } = item.payload;
        await supabase.from('study_notes').insert({
          user_id,
          title,
          subject,
          content,
        });
        syncedCount++;
      } else if (item.type === 'UPDATE_NOTE') {
        const { id, title, subject, content } = item.payload;
        await supabase.from('study_notes').update({
          title,
          subject,
          content,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        syncedCount++;
      } else if (item.type === 'DELETE_NOTE') {
        const { id } = item.payload;
        await supabase.from('study_notes').delete().eq('id', id);
        syncedCount++;
      } else if (item.type === 'CREATE_JOURNAL') {
        const { user_id, content, mood, tags, ai_summary, is_draft, gratitude_note } = item.payload;
        await supabase.from('journal_entries').insert({
          user_id,
          content,
          mood,
          tags: tags || [],
          ai_summary: ai_summary || null,
          is_draft: !!is_draft,
          gratitude_note: gratitude_note || null,
        });
        syncedCount++;
      } else if (item.type === 'UPDATE_JOURNAL') {
        const { id, content, mood, tags, ai_summary, is_draft, gratitude_note } = item.payload;
        await supabase.from('journal_entries').update({
          content,
          mood,
          tags: tags || [],
          ai_summary: ai_summary || null,
          is_draft: !!is_draft,
          gratitude_note: gratitude_note || null,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        syncedCount++;
      } else if (item.type === 'DELETE_JOURNAL') {
        const { id } = item.payload;
        await supabase.from('journal_entries').delete().eq('id', id);
        syncedCount++;
      }
    } catch (err) {
      console.log(`[Offline Sync] Failed to process ${item.type}:`, err);
      remainingQueue.push(item);
    }
  }

  await AsyncStorage.setItem(key, JSON.stringify(remainingQueue));
  console.log(`[Offline Sync] Finished. Synced: ${syncedCount}, Remaining: ${remainingQueue.length}`);
  return { syncedCount };
}
