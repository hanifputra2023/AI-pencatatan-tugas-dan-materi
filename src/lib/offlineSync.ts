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
export const STRICTLY_LOCAL_STORAGE_KEY = '@privacy_strictly_local_mode';

/**
 * Check if the user has enabled Strictly Local Mode (Privacy Mode) - Defaults to TRUE (100% Local Engine)
 */
export async function isStrictlyLocalMode(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STRICTLY_LOCAL_STORAGE_KEY);
    if (val === null) return true; // Default: Strictly Local Mode
    return val === 'true';
  } catch {
    return true;
  }
}

/**
 * Set Strictly Local Mode
 */
export async function setStrictlyLocalMode(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STRICTLY_LOCAL_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.log('Error setting strictly local mode:', e);
  }
}

/**
 * Local Subjects Management
 */
export async function getCachedSubjects(userId: string): Promise<{ id: string; name: string }[]> {
  try {
    const key = `@offline_cached_subjects_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export async function cacheSubjectsLocally(userId: string, subjects: { id: string; name: string }[]): Promise<void> {
  try {
    const key = `@offline_cached_subjects_${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(subjects));
  } catch (e) {}
}

/**
 * Local CRUD: Notes
 */
export async function localSaveNote(userId: string, note: StudyNote): Promise<StudyNote[]> {
  const existing = await getCachedNotes(userId);
  const idx = existing.findIndex(n => n.id === note.id);
  let updated: StudyNote[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = { ...updated[idx], ...note, updated_at: new Date().toISOString() };
  } else {
    updated = [note, ...existing];
  }
  await cacheNotesLocally(userId, updated);
  return updated;
}

export async function localDeleteNote(userId: string, noteId: string): Promise<StudyNote[]> {
  const existing = await getCachedNotes(userId);
  const updated = existing.filter(n => n.id !== noteId);
  await cacheNotesLocally(userId, updated);
  return updated;
}

/**
 * Local CRUD: Tasks
 */
export async function localSaveTask(userId: string, task: StudentTask): Promise<StudentTask[]> {
  const existing = await getCachedTasks(userId);
  const idx = existing.findIndex(t => t.id === task.id);
  let updated: StudentTask[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = { ...updated[idx], ...task };
  } else {
    updated = [task, ...existing];
  }
  await cacheTasksLocally(userId, updated);
  return updated;
}

export async function localDeleteTask(userId: string, taskId: string): Promise<StudentTask[]> {
  const existing = await getCachedTasks(userId);
  const updated = existing.filter(t => t.id !== taskId);
  await cacheTasksLocally(userId, updated);
  return updated;
}

/**
 * Local CRUD: Journals
 */
export async function localSaveJournal(userId: string, entry: JournalEntry): Promise<JournalEntry[]> {
  const existing = await getCachedJournals(userId);
  const idx = existing.findIndex(j => j.id === entry.id);
  let updated: JournalEntry[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = { ...updated[idx], ...entry, updated_at: new Date().toISOString() };
  } else {
    updated = [entry, ...existing];
  }
  await cacheJournalsLocally(userId, updated);
  return updated;
}

export async function localDeleteJournal(userId: string, journalId: string): Promise<JournalEntry[]> {
  const existing = await getCachedJournals(userId);
  const updated = existing.filter(j => j.id !== journalId);
  await cacheJournalsLocally(userId, updated);
  return updated;
}

/**
 * Process offline sync queue.
 * Pure Local Storage Mode: skips remote sync completely.
 */
export async function processOfflineSyncQueue(userId: string): Promise<{ syncedCount: number }> {
  return { syncedCount: 0 };
}

/**
 * Export all cached notes, tasks, journals, subjects, and chat sessions into a JSON backup payload
 */
export async function exportAllAppDataAsJson(userId: string): Promise<string> {
  const [cachedNotes, cachedTasks, cachedJournals, cachedSessions, cachedProfile, cachedSubjects] = await Promise.all([
    getCachedNotes(userId),
    getCachedTasks(userId),
    getCachedJournals(userId),
    AsyncStorage.getItem('@chat_sessions_' + userId).then(r => r ? JSON.parse(r) : []),
    AsyncStorage.getItem('@user_profile_cache_' + userId).then(r => r ? JSON.parse(r) : null),
    AsyncStorage.getItem('@my_student_subjects_' + userId).then(r => r ? JSON.parse(r) : []),
  ]);

  const backupObject = {
    app: 'StudyBot AI',
    version: '2.4',
    exported_at: new Date().toISOString(),
    userId,
    profile: cachedProfile,
    subjects: cachedSubjects || [],
    notes: cachedNotes || [],
    tasks: cachedTasks || [],
    journals: cachedJournals || [],
    chat_sessions: cachedSessions || [],
  };

  return JSON.stringify(backupObject, null, 2);
}

/**
 * Import and merge data from a backup JSON string
 */
export async function importAllAppDataFromJson(userId: string, jsonString: string): Promise<{
  notesCount: number;
  tasksCount: number;
  journalsCount: number;
  sessionsCount: number;
}> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || (typeof parsed !== 'object')) {
    throw new Error('Format file cadangan tidak valid.');
  }

  const notes: StudyNote[] = Array.isArray(parsed.notes) ? parsed.notes : [];
  const tasks: StudentTask[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const journals: JournalEntry[] = Array.isArray(parsed.journals) ? parsed.journals : [];
  const sessions = Array.isArray(parsed.chat_sessions) ? parsed.chat_sessions : [];
  const subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];

  // 1. Merge and save to local caches
  const [existingNotes, existingTasks, existingJournals, existingSessionsRaw, existingSubjectsRaw] = await Promise.all([
    getCachedNotes(userId),
    getCachedTasks(userId),
    getCachedJournals(userId),
    AsyncStorage.getItem('@chat_sessions_' + userId),
    AsyncStorage.getItem('@my_student_subjects_' + userId),
  ]);

  const existingSessions = existingSessionsRaw ? JSON.parse(existingSessionsRaw) : [];
  const existingSubjects = existingSubjectsRaw ? JSON.parse(existingSubjectsRaw) : [];

  // Merge subjects
  const mergedSubjectsMap = new Map<string, any>();
  existingSubjects.forEach((s: any) => mergedSubjectsMap.set(s.name.toLowerCase().trim(), s));
  subjects.forEach((s: any) => mergedSubjectsMap.set(s.name.toLowerCase().trim(), s));
  const mergedSubjects = Array.from(mergedSubjectsMap.values());

  // Merge items by ID
  const mergedNotesMap = new Map<string, StudyNote>();
  existingNotes.forEach(n => mergedNotesMap.set(n.id, n));
  notes.forEach(n => mergedNotesMap.set(n.id, { ...n, user_id: userId }));
  const mergedNotes = Array.from(mergedNotesMap.values());

  const mergedTasksMap = new Map<string, StudentTask>();
  existingTasks.forEach(t => mergedTasksMap.set(t.id, t));
  tasks.forEach(t => mergedTasksMap.set(t.id, { ...t, user_id: userId }));
  const mergedTasks = Array.from(mergedTasksMap.values());

  const mergedJournalsMap = new Map<string, JournalEntry>();
  existingJournals.forEach(j => mergedJournalsMap.set(j.id, j));
  journals.forEach(j => mergedJournalsMap.set(j.id, { ...j, user_id: userId }));
  const mergedJournals = Array.from(mergedJournalsMap.values());

  const mergedSessionsMap = new Map<string, any>();
  existingSessions.forEach((s: any) => mergedSessionsMap.set(s.id, s));
  sessions.forEach((s: any) => mergedSessionsMap.set(s.id, { ...s, user_id: userId }));
  const mergedSessions = Array.from(mergedSessionsMap.values());

  await Promise.all([
    cacheNotesLocally(userId, mergedNotes),
    cacheTasksLocally(userId, mergedTasks),
    cacheJournalsLocally(userId, mergedJournals),
    AsyncStorage.setItem('@chat_sessions_' + userId, JSON.stringify(mergedSessions)),
    AsyncStorage.setItem('@my_student_subjects_' + userId, JSON.stringify(mergedSubjects)),
  ]);

  return {
    notesCount: notes.length,
    tasksCount: tasks.length,
    journalsCount: journals.length,
    sessionsCount: sessions.length,
  };
}
