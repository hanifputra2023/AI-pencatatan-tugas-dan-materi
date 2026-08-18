import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { MoodOption, MOOD_OPTIONS as DEFAULT_MOOD_OPTIONS } from '../types';
import { setInMemoryApiKeys } from '../lib/gemini';

interface MoodContextType {
  moods: MoodOption[];
  loading: boolean;
  addMood: (mood: Omit<MoodOption, 'type'> & { type?: string }) => Promise<void>;
  updateMood: (type: string, mood: Partial<MoodOption>) => Promise<void>;
  deleteMood: (type: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  aiPersona: string;
  updateAiPersona: (prompt: string) => Promise<void>;
  aiBotName: string;
  updateAiBotName: (name: string) => Promise<void>;
  globalAnnouncement: string;
  updateGlobalAnnouncement: (text: string) => Promise<void>;
  geminiApiKey: string;
  updateGeminiApiKey: (key: string) => Promise<void>;
  geminiApiKeys: string[];
  updateGeminiApiKeys: (keys: string[]) => Promise<void>;
  appSettings: Record<string, string>;
  updateSetting: (key: string, value: string) => Promise<void>;
}

const MoodContext = createContext<MoodContextType>({
  moods: DEFAULT_MOOD_OPTIONS,
  loading: true,
  addMood: async () => {},
  updateMood: async () => {},
  deleteMood: async () => {},
  resetToDefaults: async () => {},
  aiPersona: '',
  updateAiPersona: async () => {},
  aiBotName: 'Ara',
  updateAiBotName: async () => {},
  globalAnnouncement: '',
  updateGlobalAnnouncement: async () => {},
  geminiApiKey: '',
  updateGeminiApiKey: async () => {},
  geminiApiKeys: [],
  updateGeminiApiKeys: async () => {},
  appSettings: {},
  updateSetting: async () => {},
});

export function MoodProvider({ children }: { children: React.ReactNode }) {
  const [moods, setMoods] = useState<MoodOption[]>(DEFAULT_MOOD_OPTIONS);
  const [aiPersona, setAiPersona] = useState<string>('');
  const [aiBotName, setAiBotName] = useState<string>('Ara');
  const [globalAnnouncement, setGlobalAnnouncement] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([]);
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchMoodsAndSettings = useCallback(async () => {
    try {
      // 1. Check local storage cache for instant offline responsiveness
      const cachedKeys = await AsyncStorage.getItem('@gemini_api_keys');
      if (cachedKeys) {
        try {
          const parsed = JSON.parse(cachedKeys);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setGeminiApiKeys(parsed);
            setGeminiApiKey(parsed[0]);
            setInMemoryApiKeys(parsed);
          }
        } catch (e) {}
      }

      const [moodsRes, settingsRes] = await Promise.all([
        supabase.from('app_moods').select('*').order('created_at', { ascending: true }),
        supabase.from('app_settings').select('*'),
      ]);

      if (moodsRes.data && moodsRes.data.length > 0) {
        setMoods(
          moodsRes.data.map(m => ({
            type: m.type_key || m.label.toLowerCase().replace(/\s+/g, '_'),
            emoji: m.emoji,
            label: m.label,
            color: m.color,
          }))
        );
      } else {
        setMoods(DEFAULT_MOOD_OPTIONS);
      }

      if (settingsRes.data && settingsRes.data.length > 0) {
        const map: Record<string, string> = {};
        let foundAnnouncement = false;
        let poolFromDb: string[] = [];

        settingsRes.data.forEach(item => {
          map[item.key] = item.value;
          if (item.key === 'ai_persona') setAiPersona(item.value);
          if (item.key === 'ai_bot_name') setAiBotName(item.value);
          if (item.key === 'gemini_api_keys') {
            try {
              const parsed = JSON.parse(item.value);
              if (Array.isArray(parsed)) {
                poolFromDb = parsed.filter((k: string) => k && k.trim() !== '');
              }
            } catch (e) {}
          }
          if (item.key === 'gemini_api_key' && poolFromDb.length === 0) {
            if (item.value) poolFromDb = [item.value];
          }
          if (item.key === 'global_announcement') {
            setGlobalAnnouncement(item.value || '');
            foundAnnouncement = true;
          }
        });

        if (poolFromDb.length > 0) {
          setGeminiApiKeys(poolFromDb);
          setGeminiApiKey(poolFromDb[0]);
          setInMemoryApiKeys(poolFromDb);
          await AsyncStorage.setItem('@gemini_api_keys', JSON.stringify(poolFromDb));
        }

        if (!foundAnnouncement) {
          setGlobalAnnouncement('');
        }
        setAppSettings(map);
      } else {
        setGlobalAnnouncement('');
      }
    } catch (e) {
      console.log('Using default moods and settings:', e);
      setMoods(DEFAULT_MOOD_OPTIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMoodsAndSettings();

    // Real-time listener for app_moods & app_settings
    const channel = supabase
      .channel('moods_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_moods' }, () => {
        fetchMoodsAndSettings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
        fetchMoodsAndSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMoodsAndSettings]);

  const addMood = async (newMood: Omit<MoodOption, 'type'> & { type?: string }) => {
    const typeKey = newMood.type || newMood.label.toLowerCase().replace(/\s+/g, '_');
    const item = {
      type_key: typeKey,
      emoji: newMood.emoji,
      label: newMood.label,
      color: newMood.color,
    };

    setMoods(prev => [...prev.filter(m => m.type !== typeKey), { ...newMood, type: typeKey }]);

    try {
      await supabase.from('app_moods').insert(item);
    } catch (e) {
      console.error(e);
    }
  };

  const updateMood = async (type: string, updated: Partial<MoodOption>) => {
    setMoods(prev => prev.map(m => (m.type === type ? { ...m, ...updated } : m)));
    try {
      await supabase
        .from('app_moods')
        .update({
          ...(updated.emoji && { emoji: updated.emoji }),
          ...(updated.label && { label: updated.label }),
          ...(updated.color && { color: updated.color }),
        })
        .eq('type_key', type);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMood = async (type: string) => {
    setMoods(prev => prev.filter(m => m.type !== type));
    try {
      await supabase.from('app_moods').delete().eq('type_key', type);
    } catch (e) {
      console.error(e);
    }
  };

  const resetToDefaults = async () => {
    setMoods(DEFAULT_MOOD_OPTIONS);
    try {
      await supabase.from('app_moods').delete().neq('type_key', '');
      const inserts = DEFAULT_MOOD_OPTIONS.map(m => ({
        type_key: m.type,
        emoji: m.emoji,
        label: m.label,
        color: m.color,
      }));
      await supabase.from('app_moods').insert(inserts);
    } catch (e) {
      console.error(e);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    setAppSettings(prev => ({ ...prev, [key]: value }));
    if (key === 'ai_persona') setAiPersona(value);
    if (key === 'ai_bot_name') setAiBotName(value);
    if (key === 'global_announcement') setGlobalAnnouncement(value);
    if (key === 'gemini_api_key') {
      setGeminiApiKey(value);
      await AsyncStorage.setItem('@gemini_api_key', value);
    }

    try {
      await supabase.from('app_settings').upsert({
        key,
        value,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const updateAiPersona = async (prompt: string) => {
    await updateSetting('ai_persona', prompt);
  };

  const updateAiBotName = async (name: string) => {
    await updateSetting('ai_bot_name', name);
  };

  const updateGlobalAnnouncement = async (text: string) => {
    await updateSetting('global_announcement', text);
  };

  const updateGeminiApiKey = async (key: string) => {
    await updateSetting('gemini_api_key', key);
    const updatedPool = [key, ...geminiApiKeys.filter(k => k !== key)];
    await updateGeminiApiKeys(updatedPool);
  };

  const updateGeminiApiKeys = async (keys: string[]) => {
    const cleanKeys = keys.filter(k => k && k.trim() !== '');
    setGeminiApiKeys(cleanKeys);
    if (cleanKeys.length > 0) {
      setGeminiApiKey(cleanKeys[0]);
    }
    setInMemoryApiKeys(cleanKeys);
    await AsyncStorage.setItem('@gemini_api_keys', JSON.stringify(cleanKeys));
    await updateSetting('gemini_api_keys', JSON.stringify(cleanKeys));
    if (cleanKeys.length > 0) {
      await updateSetting('gemini_api_key', cleanKeys[0]);
    }
  };

  return (
    <MoodContext.Provider
      value={{
        moods,
        loading,
        addMood,
        updateMood,
        deleteMood,
        resetToDefaults,
        aiPersona,
        updateAiPersona,
        aiBotName,
        updateAiBotName,
        globalAnnouncement,
        updateGlobalAnnouncement,
        geminiApiKey,
        updateGeminiApiKey,
        geminiApiKeys,
        updateGeminiApiKeys,
        appSettings,
        updateSetting,
      }}
    >
      {children}
    </MoodContext.Provider>
  );
}

export const useMoods = () => useContext(MoodContext);
