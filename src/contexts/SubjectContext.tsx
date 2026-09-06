import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { showAlert } from '../lib/alert';
import { getCachedNotes, getCachedTasks, cacheNotesLocally, cacheTasksLocally } from '../lib/offlineSync';
import { supabase } from '../lib/supabase';

export interface StudentSubject {
  id: string;
  name: string;
  color?: string;
}

const DEFAULT_SUBJECT_NAMES = [
  'Algoritma & Pemrograman',
  'Kalkulus',
  'Basis Data',
  'Sistem Operasi',
  'Jaringan Komputer',
];

interface SubjectContextType {
  subjects: StudentSubject[];
  loading: boolean;
  addSubject: (name: string) => Promise<StudentSubject | null>;
  deleteSubject: (id: string) => Promise<boolean>;
  renameSubject: (id: string, newName: string) => Promise<boolean>;
  refreshSubjects: () => Promise<void>;
}

const SubjectContext = createContext<SubjectContextType | null>(null);

const getStorageKey = (userId?: string) => `@my_student_subjects_${userId || 'guest'}`;

export function SubjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and merge subjects from all available persistent sources
  const refreshSubjects = useCallback(async () => {
    try {
      const storageKey = getStorageKey(user?.id);

      // 1. Read existing local subjects for this user
      let currentList: StudentSubject[] = [];
      const cached = await AsyncStorage.getItem(storageKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            currentList = parsed;
          }
        } catch (e) { }
      }

      // Check fallback legacy key if user key is empty
      if (currentList.length === 0) {
        const legacyCached = await AsyncStorage.getItem('@my_student_subjects');
        if (legacyCached) {
          try {
            const parsed = JSON.parse(legacyCached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              currentList = parsed;
            }
          } catch (e) { }
        }
      }

      // 2. Discover and register custom subjects from existing cached notes & tasks
      if (user?.id) {
        try {
          const [cachedNotes, cachedTasks] = await Promise.all([
            getCachedNotes(user.id),
            getCachedTasks(user.id),
          ]);
          const existingNames = new Set(currentList.map(s => s.name.toLowerCase().trim()));
          const extraNames: string[] = [];

          cachedNotes.forEach(n => {
            const sub = n.subject?.trim();
            if (sub && sub !== 'Semua' && sub !== 'Umum' && !existingNames.has(sub.toLowerCase())) {
              existingNames.add(sub.toLowerCase());
              extraNames.push(sub);
            }
          });

          cachedTasks.forEach(t => {
            const sub = t.subject?.trim();
            if (sub && sub !== 'Semua' && sub !== 'Umum' && !existingNames.has(sub.toLowerCase())) {
              existingNames.add(sub.toLowerCase());
              extraNames.push(sub);
            }
          });

          if (extraNames.length > 0) {
            const extras: StudentSubject[] = extraNames.map((name, idx) => ({
              id: 'subj_auto_' + Date.now() + '_' + idx,
              name,
            }));
            currentList = [...currentList, ...extras];
          }
        } catch (e) { }
      }

      // 3. If list is completely empty for a brand new user, initialize with defaults
      if (currentList.length === 0) {
        currentList = DEFAULT_SUBJECT_NAMES.map((name, i) => ({
          id: 'def_' + i,
          name,
        }));
      }

      setSubjects(currentList);
      await AsyncStorage.setItem(storageKey, JSON.stringify(currentList));
    } catch (e) {
      console.log('Subject refresh error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshSubjects();
  }, [user, refreshSubjects]);

  // Add new Subject
  const addSubject = async (name: string): Promise<StudentSubject | null> => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('Perhatian', 'Nama mata kuliah tidak boleh kosong.');
      return null;
    }

    if (subjects.some(s => s.name.toLowerCase().trim() === trimmed.toLowerCase())) {
      showAlert('Sudah Ada', `Mata kuliah "${trimmed}" sudah ada di daftarmu.`);
      return null;
    }

    const tempId = 'subj_' + Date.now();
    const newSubj: StudentSubject = { id: tempId, name: trimmed };

    const updated = [...subjects, newSubj];
    setSubjects(updated);

    const storageKey = getStorageKey(user?.id);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

    return newSubj;
  };

  // Delete Subject
  const deleteSubject = async (id: string): Promise<boolean> => {
    const updated = subjects.filter(s => s.id !== id);
    setSubjects(updated);

    const storageKey = getStorageKey(user?.id);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    return true;
  };

  // Rename Subject (also updates existing notes/tasks referencing the old name)
  const renameSubject = async (id: string, newName: string): Promise<boolean> => {
    const trimmed = newName.trim();
    if (!trimmed) {
      showAlert('Perhatian', 'Nama mata kuliah tidak boleh kosong.');
      return false;
    }

    const target = subjects.find(s => s.id === id);
    if (!target) return false;

    const oldName = target.name;
    if (oldName.toLowerCase().trim() === trimmed.toLowerCase()) return true;

    if (subjects.some(s => s.id !== id && s.name.toLowerCase().trim() === trimmed.toLowerCase())) {
      showAlert('Sudah Ada', `Mata kuliah "${trimmed}" sudah ada di daftarmu.`);
      return false;
    }

    const updated = subjects.map(s => (s.id === id ? { ...s, name: trimmed } : s));
    setSubjects(updated);

    const storageKey = getStorageKey(user?.id);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

    // Update existing notes & tasks that reference the old subject name
    if (user?.id && oldName.toLowerCase().trim() !== trimmed.toLowerCase()) {
      try {
        const [cachedNotes, cachedTasks] = await Promise.all([
          getCachedNotes(user.id),
          getCachedTasks(user.id),
        ]);
        let changed = false;

        const renamedNotes = cachedNotes.map(n => {
          if (n.subject && n.subject.toLowerCase().trim() === oldName.toLowerCase().trim()) {
            changed = true;
            return { ...n, subject: trimmed };
          }
          return n;
        });
        if (changed) await cacheNotesLocally(user.id, renamedNotes);

        changed = false;
        const renamedTasks = cachedTasks.map(t => {
          if (t.subject && t.subject.toLowerCase().trim() === oldName.toLowerCase().trim()) {
            changed = true;
            return { ...t, subject: trimmed };
          }
          return t;
        });
        if (changed) await cacheTasksLocally(user.id, renamedTasks);
      } catch (e) {
        console.log('Error renaming local notes/tasks subjects:', e);
      }

      try {
        await supabase
          .from('study_notes')
          .update({ subject: trimmed })
          .eq('user_id', user.id)
          .ilike('subject', oldName);
        await supabase
          .from('student_tasks')
          .update({ subject: trimmed })
          .eq('user_id', user.id)
          .ilike('subject', oldName);
      } catch (e) {
        console.log('Error renaming remote subject:', e);
      }
    }

    return true;
  };

  return (
    <SubjectContext.Provider value={{ subjects, loading, addSubject, deleteSubject, renameSubject, refreshSubjects }}>
      {children}
    </SubjectContext.Provider>
  );
}

export function useSubjects() {
  const context = useContext(SubjectContext);
  if (!context) {
    throw new Error('useSubjects must be used within a SubjectProvider');
  }
  return context;
}
