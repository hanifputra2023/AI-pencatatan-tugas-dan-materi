import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MoodOption, MOOD_OPTIONS as DEFAULT_MOOD_OPTIONS } from '../types';

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
  appSettings: {},
  updateSetting: async () => {},
});

export function MoodProvider({ children }: { children: React.ReactNode }) {
  const [moods, setMoods] = useState<MoodOption[]>(DEFAULT_MOOD_OPTIONS);
  const [aiPersona, setAiPersona] = useState<string>('');
  const [aiBotName, setAiBotName] = useState<string>('Ara');
  const [globalAnnouncement, setGlobalAnnouncement] = useState<string>('');
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchMoodsAndSettings = useCallback(async () => {
    try {
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
        settingsRes.data.forEach(item => {
          map[item.key] = item.value;
          if (item.key === 'ai_persona') setAiPersona(item.value);
          if (item.key === 'ai_bot_name') setAiBotName(item.value);
          if (item.key === 'global_announcement') {
            setGlobalAnnouncement(item.value || '');
            foundAnnouncement = true;
          }
        });
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
      await supabase.from('app_moods').delete().neq('id', '00000000-0000-0000-0000-000000000000');
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
        appSettings,
        updateSetting,
      }}
    >
      {children}
    </MoodContext.Provider>
  );
}

export const useMoods = () => useContext(MoodContext);
