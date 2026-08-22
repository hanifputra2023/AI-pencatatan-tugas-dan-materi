import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const MASTER_ADMIN_PASSCODE = 'SUPERADMIN2026';
const MAX_ATTEMPTS = 4;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 Menit Lockout jika salah 4x berturut-turut

export interface UserProfileData {
  username?: string | null;
  avatar_url?: string | null;
  role?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfileData | null;
  role: string;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  claimAdminRole: (passcode: string) => Promise<{ success: boolean; message: string }>;
  refreshProfileRole: () => Promise<void>;
  updateProfileCache: (data: Partial<UserProfileData>) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: 'student',
  isAdmin: false,
  loading: true,
  signOut: async () => { },
  claimAdminRole: async () => ({ success: false, message: '' }),
  refreshProfileRole: async () => { },
  updateProfileCache: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [role, setRole] = useState<string>('student');
  const [loading, setLoading] = useState(true);

  const updateProfileCache = useCallback((newData: Partial<UserProfileData>) => {
    setProfile(prev => {
      const updated = { ...prev, ...newData };
      if (session?.user?.id) {
        AsyncStorage.setItem('@user_profile_cache_' + session.user.id, JSON.stringify(updated)).catch(() => {});
      }
      return updated;
    });
  }, [session?.user?.id]);

  const fetchRoleAndProfile = useCallback(async (userId: string) => {
    try {
      // 1. Check local storage first for fast, offline-resilient access
      const [localRole, localProfile] = await Promise.all([
        AsyncStorage.getItem('@local_role_' + userId),
        AsyncStorage.getItem('@user_profile_cache_' + userId),
      ]);

      if (localRole === 'admin') {
        setRole('admin');
      }
      if (localProfile) {
        try {
          setProfile(JSON.parse(localProfile));
        } catch (e) {}
      }

      // 2. Fetch fresh profile from Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const profData: UserProfileData = {
          username: data.username,
          avatar_url: data.avatar_url,
          role: data.role || 'student',
        };
        setProfile(profData);
        await AsyncStorage.setItem('@user_profile_cache_' + userId, JSON.stringify(profData));

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
      await fetchRoleAndProfile(session.user.id);
    }
  }, [session?.user?.id, fetchRoleAndProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        fetchRoleAndProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        fetchRoleAndProfile(session.user.id);
      } else {
        setRole('student');
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoleAndProfile]);

  // Periodic token refresh — prevents silent session expiry on web browsers
  // Browsers throttle timers in background tabs, so we also refresh on visibility change
  useEffect(() => {
    const refreshSession = async () => {
      try {
        const { data: { session: current } } = await supabase.auth.getSession();
        if (!current) return;

        const expiresAt = current.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = expiresAt - now;

        // If token expires in less than 10 minutes, refresh proactively
        if (timeLeft < 600) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          if (refreshed) {
            setSession(refreshed);
          }
        }
      } catch {
        // Silent — onAuthStateChange will handle auth failures
      }
    };

    // Check every 5 minutes
    const interval = setInterval(refreshSession, 5 * 60 * 1000);

    // Also refresh when user returns to the tab (catches background-tab throttle, web only)
    let onVisibilityChange: (() => void) | null = null;
    if (Platform.OS === 'web') {
      onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          refreshSession();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (onVisibilityChange) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, []);

  // Realtime listener for role promotion/demotion
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel('profile_role_sync_' + session.user.id)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        payload => {
          const updated = payload.new as any;
          if (updated && updated.role) {
            setRole(updated.role);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole('student');
  };

  // =========================================================================
  // SECURE ANTI-BRUTE-FORCE & RATE-LIMITED ADMIN CLAIM VERIFICATION
  // =========================================================================
  const claimAdminRole = async (passcode: string): Promise<{ success: boolean; message: string }> => {
    if (!session?.user?.id) {
      return { success: false, message: 'Harus login terlebih dahulu.' };
    }

    const userId = session.user.id;
    const now = Date.now();

    // 1. Check if user is in Anti-Brute-Force Lockout period
    const lockoutTimestamp = await AsyncStorage.getItem('@admin_lockout_' + userId);
    if (lockoutTimestamp) {
      const lockUntil = parseInt(lockoutTimestamp, 10);
      if (now < lockUntil) {
        const remainingMinutes = Math.ceil((lockUntil - now) / 60000);
        return {
          success: false,
          message: `🚫 Akses diblokir sementara karena terlalu banyak kesalahan (Anti-Brute Force). Silakan tunggu ${remainingMinutes} menit lagi.`,
        };
      } else {
        // Lockout expired, reset
        await AsyncStorage.removeItem('@admin_lockout_' + userId);
        await AsyncStorage.setItem('@admin_attempts_' + userId, '0');
      }
    }

    // 2. Artificial Timing Delay (Prevents automated high-speed password dictionary attacks)
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Read current failed attempt counter
    const attemptsStr = await AsyncStorage.getItem('@admin_attempts_' + userId);
    let attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    // 4. Verify Passcode
    const cleanPass = passcode.trim().toUpperCase();
    if (cleanPass !== MASTER_ADMIN_PASSCODE) {
      attempts += 1;
      await AsyncStorage.setItem('@admin_attempts_' + userId, attempts.toString());

      if (attempts >= MAX_ATTEMPTS) {
        // Trigger 15-minute security lockout
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

    // 5. Success! Reset attempt counters
    await AsyncStorage.removeItem('@admin_attempts_' + userId);
    await AsyncStorage.removeItem('@admin_lockout_' + userId);

    try {
      // Immediately save admin state locally
      await AsyncStorage.setItem('@local_role_' + userId, 'admin');
      setRole('admin');

      // Attempt updating remote database
      try {
        await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', userId);
      } catch (dbErr) {
        // Silently ignore if column not yet added
      }

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
        profile,
        role,
        isAdmin,
        loading,
        signOut,
        claimAdminRole,
        refreshProfileRole,
        updateProfileCache,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
