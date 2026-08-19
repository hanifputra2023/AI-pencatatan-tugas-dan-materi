import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const MASTER_ADMIN_PASSCODE = 'SUPERADMIN2026';
const MAX_ATTEMPTS = 4;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const STORAGE_SESSION_CACHE = '@app_cached_user_session';
const STORAGE_EXPLICIT_SIGNOUT = '@app_explicit_signout';

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
  const isExplicitSignOutRef = useRef(false);

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
    let mounted = true;

    // 1. Initial Session Load & Local Backup Hydration
    const initAuth = async () => {
      try {
        const explicitOut = await AsyncStorage.getItem(STORAGE_EXPLICIT_SIGNOUT);
        if (explicitOut === 'true') {
          if (mounted) setLoading(false);
          return;
        }

        // Try Supabase official getSession
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession && mounted) {
          setSession(activeSession);
          isExplicitSignOutRef.current = false;
          await AsyncStorage.setItem(STORAGE_SESSION_CACHE, JSON.stringify(activeSession));
          if (activeSession.user?.id) {
            fetchRole(activeSession.user.id);
          }
        } else {
          // Backup fallback: check cached session
          const cachedStr = await AsyncStorage.getItem(STORAGE_SESSION_CACHE);
          if (cachedStr && mounted) {
            try {
              const cachedObj = JSON.parse(cachedStr);
              if (cachedObj?.user?.id) {
                setSession(cachedObj);
                fetchRole(cachedObj.user.id);
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('Auth init check error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 2. Resilient Auth State Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (newSession) {
          isExplicitSignOutRef.current = false;
          await AsyncStorage.removeItem(STORAGE_EXPLICIT_SIGNOUT);
          await AsyncStorage.setItem(STORAGE_SESSION_CACHE, JSON.stringify(newSession));
          setSession(newSession);
          if (newSession.user?.id) {
            fetchRole(newSession.user.id);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        // Only log out if user explicitly clicked Sign Out
        if (isExplicitSignOutRef.current) {
          setSession(null);
          setRole('student');
          await AsyncStorage.setItem(STORAGE_EXPLICIT_SIGNOUT, 'true');
          await AsyncStorage.removeItem(STORAGE_SESSION_CACHE);
        } else {
          // Idle timeout or transient WebSocket blip: attempt to keep local session alive
          console.warn('Ignored transient SIGNED_OUT event to prevent accidental idle logout');
        }
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  // Explicit user sign out
  const signOut = async () => {
    isExplicitSignOutRef.current = true;
    try {
      await AsyncStorage.setItem(STORAGE_EXPLICIT_SIGNOUT, 'true');
      await AsyncStorage.removeItem(STORAGE_SESSION_CACHE);
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
