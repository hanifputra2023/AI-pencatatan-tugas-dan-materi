import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type BgArtStyle = 'none' | 'aurora-ribbons' | 'fluid-waves' | 'geometric-glow' | 'custom-photo';

export interface AppTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light' | 'custom';
  iconName: string;
  description: string;
  primary: string;
  accent: string;
  accentLight: string;
  accentBg: string;
  bg: string;
  card: string;
  cardInner: string;
  border: string;
  text: string;
  subtext: string;
  muted: string;
}

// -------------------------------------------------------------
// CURATED DARK PRESETS (8 Styles) - Clean Vector Style (No Emojis)
// -------------------------------------------------------------
export const DARK_THEMES: AppTheme[] = [
  {
    id: 'obsidian-blue',
    name: 'Obsidian Blue (Default)',
    mode: 'dark',
    iconName: 'planet-outline',
    description: 'Nuansa biru modern gelap dengan kontras seimbang.',
    primary: '#2563EB',
    accent: '#3B82F6',
    accentLight: '#60A5FA',
    accentBg: '#16233B',
    bg: '#0E1117',
    card: '#141822',
    cardInner: '#0E1117',
    border: '#1E2430',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    mode: 'dark',
    iconName: 'leaf-outline',
    description: 'Nuansa hijau alami yang menenangkan mata saat belajar.',
    primary: '#059669',
    accent: '#10B981',
    accentLight: '#34D399',
    accentBg: '#102B21',
    bg: '#09130F',
    card: '#11221B',
    cardInner: '#0A1612',
    border: '#18362B',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'midnight-galaxy',
    name: 'Midnight Galaxy',
    mode: 'dark',
    iconName: 'sparkles-outline',
    description: 'Nuansa ungu galaksi misterius dan estetis.',
    primary: '#7C3AED',
    accent: '#8B5CF6',
    accentLight: '#A78BFA',
    accentBg: '#23153C',
    bg: '#0F0C18',
    card: '#181326',
    cardInner: '#100D1C',
    border: '#2B1F45',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    mode: 'dark',
    iconName: 'sunny-outline',
    description: 'Nuansa hangat senja yang memicu fokus dan semangat.',
    primary: '#D97706',
    accent: '#F59E0B',
    accentLight: '#FBBF24',
    accentBg: '#2E1E09',
    bg: '#130E07',
    card: '#1F170D',
    cardInner: '#140F08',
    border: '#362816',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    mode: 'dark',
    iconName: 'flash-outline',
    description: 'Nuansa pink & magenta modern yang futuristik.',
    primary: '#DB2777',
    accent: '#EC4899',
    accentLight: '#F472B6',
    accentBg: '#2E1222',
    bg: '#140A10',
    card: '#21111B',
    cardInner: '#140910',
    border: '#381B2E',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    mode: 'dark',
    iconName: 'water-outline',
    description: 'Nuansa biru laut dan teal yang segar dan bersih.',
    primary: '#0891B2',
    accent: '#06B6D4',
    accentLight: '#22D3EE',
    accentBg: '#10262E',
    bg: '#071216',
    card: '#0D1E24',
    cardInner: '#071317',
    border: '#16333D',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'crimson-ruby',
    name: 'Crimson Ruby',
    mode: 'dark',
    iconName: 'diamond-outline',
    description: 'Nuansa merah ruby elegan dan tegas.',
    primary: '#DC2626',
    accent: '#EF4444',
    accentLight: '#F87171',
    accentBg: '#2E1215',
    bg: '#14080A',
    card: '#210E11',
    cardInner: '#140709',
    border: '#38161B',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
  {
    id: 'onyx-monochrome',
    name: 'Onyx Monokrom',
    mode: 'dark',
    iconName: 'contrast-outline',
    description: 'Nuansa abu-abu slate monokromatis minimalis profesional.',
    primary: '#475569',
    accent: '#64748B',
    accentLight: '#94A3B8',
    accentBg: '#1E2430',
    bg: '#090B0E',
    card: '#121620',
    cardInner: '#0A0D14',
    border: '#1E2636',
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
  },
];

// -------------------------------------------------------------
// CURATED LIGHT PRESETS (6 Styles) - Clean Vector Style (No Emojis)
// -------------------------------------------------------------
export const LIGHT_THEMES: AppTheme[] = [
  {
    id: 'clean-white',
    name: 'Clean White Minimalist',
    mode: 'light',
    iconName: 'sunny-outline',
    description: 'Tampilan putih bersih modern dengan aksen biru profesional.',
    primary: '#2563EB',
    accent: '#3B82F6',
    accentLight: '#1D4ED8',
    accentBg: '#EFF6FF',
    bg: '#F8FAFC',
    card: '#FFFFFF',
    cardInner: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    subtext: '#475569',
    muted: '#94A3B8',
  },
  {
    id: 'warm-sand',
    name: 'Warm Sand Light',
    mode: 'light',
    iconName: 'document-text-outline',
    description: 'Nuansa hangat lembut bernuansa kertas krem elegan.',
    primary: '#D97706',
    accent: '#F59E0B',
    accentLight: '#B45309',
    accentBg: '#FEF3C7',
    bg: '#FAF8F5',
    card: '#FFFFFF',
    cardInner: '#F4EFEA',
    border: '#E6DFD5',
    text: '#292524',
    subtext: '#57534E',
    muted: '#A8A29E',
  },
  {
    id: 'sage-pastel',
    name: 'Sage Pastel Light',
    mode: 'light',
    iconName: 'leaf-outline',
    description: 'Nuansa hijau sage lembut yang segar dan nyaman di mata.',
    primary: '#059669',
    accent: '#10B981',
    accentLight: '#047857',
    accentBg: '#ECFDF5',
    bg: '#F2F8F5',
    card: '#FFFFFF',
    cardInner: '#E6F2EC',
    border: '#CFE6DA',
    text: '#132E22',
    subtext: '#3D6352',
    muted: '#84A897',
  },
  {
    id: 'lavender-dream',
    name: 'Lavender Dream Light',
    mode: 'light',
    iconName: 'color-filter-outline',
    description: 'Nuansa pastel ungu lavender yang anggun dan menenangkan.',
    primary: '#7C3AED',
    accent: '#8B5CF6',
    accentLight: '#6D28D9',
    accentBg: '#F3E8FF',
    bg: '#F8F6FC',
    card: '#FFFFFF',
    cardInner: '#F0EBF8',
    border: '#DFD5F0',
    text: '#1E1630',
    subtext: '#51436E',
    muted: '#9688B3',
  },
  {
    id: 'sakura-rose',
    name: 'Sakura Rose Light',
    mode: 'light',
    iconName: 'heart-outline',
    description: 'Nuansa pink sakura cerah yang manis dan bersemangat.',
    primary: '#DB2777',
    accent: '#EC4899',
    accentLight: '#BE185D',
    accentBg: '#FCE7F3',
    bg: '#FCF6F9',
    card: '#FFFFFF',
    cardInner: '#F9ECF3',
    border: '#F2D5E6',
    text: '#2E1222',
    subtext: '#6B3B59',
    muted: '#B0839E',
  },
  {
    id: 'sky-cyan',
    name: 'Sky Cyan Light',
    mode: 'light',
    iconName: 'cloudy-outline',
    description: 'Nuansa biru langit cerah yang jernih dan lapang.',
    primary: '#0284C7',
    accent: '#0EA5E9',
    accentLight: '#0369A1',
    accentBg: '#E0F2FE',
    bg: '#F0F9FF',
    card: '#FFFFFF',
    cardInner: '#E0F2FE',
    border: '#BAE6FD',
    text: '#0C2B40',
    subtext: '#255D80',
    muted: '#7AA3BD',
  },
];

export const ALL_THEMES = [...DARK_THEMES, ...LIGHT_THEMES];

// -------------------------------------------------------------
// SEMANTIC COLOR TOKENS (success / warning / danger / info)
// Single source of truth so banners, badges & status colors stay
// consistent across every screen and follow light/dark mode.
// -------------------------------------------------------------
export interface SemanticColors {
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningStrong: string;
  warningSoft: string;
  warningBg: string;
  warningBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  info: string;
  infoBg: string;
  infoBorder: string;
}

export const getSemanticColors = (isLightMode: boolean): SemanticColors =>
  isLightMode
    ? {
        success: '#16A34A',
        successBg: '#F0FDF4',
        successBorder: '#BBF7D0',
        warning: '#D97706',
        warningStrong: '#92400E',
        warningSoft: '#78350F',
        warningBg: '#FEF3C7',
        warningBorder: '#FDE68A',
        danger: '#DC2626',
        dangerBg: '#FEE2E2',
        dangerBorder: '#FECACA',
        info: '#0284C7',
        infoBg: '#E0F2FE',
        infoBorder: '#BAE6FD',
      }
    : {
        success: '#34D399',
        successBg: '#0D1A16',
        successBorder: '#192823',
        warning: '#FBBF24',
        warningStrong: '#FCD34D',
        warningSoft: '#FDE68A',
        warningBg: '#261C08',
        warningBorder: '#3E2E10',
        danger: '#F87171',
        dangerBg: '#2D1418',
        dangerBorder: '#451A20',
        info: '#60A5FA',
        infoBg: '#101B2E',
        infoBorder: '#1E2D4A',
      };

// Helper to check luminance of a hex color
export function isColorLight(hex: string): boolean {
  if (!hex || typeof hex !== 'string') return false;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return false;
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140;
}

// Helper to calculate light or dark text based on background
export function getContrastColors(bgHex: string) {
  const isLight = isColorLight(bgHex);
  if (isLight) {
    return {
      text: '#0F172A',
      subtext: '#475569',
      muted: '#94A3B8',
      border: '#E2E8F0',
    };
  }
  return {
    text: '#F3F4F6',
    subtext: '#9CA3AF',
    muted: '#6B7280',
    border: '#1E2430',
  };
}

interface ThemeContextType {
  theme: AppTheme;
  themeMode: 'dark' | 'light' | 'custom';
  themeId: string;
  isLightMode: boolean;
  setThemeMode: (mode: 'dark' | 'light' | 'custom') => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setCustomColor: (key: 'bg' | 'card' | 'primary' | 'accent' | 'text' | 'border', value: string) => Promise<void>;
  setFullCustomTheme: (custom: Partial<AppTheme>) => Promise<void>;
  resetTheme: () => Promise<void>;
  darkThemes: AppTheme[];
  lightThemes: AppTheme[];
  allThemes: AppTheme[];
  customThemeData: Partial<AppTheme> | null;

  // Background Art & Custom Photo Wallpaper
  bgArtStyle: BgArtStyle;
  bgCustomImage: string | null;
  bgBlurRadius: number;
  bgDimmingOpacity: number;
  bgFitMode: 'cover' | 'contain';
  setBgArtStyle: (style: BgArtStyle) => Promise<void>;
  setBgCustomImage: (uri: string | null) => Promise<void>;
  setBgBlurRadius: (radius: number) => Promise<void>;
  setBgDimmingOpacity: (opacity: number) => Promise<void>;
  setBgFitMode: (mode: 'cover' | 'contain') => Promise<void>;
}

const STORAGE_KEY = '@user_app_theme_v2';
const BG_ART_STORAGE_KEY = '@user_bg_art_settings_v1';

const getInitialThemeState = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const mode = (parsed.mode as 'dark' | 'light' | 'custom') || 'dark';
        const id = parsed.id || (mode === 'light' ? 'clean-white' : 'obsidian-blue');
        return {
          mode,
          id,
          custom: parsed.custom || null,
        };
      }
    } catch (e) {}
  }
  return {
    mode: 'dark' as const,
    id: 'obsidian-blue',
    custom: null,
  };
};

const ThemeContext = createContext<ThemeContextType>({
  theme: DARK_THEMES[0],
  themeMode: 'dark',
  themeId: 'obsidian-blue',
  isLightMode: false,
  setThemeMode: async () => {},
  setTheme: async () => {},
  setCustomColor: async () => {},
  setFullCustomTheme: async () => {},
  resetTheme: async () => {},
  darkThemes: DARK_THEMES,
  lightThemes: LIGHT_THEMES,
  allThemes: ALL_THEMES,
  customThemeData: null,
  bgArtStyle: 'aurora-ribbons',
  bgCustomImage: null,
  bgBlurRadius: 18,
  bgDimmingOpacity: 0.55,
  bgFitMode: 'cover',
  setBgArtStyle: async () => {},
  setBgCustomImage: async () => {},
  setBgBlurRadius: async () => {},
  setBgDimmingOpacity: async () => {},
  setBgFitMode: async () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const initial = getInitialThemeState();
  const [themeMode, setLocalThemeMode] = useState<'dark' | 'light' | 'custom'>(initial.mode);
  const [themeId, setLocalThemeId] = useState<string>(initial.id);
  const [customThemeData, setCustomThemeData] = useState<Partial<AppTheme> | null>(initial.custom);

  // Background Art & Wallpaper State
  const [bgArtStyle, setLocalBgArtStyle] = useState<BgArtStyle>('aurora-ribbons');
  const [bgCustomImage, setLocalBgCustomImage] = useState<string | null>(null);
  const [bgBlurRadius, setLocalBgBlurRadius] = useState<number>(0);
  const [bgDimmingOpacity, setLocalBgDimmingOpacity] = useState<number>(0.30);
  const [bgFitMode, setLocalBgFitMode] = useState<'cover' | 'contain'>('cover');

  // Sync to database
  const syncToDatabase = useCallback(async (
    mode: 'dark' | 'light' | 'custom',
    id: string,
    custom: Partial<AppTheme> | null,
    artSettings?: { style?: BgArtStyle; image?: string | null; blur?: number; dimming?: number; fit?: 'cover' | 'contain' }
  ) => {
    if (!user) return;
    try {
      await supabase.from('user_theme_settings').upsert({
        user_id: user.id,
        theme_mode: mode,
        theme_id: id,
        primary_color: custom?.primary || undefined,
        accent_color: custom?.accent || undefined,
        background_color: custom?.bg || undefined,
        card_color: custom?.card || undefined,
        text_color: custom?.text || undefined,
        border_color: custom?.border || undefined,
        custom_theme: custom ? JSON.stringify(custom) : null,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      try {
        await supabase.auth.updateUser({
          data: {
            app_theme_mode: mode,
            app_theme_id: id,
            app_custom_theme: custom ? JSON.stringify(custom) : null,
            app_bg_art_settings: artSettings || undefined,
          },
        });
      } catch (e) {}
    }
  }, [user]);

  // Load saved theme & background art on mount
  useEffect(() => {
    const loadSaved = async () => {
      try {
        // 1. Local storage first for immediate zero-latency load
        const [cachedTheme, cachedBgArt] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(BG_ART_STORAGE_KEY),
        ]);

        if (cachedTheme) {
          const parsed = JSON.parse(cachedTheme);
          if (parsed.mode) setLocalThemeMode(parsed.mode);
          if (parsed.id) setLocalThemeId(parsed.id);
          if (parsed.custom) setCustomThemeData(parsed.custom);
        }

        if (cachedBgArt) {
          try {
            const artParsed = JSON.parse(cachedBgArt);
            if (artParsed.style) setLocalBgArtStyle(artParsed.style);
            if (artParsed.image !== undefined) setLocalBgCustomImage(artParsed.image);
            if (typeof artParsed.blur === 'number') setLocalBgBlurRadius(artParsed.blur);
            if (typeof artParsed.dimming === 'number') setLocalBgDimmingOpacity(artParsed.dimming);
            if (artParsed.fit) setLocalBgFitMode(artParsed.fit);
          } catch (e) {}
        }

        // 2. Cloud database sync for authenticated users
        if (user) {
          const { data } = await supabase
            .from('user_theme_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (data) {
            const dbMode = data.theme_mode || 'dark';
            const dbId = data.theme_id || 'obsidian-blue';
            let dbCustom: any = null;
            if (data.custom_theme) {
              try {
                dbCustom = typeof data.custom_theme === 'string'
                  ? JSON.parse(data.custom_theme)
                  : data.custom_theme;
              } catch (e) {}
            }

            setLocalThemeMode(dbMode as any);
            setLocalThemeId(dbId);
            if (dbCustom) setCustomThemeData(dbCustom);

            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
              mode: dbMode,
              id: dbId,
              custom: dbCustom,
            }));
          }
        }
      } catch (e) {
        console.log('Error loading saved theme:', e);
      }
    };

    loadSaved();
  }, [user]);

  // Select Preset Theme
  const setTheme = async (newThemeId: string) => {
    const foundPreset = ALL_THEMES.find(t => t.id === newThemeId) || DARK_THEMES[0];
    const mode = foundPreset.mode;

    setLocalThemeMode(mode);
    setLocalThemeId(newThemeId);
    setCustomThemeData(null);

    const payload = { mode, id: newThemeId, custom: null };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    syncToDatabase(mode, newThemeId, null);
  };

  // Change Theme Mode
  const setThemeMode = async (mode: 'dark' | 'light' | 'custom') => {
    setLocalThemeMode(mode);
    let targetId = themeId;

    if (mode === 'dark') {
      const isDark = DARK_THEMES.some(t => t.id === themeId);
      if (!isDark) targetId = DARK_THEMES[0].id;
      setCustomThemeData(null);
    } else if (mode === 'light') {
      const isLight = LIGHT_THEMES.some(t => t.id === themeId);
      if (!isLight) targetId = LIGHT_THEMES[0].id;
      setCustomThemeData(null);
    }

    setLocalThemeId(targetId);
    const custom = mode === 'custom' ? (customThemeData || {}) : null;

    const payload = { mode, id: targetId, custom };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    syncToDatabase(mode, targetId, custom);
  };

  // Set Single Custom Color
  const setCustomColor = async (key: 'bg' | 'card' | 'primary' | 'accent' | 'text' | 'border', value: string) => {
    setLocalThemeMode('custom');

    const base = ALL_THEMES.find(t => t.id === themeId) || DARK_THEMES[0];
    const currentCustom = customThemeData || { ...base };
    const updatedCustom: Partial<AppTheme> = {
      ...currentCustom,
      [key]: value,
    };

    if (key === 'bg') {
      const contrast = getContrastColors(value);
      if (!updatedCustom.text) updatedCustom.text = contrast.text;
      if (!updatedCustom.subtext) updatedCustom.subtext = contrast.subtext;
      if (!updatedCustom.border) updatedCustom.border = contrast.border;
    }

    if (key === 'primary' || key === 'accent') {
      updatedCustom.accentLight = value;
      updatedCustom.accentBg = isColorLight(value) ? '#F1F5F9' : '#16233B';
    }

    setCustomThemeData(updatedCustom);

    const payload = { mode: 'custom' as const, id: themeId, custom: updatedCustom };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    syncToDatabase('custom', themeId, updatedCustom);
  };

  // Set Full Custom Theme
  const setFullCustomTheme = async (custom: Partial<AppTheme>) => {
    setLocalThemeMode('custom');
    setCustomThemeData(custom);

    const payload = { mode: 'custom' as const, id: themeId, custom };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    syncToDatabase('custom', themeId, custom);
  };

  // Reset to Default
  const resetTheme = async () => {
    await setTheme('obsidian-blue');
    await setBgArtStyle('aurora-ribbons');
    await setBgCustomImage(null);
  };

  // -------------------------------------------------------------
  // Background Art & Wallpaper Setters
  // -------------------------------------------------------------
  const saveBgArtLocally = async (artObj: { style: BgArtStyle; image: string | null; blur: number; dimming: number; fit: 'cover' | 'contain' }) => {
    await AsyncStorage.setItem(BG_ART_STORAGE_KEY, JSON.stringify(artObj));
    syncToDatabase(themeMode, themeId, customThemeData, artObj);
  };

  const setBgArtStyle = async (style: BgArtStyle) => {
    setLocalBgArtStyle(style);
    await saveBgArtLocally({
      style,
      image: bgCustomImage,
      blur: bgBlurRadius,
      dimming: bgDimmingOpacity,
      fit: bgFitMode,
    });
  };

  const setBgCustomImage = async (uri: string | null) => {
    setLocalBgCustomImage(uri);
    if (uri) {
      setLocalBgArtStyle('custom-photo');
    }
    await saveBgArtLocally({
      style: uri ? 'custom-photo' : bgArtStyle,
      image: uri,
      blur: bgBlurRadius,
      dimming: bgDimmingOpacity,
      fit: bgFitMode,
    });
  };

  const setBgBlurRadius = async (radius: number) => {
    setLocalBgBlurRadius(radius);
    await saveBgArtLocally({
      style: bgArtStyle,
      image: bgCustomImage,
      blur: radius,
      dimming: bgDimmingOpacity,
      fit: bgFitMode,
    });
  };

  const setBgDimmingOpacity = async (opacity: number) => {
    setLocalBgDimmingOpacity(opacity);
    await saveBgArtLocally({
      style: bgArtStyle,
      image: bgCustomImage,
      blur: bgBlurRadius,
      dimming: opacity,
      fit: bgFitMode,
    });
  };

  const setBgFitMode = async (fit: 'cover' | 'contain') => {
    setLocalBgFitMode(fit);
    await saveBgArtLocally({
      style: bgArtStyle,
      image: bgCustomImage,
      blur: bgBlurRadius,
      dimming: bgDimmingOpacity,
      fit,
    });
  };

  // Compute Active Final Theme
  const basePreset = ALL_THEMES.find(t => t.id === themeId) || DARK_THEMES[0];

  let computedTheme: AppTheme;
  if (themeMode === 'custom' && customThemeData) {
    const bg = customThemeData.bg || basePreset.bg;
    const isBgLight = isColorLight(bg);
    const contrast = getContrastColors(bg);

    computedTheme = {
      ...basePreset,
      ...customThemeData,
      id: 'custom',
      mode: isBgLight ? 'light' : 'dark',
      name: 'Custom Studio Creation',
      iconName: 'color-palette-outline',
      bg,
      card: customThemeData.card || (isBgLight ? '#FFFFFF' : '#141822'),
      cardInner: customThemeData.cardInner || (isBgLight ? '#F1F5F9' : '#0E1117'),
      border: customThemeData.border || contrast.border,
      text: customThemeData.text || contrast.text,
      subtext: customThemeData.subtext || contrast.subtext,
      muted: customThemeData.muted || contrast.muted,
      primary: customThemeData.primary || basePreset.primary,
      accent: customThemeData.accent || basePreset.accent,
      accentLight: customThemeData.accentLight || customThemeData.accent || basePreset.accentLight,
      accentBg: customThemeData.accentBg || (isBgLight ? '#EFF6FF' : '#16233B'),
    };
  } else {
    computedTheme = basePreset;
  }

  const isLightMode = isColorLight(computedTheme.bg) || computedTheme.mode === 'light';

  // If a photo wallpaper is active, apply glassmorphic translucency to cards so wallpaper shines through beautifully
  if (bgCustomImage || bgArtStyle === 'custom-photo') {
    computedTheme = {
      ...computedTheme,
      card: isLightMode ? 'rgba(255, 255, 255, 0.88)' : 'rgba(20, 24, 34, 0.85)',
      cardInner: isLightMode ? 'rgba(241, 245, 249, 0.80)' : 'rgba(14, 17, 23, 0.80)',
      border: isLightMode ? 'rgba(226, 232, 240, 0.90)' : 'rgba(30, 36, 48, 0.90)',
    };
  }

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = computedTheme.bg;
      if (document.body) {
        document.body.style.backgroundColor = computedTheme.bg;
      }
    }
  }, [computedTheme.bg]);

  return (
    <ThemeContext.Provider
      value={{
        theme: computedTheme,
        themeMode,
        themeId,
        isLightMode,
        setThemeMode,
        setTheme,
        setCustomColor,
        setFullCustomTheme,
        resetTheme,
        darkThemes: DARK_THEMES,
        lightThemes: LIGHT_THEMES,
        allThemes: ALL_THEMES,
        customThemeData,
        bgArtStyle,
        bgCustomImage,
        bgBlurRadius,
        bgDimmingOpacity,
        bgFitMode,
        setBgArtStyle,
        setBgCustomImage,
        setBgBlurRadius,
        setBgDimmingOpacity,
        setBgFitMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
