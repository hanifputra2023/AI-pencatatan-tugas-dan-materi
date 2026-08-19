import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

// Robust cross-platform storage adapter for Supabase Auth
// On Web/Hosting, utilizes synchronous window.localStorage to prevent async hydration drops
const robustAuthStorage = {
  getItem: (key: string): string | Promise<string | null> | null => {
    if (isWeb) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): void | Promise<void> => {
    if (isWeb) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {}
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string): void | Promise<void> => {
    if (isWeb) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {}
    }
    return AsyncStorage.removeItem(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://phyaabrmqwlxlmexegpf.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SXG-NOaNs_rxB1g0eVxvTA_qWzyPtWB';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: robustAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
  },
});
