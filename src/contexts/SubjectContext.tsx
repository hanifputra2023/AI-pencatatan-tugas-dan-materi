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

const STORAGE_KEY = '@my_student_subjects';

export function SubjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from local storage and supabase
  const refreshSubjects = useCallback(async () => {
    try {
      // 1. Try local cache first
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        setSubjects(JSON.parse(cached));
      }

      if (!user) {
        if (!cached) {
          const defaultItems = DEFAULT_SUBJECT_NAMES.map((name, i) => ({
            id: 'local_' + i,
            name,
          }));
          setSubjects(defaultItems);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultItems));
        }
        setLoading(false);
        return;
      }

      // 2. Fetch from Supabase
      const { data, error } = await supabase
        .from('student_subjects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        const mapped = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          color: d.color,
        }));
        setSubjects(mapped);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
      } else if (!data || data.length === 0) {
        // Seed default subjects for new user
        const seedItems = DEFAULT_SUBJECT_NAMES.map(name => ({
          user_id: user.id,
          name,
        }));
        const { data: inserted } = await supabase
          .from('student_subjects')
          .insert(seedItems)
          .select();

        if (inserted) {
          const mapped = inserted.map((d: any) => ({
            id: d.id,
            name: d.name,
            color: d.color,
          }));
          setSubjects(mapped);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        } else {
          // If table not created yet in Supabase, fallback to local defaults
          const defaultItems = DEFAULT_SUBJECT_NAMES.map((name, i) => ({
            id: 'local_' + i,
            name,
          }));
          setSubjects(defaultItems);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultItems));
        }
      }
    } catch (e) {
      console.log('Subject load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshSubjects();

    if (!user) return;

    const channel = supabase
      .channel('subjects_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_subjects', filter: `user_id=eq.${user.id}` }, () => {
        refreshSubjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshSubjects]);

  // Add new Subject
  const addSubject = async (name: string): Promise<StudentSubject | null> => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('Perhatian', 'Nama mata kuliah tidak boleh kosong.');
      return null;
    }

    if (subjects.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      showAlert('Sudah Ada', `Mata kuliah "${trimmed}" sudah ada di daftarmu.`);
      return null;
    }

    const tempId = 'subj_' + Date.now();
    const newSubj: StudentSubject = { id: tempId, name: trimmed };

    const updated = [...subjects, newSubj];
    setSubjects(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (user) {
      const { data } = await supabase
        .from('student_subjects')
        .insert({ user_id: user.id, name: trimmed })
        .select()
        .single();
      if (data) {
        newSubj.id = data.id;
        const finalized = updated.map(s => s.id === tempId ? { ...s, id: data.id } : s);
        setSubjects(finalized);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(finalized));
      }
    }

    return newSubj;
  };

  // Delete Subject
  const deleteSubject = async (id: string): Promise<boolean> => {
    const updated = subjects.filter(s => s.id !== id);
    setSubjects(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (user && !id.startsWith('local_') && !id.startsWith('subj_')) {
      await supabase.from('student_subjects').delete().eq('id', id);
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
