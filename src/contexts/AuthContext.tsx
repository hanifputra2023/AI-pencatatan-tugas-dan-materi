import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const MASTER_ADMIN_PASSCODE = 'SUPERADMIN2026';
const MAX_ATTEMPTS = 4;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  claimAdminRole: (passcode: string) => Promise<{ success: boolean; message: string }>;
  refreshProfileRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: 'student',
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  claimAdminRole: async () => ({ success: false, message: '' }),
  refreshProfileRole: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string>('student');
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const localRole = await AsyncStorage.getItem('@local_role_' + userId);
      if (localRole === 'admin') {
        setRole('admin');
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        if (data.role === 'admin' || localRole === 'admin') {
          setRole('admin');
          await AsyncStorage.setItem('@local_role_' + userId, 'admin');
        } else {
          setRole('student');
          await AsyncStorage.setItem('@local_role_' + userId, 'student');
        }
      }
    } catch (e) {
      const localRole = await AsyncStorage.getItem('@local_role_' + userId);
      if (localRole === 'admin') {
        setRole('admin');
      } else {
        setRole('student');
      }
    }
  }, []);

  const refreshProfileRole = useCallback(async () => {
    if (session?.user?.id) {
      await fetchRole(session.user.id);
    }
  }, [session?.user?.id, fetchRole]);

  useEffect(() => {
    let isMounted = true;

    // 1. Initial Session Retrieval
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) return;
      if (initialSession) {
        setSession(initialSession);
        if (initialSession.user?.id) {
          fetchRole(initialSession.user.id);
        }
      }
      setLoading(false);
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setRole('student');
      } else if (currentSession) {
        setSession(currentSession);
        if (currentSession.user?.id) {
          fetchRole(currentSession.user.id);
        }
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setSession(null);
    setRole('student');
  };

  // Secure admin claim
  const claimAdminRole = async (passcode: string): Promise<{ success: boolean; message: string }> => {
    if (!session?.user?.id) {
      return { success: false, message: 'Harus login terlebih dahulu.' };
    }

    const userId = session.user.id;
    const now = Date.now();

    const lockoutTimestamp = await AsyncStorage.getItem('@admin_lockout_' + userId);
    if (lockoutTimestamp) {
      const lockUntil = parseInt(lockoutTimestamp, 10);
      if (now < lockUntil) {
        const remainingMinutes = Math.ceil((lockUntil - now) / 60000);
        return {
          success: false,
          message: `🚫 Akses diblokir sementara (Anti-Brute Force). Silakan tunggu ${remainingMinutes} menit lagi.`,
        };
      } else {
        await AsyncStorage.removeItem('@admin_lockout_' + userId);
        await AsyncStorage.setItem('@admin_attempts_' + userId, '0');
      }
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    const attemptsStr = await AsyncStorage.getItem('@admin_attempts_' + userId);
    let attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    const cleanPass = passcode.trim().toUpperCase();
    if (cleanPass !== MASTER_ADMIN_PASSCODE) {
      attempts += 1;
      await AsyncStorage.setItem('@admin_attempts_' + userId, attempts.toString());

      if (attempts >= MAX_ATTEMPTS) {
        const lockUntil = now + LOCKOUT_DURATION_MS;
        await AsyncStorage.setItem('@admin_lockout_' + userId, lockUntil.toString());
        await AsyncStorage.setItem('@admin_attempts_' + userId, '0');
        return {
          success: false,
          message: `🚨 Keamanan Sistem Terpicu! 4 kali percobaan salah. Verifikasi dibekukan selama 15 menit.`,
        };
      }

      const sisa = MAX_ATTEMPTS - attempts;
      return {
        success: false,
        message: `Kode otorisasi tidak valid. Sisa kesempatan: ${sisa} kali sebelum akun dibekukan sementara.`,
      };
    }

    await AsyncStorage.removeItem('@admin_attempts_' + userId);
    await AsyncStorage.removeItem('@admin_lockout_' + userId);

    try {
      await AsyncStorage.setItem('@local_role_' + userId, 'admin');
      setRole('admin');
      try {
        await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', userId);
      } catch (dbErr) {}

      return {
        success: true,
        message: 'Otorisasi berhasil! Akun kamu telah diverifikasi sebagai Administrator 👑.',
      };
    } catch (e: any) {
      await AsyncStorage.setItem('@local_role_' + userId, 'admin');
      setRole('admin');
      return {
        success: true,
        message: 'Akses Administrator berhasil diaktifkan 👑.',
      };
    }
  };

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        isAdmin,
        loading,
        signOut,
        claimAdminRole,
        refreshProfileRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
