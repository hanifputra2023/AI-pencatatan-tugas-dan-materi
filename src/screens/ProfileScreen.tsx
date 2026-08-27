import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Image, ActivityIndicator, ScrollView, TextInput, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme, isColorLight } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';
import { RootStackParamList } from '../navigation/AppNavigator';
import { confirmAction, showAlert } from '../lib/alert';
import { compressImage } from '../lib/imageCompressor';
import { PersonaPreset } from '../types';
import { calculateRealStreak } from '../lib/streakCalculator';
import {
  isStrictlyLocalMode,
  setStrictlyLocalMode,
  exportAllAppDataAsJson,
  importAllAppDataFromJson,
  getCachedJournals,
  getCachedNotes,
  getCachedTasks,
} from '../lib/offlineSync';
import { getBossTrophies, BossTrophy } from '../lib/rpgStorage';
import BossAvatarIllustration from '../components/BossAvatarIllustration';
import {
  ALL_ACHIEVEMENTS,
  getUnlockedAchievements,
  checkAndUnlockAchievements,
  UnlockedAchievement,
} from '../lib/dailyRewardStorage';
import {
  ALL_RPG_TITLES,
  getUnlockedTitles,
  getActiveTitle,
  setActiveTitle,
  RpgTitle,
  RARITY_COLORS,
} from '../lib/lootChestStorage';

const BG_COLOR_PRESETS = [
  { label: 'Obsidian Dark', hex: '#0E1117' },
  { label: 'Pure Black', hex: '#000000' },
  { label: 'Deep Forest', hex: '#09130F' },
  { label: 'Galaxy Purple', hex: '#0F0C18' },
  { label: 'Dark Ruby', hex: '#14080A' },
  { label: 'Clean White', hex: '#F8FAFC' },
  { label: 'Pure White', hex: '#FFFFFF' },
  { label: 'Warm Cream', hex: '#FAF8F5' },
  { label: 'Sage Light', hex: '#F2F8F5' },
  { label: 'Sky Light', hex: '#F0F9FF' },
  { label: 'Midnight Blue', hex: '#111827' },
  { label: 'Slate Dark', hex: '#1E293B' },
];

const CARD_COLOR_PRESETS = [
  { label: 'Dark Navy', hex: '#141822' },
  { label: 'Dark Surface', hex: '#161B26' },
  { label: 'Dark Green', hex: '#11221B' },
  { label: 'Dark Purple', hex: '#181326' },
  { label: 'Dark Maroon', hex: '#210E11' },
  { label: 'Pure White', hex: '#FFFFFF' },
  { label: 'Light Gray', hex: '#F1F5F9' },
  { label: 'Warm Card', hex: '#F4EFEA' },
  { label: 'Soft Sage', hex: '#E6F2EC' },
  { label: 'Soft Blue', hex: '#E0F2FE' },
];

const ACCENT_COLOR_PALETTE = [
  '#2563EB', '#3B82F6', '#10B981', '#059669',
  '#7C3AED', '#8B5CF6', '#D97706', '#F59E0B',
  '#DB2777', '#EC4899', '#0891B2', '#06B6D4',
  '#DC2626', '#EF4444', '#14B8A6', '#84CC16',
  '#F97316', '#6366F1',
];

interface ColorPamphletItem {
  name: string;
  hex: string;
  desc?: string;
}

interface ColorPamphletCategory {
  title: string;
  icon: string;
  description: string;
  colors: ColorPamphletItem[];
}

const COLOR_PAMPHLET_CATEGORIES: ColorPamphletCategory[] = [
  {
    title: 'Nuansa Gelap & Deep (Mode Malam)',
    icon: 'moon',
    description: 'Pilihan warna gelap redup elegan yang sangat nyaman untuk mata.',
    colors: [
      { name: 'Obsidian Dark', hex: '#0E1117' },
      { name: 'Pure Black', hex: '#000000' },
      { name: 'Deep Space', hex: '#08090C' },
      { name: 'Dark Slate', hex: '#0F172A' },
      { name: 'Midnight Navy', hex: '#0B1120' },
      { name: 'Dark Charcoal', hex: '#121212' },
      { name: 'Deep Forest', hex: '#09130F' },
      { name: 'Dark Emerald', hex: '#061A14' },
      { name: 'Galaxy Purple', hex: '#0F0C18' },
      { name: 'Deep Violet', hex: '#150B24' },
      { name: 'Dark Plum', hex: '#1A0B1E' },
      { name: 'Dark Ruby', hex: '#14080A' },
      { name: 'Espresso Brown', hex: '#181008' },
      { name: 'Dark Copper', hex: '#1A1108' },
      { name: 'Dark Teal', hex: '#07151A' },
      { name: 'Onyx Monochrome', hex: '#090B0E' },
    ],
  },
  {
    title: 'Nuansa Terang, Krem & Pastel',
    icon: 'sunny',
    description: 'Pilihan warna terang bersih dan pastel lembut untuk tampilan minimalis.',
    colors: [
      { name: 'Clean White', hex: '#F8FAFC' },
      { name: 'Pure White', hex: '#FFFFFF' },
      { name: 'Snow Ice', hex: '#F1F5F9' },
      { name: 'Warm Cream', hex: '#FAF8F5' },
      { name: 'Warm Sand', hex: '#F5EBE6' },
      { name: 'Parchment Light', hex: '#FDFBF7' },
      { name: 'Soft Sage Mint', hex: '#F2F8F5' },
      { name: 'Pastel Mint', hex: '#F0FDF4' },
      { name: 'Sky Cyan Light', hex: '#F0F9FF' },
      { name: 'Ice Blue', hex: '#E0F2FE' },
      { name: 'Lavender Dream', hex: '#F8F6FC' },
      { name: 'Soft Lilac', hex: '#F3E8FF' },
      { name: 'Sakura Rose Light', hex: '#FCF6F9' },
      { name: 'Pastel Peach', hex: '#FFF7ED' },
      { name: 'Soft Buttercup', hex: '#FEFCE8' },
      { name: 'Linen Paper', hex: '#F9F9FB' },
    ],
  },
  {
    title: 'Nuansa Panel, Kartu & Container',
    icon: 'layers',
    description: 'Nuansa warna perantara yang seimbang untuk kotak kartu dan pembungkus menu.',
    colors: [
      { name: 'Dark Navy Card', hex: '#141822' },
      { name: 'Dark Surface', hex: '#161B26' },
      { name: 'Slate Gray Card', hex: '#1E293B' },
      { name: 'Zinc Charcoal', hex: '#18181B' },
      { name: 'Emerald Card', hex: '#11221B' },
      { name: 'Galaxy Card', hex: '#181326' },
      { name: 'Ruby Wine Card', hex: '#210E11' },
      { name: 'Amber Wood Card', hex: '#1F170D' },
      { name: 'Cyber Magenta Card', hex: '#21111B' },
      { name: 'Ocean Teal Card', hex: '#0D1E24' },
      { name: 'Light Card Slate', hex: '#E2E8F0' },
      { name: 'Soft Blue Card', hex: '#DBEAFE' },
      { name: 'Soft Sage Card', hex: '#E6F2EC' },
      { name: 'Soft Amber Card', hex: '#FEF3C7' },
      { name: 'Soft Purple Card', hex: '#EDE9FE' },
      { name: 'Soft Rose Card', hex: '#FFE4E6' },
    ],
  },
  {
    title: 'Warna Aksen, Tombol & Neon Cerah',
    icon: 'color-wand',
    description: 'Pilihan warna memikat dan bertenaga untuk tombol utama dan sorotan elemen.',
    colors: [
      { name: 'Royal Blue', hex: '#2563EB' },
      { name: 'Sky Electric', hex: '#0EA5E9' },
      { name: 'Cyan Glow', hex: '#06B6D4' },
      { name: 'Teal Modern', hex: '#0D9488' },
      { name: 'Emerald Gem', hex: '#10B981' },
      { name: 'Forest Green', hex: '#059669' },
      { name: 'Lime Energy', hex: '#84CC16' },
      { name: 'Sunflower Yellow', hex: '#EAB308' },
      { name: 'Sunset Amber', hex: '#F59E0B' },
      { name: 'Warm Orange', hex: '#F97316' },
      { name: 'Coral Red', hex: '#FF5733' },
      { name: 'Crimson Red', hex: '#EF4444' },
      { name: 'Ruby Red', hex: '#DC2626' },
      { name: 'Hot Pink', hex: '#EC4899' },
      { name: 'Cyber Magenta', hex: '#D946EF' },
      { name: 'Purple Violet', hex: '#8B5CF6' },
      { name: 'Deep Purple', hex: '#7C3AED' },
      { name: 'Indigo Aura', hex: '#6366F1' },
    ],
  },
];

export default function ProfileScreen() {
  const { user, signOut, isAdmin, role, claimAdminRole, refreshProfileRole, updateProfileCache } = useAuth();
  const {
    allPersonas,
    activePersona,
    selectPersona,
    refreshMoodsAndSettings,
    customAiName,
    customAiAvatar,
    updateUserCustomAi,
    resetUserCustomAi,
    aiBotName,
  } = useMoods();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;
  const {
    theme,
    themeMode,
    themeId,
    isLightMode,
    setThemeMode,
    setTheme,
    setCustomColor,
    setFullCustomTheme,
    resetTheme,
    darkThemes,
    lightThemes,
    allThemes,
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
  } = useTheme();

  const primaryBtnTextColor = isColorLight(theme.primary) ? '#0F172A' : '#FFFFFF';

  const handlePickWallpaperImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Izin Dibutuhkan', 'Izinkan akses galeri foto untuk memilih wallpaper kustom.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Keep original high-res aspect ratio without forced cropping
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        await setBgCustomImage(result.assets[0].uri);
        showAlert('Wallpaper Diterapkan', 'Foto kustom berhasil dipasang sebagai latar belakang dengan penyesuaian layar otomatis.');
      }
    } catch (e: any) {
      showAlert('Gagal', 'Gagal memuat gambar dari galeri.');
    }
  };

  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ total: 0, streak: 0, chats: 0 });

  // Secret Admin Claim Dialog State
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [secretTapCount, setSecretTapCount] = useState(0);

  // RPG Boss Trophies State
  const [bossTrophies, setBossTrophies] = useState<BossTrophy[]>([]);

  // Achievements State
  const [unlockedAchievements, setUnlockedAchievements] = useState<UnlockedAchievement[]>([]);

  // RPG Titles State
  const [unlockedTitleIds, setUnlockedTitleIds] = useState<string[]>([]);
  const [activeRpgTitle, setActiveRpgTitle] = useState<RpgTitle | null>(null);

  // AI Persona Selection Modal State
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [personaSearchQuery, setPersonaSearchQuery] = useState('');

  // Custom AI Avatar & Name Modal State
  const [showCustomAiModal, setShowCustomAiModal] = useState(false);
  const [tempAiName, setTempAiName] = useState(customAiName || aiBotName || 'Ara');
  const [tempAiAvatar, setTempAiAvatar] = useState<string | null>(customAiAvatar);
  const [savingCustomAi, setSavingCustomAi] = useState(false);

  const handlePickCustomAiAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Izin Dibutuhkan', 'Izinkan akses galeri foto untuk memilih avatar kustom AI.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawUri = result.assets[0].uri;
        const compressed = await compressImage(rawUri, { maxWidth: 300, quality: 0.7 });
        setTempAiAvatar(compressed);
      }
    } catch (e: any) {
      showAlert('Gagal', 'Gagal memuat foto avatar AI dari galeri.');
    }
  };

  const handleSaveCustomAi = async () => {
    setSavingCustomAi(true);
    const finalName = tempAiName.trim() || 'Ara';
    await updateUserCustomAi({
      botName: finalName,
      avatarUrl: tempAiAvatar,
    });
    setSavingCustomAi(false);
    setShowCustomAiModal(false);
    showAlert('Kustomisasi AI Tersimpan ✨', `Teman AI kamu sekarang bernama "${finalName}" dengan avatar kustom.`);
  };

  const handleResetCustomAi = async () => {
    setTempAiName('Ara');
    setTempAiAvatar(null);
    await resetUserCustomAi();
    setShowCustomAiModal(false);
    showAlert('Avatar & Nama AI Direset', 'Avatar dan nama teman AI telah dikembalikan ke pengaturan bawaan.');
  };

  // Custom Color Hex Inputs State
  const [customBgHex, setCustomBgHex] = useState(theme.bg);
  const [customCardHex, setCustomCardHex] = useState(theme.card);
  const [customAccentHex, setCustomAccentHex] = useState(theme.primary);
  const [customTextHex, setCustomTextHex] = useState(theme.text);
  const [customSubtextHex, setCustomSubtextHex] = useState(theme.subtext);

  useEffect(() => { setCustomBgHex(theme.bg); }, [theme.bg]);
  useEffect(() => { setCustomCardHex(theme.card); }, [theme.card]);
  useEffect(() => { setCustomAccentHex(theme.primary); }, [theme.primary]);
  useEffect(() => { setCustomTextHex(theme.text); }, [theme.text]);
  useEffect(() => { setCustomSubtextHex(theme.subtext); }, [theme.subtext]);

  const handleBgHexChange = (val: string) => {
    setCustomBgHex(val);
    const clean = val.trim().startsWith('#') ? val.trim() : ('#' + val.trim());
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setCustomColor('bg', clean.toUpperCase());
    }
  };

  const handleCardHexChange = (val: string) => {
    setCustomCardHex(val);
    const clean = val.trim().startsWith('#') ? val.trim() : ('#' + val.trim());
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setCustomColor('card', clean.toUpperCase());
    }
  };

  const handleAccentHexChange = (val: string) => {
    setCustomAccentHex(val);
    const clean = val.trim().startsWith('#') ? val.trim() : ('#' + val.trim());
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setCustomColor('primary', clean.toUpperCase());
    }
  };

  const handleTextHexChange = (val: string) => {
    setCustomTextHex(val);
    const clean = val.trim().startsWith('#') ? val.trim() : ('#' + val.trim());
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setCustomColor('text', clean.toUpperCase());
    }
  };

  const handleSubtextHexChange = (val: string) => {
    setCustomSubtextHex(val);
    const clean = val.trim().startsWith('#') ? val.trim() : ('#' + val.trim());
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setCustomColor('subtext', clean.toUpperCase());
    }
  };

  // Color Pamphlet Modal State
  const [showColorPamphletModal, setShowColorPamphletModal] = useState(false);
  const [colorPamphletTarget, setColorPamphletTarget] = useState<'bg' | 'card' | 'primary' | 'text' | 'subtext'>('bg');
  const [pamphletSearchQuery, setPamphletSearchQuery] = useState('');
  const [tempSelectedColor, setTempSelectedColor] = useState(theme.bg);

  const openColorPamphlet = (target: 'bg' | 'card' | 'primary' | 'text' | 'subtext') => {
    setColorPamphletTarget(target);
    const initialHex =
      target === 'bg' ? customBgHex
      : target === 'card' ? customCardHex
      : target === 'text' ? customTextHex
      : target === 'subtext' ? customSubtextHex
      : customAccentHex;
    setTempSelectedColor(initialHex);
    setPamphletSearchQuery('');
    setShowColorPamphletModal(true);
  };

  const applyPamphletColor = (hex: string) => {
    const cleanHex = hex.toUpperCase();
    if (colorPamphletTarget === 'bg') {
      setCustomColor('bg', cleanHex);
      setCustomBgHex(cleanHex);
    } else if (colorPamphletTarget === 'card') {
      setCustomColor('card', cleanHex);
      setCustomCardHex(cleanHex);
    } else if (colorPamphletTarget === 'primary') {
      setCustomColor('primary', cleanHex);
      setCustomAccentHex(cleanHex);
    } else if (colorPamphletTarget === 'text') {
      setCustomColor('text', cleanHex);
      setCustomTextHex(cleanHex);
    } else if (colorPamphletTarget === 'subtext') {
      setCustomColor('subtext', cleanHex);
      setCustomSubtextHex(cleanHex);
    }
    setShowColorPamphletModal(false);
  };

  // Trigger native browser color picker (appended to body to avoid browser blocking programmatic clicks)
  const triggerNativeWebColorPicker = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'color';
      input.style.position = 'fixed';
      input.style.top = '-9999px';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      input.value = tempSelectedColor.startsWith('#') && tempSelectedColor.length === 7
        ? tempSelectedColor
        : '#2563EB';
      document.body.appendChild(input);
      input.oninput = (e: any) => {
        const chosen = (e.target.value || '').toUpperCase();
        if (chosen) setTempSelectedColor(chosen);
      };
      input.onchange = (e: any) => {
        const chosen = (e.target.value || '').toUpperCase();
        if (chosen) applyPamphletColor(chosen);
        document.body.removeChild(input);
      };
      input.click();
    }
  };

  // Direct color picker (tanpa buka modal pamflet) - untuk tombol roda warna langsung di Studio Kustom
  const triggerDirectColorPicker = (target: 'bg' | 'card' | 'primary' | 'text' | 'subtext', currentHex: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'color';
      input.style.position = 'fixed';
      input.style.top = '-9999px';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      input.value = currentHex.startsWith('#') && currentHex.length === 7 ? currentHex : '#2563EB';
      document.body.appendChild(input);
      input.oninput = (e: any) => {
        const chosen = (e.target.value || '').toUpperCase();
        if (!chosen) return;
        if (target === 'bg') { setCustomColor('bg', chosen); setCustomBgHex(chosen); }
        else if (target === 'card') { setCustomColor('card', chosen); setCustomCardHex(chosen); }
        else if (target === 'primary') { setCustomColor('primary', chosen); setCustomAccentHex(chosen); }
        else if (target === 'text') { setCustomColor('text', chosen); setCustomTextHex(chosen); }
        else if (target === 'subtext') { setCustomColor('subtext', chosen); setCustomSubtextHex(chosen); }
      };
      input.onchange = (e: any) => {
        document.body.removeChild(input);
      };
      input.click();
    }
  };

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Read from local cache immediately (offline resilient)
    try {
      const cached = await AsyncStorage.getItem('@user_profile_cache_' + user.id);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.username !== undefined) setUsername(parsed.username || '');
        if (parsed.avatar_url !== undefined) setAvatarUrl(parsed.avatar_url || null);
      }
    } catch (e) {}

    // 2. Fetch from Supabase database if online
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setUsername(data.username ?? '');
        setAvatarUrl(data.avatar_url);
        await AsyncStorage.setItem('@user_profile_cache_' + user.id, JSON.stringify({
          username: data.username ?? '',
          avatar_url: data.avatar_url,
          role: data.role || 'student',
        }));
        updateProfileCache({ username: data.username, avatar_url: data.avatar_url });
      }
    } catch (e) {
      // Offline / network issue: Keep cached profile data
    } finally {
      setLoading(false);
    }
  }, [user, updateProfileCache]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const [entries, notes, tasks, rawSessions] = await Promise.all([
        getCachedJournals(user.id),
        getCachedNotes(user.id),
        getCachedTasks(user.id),
        AsyncStorage.getItem('@chat_sessions_' + user.id).then((r: string | null) => r ? JSON.parse(r) : []),
      ]);

      const allTimestamps: string[] = [
        ...entries.map((d: any) => d.created_at),
        ...notes.map((d: any) => d.created_at),
        ...tasks.map((d: any) => d.created_at),
      ].filter(Boolean);

      const streak = calculateRealStreak(allTimestamps);
      setStats({ total: entries.length, streak, chats: (rawSessions || []).length });
    } catch (e) {
      console.log('Error fetching stats in ProfileScreen:', e);
    }
  }, [user]);

  const loadBossTrophies = useCallback(async () => {
    const list = await getBossTrophies();
    setBossTrophies(list);
  }, []);

  const loadAchievements = useCallback(async () => {
    try {
      if (user) {
        const cachedNotes = await getCachedNotes(user.id);
        const streak = stats.streak;
        const trophies = await getBossTrophies();
        await checkAndUnlockAchievements({
          noteCount: cachedNotes.length,
          streak: streak,
          bossCount: trophies.length,
        });
      }
      const unlocked = await getUnlockedAchievements();
      setUnlockedAchievements(unlocked);
    } catch (e) {
      console.log('Error loading achievements:', e);
    }
  }, [user, stats.streak]);

  const loadTitles = useCallback(async () => {
    try {
      const [unlocked, active] = await Promise.all([
        getUnlockedTitles(),
        getActiveTitle(),
      ]);
      setUnlockedTitleIds(unlocked);
      setActiveRpgTitle(active);
    } catch (e) {
      console.log('Error loading titles:', e);
    }
  }, []);

  const handleToggleEquipTitle = async (title: RpgTitle) => {
    if (activeRpgTitle?.id === title.id) {
      await setActiveTitle(null);
      setActiveRpgTitle(null);
      showAlert('Gelar Dilepas', `Gelar "${title.label}" berhasil dilepas.`);
    } else {
      await setActiveTitle(title.id);
      setActiveRpgTitle(title);
      showAlert('Gelar Dipasang!', `Gelar "${title.label}" kini aktif dan tampil di bawah namamu.`);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchStats();
    loadBossTrophies();
    loadAchievements();
    loadTitles();

    if (!user) return;

    const channel = supabase
      .channel('profile_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, () => {
        fetchProfile();
        refreshProfileRole();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchProfile, fetchStats, loadBossTrophies, loadAchievements, loadTitles, refreshProfileRole]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchStats();
      refreshProfileRole();
      refreshMoodsAndSettings();
      loadBossTrophies();
      loadAchievements();
      loadTitles();
    }, [fetchProfile, fetchStats, refreshProfileRole, refreshMoodsAndSettings, loadBossTrophies, loadAchievements, loadTitles])
  );

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawUri = result.assets[0].uri;
        const compressedUri = await compressImage(rawUri, { maxWidth: 400, quality: 0.6 });
        setAvatarUrl(compressedUri);
      }
    } catch (e) {
      console.warn('Error picking/compressing avatar:', e);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    // 1. Save to local cache first so it's permanent even when offline
    updateProfileCache({ username, avatar_url: avatarUrl });
    try {
      await AsyncStorage.setItem('@user_profile_cache_' + user.id, JSON.stringify({
        username,
        avatar_url: avatarUrl,
        role,
      }));
    } catch (e) {}

    // 2. Sync to Supabase database if online
    try {
      await supabase.from('profiles').upsert({ id: user.id, username, avatar_url: avatarUrl });
    } catch (e) {
      console.log('Offline/Network: profile saved locally.');
    }

    setSaving(false);
    setEditing(false);
    showAlert('Sukses', 'Profil berhasil disimpan.');
  };

  // Strictly Local Privacy & Backup State
  const [isStrictLocal, setIsStrictLocal] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);

  useEffect(() => {
    isStrictlyLocalMode().then(setIsStrictLocal);
  }, []);

  const handleToggleStrictLocal = async () => {
    const nextVal = !isStrictLocal;
    setIsStrictLocal(nextVal);
    await setStrictlyLocalMode(nextVal);
    showAlert(
      nextVal ? 'Mode Lokal Aktif 🔒' : 'Cloud Sync Aktif ☁️',
      nextVal
        ? 'Data catatan, tugas, dan jurnal sekarang HANYA disimpan di perangkat ini dan tidak akan dikirim ke cloud.'
        : 'Data catatan, tugas, dan jurnal akan tersinkronisasi otomatis dengan database cloud.'
    );
  };

  const handleExportBackup = async () => {
    if (!user) {
      showAlert('Perhatian', 'Silakan login terlebih dahulu untuk mengekspor cadangan.');
      return;
    }
    setExportingBackup(true);
    try {
      const jsonString = await exportAllAppDataAsJson(user.id);
      const filename = `studybot_backup_${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAlert('Cadangan Berhasil Diunduh 📦', `File "${filename}" telah disimpan.`);
      } else {
        const fileUri = (FileSystem.documentDirectory || '') + filename;
        await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Simpan Cadangan StudyBot AI' });
      }
    } catch (e: any) {
      showAlert('Gagal Ekspor Cadangan', e?.message || 'Terjadi kesalahan saat mengekspor data.');
    } finally {
      setExportingBackup(false);
    }
  };

  const handleImportBackup = async () => {
    if (!user) {
      showAlert('Perhatian', 'Silakan login terlebih dahulu untuk mengimpor cadangan.');
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const file = res.assets[0];
      setImportingBackup(true);
      let jsonString = '';

      if (Platform.OS === 'web' && file.file) {
        jsonString = await (file.file as File).text();
      } else {
        jsonString = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }

      confirmAction(
        'Pulihkan Data Cadangan?',
        'Data catatan, tugas, jurnal, dan sesi obrolan dari file ini akan digabungkan ke perangkat Anda.',
        async () => {
          try {
            const summary = await importAllAppDataFromJson(user.id, jsonString);
            showAlert(
              'Pemulihan Berhasil 🎉',
              `Berhasil memulihkan:\n• ${summary.notesCount} Catatan Kuliah\n• ${summary.tasksCount} Tugas Kuliah\n• ${summary.journalsCount} Jurnal Refleksi\n• ${summary.sessionsCount} Sesi Chat`
            );
            fetchStats();
          } catch (err: any) {
            showAlert('Gagal Memulihkan Data', err?.message || 'Format file cadangan tidak valid.');
          } finally {
            setImportingBackup(false);
          }
        },
        'Pulihkan'
      );
    } catch (e: any) {
      setImportingBackup(false);
      showAlert('Gagal Mengimpor File', e?.message || 'Terjadi kesalahan saat membaca file.');
    }
  };

  const handleSignOut = () => {
    confirmAction(
      'Keluar dari Akun?',
      'Apakah kamu yakin ingin logout?',
      async () => {
        try {
          await signOut();
        } catch (e: any) {
          showAlert('Error', e.message || 'Gagal logout');
        }
      },
      'Keluar'
    );
  };

  const handleSecretTap = () => {
    const nextCount = secretTapCount + 1;
    setSecretTapCount(nextCount);
    if (nextCount >= 5) {
      setSecretTapCount(0);
      setShowClaimModal(true);
    }
  };

  const handleClaimAdmin = async () => {
    if (!passcodeInput.trim()) {
      showAlert('Perhatian', 'Masukkan Master Passcode Admin.');
      return;
    }
    setClaiming(true);
    const result = await claimAdminRole(passcodeInput);
    setClaiming(false);
    if (result.success) {
      setShowClaimModal(false);
      setPasscodeInput('');
      showAlert('Akses Diberikan 👑', result.message);
    } else {
      showAlert('Gagal', result.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator color={theme.accentLight} size="small" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Akun Pengguna</Text>
            <Text style={[styles.subtitle, { color: isLightMode ? theme.text : theme.accentLight }]}>Informasi profil dan pengaturan aplikasi</Text>
          </View>

          <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>

            {/* Left Column (Avatar & Profile Data) */}
            <View style={[styles.column, isWide && { flex: 1 }]}>
              <View style={[styles.avatarSection, { backgroundColor: theme.card, borderColor: theme.border }]}>

                <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                      <Text style={[styles.avatarInitial, { color: theme.accentLight }]}>
                        {(username || user?.email || 'M')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.cameraBtn, { backgroundColor: theme.primary }]}>
                    <Ionicons name="camera" size={13} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>

                {/* Role Badge */}
                <View style={[
                  styles.roleBadge,
                  isAdmin
                    ? { backgroundColor: isLightMode ? '#EFF6FF' : '#16233B', borderColor: isLightMode ? '#BFDBFE' : '#253856', borderWidth: 1 }
                    : { backgroundColor: isLightMode ? '#F1F5F9' : '#161B26', borderColor: isLightMode ? '#E2E8F0' : '#202634', borderWidth: 1 }
                ]}>
                  <Ionicons
                    name={isAdmin ? 'shield-checkmark' : 'school-outline'}
                    size={12}
                    color={isAdmin ? (isLightMode ? '#1D4ED8' : '#60A5FA') : (isLightMode ? '#475569' : '#9CA3AF')}
                  />
                  <Text style={[
                    styles.roleBadgeText,
                    isAdmin
                      ? { color: isLightMode ? '#1D4ED8' : '#60A5FA' }
                      : { color: isLightMode ? '#475569' : '#6B7280' }
                  ]}>
                    {isAdmin ? 'ADMINISTRATOR' : 'MAHASISWA'}
                  </Text>
                </View>

                {editing ? (
                  <TextInput
                    style={[styles.nameInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Nama Pengguna"
                    placeholderTextColor={theme.muted}
                    autoFocus
                  />
                ) : (
                  <Text style={[styles.userName, { color: theme.text }]}>{username || 'Mahasiswa'}</Text>
                )}

                <Text style={[styles.userEmail, { color: theme.subtext }]}>{user?.email}</Text>
              </View>

              {editing ? (
                <View style={styles.btnRow}>
                  <TouchableOpacity style={[styles.btnCancel, { backgroundColor: theme.cardInner }]} onPress={() => { setEditing(false); fetchProfile(); }}>
                    <Text style={[styles.btnCancelText, { color: theme.subtext }]}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnSave, { backgroundColor: theme.primary }]} onPress={saveProfile} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnSaveText}>Simpan</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.editBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setEditing(true)}>
                  <Ionicons name="pencil-outline" size={15} color={theme.subtext} />
                  <Text style={[styles.editBtnText, { color: theme.subtext }]}>Edit Profil</Text>
                </TouchableOpacity>
              )}

              {/* 2. STATS ROW */}
              <View style={styles.statsRow}>
                <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.statNum, { color: theme.text }]}>{stats.total}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Total Jurnal</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.statNum, { color: theme.text }]}>{stats.streak}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Hari Streak</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.statNum, { color: theme.text }]}>{stats.chats}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Sesi Cerita</Text>
                </View>
              </View>

              {/* 3. KUSTOMISASI AVATAR, NAMA & KEPRIBADIAN TEMAN AI */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 10 }]}>
                {/* Top Info Row: Avatar + Title + Badges */}
                <View style={styles.aiCardHeaderRow}>
                  {/* Live AI Avatar Image or Icon */}
                  <TouchableOpacity
                    onPress={() => {
                      setTempAiName(customAiName || aiBotName || 'Ara');
                      setTempAiAvatar(customAiAvatar);
                      setShowCustomAiModal(true);
                    }}
                    activeOpacity={0.8}
                    style={[styles.aiAvatarPreviewWrap, { borderColor: theme.accentLight, backgroundColor: theme.cardInner }]}
                  >
                    {customAiAvatar ? (
                      <Image source={{ uri: customAiAvatar }} style={styles.aiAvatarImg} />
                    ) : (
                      <Ionicons name="sparkles" size={18} color={theme.accentLight} />
                    )}
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Teman AI Saya</Text>
                      {customAiName || customAiAvatar ? (
                        <View style={[styles.customPersonaBadge, { backgroundColor: isLightMode ? '#EFF6FF' : '#16233B', borderColor: isLightMode ? '#3B82F6' : '#2563EB' }]}>
                          <Text style={[styles.customPersonaBadgeText, { color: isLightMode ? '#1D4ED8' : '#93C5FD' }]}>Kustom</Text>
                        </View>
                      ) : activePersona.isCustom ? (
                        <View style={[styles.customPersonaBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#332014', borderColor: isLightMode ? '#F59E0B' : '#78350F' }]}>
                          <Text style={[styles.customPersonaBadgeText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>Karakter</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.activePersonaNameHighlight, { color: theme.accentLight }]}>
                      "{customAiName || aiBotName || 'Ara'}" • {activePersona.name.split(' (')[0]}
                    </Text>
                  </View>
                </View>

                {/* Persona Description */}
                <Text style={[styles.activePersonaDesc, { color: theme.subtext, marginTop: 8, marginBottom: 12 }]} numberOfLines={2}>
                  {activePersona.desc}
                </Text>

                {/* Responsive Action Buttons Row */}
                <View style={styles.aiCardActionRow}>
                  <TouchableOpacity
                    style={[styles.aiCardActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={() => {
                      setTempAiName(customAiName || aiBotName || 'Ara');
                      setTempAiAvatar(customAiAvatar);
                      setShowCustomAiModal(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil" size={13} color={theme.accentLight} />
                    <Text style={[styles.aiCardActionBtnText, { color: theme.accentLight }]}>Kustom</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.aiCardActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={() => {
                      refreshMoodsAndSettings();
                      setPersonaSearchQuery('');
                      setShowPersonaModal(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="sparkles" size={13} color={theme.accentLight} />
                    <Text style={[styles.aiCardActionBtnText, { color: theme.accentLight }]}>Karakter</Text>
                    <Ionicons name="chevron-forward" size={12} color={theme.accentLight} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3.5 LEMARI LENCANA PERTARUNGAN BOS (RPG BOSS TROPHY SHOWCASE) */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.themeHeaderIconWrap, { backgroundColor: '#F59E0B' + '22', borderColor: theme.border }]}>
                    <Ionicons name="trophy" size={17} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Lemari Lencana Bos RPG</Text>
                      <View style={{ backgroundColor: '#F59E0B' + '22', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>{bossTrophies.length} Dimenangkan</Text>
                      </View>
                    </View>
                    <Text style={[styles.themeHeaderSub, { color: theme.subtext }]}>
                      Koleksi monster materi kuliah yang berhasil kamu taklukkan
                    </Text>
                  </View>
                </View>

                {bossTrophies.length === 0 ? (
                  <View style={[styles.emptyTrophyCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Ionicons name="shield-outline" size={26} color={theme.muted} />
                    <Text style={[styles.emptyTrophyTitle, { color: theme.text }]}>Belum ada Lencana Pertarungan</Text>
                    <Text style={[styles.emptyTrophyDesc, { color: theme.subtext }]}>
                      Buka Catatan Kuliah → Mainkan Mode Boss Battle RPG untuk menaklukkan Monster Bos materi pertamamu dan klaim +75 XP!
                    </Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trophyScrollList}>
                    {bossTrophies.map((t, idx) => (
                      <View key={idx} style={[styles.trophyItemCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <BossAvatarIllustration bossId={t.bossId as any} size={64} />
                        <Text style={[styles.trophyBossName, { color: theme.text }]} numberOfLines={1}>
                          {t.bossName}
                        </Text>
                        <Text style={[styles.trophySubjectText, { color: theme.accentLight }]} numberOfLines={1}>
                          {t.subject}
                        </Text>
                        <View style={[styles.trophyXpBadge, { backgroundColor: '#F59E0B' + '22' }]}>
                          <Ionicons name="star" size={10} color="#F59E0B" />
                          <Text style={styles.trophyXpText}>+{t.earnedXp} XP</Text>
                        </View>
                        <Text style={[styles.trophyDateText, { color: theme.muted }]}>
                          {new Date(t.defeatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* 3.6 KOLEKSI PENCAPAIAN & LENCANA PRESTASI (ACHIEVEMENT BADGES) */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.themeHeaderIconWrap, { backgroundColor: '#6366F122', borderColor: theme.border }]}>
                    <Ionicons name="ribbon" size={17} color="#818CF8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Lencana & Pencapaian</Text>
                      <View style={{ backgroundColor: '#6366F122', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                        <Text style={{ color: '#818CF8', fontSize: 10, fontWeight: '800' }}>
                          {unlockedAchievements.length}/{ALL_ACHIEVEMENTS.length} Terbuka
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.themeHeaderSub, { color: theme.subtext }]}>
                      Selesaikan berbagai tantangan belajar untuk membuka lencana khusus!
                    </Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trophyScrollList}>
                  {ALL_ACHIEVEMENTS.map((ach) => {
                    const isUnlocked = unlockedAchievements.some(u => u.id === ach.id);
                    const rarityColor = ach.rarity === 'mythic' ? '#EF4444' : ach.rarity === 'legendary' ? '#F59E0B' : ach.rarity === 'epic' ? '#8B5CF6' : '#3B82F6';
                    const rarityLabel = ach.rarity === 'mythic' ? 'MYTHIC' : ach.rarity === 'legendary' ? 'LEGEND' : ach.rarity === 'epic' ? 'EPIC' : 'RARE';
                    return (
                      <View
                        key={ach.id}
                        style={[
                          styles.achievementBadgeCard,
                          {
                            backgroundColor: isUnlocked ? theme.cardInner : (isLightMode ? '#F1F5F9' : '#0B0F17'),
                            borderColor: isUnlocked ? rarityColor : theme.border,
                            opacity: isUnlocked ? 1 : 0.65,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 4 }}>
                          <View
                            style={[
                              styles.achievementIconWrap,
                              {
                                backgroundColor: isUnlocked ? rarityColor + '20' : theme.border,
                              },
                            ]}
                          >
                            <Ionicons
                              name={ach.icon as any}
                              size={18}
                              color={isUnlocked ? rarityColor : theme.muted}
                            />
                          </View>
                          <View style={{ backgroundColor: rarityColor + '22', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                            <Text style={{ color: rarityColor, fontSize: 8.5, fontWeight: '900' }}>{rarityLabel}</Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.achievementTitle,
                            { color: isUnlocked ? theme.text : theme.muted },
                          ]}
                          numberOfLines={1}
                        >
                          {ach.title}
                        </Text>
                        <Text
                          style={[styles.achievementDesc, { color: theme.subtext }]}
                          numberOfLines={2}
                        >
                          {ach.description}
                        </Text>
                        <View
                          style={[
                            styles.achievementRewardPill,
                            {
                              backgroundColor: isUnlocked ? '#10B98120' : theme.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={isUnlocked ? 'checkmark' : 'lock-closed'}
                            size={10}
                            color={isUnlocked ? '#10B981' : theme.muted}
                          />
                          <Text
                            style={[
                              styles.achievementRewardText,
                              { color: isUnlocked ? '#10B981' : theme.muted },
                            ]}
                          >
                            +{ach.xpReward} XP
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 3.7 LEMARI GELAR & TITLE RPG (RPG TITLES SHOWCASE & SELECTOR) */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.themeHeaderIconWrap, { backgroundColor: '#F59E0B22', borderColor: theme.border }]}>
                    <Ionicons name="ribbon" size={17} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Koleksi Gelar RPG</Text>
                      <View style={{ backgroundColor: '#F59E0B22', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>
                          {unlockedTitleIds.length}/{ALL_RPG_TITLES.length} Terbuka
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.themeHeaderSub, { color: theme.subtext }]}>
                      Pasang gelar kehormatan di bawah namamu. Ketuk gelar yang terbuka untuk memasang!
                    </Text>
                  </View>
                </View>

                {activeRpgTitle && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: activeRpgTitle.color + '15', borderWidth: 1, borderColor: activeRpgTitle.color + '55', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name={activeRpgTitle.icon as any} size={18} color={activeRpgTitle.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: theme.subtext, fontWeight: '700', textTransform: 'uppercase' }}>Gelar Aktif Terpasang:</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '900', color: activeRpgTitle.color }}>{activeRpgTitle.label}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: activeRpgTitle.color + '30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                      onPress={() => handleToggleEquipTitle(activeRpgTitle)}
                    >
                      <Text style={{ color: activeRpgTitle.color, fontSize: 10, fontWeight: '800' }}>Lepas</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trophyScrollList}>
                  {ALL_RPG_TITLES.map((title) => {
                    const isUnlocked = unlockedTitleIds.includes(title.id);
                    const isEquipped = activeRpgTitle?.id === title.id;
                    const rarityColor = title.rarity === 'mythic' ? '#EF4444' : title.rarity === 'legendary' ? '#F59E0B' : title.rarity === 'epic' ? '#8B5CF6' : '#3B82F6';
                    const rarityLabel = title.rarity === 'mythic' ? 'MYTHIC' : title.rarity === 'legendary' ? 'LEGEND' : title.rarity === 'epic' ? 'EPIC' : 'RARE';
                    return (
                      <TouchableOpacity
                        key={title.id}
                        style={[
                          styles.achievementBadgeCard,
                          {
                            backgroundColor: isEquipped ? title.color + '18' : isUnlocked ? theme.cardInner : (isLightMode ? '#F1F5F9' : '#0B0F17'),
                            borderColor: isEquipped ? title.color : isUnlocked ? rarityColor : theme.border,
                            opacity: isUnlocked ? 1 : 0.6,
                          },
                        ]}
                        onPress={() => {
                          if (isUnlocked) {
                            handleToggleEquipTitle(title);
                          } else {
                            showAlert('Gelar Terkunci', `${title.description}\n\nKelangkaan: ${rarityLabel}\nDapatkan gelar ini dari Kotak Hadiah 📦, Roda Putar 🎰, atau mengalahkan Bos Arena!`);
                          }
                        }}
                        activeOpacity={0.75}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 4 }}>
                          <View style={[styles.achievementIconWrap, { backgroundColor: isUnlocked ? rarityColor + '22' : theme.border }]}>
                            <Ionicons name={title.icon as any} size={18} color={isUnlocked ? rarityColor : theme.muted} />
                          </View>
                          <View style={{ backgroundColor: rarityColor + '22', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                            <Text style={{ color: rarityColor, fontSize: 8.5, fontWeight: '900' }}>{rarityLabel}</Text>
                          </View>
                        </View>
                        <Text style={[styles.achievementTitle, { color: isUnlocked ? theme.text : theme.muted }]} numberOfLines={1}>
                          {title.label}
                        </Text>
                        <Text style={[styles.achievementDesc, { color: theme.subtext }]} numberOfLines={2}>
                          {title.description}
                        </Text>
                        <View style={[styles.achievementRewardPill, { backgroundColor: isEquipped ? title.color : isUnlocked ? '#10B98120' : theme.border }]}>
                          <Ionicons
                            name={isEquipped ? 'checkmark-circle' : isUnlocked ? 'checkmark' : 'lock-closed'}
                            size={10}
                            color={isEquipped ? '#FFFFFF' : isUnlocked ? '#10B981' : theme.muted}
                          />
                          <Text style={[styles.achievementRewardText, { color: isEquipped ? '#FFFFFF' : isUnlocked ? '#10B981' : theme.muted }]}>
                            {isEquipped ? 'Dipasang' : isUnlocked ? 'Miliki' : 'Terkunci'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 4. ADMIN PANEL BUTTON (HANYA MUNCUL JIKA USER ADALAH ADMIN) */}
              {isAdmin ? (
                <TouchableOpacity
                  style={[styles.adminBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => navigation.navigate('Admin')}
                >
                  <View style={styles.adminBtnLeft}>
                    <View style={[styles.adminIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                      <Ionicons name="shield-checkmark" size={17} color={theme.accentLight} />
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.adminBtnTitle, { color: theme.text }]}>Pusat Kontrol Admin</Text>
                        <View style={{ backgroundColor: theme.accentBg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ color: theme.accentLight, fontSize: 11, fontWeight: '700' }}>SUPERADMIN</Text>
                        </View>
                      </View>
                      <Text style={[styles.adminBtnSub, { color: theme.subtext }]}>Kelola AI, Fitur, Moods & Database</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
                </TouchableOpacity>
              ) : null}

              {/* 5. APP INFO & DATABASE STATUS */}
              <View style={[styles.infoSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.infoRow}>
                  <Ionicons name="cloud-done-outline" size={16} color={theme.accentLight} />
                  <Text style={[styles.infoText, { color: theme.subtext }]}>Database Cloud: Supabase PostgreSQL (Terkoneksi)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="lock-closed-outline" size={16} color={theme.accentLight} />
                  <Text style={[styles.infoText, { color: theme.subtext }]}>Autentikasi & Data: Terisolasi (RLS Protected)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="hardware-chip-outline" size={16} color={theme.accentLight} />
                  <Text style={[styles.infoText, { color: theme.subtext }]}>AI Model Engine: Gemini 2.5 Flash</Text>
                </View>
              </View>

              

              

            </View>

            {/* Right Column (Themes, Colors & Wallpaper Studio) */}
            <View style={[styles.column, isWide && { flex: 1.35 }]}>

              {/* ========================================================================= */}
              {/* TEMA & PERSONALISASI WARNA APLIKASI (STUDIO & DATABASE PERSISTENCE) */}
              {/* ========================================================================= */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.themeHeaderIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                    <Ionicons name="color-palette" size={17} color={theme.accentLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Tema & Personalisasi Tampilan</Text>
                    <Text style={[styles.themeHeaderSub, { color: theme.subtext }]}>
                      Sesuaikan mode terang, gelap, dan warna kreasi bebas Anda
                    </Text>
                  </View>
                </View>

                {/* Mode Tabs (Gelap / Terang / Studio Kustom) */}
                <View style={[styles.themeModeTabsRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.themeModeTab,
                      themeMode === 'dark' && [styles.themeModeTabActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setThemeMode('dark')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="moon" size={13} color={themeMode === 'dark' ? theme.accentLight : theme.subtext} />
                    <Text style={[styles.themeModeTabText, { color: themeMode === 'dark' ? theme.accentLight : theme.subtext }]}>
                      Gelap ({darkThemes.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeModeTab,
                      themeMode === 'light' && [styles.themeModeTabActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setThemeMode('light')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="sunny" size={14} color={themeMode === 'light' ? theme.accentLight : theme.subtext} />
                    <Text style={[styles.themeModeTabText, { color: themeMode === 'light' ? theme.accentLight : theme.subtext }]}>
                      Terang ({lightThemes.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeModeTab,
                      themeMode === 'custom' && [styles.themeModeTabActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setThemeMode('custom')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="color-wand" size={13} color={themeMode === 'custom' ? theme.accentLight : theme.subtext} />
                    <Text style={[styles.themeModeTabText, { color: themeMode === 'custom' ? theme.accentLight : theme.subtext }]}>
                      Studio Kustom
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ------------------------------------------------------------------- */}
                {/* TAB 1: DARK THEMES */}
                {/* ------------------------------------------------------------------- */}
                {themeMode === 'dark' && (
                  <View style={styles.themeGrid}>
                    {darkThemes.map(t => {
                      const isActive = themeId === t.id && themeMode === 'dark';
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.themeCard,
                            { backgroundColor: t.bg, borderColor: isActive ? t.accentLight : '#202634' },
                            isActive && { borderWidth: 2, shadowColor: t.accent, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }
                          ]}
                          onPress={() => setTheme(t.id)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.themeCardTop}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons
                                name={(t.iconName as any) || 'color-palette-outline'}
                                size={15}
                                color={isActive ? (isLightMode ? t.accent : t.accentLight) : theme.subtext}
                              />
                              <Text style={[styles.themeName, { color: isActive ? t.accentLight : t.text }]} numberOfLines={1}>
                                {t.name.split(' (')[0]}
                              </Text>
                            </View>
                            {isActive && <Ionicons name="checkmark-circle" size={16} color={t.accentLight} />}
                          </View>
                          <View style={styles.themePreviewPalette}>
                            <View style={[styles.themeDot, { backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.card, borderWidth: 1, borderColor: t.border }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.accent }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.text }]} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ------------------------------------------------------------------- */}
                {/* TAB 2: LIGHT THEMES */}
                {/* ------------------------------------------------------------------- */}
                {themeMode === 'light' && (
                  <View style={styles.themeGrid}>
                    {lightThemes.map(t => {
                      const isActive = themeId === t.id && themeMode === 'light';
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.themeCard,
                            { backgroundColor: t.bg, borderColor: isActive ? t.accent : '#D1D5DB' },
                            isActive && { borderWidth: 2, shadowColor: t.accent, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }
                          ]}
                          onPress={() => setTheme(t.id)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.themeCardTop}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Ionicons
                                name={(t.iconName as any) || 'color-palette-outline'}
                                size={15}
                                color={isActive ? t.accent : theme.subtext}
                              />
                              <Text style={[styles.themeName, { color: isActive ? t.accent : t.text }]} numberOfLines={1}>
                                {t.name}
                              </Text>
                            </View>
                            {isActive && <Ionicons name="checkmark-circle" size={16} color={t.accent} />}
                          </View>
                          <View style={styles.themePreviewPalette}>
                            <View style={[styles.themeDot, { backgroundColor: t.bg, borderWidth: 1, borderColor: t.border }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.card, borderWidth: 1, borderColor: t.border }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.accent }]} />
                            <View style={[styles.themeDot, { backgroundColor: t.text }]} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ------------------------------------------------------------------- */}
                {/* TAB 3: CUSTOM STUDIO (GANTI WARNA BEBAS & BACKGROUND PICKER) */}
                {/* ------------------------------------------------------------------- */}
                {themeMode === 'custom' && (
                  <View style={styles.customStudioWrap}>
                    {/* Live Mini Preview Box */}
                    <View style={[styles.miniPreviewCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.miniBadgeDot, { backgroundColor: theme.primary }]} />
                          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Live Preview Tampilan</Text>
                        </View>
                        <View style={{ backgroundColor: theme.accentBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: theme.accentLight, fontSize: 11, fontWeight: '700' }}>KUSTOM AKTIF</Text>
                        </View>
                      </View>

                      <View style={[styles.miniInnerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600', marginBottom: 2 }}>
                          Kartu Komponen Aplikasi
                        </Text>
                        <Text style={{ color: theme.subtext, fontSize: 11, lineHeight: 14 }}>
                          Teks ini dan background di atas berubah sesuai palet yang Anda pilih di bawah.
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                          <View style={[styles.miniBtnPrimary, { backgroundColor: theme.primary }]}>
                            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Tombol Utama</Text>
                          </View>
                          <View style={[styles.miniBtnOutline, { borderColor: theme.border, backgroundColor: theme.cardInner }]}>
                            <Text style={{ color: theme.accentLight, fontSize: 11, fontWeight: '600' }}>Aksen</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* 1. Background Color Picker */}
                    <Text style={[styles.customFieldTitle, { color: theme.text }]}>1. Warna Latar Belakang (Background):</Text>
                    <View style={styles.colorChipsRow}>
                      {BG_COLOR_PRESETS.map(b => (
                        <TouchableOpacity
                          key={b.hex}
                          style={[
                            styles.colorChipBtn,
                            { backgroundColor: b.hex, borderColor: theme.bg === b.hex ? theme.accentLight : theme.border },
                            theme.bg === b.hex && styles.colorChipBtnActive
                          ]}
                          onPress={() => {
                            setCustomColor('bg', b.hex);
                            setCustomBgHex(b.hex);
                          }}
                        >
                          {theme.bg === b.hex && <Ionicons name="checkmark" size={12} color={isColorLight(b.hex) ? '#000' : '#FFF'} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.hexInputRow}>
                      <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                      <View style={[styles.hexColorIndicator, { backgroundColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customBgHex.trim().startsWith('#') ? customBgHex.trim() : '#' + customBgHex.trim()) ? (customBgHex.trim().startsWith('#') ? customBgHex.trim() : '#' + customBgHex.trim()) : theme.bg }]} />
                      <TextInput
                        style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                        placeholder="#0E1117"
                        placeholderTextColor={theme.muted}
                        value={customBgHex}
                        autoCapitalize="characters"
                        maxLength={7}
                        onChangeText={handleBgHexChange}
                        onBlur={() => {
                          if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customBgHex.trim().startsWith('#') ? customBgHex.trim() : '#' + customBgHex.trim())) {
                            setCustomBgHex(theme.bg);
                          }
                        }}
                      />
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[styles.colorWheelBtn, { backgroundColor: '#1E293B', borderColor: theme.border }]}
                          onPress={() => triggerDirectColorPicker('bg', customBgHex)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>🎨</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.openPamphletBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                        onPress={() => openColorPamphlet('bg')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="color-palette-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.openPamphletBtnText, { color: theme.accentLight }]}>Buka Palet</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 2. Card / Container Color Picker */}
                    <Text style={[styles.customFieldTitle, { color: theme.text, marginTop: 12 }]}>2. Warna Kartu / Panel (Card):</Text>
                    <View style={styles.colorChipsRow}>
                      {CARD_COLOR_PRESETS.map(c => (
                        <TouchableOpacity
                          key={c.hex}
                          style={[
                            styles.colorChipBtn,
                            { backgroundColor: c.hex, borderColor: theme.card === c.hex ? theme.accentLight : theme.border },
                            theme.card === c.hex && styles.colorChipBtnActive
                          ]}
                          onPress={() => {
                            setCustomColor('card', c.hex);
                            setCustomCardHex(c.hex);
                          }}
                        >
                          {theme.card === c.hex && <Ionicons name="checkmark" size={12} color={isColorLight(c.hex) ? '#000' : '#FFF'} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.hexInputRow}>
                      <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                      <View style={[styles.hexColorIndicator, { backgroundColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customCardHex.trim().startsWith('#') ? customCardHex.trim() : '#' + customCardHex.trim()) ? (customCardHex.trim().startsWith('#') ? customCardHex.trim() : '#' + customCardHex.trim()) : theme.card }]} />
                      <TextInput
                        style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                        placeholder="#141822"
                        placeholderTextColor={theme.muted}
                        value={customCardHex}
                        autoCapitalize="characters"
                        maxLength={7}
                        onChangeText={handleCardHexChange}
                        onBlur={() => {
                          if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customCardHex.trim().startsWith('#') ? customCardHex.trim() : '#' + customCardHex.trim())) {
                            setCustomCardHex(theme.card);
                          }
                        }}
                      />
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[styles.colorWheelBtn, { backgroundColor: '#1E293B', borderColor: theme.border }]}
                          onPress={() => triggerDirectColorPicker('card', customCardHex)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>🎨</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.openPamphletBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                        onPress={() => openColorPamphlet('card')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="color-palette-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.openPamphletBtnText, { color: theme.accentLight }]}>Buka Palet</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 3. Primary / Accent Color Palette */}
                    <Text style={[styles.customFieldTitle, { color: theme.text, marginTop: 12 }]}>3. Warna Aksen & Tombol Utama:</Text>
                    <View style={styles.colorChipsRow}>
                      {ACCENT_COLOR_PALETTE.map(a => (
                        <TouchableOpacity
                          key={a}
                          style={[
                            styles.colorChipBtn,
                            { backgroundColor: a, borderColor: theme.accent === a ? '#FFFFFF' : 'transparent' },
                            theme.accent === a && styles.colorChipBtnActive
                          ]}
                          onPress={() => {
                            setCustomColor('primary', a);
                            setCustomAccentHex(a);
                          }}
                        >
                          {theme.accent === a && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.hexInputRow}>
                      <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                      <View style={[styles.hexColorIndicator, { backgroundColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customAccentHex.trim().startsWith('#') ? customAccentHex.trim() : '#' + customAccentHex.trim()) ? (customAccentHex.trim().startsWith('#') ? customAccentHex.trim() : '#' + customAccentHex.trim()) : theme.primary }]} />
                      <TextInput
                        style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                        placeholder="#2563EB"
                        placeholderTextColor={theme.muted}
                        value={customAccentHex}
                        autoCapitalize="characters"
                        maxLength={7}
                        onChangeText={handleAccentHexChange}
                        onBlur={() => {
                          if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customAccentHex.trim().startsWith('#') ? customAccentHex.trim() : '#' + customAccentHex.trim())) {
                            setCustomAccentHex(theme.primary);
                          }
                        }}
                      />
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[styles.colorWheelBtn, { backgroundColor: '#1E293B', borderColor: theme.border }]}
                          onPress={() => triggerDirectColorPicker('primary', customAccentHex)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>🎨</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.openPamphletBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                        onPress={() => openColorPamphlet('primary')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="color-palette-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.openPamphletBtnText, { color: theme.accentLight }]}>Buka Palet</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 4. Text Color Picker (Full Custom) */}
                    <Text style={[styles.customFieldTitle, { color: theme.text, marginTop: 12 }]}>4. Warna Teks / Tulisan:</Text>

                    {/* Quick preset text colors */}
                    <View style={[styles.colorChipsRow, { marginTop: 4 }]}>
                      {[
                        '#F3F4F6', '#FFFFFF', '#E2E8F0', '#CBD5E1', '#94A3B8',
                        '#0F172A', '#1E293B', '#334155', '#475569', '#64748B',
                        '#FDE68A', '#86EFAC', '#93C5FD', '#F9A8D4', '#C4B5FD',
                        '#FCA5A5', '#FDBA74', '#6EE7B7', '#7DD3FC', '#A5B4FC',
                      ].map(textCol => (
                        <TouchableOpacity
                          key={textCol}
                          style={[
                            styles.colorChipBtn,
                            {
                              backgroundColor: textCol,
                              borderColor: theme.text.toUpperCase() === textCol.toUpperCase() ? theme.accentLight : (isColorLight(textCol) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)'),
                            },
                            theme.text.toUpperCase() === textCol.toUpperCase() && styles.colorChipBtnActive,
                          ]}
                          onPress={() => {
                            setCustomColor('text', textCol);
                            setCustomTextHex(textCol);
                          }}
                        >
                          {theme.text.toUpperCase() === textCol.toUpperCase() && (
                            <Ionicons name="checkmark" size={12} color={isColorLight(textCol) ? '#000' : '#FFF'} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.hexInputRow}>
                      <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                      <View style={[styles.hexColorIndicator, { backgroundColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customTextHex.trim().startsWith('#') ? customTextHex.trim() : '#' + customTextHex.trim()) ? (customTextHex.trim().startsWith('#') ? customTextHex.trim() : '#' + customTextHex.trim()) : theme.text, borderWidth: 1, borderColor: theme.border }]} />
                      <TextInput
                        style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                        placeholder="#F3F4F6"
                        placeholderTextColor={theme.muted}
                        value={customTextHex}
                        autoCapitalize="characters"
                        maxLength={7}
                        onChangeText={handleTextHexChange}
                        onBlur={() => {
                          if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customTextHex.trim().startsWith('#') ? customTextHex.trim() : '#' + customTextHex.trim())) {
                            setCustomTextHex(theme.text);
                          }
                        }}
                      />
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[styles.colorWheelBtn, { backgroundColor: '#1E293B', borderColor: theme.border }]}
                          onPress={() => triggerDirectColorPicker('text', customTextHex)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>🎨</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.openPamphletBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                        onPress={() => openColorPamphlet('text')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="color-palette-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.openPamphletBtnText, { color: theme.accentLight }]}>Buka Palet</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 4 }}>
                      Teks utama preview: <Text style={{ color: theme.text, fontWeight: '700' }}>{customTextHex}</Text>
                    </Text>

                    {/* 5. Subtext / Description Color Picker */}
                    <Text style={[styles.customFieldTitle, { color: theme.text, marginTop: 14 }]}>5. Warna Subtext / Teks Deskripsi:</Text>
                    <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 6 }}>
                      Warna untuk tulisan abu-abu seperti keterangan, label, dan deskripsi.
                    </Text>

                    {/* Quick preset subtext colors */}
                    <View style={[styles.colorChipsRow, { marginTop: 2 }]}>
                      {[
                        '#9CA3AF', '#6B7280', '#94A3B8', '#64748B', '#71717A',
                        '#A3A3A3', '#D1D5DB', '#E5E7EB', '#475569', '#334155',
                        '#A78BFA', '#6EE7B7', '#93C5FD', '#F9A8D4', '#FCA5A5',
                        '#FDBA74', '#FDE68A', '#86EFAC', '#7DD3FC', '#C4B5FD',
                      ].map(subCol => (
                        <TouchableOpacity
                          key={subCol}
                          style={[
                            styles.colorChipBtn,
                            {
                              backgroundColor: subCol,
                              borderColor: theme.subtext.toUpperCase() === subCol.toUpperCase() ? theme.accentLight : (isColorLight(subCol) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)'),
                            },
                            theme.subtext.toUpperCase() === subCol.toUpperCase() && styles.colorChipBtnActive,
                          ]}
                          onPress={() => {
                            setCustomColor('subtext', subCol);
                            setCustomSubtextHex(subCol);
                          }}
                        >
                          {theme.subtext.toUpperCase() === subCol.toUpperCase() && (
                            <Ionicons name="checkmark" size={12} color={isColorLight(subCol) ? '#000' : '#FFF'} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.hexInputRow}>
                      <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                      <View style={[styles.hexColorIndicator, { backgroundColor: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customSubtextHex.trim().startsWith('#') ? customSubtextHex.trim() : '#' + customSubtextHex.trim()) ? (customSubtextHex.trim().startsWith('#') ? customSubtextHex.trim() : '#' + customSubtextHex.trim()) : theme.subtext, borderWidth: 1, borderColor: theme.border }]} />
                      <TextInput
                        style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                        placeholder="#9CA3AF"
                        placeholderTextColor={theme.muted}
                        value={customSubtextHex}
                        autoCapitalize="characters"
                        maxLength={7}
                        onChangeText={handleSubtextHexChange}
                        onBlur={() => {
                          if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(customSubtextHex.trim().startsWith('#') ? customSubtextHex.trim() : '#' + customSubtextHex.trim())) {
                            setCustomSubtextHex(theme.subtext);
                          }
                        }}
                      />
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[styles.colorWheelBtn, { backgroundColor: '#1E293B', borderColor: theme.border }]}
                          onPress={() => triggerDirectColorPicker('subtext', customSubtextHex)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>🎨</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.openPamphletBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                        onPress={() => openColorPamphlet('subtext')}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="color-palette-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.openPamphletBtnText, { color: theme.accentLight }]}>Buka Palet</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 11, marginTop: 4 }}>
                      <Text style={{ color: theme.subtext }}>Subtext preview: </Text>
                      <Text style={{ color: theme.subtext, fontWeight: '700' }}>Teks deskripsi seperti ini</Text>
                    </Text>

                    {/* Reset Button */}
                    <TouchableOpacity
                      style={[styles.resetCustomBtn, { borderColor: theme.border, backgroundColor: theme.cardInner }]}
                      onPress={resetTheme}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh" size={13} color={theme.subtext} />
                      <Text style={[styles.resetCustomText, { color: theme.subtext }]}>Reset ke Bawaan (Default Obsidian)</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ------------------------------------------------------------------- */}
                {/* SECTION: GAYA SENI PITA LATAR & WALLPAPER KUSTOM */}
                {/* ------------------------------------------------------------------- */}
                <View style={[styles.artSectionDivider, { borderTopColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 8 }}>
                    <Ionicons name="sparkles-outline" size={16} color={theme.accentLight} />
                    <Text style={[styles.artSectionHeaderTitle, { color: theme.text }]}>Ornamen Seni Latar & Wallpaper</Text>
                  </View>
                  <Text style={[styles.artSectionHeaderSub, { color: theme.subtext }]}>
                    Pilih gaya pita seni vektor dinamis atau pasang foto galeri pribadi dengan efek blur.
                  </Text>

                  {/* Art Style Choices Grid */}
                  <View style={styles.artStylesGrid}>
                    {[
                      { id: 'aurora-ribbons', label: 'Pita Aurora', desc: 'Gelombang pita halus glowing', icon: 'color-filter-outline' },
                      { id: 'fluid-waves', label: 'Garis Fluida', desc: 'Garis meliuk modern abstrak', icon: 'water-outline' },
                      { id: 'geometric-glow', label: 'Sudut Geometris', desc: 'Aksen poligon sudut modern', icon: 'cube-outline' },
                      { id: 'custom-photo', label: 'Foto Wallpaper', desc: 'Foto galeri + Frosted Blur', icon: 'image-outline' },
                      { id: 'none', label: 'Polos Minimal', desc: 'Warna solid tanpa ornamen', icon: 'square-outline' },
                    ].map(styleItem => {
                      const isSelected = bgArtStyle === styleItem.id;
                      return (
                        <TouchableOpacity
                          key={styleItem.id}
                          style={[
                            styles.artStyleCard,
                            { backgroundColor: theme.cardInner, borderColor: isSelected ? theme.accentLight : theme.border },
                            isSelected && { borderWidth: 1.5, backgroundColor: isLightMode ? '#EFF6FF' : '#16233B' }
                          ]}
                          onPress={() => setBgArtStyle(styleItem.id as any)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name={styleItem.icon as any} size={14} color={isSelected ? theme.accentLight : theme.subtext} />
                            <Text style={[styles.artStyleLabel, { color: isSelected ? theme.accentLight : theme.text }]}>
                              {styleItem.label}
                            </Text>
                          </View>
                          <Text style={[styles.artStyleDesc, { color: theme.subtext }]} numberOfLines={1}>
                            {styleItem.desc}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Sub-controls when 'custom-photo' is active */}
                  {bgArtStyle === 'custom-photo' && (
                    <View style={[styles.customPhotoControlsBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="images-outline" size={15} color={theme.accentLight} />
                          <Text style={{ color: theme.text, fontSize: 11.5, fontWeight: '700' }}>Foto Wallpaper Galeri</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.uploadPhotoBtn, { backgroundColor: theme.primary }]}
                          onPress={handlePickWallpaperImage}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="cloud-upload-outline" size={13} color="#FFFFFF" />
                          <Text style={styles.uploadPhotoBtnText}>{bgCustomImage ? 'Ganti Foto' : 'Pilih Foto'}</Text>
                        </TouchableOpacity>
                      </View>

                      {bgCustomImage && (
                        <View style={{ marginTop: 10, gap: 8 }}>
                          {/* Blur Intensity Options */}
                          {/* Blur Intensity Options */}
                          <View>
                            <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 4 }}>Intensitas Blur Wallpaper:</Text>
                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Jernih (0px)', val: 0 },
                                { label: 'Halus (4px)', val: 4 },
                                { label: 'Sedang (10px)', val: 10 },
                                { label: 'Pekat (20px)', val: 20 },
                              ].map(b => (
                                <TouchableOpacity
                                  key={b.val}
                                  style={[
                                    styles.blurOptionBtn,
                                    { backgroundColor: theme.card, borderColor: bgBlurRadius === b.val ? theme.accentLight : theme.border },
                                    bgBlurRadius === b.val && { borderWidth: 1.5, backgroundColor: isLightMode ? '#EFF6FF' : '#16233B' }
                                  ]}
                                  onPress={() => setBgBlurRadius(b.val)}
                                >
                                  <Text style={{ color: bgBlurRadius === b.val ? theme.accentLight : theme.text, fontSize: 11, fontWeight: '700' }}>
                                    {b.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          {/* Dimming / Shadow Opacity Options */}
                          <View>
                            <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 4 }}>Lapisan Peredup (Shadow Tint):</Text>
                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Terang (15%)', val: 0.15 },
                                { label: 'Seimbang (30%)', val: 0.30 },
                                { label: 'Teduh (50%)', val: 0.50 },
                                { label: 'Gelap (70%)', val: 0.70 },
                              ].map(d => (
                                <TouchableOpacity
                                  key={d.val}
                                  style={[
                                    styles.blurOptionBtn,
                                    { backgroundColor: theme.card, borderColor: bgDimmingOpacity === d.val ? theme.accentLight : theme.border },
                                    bgDimmingOpacity === d.val && { borderWidth: 1.5, backgroundColor: isLightMode ? '#EFF6FF' : '#16233B' }
                                  ]}
                                  onPress={() => setBgDimmingOpacity(d.val)}
                                >
                                  <Text style={{ color: bgDimmingOpacity === d.val ? theme.accentLight : theme.text, fontSize: 11, fontWeight: '700' }}>
                                    {d.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          {/* Screen Fit Mode Option */}
                          <View>
                            <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 4 }}>
                              Penyesuaian Ukuran Layar:
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {[
                                { label: 'Pas Utuh (Tanpa Potong)', mode: 'contain' as const },
                                { label: 'Isi Penuh Layar', mode: 'cover' as const },
                              ].map(f => (
                                <TouchableOpacity
                                  key={f.mode}
                                  style={[
                                    styles.blurOptionBtn,
                                    { backgroundColor: theme.card, borderColor: bgFitMode === f.mode ? theme.accentLight : theme.border },
                                    bgFitMode === f.mode && { borderWidth: 1.5, backgroundColor: isLightMode ? '#EFF6FF' : '#16233B' }
                                  ]}
                                  onPress={() => setBgFitMode(f.mode)}
                                >
                                  <Text style={{ color: bgFitMode === f.mode ? theme.accentLight : theme.text, fontSize: 11, fontWeight: '700' }}>
                                    {f.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>

                          {/* Remove Photo Button */}
                          <TouchableOpacity
                            style={[styles.removePhotoBtn, { borderColor: '#EF4444' }]}
                            onPress={() => setBgCustomImage(null)}
                          >
                            <Ionicons name="trash-outline" size={12} color="#EF4444" />
                            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Hapus Foto Wallpaper</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Persistence note */}
                <View style={[styles.persistenceNote, { backgroundColor: isLightMode ? '#ECFDF5' : '#0F1A14', borderColor: isLightMode ? '#A7F3D0' : '#193324' }]}>
                  <Ionicons name="cloud-done-outline" size={14} color="#10B981" />
                  <Text style={[styles.persistenceNoteText, { color: isLightMode ? '#065F46' : '#34D399' }]}>
                    Kreasi tema Anda tersimpan permanen di cloud database & browser/aplikasi.
                  </Text>
                </View>
              </View>

              {/* 6.5 PRIVACY & LOCAL DATA BACKUP / RESTORE SECTION */}
              <View style={[styles.themeSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.themeHeaderIconWrap, { backgroundColor: isStrictLocal ? (isLightMode ? '#FEF3C7' : '#332014') : theme.accentBg, borderColor: theme.border }]}>
                    <Ionicons name={isStrictLocal ? "shield-half" : "cloud-outline"} size={17} color={isStrictLocal ? "#F59E0B" : theme.accentLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.themeHeaderTitle, { color: theme.text }]}>Privasi & Data Cadangan</Text>
                    <Text style={[styles.themeHeaderSub, { color: theme.subtext }]}>
                      Pilih penyimpanan offline lokal atau ekspor-impor data cadangan (.json)
                    </Text>
                  </View>
                </View>

                {/* Strictly Local Toggle Card */}
                <View style={[styles.privacyToggleCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Ionicons name="hardware-chip-outline" size={15} color={theme.text} />
                      <Text style={[styles.privacyToggleTitle, { color: theme.text }]}>Mode Penyimpanan Lokal Saja</Text>
                    </View>
                    <Text style={[styles.privacyToggleDesc, { color: theme.subtext }]}>
                      {isStrictLocal
                        ? '🔒 Aktif: Catatan, tugas & jurnal HANYA disimpan di HP ini dan TIDAK dikirim ke server Supabase.'
                        : '☁️ Nonaktif: Data tersinkronisasi otomatis dengan server cloud untuk keamanan cadangan saat ganti HP.'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.customSwitch,
                      { backgroundColor: isStrictLocal ? '#10B981' : (isLightMode ? '#CBD5E1' : '#334155') }
                    ]}
                    onPress={handleToggleStrictLocal}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.switchThumb, isStrictLocal && styles.switchThumbActive]} />
                  </TouchableOpacity>
                </View>

                {/* Backup & Restore Action Buttons */}
                <View style={styles.backupButtonsRow}>
                  <TouchableOpacity
                    style={[styles.backupActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, exportingBackup && { opacity: 0.6 }]}
                    onPress={handleExportBackup}
                    disabled={exportingBackup}
                    activeOpacity={0.7}
                  >
                    {exportingBackup ? (
                      <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.8 }] }} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={15} color={theme.accentLight} />
                        <Text style={[styles.backupActionBtnText, { color: theme.accentLight }]}>Unduh Cadangan (.json)</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.backupActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, importingBackup && { opacity: 0.6 }]}
                    onPress={handleImportBackup}
                    disabled={importingBackup}
                    activeOpacity={0.7}
                  >
                    {importingBackup ? (
                      <ActivityIndicator size="small" color="#10B981" style={{ transform: [{ scale: 0.8 }] }} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={15} color={isLightMode ? '#16A34A' : '#34D399'} />
                        <Text style={[styles.backupActionBtnText, { color: isLightMode ? '#16A34A' : '#34D399' }]}>Pulihkan / Impor</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* 7. LOGOUT BUTTON */}
              {user && (
                <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleSignOut}>
                  <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                  <Text style={styles.logoutText}>Keluar dari Akun</Text>
                </TouchableOpacity>
              )}

              {/* 8. VERSION / SECRET ADMIN TRIGGER */}
              <TouchableOpacity onPress={handleSecretTap} activeOpacity={0.7} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={[styles.versionText, { color: theme.muted }]}>Aplikasi Teman Belajar & AI v2.4 • Supabase DB</Text>
              </TouchableOpacity>

            </View>

          </View>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL KLAIM HAK AKSES ADMIN (SECRET EASTER EGG) */}
      {/* ========================================================================= */}
      <Modal
        visible={showClaimModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClaimModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.claimModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

            <View style={styles.claimModalHeader}>
              <View style={[styles.claimIconCircle, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                <Ionicons name="shield-checkmark" size={20} color={theme.accentLight} />
              </View>
              <Text style={[styles.claimModalTitle, { color: theme.text }]}>Otorisasi Akses Sistem</Text>
              <Text style={[styles.claimModalDesc, { color: theme.subtext }]}>
                Masukkan kode otorisasi rahasia untuk memverifikasi hak akses Administrator pada akun ini:
              </Text>
            </View>

            <TextInput
              style={[
                styles.passcodeInput,
                {
                  backgroundColor: isLightMode ? '#F1F5F9' : '#0E1117',
                  borderColor: isLightMode ? '#CBD5E1' : '#202634',
                  color: theme.text,
                }
              ]}
              value={passcodeInput}
              onChangeText={setPasscodeInput}
              placeholder="••••••••••••"
              placeholderTextColor={theme.muted}
              secureTextEntry
              autoCapitalize="characters"
            />

            <View style={styles.claimBtnRow}>
              <TouchableOpacity
                style={[
                  styles.claimCancelBtn,
                  {
                    backgroundColor: isLightMode ? '#F1F5F9' : '#141822',
                    borderColor: isLightMode ? '#CBD5E1' : '#202634',
                  }
                ]}
                onPress={() => {
                  setShowClaimModal(false);
                  setPasscodeInput('');
                }}
              >
                <Text style={[styles.claimCancelText, { color: theme.subtext }]}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.claimSubmitBtn, { backgroundColor: theme.primary }]}
                onPress={handleClaimAdmin}
                disabled={claiming}
              >
                {claiming ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.claimSubmitText}>Verifikasi</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL KUSTOMISASI AVATAR & NAMA TEMAN AI */}
      {/* ========================================================================= */}
      <Modal
        visible={showCustomAiModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomAiModal(false)}
      >
        <View style={styles.personaModalOverlay}>
          <TouchableOpacity
            style={styles.personaModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCustomAiModal(false)}
          />

          <View style={[styles.customAiModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Modal Header */}
            <View style={[styles.personaModalHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.themeHeaderIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                  <Ionicons name="color-wand" size={17} color={theme.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personaModalTitle, { color: theme.text }]}>Kustomisasi Teman AI</Text>
                  <Text style={[styles.personaModalSub, { color: theme.subtext }]}>
                    Pasang foto avatar & nama panggilan AI kamu
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowCustomAiModal(false)}
                style={[styles.closePersonaModalBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              >
                <Ionicons name="close" size={18} color={theme.subtext} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
              {/* Avatar Live Preview */}
              <View style={styles.customAiAvatarCenter}>
                <View style={[styles.customAiLargeAvatarWrap, { borderColor: theme.primary, backgroundColor: theme.cardInner }]}>
                  {tempAiAvatar ? (
                    <Image source={{ uri: tempAiAvatar }} style={styles.customAiLargeAvatarImg} />
                  ) : (
                    <Ionicons name="sparkles" size={36} color={theme.accentLight} />
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.uploadAiAvatarBtn, { backgroundColor: theme.primary }]}
                    onPress={handlePickCustomAiAvatar}
                  >
                    <Ionicons name="image-outline" size={15} color={primaryBtnTextColor} />
                    <Text style={[styles.uploadAiAvatarBtnText, { color: primaryBtnTextColor }]}>Pilih dari Galeri</Text>
                  </TouchableOpacity>

                  {tempAiAvatar && (
                    <TouchableOpacity
                      style={[styles.removeAiAvatarBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418', borderColor: isLightMode ? '#FECACA' : '#5A2026' }]}
                      onPress={() => setTempAiAvatar(null)}
                    >
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Hapus</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Input Nama Panggilan AI */}
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.customAiFieldLabel, { color: theme.text }]}>Nama Panggilan AI</Text>
                <TextInput
                  style={[styles.customAiInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Misal: Ara, Jarvis, Athena, Luna, Sensei..."
                  placeholderTextColor={theme.muted}
                  value={tempAiName}
                  onChangeText={setTempAiName}
                  maxLength={30}
                />
                <Text style={[styles.customAiFieldHint, { color: theme.subtext }]}>
                  AI akan memperkenalkan diri dengan nama ini di ruang obrolan.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.customAiModalActionRow}>
                {(customAiName || customAiAvatar) && (
                  <TouchableOpacity
                    style={[styles.resetAiBtn, { backgroundColor: isLightMode ? '#F1F5F9' : '#1E2430', borderColor: theme.border }]}
                    onPress={handleResetCustomAi}
                  >
                    <Text style={[styles.resetAiBtnText, { color: theme.subtext }]}>Reset Bawaan</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.saveCustomAiBtn, { backgroundColor: theme.primary, flex: 1 }]}
                  onPress={handleSaveCustomAi}
                  disabled={savingCustomAi}
                >
                  {savingCustomAi ? (
                    <ActivityIndicator size="small" color={primaryBtnTextColor} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color={primaryBtnTextColor} />
                      <Text style={[styles.saveCustomAiBtnText, { color: primaryBtnTextColor }]}>Simpan Kustomisasi</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL PEMILIHAN KARAKTER AI (CLEAN & SEARCHABLE MODAL) */}
      {/* ========================================================================= */}
      <Modal
        visible={showPersonaModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPersonaModal(false)}
      >
        <View style={styles.personaModalOverlay}>
          <TouchableOpacity
            style={styles.personaModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowPersonaModal(false)}
          />

          <View style={[styles.personaModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Modal Header */}
            <View style={[styles.personaModalHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.themeHeaderIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                  <Ionicons name="sparkles" size={17} color={theme.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personaModalTitle, { color: theme.text }]}>Pilih Kepribadian Teman AI</Text>
                  <Text style={[styles.personaModalSub, { color: theme.subtext }]}>
                    Tersedia {allPersonas.length} pilihan karakter dari admin
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowPersonaModal(false)}
                style={[styles.closePersonaModalBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              >
                <Ionicons name="close" size={18} color={theme.subtext} />
              </TouchableOpacity>
            </View>

            {/* Search Bar for Personas */}
            {allPersonas.length > 3 && (
              <View style={[styles.personaSearchWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Ionicons name="search" size={15} color={theme.muted} />
                <TextInput
                  style={[styles.personaSearchInput, { color: theme.text }]}
                  placeholder="Cari karakter atau peran..."
                  placeholderTextColor={theme.muted}
                  value={personaSearchQuery}
                  onChangeText={setPersonaSearchQuery}
                />
                {personaSearchQuery ? (
                  <TouchableOpacity onPress={() => setPersonaSearchQuery('')}>
                    <Ionicons name="close-circle" size={15} color={theme.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Scrollable Personas List */}
            <ScrollView style={styles.personaModalList} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8, paddingVertical: 4 }}>
                {allPersonas
                  .filter(p => {
                    if (!personaSearchQuery.trim()) return true;
                    const q = personaSearchQuery.toLowerCase();
                    return p.name.toLowerCase().includes(q) ||
                      (p.botName && p.botName.toLowerCase().includes(q)) ||
                      (p.desc && p.desc.toLowerCase().includes(q));
                  })
                  .map((persona, pIdx) => {
                    const isSelected = (activePersona.id && persona.id)
                      ? activePersona.id === persona.id
                      : activePersona.name === persona.name;

                    return (
                      <TouchableOpacity
                        key={persona.id || `p_${pIdx}`}
                        style={[
                          styles.personaOptionCard,
                          {
                            backgroundColor: isSelected ? (isLightMode ? '#EFF6FF' : '#141E2E') : theme.cardInner,
                            borderColor: isSelected ? theme.accent : theme.border,
                          },
                          isSelected && { borderWidth: 1.5 }
                        ]}
                        onPress={() => {
                          selectPersona(persona);
                          setShowPersonaModal(false);
                          showAlert('Karakter AI Dipilih', `Teman AI kamu sekarang: "${persona.name}" (${persona.botName || 'Ara'})`);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Text style={[styles.personaNameText, { color: isSelected ? theme.accentLight : theme.text }]}>
                              {persona.name}
                            </Text>
                            {persona.isCustom && (
                              <View style={[styles.customPersonaBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#332014', borderColor: isLightMode ? '#F59E0B' : '#78350F' }]}>
                                <Text style={[styles.customPersonaBadgeText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>Kustom</Text>
                              </View>
                            )}
                          </View>

                          {isSelected ? (
                            <View style={[styles.selectedCheckWrap, { backgroundColor: theme.primary }]}>
                              <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.unselectedCheckWrap, { borderColor: theme.border }]} />
                          )}
                        </View>

                        <Text style={[styles.personaBotCallText, { color: theme.accentLight }]}>
                          Nama Panggilan: <Text style={{ fontWeight: '700' }}>"{persona.botName || 'Ara'}"</Text>
                        </Text>

                        <Text style={[styles.personaDescText, { color: theme.subtext }]} numberOfLines={2}>
                          {persona.desc}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL PAMFLET SPEKTRUM WARNA LENGKAP (VISUAL COLOR PAMPHLET) */}
      {/* ========================================================================= */}
      <Modal
        visible={showColorPamphletModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColorPamphletModal(false)}
      >
        <View style={styles.personaModalOverlay}>
          <TouchableOpacity
            style={styles.personaModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowColorPamphletModal(false)}
          />

          <View style={[styles.colorPamphletCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Header */}
            <View style={[styles.personaModalHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[styles.themeHeaderIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                  <Ionicons name="color-palette" size={18} color={theme.accentLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personaModalTitle, { color: theme.text }]}>Pamflet Spektrum Warna</Text>
                  <Text style={[styles.personaModalSub, { color: theme.subtext }]}>
                    Pilih warna untuk{' '}
                    <Text style={{ fontWeight: '700', color: theme.accentLight }}>
                      {colorPamphletTarget === 'bg'
                        ? 'Latar Belakang (Background)'
                        : colorPamphletTarget === 'card'
                          ? 'Kartu & Panel (Card)'
                          : colorPamphletTarget === 'text'
                            ? 'Warna Teks / Judul Utama'
                            : colorPamphletTarget === 'subtext'
                              ? 'Warna Subtext / Deskripsi'
                              : 'Tombol Aksen & Highlight'}
                    </Text>
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setShowColorPamphletModal(false)}
                style={[styles.closePersonaModalBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              >
                <Ionicons name="close" size={18} color={theme.subtext} />
              </TouchableOpacity>
            </View>

            {/* Live Selected Color Banner & Action Row */}
            <View style={[styles.pamphletPreviewBanner, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <View style={[styles.pamphletColorBlock, { backgroundColor: tempSelectedColor, borderColor: theme.border }]}>
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={isColorLight(tempSelectedColor) ? '#000000' : '#FFFFFF'}
                />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.pamphletHexText, { color: theme.text }]}>
                    {tempSelectedColor}
                  </Text>
                  <View
                    style={[
                      styles.pamphletBadge,
                      {
                        backgroundColor: isColorLight(tempSelectedColor) ? '#FEF3C7' : '#1E293B',
                        borderColor: isColorLight(tempSelectedColor) ? '#F59E0B' : '#334155',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pamphletBadgeText,
                        { color: isColorLight(tempSelectedColor) ? '#B45309' : '#94A3B8' },
                      ]}
                    >
                      {isColorLight(tempSelectedColor) ? '☀️ Terang' : '🌑 Gelap'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: theme.subtext }}>
                  Klik salah satu warna di bawah untuk preview, lalu tekan Terapkan.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.pamphletApplyBtn, { backgroundColor: theme.primary }]}
                onPress={() => applyPamphletColor(tempSelectedColor)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                <Text style={styles.pamphletApplyBtnText}>Terapkan</Text>
              </TouchableOpacity>
            </View>

            {/* Search Bar & Web Color Wheel Button */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 }}>
              <View style={[styles.personaSearchWrap, { flex: 1, marginTop: 0, marginBottom: 0, backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Ionicons name="search" size={14} color={theme.muted} />
                <TextInput
                  style={[styles.personaSearchInput, { color: theme.text }]}
                  placeholder="Cari warna (Emerald, Rose, Slate, Black)..."
                  placeholderTextColor={theme.muted}
                  value={pamphletSearchQuery}
                  onChangeText={setPamphletSearchQuery}
                />
                {pamphletSearchQuery ? (
                  <TouchableOpacity onPress={() => setPamphletSearchQuery('')}>
                    <Ionicons name="close-circle" size={14} color={theme.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.nativeWheelBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={triggerNativeWebColorPicker}
                  activeOpacity={0.8}
                >
                  <Ionicons name="aperture" size={14} color={theme.accentLight} />
                  <Text style={[styles.nativeWheelBtnText, { color: theme.accentLight }]}>Roda Warna</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Categorized Color Swatches List */}
            <ScrollView style={styles.pamphletListScroll} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 14, paddingVertical: 6, paddingBottom: 16 }}>
                {COLOR_PAMPHLET_CATEGORIES.map((cat, cIdx) => {
                  const filteredColors = cat.colors.filter(col => {
                    if (!pamphletSearchQuery.trim()) return true;
                    const q = pamphletSearchQuery.toLowerCase().trim();
                    return col.name.toLowerCase().includes(q) || col.hex.toLowerCase().includes(q);
                  });

                  if (filteredColors.length === 0) return null;

                  return (
                    <View key={`cat_${cIdx}`} style={[styles.pamphletCategoryBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                      <View style={styles.pamphletCatHeader}>
                        <Text style={[styles.pamphletCatTitle, { color: theme.text }]}>{cat.title}</Text>
                        <Text style={[styles.pamphletCatDesc, { color: theme.subtext }]}>{cat.description}</Text>
                      </View>

                      <View style={styles.pamphletGrid}>
                        {filteredColors.map(colorItem => {
                          const isSelected = tempSelectedColor.toUpperCase() === colorItem.hex.toUpperCase();

                          return (
                            <TouchableOpacity
                              key={colorItem.hex}
                              style={[
                                styles.pamphletSwatchBtn,
                                {
                                  backgroundColor: colorItem.hex,
                                  borderColor: isSelected ? theme.accentLight : (isColorLight(colorItem.hex) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'),
                                },
                                isSelected && styles.pamphletSwatchSelected,
                              ]}
                              onPress={() => setTempSelectedColor(colorItem.hex)}
                              activeOpacity={0.8}
                            >
                              <View style={[styles.swatchInnerLabelWrap, { backgroundColor: isColorLight(colorItem.hex) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)' }]}>
                                <Text
                                  style={[
                                    styles.swatchNameText,
                                    { color: isColorLight(colorItem.hex) ? '#0F172A' : '#F3F4F6' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {colorItem.name}
                                </Text>
                                <Text
                                  style={[
                                    styles.swatchHexText,
                                    { color: isColorLight(colorItem.hex) ? '#475569' : '#9CA3AF' },
                                  ]}
                                >
                                  {colorItem.hex}
                                </Text>
                              </View>

                              {isSelected && (
                                <View style={[styles.swatchCheckBadge, { backgroundColor: theme.primary }]}>
                                  <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  scrollContentWide: {
    paddingHorizontal: 28,
  },
  innerContainer: {
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1200,
    alignSelf: 'center',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 14,
  },
  title: {
    color: '#F3F4F6',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  mainLayout: {
    gap: 14,
  },
  mainLayoutWide: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
  },
  column: {
    width: '100%',
  },
  avatarSection: {
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 10,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#202634',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#202634',
  },
  avatarInitial: {
    color: '#60A5FA',
    fontSize: 30,
    fontWeight: '700',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2563EB',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#141822',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 8,
  },
  roleBadgeAdmin: {
    backgroundColor: '#16233B',
    borderWidth: 1,
    borderColor: '#253856',
  },
  roleBadgeStudent: {
    backgroundColor: '#161B26',
    borderWidth: 1,
    borderColor: '#202634',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roleBadgeTextAdmin: {
    color: '#60A5FA',
  },
  roleBadgeTextStudent: {
    color: '#6B7280',
  },
  userName: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  nameInput: {
    backgroundColor: '#0E1117',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#F3F4F6',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#202634',
    textAlign: 'center',
    marginBottom: 4,
    minWidth: 180,
  },
  userEmail: {
    color: '#6B7280',
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: '#1E2430',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: 12.5,
  },
  btnSave: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnSaveText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12.5,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#141822',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 10,
  },
  editBtnText: {
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: 12.5,
  },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#253856',
    marginBottom: 10,
  },
  adminBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  adminIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#253856',
  },
  adminBtnTitle: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '700',
  },
  adminBtnSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  statNum: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  /* Theme Customizer Styles */
  themeSectionCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  themeHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  themeHeaderSub: {
    fontSize: 11,
    marginTop: 1,
  },
  emptyTrophyCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTrophyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyTrophyDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  trophyScrollList: {
    gap: 10,
    paddingVertical: 4,
  },
  trophyItemCard: {
    width: 130,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  trophyBossName: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  trophySubjectText: {
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  trophyXpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  trophyXpText: {
    color: '#F59E0B',
    fontSize: 9.5,
    fontWeight: '800',
  },
  trophyDateText: {
    fontSize: 9,
    marginTop: 1,
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  achievementBadgeCard: {
    width: 140,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  achievementIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  achievementTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  achievementDesc: {
    fontSize: 10,
    lineHeight: 13,
  },
  achievementRewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  achievementRewardText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  themeModeTabsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    gap: 4,
    marginBottom: 12,
  },
  themeModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  themeModeTabActive: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  themeModeTabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  themeCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  themeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  themeName: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  themePreviewPalette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  themeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  /* Custom Studio Studio Styles */
  customStudioWrap: {
    gap: 8,
    marginBottom: 12,
  },
  miniPreviewCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  miniBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniInnerCard: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
  },
  miniBtnPrimary: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  miniBtnOutline: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
  },
  customFieldTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 6,
  },
  colorChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  colorChipBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorChipBtnActive: {
    transform: [{ scale: 1.15 }],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  hexInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  hexInputPrefix: {
    fontSize: 11,
    fontWeight: '700',
  },
  hexColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  hexInput: {
    flex: 1,
    maxWidth: 130,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  openPamphletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  openPamphletBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Color Pamphlet Modal Styles */
  colorPamphletCard: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  pamphletPreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  pamphletColorBlock: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pamphletHexText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  pamphletBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  pamphletBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pamphletApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pamphletApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  nativeWheelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  nativeWheelBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  pamphletListScroll: {
    marginTop: 4,
  },
  pamphletCategoryBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  pamphletCatHeader: {
    marginBottom: 2,
  },
  pamphletCatTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  pamphletCatDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  pamphletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pamphletSwatchBtn: {
    width: '23.5%',
    minWidth: 70,
    height: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'flex-end',
    padding: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  pamphletSwatchSelected: {
    borderWidth: 2.5,
    transform: [{ scale: 1.03 }],
  },
  swatchInnerLabelWrap: {
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
  },
  swatchNameText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  swatchHexText: {
    fontSize: 8,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  swatchCheckBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contrastOptionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  resetCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  resetCustomText: {
    fontSize: 11,
    fontWeight: '600',
  },

  /* Background Art & Wallpaper Section Styles */
  artSectionDivider: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  artSectionHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  artSectionHeaderSub: {
    fontSize: 12,
    lineHeight: 14,
    marginBottom: 10,
  },
  artStylesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  artStyleCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 3,
  },
  artStyleLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  artStyleDesc: {
    fontSize: 11,
    lineHeight: 13,
  },
  customPhotoControlsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  uploadPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  uploadPhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  blurOptionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginTop: 4,
  },

  persistenceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  persistenceNoteText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 14,
    fontWeight: '500',
  },
  infoSection: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  claimAdminTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  claimAdminTriggerText: {
    color: '#4B5565',
    fontSize: 11,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#141822',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 12.5,
  },
  versionText: {
    color: '#3B4556',
    fontSize: 12,
  },

  /* ========================================================= */
  /* MODAL KLAIM ADMIN */
  /* ========================================================= */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  claimModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#11141C',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#253856',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  claimModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  claimIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#253856',
  },
  claimModalTitle: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  claimModalDesc: {
    color: '#9CA3AF',
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 17,
  },
  passcodeInput: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F3F4F6',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#202634',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  passcodeHint: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16,
  },
  claimBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  claimCancelBtn: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  claimCancelText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '500',
  },
  claimSubmitBtn: {
    flex: 1.5,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  claimSubmitText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  personaOptionCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
  },
  personaNameText: {
    fontSize: 13,
    fontWeight: '700',
  },
  customPersonaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  customPersonaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectedCheckWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unselectedCheckWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  personaBotCallText: {
    fontSize: 11,
    fontWeight: '500',
  },
  personaDescText: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  activePersonaNameHighlight: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  changePersonaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  changePersonaBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  activePersonaDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  personaModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  personaModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  personaModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  personaModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  personaModalTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  personaModalSub: {
    fontSize: 11,
    marginTop: 1,
  },
  closePersonaModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  personaSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  personaSearchInput: {
    flex: 1,
    fontSize: 12.5,
    padding: 0,
  },
  personaModalList: {
    marginTop: 8,
  },
  tourBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginTop: 10,
  },
  tourBtnIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tourBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  tourBtnSub: {
    fontSize: 11,
  },
  privacyToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 12,
  },
  privacyToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  privacyToggleDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  customSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  backupButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  backupActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  backupActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  aiCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiAvatarPreviewWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  aiAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  aiCardActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aiCardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7.5,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
  },
  aiCardActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  customAiModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  customAiAvatarCenter: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  customAiLargeAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  customAiLargeAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  uploadAiAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  uploadAiAvatarBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  removeAiAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  customAiFieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  customAiInput: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  customAiFieldHint: {
    fontSize: 11,
    marginTop: 4,
  },
  customAiModalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 6,
  },
  resetAiBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetAiBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveCustomAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  saveCustomAiBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  colorWheelBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});
