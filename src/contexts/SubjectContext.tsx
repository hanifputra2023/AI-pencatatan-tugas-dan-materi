import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { showAlert } from '../lib/alert';

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
            setSubjects(currentList);
          }
        } catch (e) {}
      }

      // Check fallback legacy key if user key is empty
      if (currentList.length === 0) {
        const legacyCached = await AsyncStorage.getItem('@my_student_subjects');
        if (legacyCached) {
          try {
            const parsed = JSON.parse(legacyCached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              currentList = parsed;
              setSubjects(currentList);
            }
          } catch (e) {}
        }
      }

      // 2. If logged in, fetch from Cloud (User Metadata + Study Notes + Student Subjects table)
      if (user) {
        const existingNames = new Set(currentList.map(s => s.name.toLowerCase().trim()));

        // A. From Supabase Auth user_metadata
        const cloudMetaSubjects = user.user_metadata?.student_subjects;
        if (Array.isArray(cloudMetaSubjects) && cloudMetaSubjects.length > 0) {
          cloudMetaSubjects.forEach((s: any) => {
            const name = typeof s === 'string' ? s : s.name;
            if (name && !existingNames.has(name.toLowerCase().trim())) {
              existingNames.add(name.toLowerCase().trim());
              currentList.push({
                id: (typeof s === 'object' && s.id) ? s.id : 'cloud_' + Math.random().toString(36).substring(2, 8),
                name: name.trim(),
              });
            }
          });
        }

        // B. From user's existing study notes in Supabase
        try {
          const { data: noteSubjects } = await supabase
            .from('study_notes')
            .select('subject')
            .eq('user_id', user.id);

          if (noteSubjects && noteSubjects.length > 0) {
            noteSubjects.forEach((n: any) => {
              if (n.subject && n.subject.trim() && !existingNames.has(n.subject.toLowerCase().trim())) {
                existingNames.add(n.subject.toLowerCase().trim());
                currentList.push({
                  id: 'note_subj_' + Math.random().toString(36).substring(2, 8),
                  name: n.subject.trim(),
                });
              }
            });
          }
        } catch (e) {}

        // C. Try table student_subjects if available
        try {
          const { data: tableData } = await supabase
            .from('student_subjects')
            .select('*')
            .eq('user_id', user.id);

          if (tableData && tableData.length > 0) {
            tableData.forEach((t: any) => {
              if (t.name && !existingNames.has(t.name.toLowerCase().trim())) {
                existingNames.add(t.name.toLowerCase().trim());
                currentList.push({ id: t.id, name: t.name.trim() });
              }
            });
          }
        } catch (e) {}
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

    if (user) {
      // Try saving to table if available
      try {
        const { data } = await supabase
          .from('student_subjects')
          .insert({ user_id: user.id, name: trimmed })
          .select()
          .single();
        if (data) {
          newSubj.id = data.id;
          const finalized = updated.map(s => s.id === tempId ? { ...s, id: data.id } : s);
          setSubjects(finalized);
          await AsyncStorage.setItem(storageKey, JSON.stringify(finalized));
        }
      } catch (e) {}
    }

    return newSubj;
  };

  // Delete Subject
  const deleteSubject = async (id: string): Promise<boolean> => {
    const updated = subjects.filter(s => s.id !== id);
    setSubjects(updated);

    const storageKey = getStorageKey(user?.id);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

    if (user) {
      try {
        await supabase.from('student_subjects').delete().eq('id', id);
      } catch (e) {}
    }
    return true;
  };

  return (
    <SubjectContext.Provider value={{ subjects, loading, addSubject, deleteSubject, refreshSubjects }}>
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
