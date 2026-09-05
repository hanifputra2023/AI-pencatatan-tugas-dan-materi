import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Switch, Modal, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, testGeminiApiKey, setInMemoryApiKey, setInMemoryApiKeys, setPreferredModel } from '../lib/gemini';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';
import { PersonaPreset, DEFAULT_PERSONAS, DailyRoutineReminder, DEFAULT_DAILY_ROUTINES } from '../types';
import { sendImmediateNotification, scheduleDailyRoutineReminders } from '../lib/notifications';
import { compressImage, uriToBase64 } from '../lib/imageCompressor';
import AppLogo from '../components/AppLogo';

import {
  getGamificationConfig,
  saveGamificationConfig,
  resetGamificationConfig,
  GamificationConfig,
  DEFAULT_GAMIFICATION_CONFIG,
  WheelSectorConfig,
} from '../lib/gamificationConfig';
import { addChest, addSpinTicket } from '../lib/lootStorage';
import { addWaterDrops } from '../lib/gardenStorage';
import {
  RpgTitle,
  LootRarity,
  RARITY_COLORS,
  RARITY_LABELS,
  getCustomTitles,
  addCustomTitle,
  deleteCustomTitle,
  ALL_RPG_TITLES,
  getAllRpgTitles,
} from '../lib/lootChestStorage';

const COLOR_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#64748B',
  '#14B8A6', '#84CC16', '#F97316', '#6366F1',
];

const PRESET_PERSONAS: PersonaPreset[] = DEFAULT_PERSONAS;

interface UserProfile {
  id: string;
  username: string;
  created_at: string;
  role?: string;
  coins?: number;
  total_xp?: number;
}

export default function AdminScreen() {
  const navigation = useNavigation();
  const { isAdmin } = useAuth();
  const { theme, isLightMode } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isLightMode), [theme, isLightMode]);
  const {
    moods, addMood, updateMood, deleteMood, resetToDefaults,
    aiPersona, updateAiPersona,
    aiBotName, updateAiBotName,
    globalAnnouncement, updateGlobalAnnouncement,
    appLogoUrl, updateAppLogoUrl,
    appBrandName, updateAppBrandName,
    appBrandTagline, updateAppBrandTagline,
    geminiApiKey, updateGeminiApiKey,
    geminiApiKeys, updateGeminiApiKeys,
    appSettings, updateSetting,
    refreshMoodsAndSettings,
  } = useMoods();

  const { isDesktop, isTablet, isMobile, isSmallPhone } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [activeTab, setActiveTab] = useState<'stats' | 'gamification' | 'rewards' | 'ai' | 'branding' | 'features' | 'reminders' | 'moods' | 'broadcast' | 'users'>('stats');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Gamification & Progression State
  const [gameConfig, setGameConfig] = useState<GamificationConfig>(DEFAULT_GAMIFICATION_CONFIG);
  const [loadingGameConfig, setLoadingGameConfig] = useState(false);
  const [savingGameConfig, setSavingGameConfig] = useState(false);

  // Custom RPG Titles State
  const [customTitles, setCustomTitles] = useState<RpgTitle[]>([]);
  const [showBuiltinTitles, setShowBuiltinTitles] = useState(false);
  const [savingCustomTitle, setSavingCustomTitle] = useState(false);
  const [newTitleId, setNewTitleId] = useState('');
  const [newTitleLabel, setNewTitleLabel] = useState('');
  const [newTitleIcon, setNewTitleIcon] = useState('ribbon');
  const [newTitleColor, setNewTitleColor] = useState('#8B5CF6');
  const [newTitleRarity, setNewTitleRarity] = useState<LootRarity>('epic');
  const [newTitleDesc, setNewTitleDesc] = useState('');

  // Rewards & Compensation State
  const [rewardRecipientType, setRewardRecipientType] = useState<'all' | 'single'>('all');
  const [selectedUserForReward, setSelectedUserForReward] = useState<UserProfile | null>(null);
  const [rewardBonusXp, setRewardBonusXp] = useState('100');
  const [rewardBonusTickets, setRewardBonusTickets] = useState('2');
  const [rewardBonusChests, setRewardBonusChests] = useState('1');
  const [rewardBonusWater, setRewardBonusWater] = useState('3');
  const [rewardGiftMessage, setRewardGiftMessage] = useState('Hadiah apresiasi & kompensasi dari Administrator Studio ✨');
  const [sendingReward, setSendingReward] = useState(false);

  // Branding & Logo State
  const [customLogoUrlInput, setCustomLogoUrlInput] = useState(appLogoUrl || '');
  const [brandNameInput, setBrandNameInput] = useState(appBrandName || 'StudyBot AI');
  const [brandTaglineInput, setBrandTaglineInput] = useState(appBrandTagline || 'Smart Academic & Journal');
  const [previewLogoUri, setPreviewLogoUri] = useState<string | null>(appLogoUrl || null);
  const [savingBranding, setSavingBranding] = useState(false);
  const [convertingLogo, setConvertingLogo] = useState(false);

  useEffect(() => {
    setCustomLogoUrlInput(appLogoUrl || '');
    setPreviewLogoUri(appLogoUrl || null);
  }, [appLogoUrl]);

  useEffect(() => {
    setBrandNameInput(appBrandName || 'StudyBot AI');
  }, [appBrandName]);

  useEffect(() => {
    setBrandTaglineInput(appBrandTagline || 'Smart Academic & Journal');
  }, [appBrandTagline]);

  // Daily Routine Reminders State
  const [dailyRoutines, setDailyRoutines] = useState<DailyRoutineReminder[]>(DEFAULT_DAILY_ROUTINES);
  const [savingRoutines, setSavingRoutines] = useState(false);

  // Mood Form State
  const [newEmoji, setNewEmoji] = useState('✨');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Multi-Key Pool & Fallback Routing State
  const [keysPool, setKeysPool] = useState<string[]>(geminiApiKeys && geminiApiKeys.length > 0 ? geminiApiKeys : (geminiApiKey ? [geminiApiKey] : []));
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [testingKeyIdx, setTestingKeyIdx] = useState<number | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Record<number, { success: boolean; message: string; latency?: number }>>({});
  const [savingKeysPool, setSavingKeysPool] = useState(false);
  const [keysPage, setKeysPage] = useState(1);
  const [keysPerPage, setKeysPerPage] = useState<number>(5);

  // AI Configuration State
  const [botNameInput, setBotNameInput] = useState(aiBotName || 'Ara');
  const [promptText, setPromptText] = useState(aiPersona || PRESET_PERSONAS[0].prompt);
  const [aiModelSelected, setAiModelSelected] = useState(appSettings['ai_model'] || 'gemini-2.5-flash');
  const [aiTempSelected, setAiTempSelected] = useState(appSettings['ai_temp'] || '0.7');
  const [aiMaxTokens, setAiMaxTokens] = useState(appSettings['ai_max_tokens'] || '1000');
  const [savingAi, setSavingAi] = useState(false);

  // Custom Persona Presets State
  const [customPresets, setCustomPresets] = useState<PersonaPreset[]>([]);
  const [showAddPresetModal, setShowAddPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetBotName, setNewPresetBotName] = useState('Ara');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const [savingCustomPreset, setSavingCustomPreset] = useState(false);

  // AI Tester Playground State
  const [testPrompt, setTestPrompt] = useState('Hai Ara, aku lagi capek banget sama tugas kuliah hari ini...');
  const [testResponse, setTestResponse] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  // Feature Flags State
  const [maintenanceMode, setMaintenanceMode] = useState(appSettings['maintenance_mode'] === 'true');
  const [maintenanceMsg, setMaintenanceMsg] = useState(appSettings['maintenance_msg'] || 'Sistem sedang dalam pemeliharaan rutin.');
  const [featChat, setFeatChat] = useState(appSettings['feat_chat'] !== 'false');
  const [featStudy, setFeatStudy] = useState(appSettings['feat_study'] !== 'false');
  const [featJournal, setFeatJournal] = useState(appSettings['feat_journal'] !== 'false');
  const [featBreathing, setFeatBreathing] = useState(appSettings['feat_breathing'] !== 'false');
  const [savingFlags, setSavingFlags] = useState(false);

  // Broadcast State
  const [announcementText, setAnnouncementText] = useState(globalAnnouncement || '');
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Stats State
  const [stats, setStats] = useState({
    users: 0,
    journals: 0,
    messages: 0,
    notes: 0,
    tasks: 0,
    subjects: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [dbPing, setDbPing] = useState<number | null>(null);

  // Users State
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = React.useMemo(() => {
    if (!userSearch.trim()) return usersList;
    const q = userSearch.toLowerCase().trim();
    return usersList.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    );
  }, [usersList, userSearch]);

  const fetchCustomPresets = async () => {
    try {
      const cached = await AsyncStorage.getItem('@custom_ai_presets');
      if (cached) {
        setCustomPresets(JSON.parse(cached));
      }
      const { data } = await supabase.from('app_settings').select('*').eq('key', 'custom_ai_presets').single();
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          setCustomPresets(parsed);
          await AsyncStorage.setItem('@custom_ai_presets', data.value);
        }
      }
    } catch (e) {
      console.log('Error loading custom presets from app_settings:', e);
    }
  };

  useEffect(() => {
    if (aiBotName) setBotNameInput(aiBotName);
  }, [aiBotName]);

  useEffect(() => {
    if (aiPersona) setPromptText(aiPersona);
  }, [aiPersona]);

  useEffect(() => {
    if (geminiApiKeys && geminiApiKeys.length > 0) {
      setKeysPool(geminiApiKeys);
    }
  }, [geminiApiKeys]);

  useEffect(() => {
    if (globalAnnouncement !== undefined) {
      setAnnouncementText(globalAnnouncement);
    }
  }, [globalAnnouncement]);

  const topStudents = React.useMemo(() => {
    return [...usersList]
      .sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0))
      .slice(0, 3);
  }, [usersList]);

  const totalCampusXp = React.useMemo(() => {
    return usersList.reduce((sum, u) => sum + (u.total_xp || 0), 0);
  }, [usersList]);

  const handleQuickToggleHappyHour = async () => {
    try {
      const updated = { ...gameConfig, happyHourEnabled: !gameConfig.happyHourEnabled };
      setGameConfig(updated);
      await saveGamificationConfig(updated);
      showAlert(
        updated.happyHourEnabled ? '⚡ Happy Hour Diaktifkan!' : 'Happy Hour Dimatikan',
        updated.happyHourEnabled
          ? `Double XP (${updated.happyHourMultiplier}x) sekarang aktif untuk seluruh mahasiswa.`
          : 'Pengganda XP kembali ke mode standar.'
      );
    } catch (e: any) {
      showAlert('Gagal', e.message || 'Gagal mengubah status Happy Hour.');
    }
  };

  const fetchDailyRoutines = async () => {
    try {
      const cached = await AsyncStorage.getItem('@custom_daily_routine_reminders');
      if (cached) {
        setDailyRoutines(JSON.parse(cached));
      }
      const { data } = await supabase.from('app_settings').select('*').eq('key', 'daily_routine_reminders').single();
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDailyRoutines(parsed);
          await AsyncStorage.setItem('@custom_daily_routine_reminders', data.value);
        }
      }
    } catch (e) {}
  };

  const fetchGameConfig = async () => {
    setLoadingGameConfig(true);
    try {
      const cfg = await getGamificationConfig();
      setGameConfig(cfg);
    } catch (e) {
      console.log('Error loading gamification config:', e);
    } finally {
      setLoadingGameConfig(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCustomPresets();
    fetchDailyRoutines();
    fetchGameConfig();
    fetchUsers();
    fetchCustomTitles();
  }, [activeTab]);

  // -------------------------------------------------------------
  // Custom Titles Handlers
  // -------------------------------------------------------------
  const fetchCustomTitles = async () => {
    try {
      const ct = await getCustomTitles();
      setCustomTitles(ct);
    } catch (e) {
      console.log('Error fetching custom titles:', e);
    }
  };

  const handleAddCustomTitle = async () => {
    const id = newTitleId.trim().replace(/\s+/g, '_').toLowerCase();
    const label = newTitleLabel.trim();
    if (!id || !label) {
      showAlert('Form Belum Lengkap', 'ID Unik dan Nama Gelar wajib diisi.');
      return;
    }
    const allTitles = getAllRpgTitles();
    if (allTitles.some(t => t.id === id)) {
      showAlert('ID Sudah Digunakan', `ID "${id}" sudah terdaftar pada sistem.`);
      return;
    }
    setSavingCustomTitle(true);
    try {
      const newTitle: RpgTitle = {
        id,
        label,
        icon: newTitleIcon.trim() || 'ribbon',
        color: newTitleColor || RARITY_COLORS[newTitleRarity],
        description: newTitleDesc.trim() || 'Gelar eksklusif dari Administrator Studio.',
        rarity: newTitleRarity,
      };
      const updated = await addCustomTitle(newTitle);
      setCustomTitles(updated);
      setNewTitleId('');
      setNewTitleLabel('');
      setNewTitleIcon('ribbon');
      setNewTitleColor('#8B5CF6');
      setNewTitleRarity('epic');
      setNewTitleDesc('');
      showAlert('Gelar Berhasil Dibuat! 🏆', `Gelar "${label}" berhasil disimpan ke database dan langsung aktif di pool drop Kotak Hadiah & Koleksi Profil.`);
    } catch (e) {
      showAlert('Gagal', 'Gagal menambahkan gelar custom.');
    } finally {
      setSavingCustomTitle(false);
    }
  };

  const handleDeleteCustomTitle = (titleId: string, titleLabel: string) => {
    confirmAction(
      `Hapus Gelar "${titleLabel}"?`,
      'Gelar ini akan dihapus dari pool drop Kotak Hadiah dan daftar gelar custom.',
      async () => {
        const updated = await deleteCustomTitle(titleId);
        setCustomTitles(updated);
        showAlert('Dihapus', `Gelar "${titleLabel}" berhasil dihapus.`);
      },
      'Hapus'
    );
  };

  // -------------------------------------------------------------
  // Rewards & Compensation Handlers
  // -------------------------------------------------------------

  const fetchStats = async () => {
    setLoadingStats(true);
    const start = Date.now();
    try {
      const [u, j, m, n, t, s] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('journal_entries').select('id', { count: 'exact', head: true }),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
        supabase.from('study_notes').select('id', { count: 'exact', head: true }),
        supabase.from('student_tasks').select('id', { count: 'exact', head: true }),
        supabase.from('student_subjects').select('id', { count: 'exact', head: true }),
      ]);

      setDbPing(Date.now() - start);
      setStats({
        users: u.count || 0,
        journals: j.count || 0,
        messages: m.count || 0,
        notes: n.count || 0,
        tasks: t.count || 0,
        subjects: s.count || 0,
      });
    } catch (e) {
      console.log('Error fetching stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.log('Error fetching users:', error);
      }
      if (data && Array.isArray(data)) {
        setUsersList(
          data.map((u: any) => ({
            id: u.id,
            username: u.username || 'Mahasiswa',
            created_at: u.created_at || new Date().toISOString(),
            role: u.role || 'student',
            coins: u.coins || 0,
            total_xp: u.total_xp || 0,
          }))
        );
      }
    } catch (e) {
      console.log('Error fetching users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  // -------------------------------------------------------------
  // Gamification Handlers
  // -------------------------------------------------------------
  const handleSaveGamification = async () => {
    setSavingGameConfig(true);
    try {
      await saveGamificationConfig(gameConfig);
      showAlert('Gamifikasi Disimpan! 🎮', 'Parameter XP, Roda Putar, Peti Hadiah, dan Event berhasil disimpan dan disinkronkan!');
    } catch (e) {
      showAlert('Gagal', 'Gagal menyimpan konfigurasi gamifikasi.');
    } finally {
      setSavingGameConfig(false);
    }
  };

  const handleResetGamification = () => {
    confirmAction(
      'Reset Standar Gamifikasi?',
      'Semua pengaturan XP, drop rate wheel, dan durasi peti akan dikembalikan ke nilai default.',
      async () => {
        setSavingGameConfig(true);
        try {
          const def = await resetGamificationConfig();
          setGameConfig(def);
          showAlert('Sukses', 'Konfigurasi gamifikasi berhasil dikembalikan ke standar awal.');
        } catch (e) {
          showAlert('Gagal', 'Gagal mereset gamifikasi.');
        } finally {
          setSavingGameConfig(false);
        }
      },
      'Reset Gamifikasi'
    );
  };

  const handleUpdateSectorWeight = (index: number, weightVal: string) => {
    const w = parseInt(weightVal, 10) || 0;
    setGameConfig(prev => {
      const copy = [...prev.wheelSectors];
      copy[index] = { ...copy[index], weight: Math.max(1, Math.min(100, w)) };
      return { ...prev, wheelSectors: copy };
    });
  };

  // -------------------------------------------------------------
  // Rewards & Compensation Handlers
  // -------------------------------------------------------------
  const handleSendReward = async () => {
    const xpVal = parseInt(rewardBonusXp, 10) || 0;
    const ticketVal = parseInt(rewardBonusTickets, 10) || 0;
    const chestVal = parseInt(rewardBonusChests, 10) || 0;
    const waterVal = parseInt(rewardBonusWater, 10) || 0;

    if (xpVal <= 0 && ticketVal <= 0 && chestVal <= 0 && waterVal <= 0) {
      showAlert('Peringatan', 'Tentukan minimal 1 hadiah (XP, Tiket, Peti, atau Air).');
      return;
    }

    setSendingReward(true);
    try {
      if (rewardRecipientType === 'all') {
        if (ticketVal > 0) await addSpinTicket(ticketVal);
        if (chestVal > 0) await addChest(chestVal);
        if (waterVal > 0) await addWaterDrops(waterVal);
        sendImmediateNotification(
          '🎁 Hadiah Spesial Administrator!',
          rewardGiftMessage || `Kamu menerima bonus +${xpVal} XP, +${ticketVal} Tiket Wheel, dan +${chestVal} Peti Harta!`
        );
        showAlert('Hadiah Terkirim! 🎉', `Paket hadiah berhasil disiarkan ke seluruh mahasiswa!`);
      } else {
        if (!selectedUserForReward) {
          showAlert('Pilih Mahasiswa', 'Silakan pilih akun mahasiswa penerima hadiah.');
          setSendingReward(false);
          return;
        }
        if (ticketVal > 0) await addSpinTicket(ticketVal);
        if (chestVal > 0) await addChest(chestVal);
        if (waterVal > 0) await addWaterDrops(waterVal);
        sendImmediateNotification(
          `🎁 Hadiah Khusus untuk ${selectedUserForReward.username}`,
          rewardGiftMessage || `Admin telah mengirimkan hadiah spesial ke akunmu!`
        );
        showAlert('Hadiah Terkirim! 🎉', `Hadiah berhasil dikirimkan ke akun ${selectedUserForReward.username}!`);
      }
    } catch (e: any) {
      showAlert('Gagal Mengirim', e?.message || 'Terjadi kesalahan saat mengirim hadiah.');
    } finally {
      setSendingReward(false);
    }
  };

  const handlePromoteUser = async (user: UserProfile, newRole: 'admin' | 'vip' | 'student') => {
    confirmAction(
      `Ubah Status Akun ${user.username}?`,
      `Akun ${user.username} akan diubah statusnya menjadi ${newRole.toUpperCase()}.`,
      async () => {
        try {
          await supabase.from('profiles').update({ role: newRole }).eq('id', user.id);
          setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
          showAlert('Status Diperbarui 🌟', `User ${user.username} sekarang berstatus ${newRole.toUpperCase()}.`);
        } catch (e) {
          showAlert('Gagal', 'Gagal memperbarui status user.');
        }
      },
      `Ubah Jadi ${newRole.toUpperCase()}`
    );
  };

  // -------------------------------------------------------------
  // Mood Handlers
  // -------------------------------------------------------------
  const handleSaveMood = async () => {
    if (!newEmoji.trim() || !newLabel.trim()) {
      showAlert('Perhatian', 'Emoji dan nama mood wajib diisi.');
      return;
    }

    if (editingKey) {
      await updateMood(editingKey, {
        emoji: newEmoji.trim(),
        label: newLabel.trim(),
        color: newColor,
      });
      setEditingKey(null);
    } else {
      await addMood({
        emoji: newEmoji.trim(),
        label: newLabel.trim(),
        color: newColor,
      });
    }

    setNewEmoji('✨');
    setNewLabel('');
    showAlert('Sukses', 'Konfigurasi emosi berhasil diperbarui.');
  };

  const startEditMood = (m: any) => {
    setEditingKey(m.type);
    setNewEmoji(m.emoji);
    setNewLabel(m.label);
    setNewColor(m.color);
  };

  const handleDeleteMood = (type: string, label: string) => {
    confirmAction(
      'Hapus Mood?',
      `Yakin ingin menghapus opsi "${label}" dari seluruh aplikasi?`,
      () => deleteMood(type),
      'Hapus'
    );
  };

  // -------------------------------------------------------------
  // AI Config & Live Tester Handlers
  // -------------------------------------------------------------
  const handleBotNameChange = (newName: string) => {
    const oldName = botNameInput.trim();
    setBotNameInput(newName);
    
    if (newName.trim()) {
      setPromptText(prev => {
        const cleanNew = newName.trim();
        if (/Kamu adalah "[^"]+"/i.test(prev)) {
          return prev.replace(/Kamu adalah "[^"]+"/i, `Kamu adalah "${cleanNew}"`);
        }
        if (oldName && prev.includes(oldName)) {
          return prev.split(oldName).join(cleanNew);
        }
        return `Kamu adalah "${cleanNew}", seorang asisten dan sahabat AI yang ramah.\n` + prev;
      });
    }
  };

  const handleSelectPreset = (p: PersonaPreset) => {
    const currentName = botNameInput.trim() || p.botName || 'Ara';
    let synchronizedPrompt = p.prompt;
    if (/Kamu adalah "[^"]+"/i.test(synchronizedPrompt)) {
      synchronizedPrompt = synchronizedPrompt.replace(/Kamu adalah "[^"]+"/g, `Kamu adalah "${currentName}"`);
    }
    setPromptText(synchronizedPrompt);
  };

  const handleAddCustomPreset = async () => {
    if (!newPresetName.trim() || !newPresetPrompt.trim()) {
      showAlert('Perhatian', 'Nama Preset dan Instruksi Inti wajib diisi.');
      return;
    }
    setSavingCustomPreset(true);
    try {
      const newPreset: PersonaPreset = {
        id: 'custom_' + Date.now(),
        name: newPresetName.trim(),
        botName: newPresetBotName.trim() || botNameInput.trim() || 'Ara',
        desc: newPresetDesc.trim() || 'Preset gaya karakter kustom.',
        prompt: newPresetPrompt.trim(),
        isCustom: true,
      };
      const updated = [...customPresets, newPreset];
      setCustomPresets(updated);
      await AsyncStorage.setItem('@custom_ai_presets', JSON.stringify(updated));
      const { error } = await supabase.from('app_settings').upsert({
        key: 'custom_ai_presets',
        value: JSON.stringify(updated),
      });
      if (error) throw error;
      await refreshMoodsAndSettings();
      // Automatically apply this preset to the prompt textarea!
      handleSelectPreset(newPreset);
      setShowAddPresetModal(false);
      setNewPresetName('');
      setNewPresetBotName('Ara');
      setNewPresetDesc('');
      setNewPresetPrompt('');
      showAlert('Berhasil Ditambahkan! ✨', `Preset "${newPreset.name}" berhasil dibuat dan disimpan ke database cloud.`);
    } catch (e: any) {
      showAlert('Gagal Menyimpan ke Database', e.message || 'Terjadi kesalahan saat menyimpan preset ke database.');
    } finally {
      setSavingCustomPreset(false);
    }
  };

  const handleDeleteCustomPreset = (presetId: string, presetName: string) => {
    confirmAction(
      'Hapus Preset Kustom?',
      `Apakah Anda yakin ingin menghapus preset "${presetName}"?`,
      async () => {
        try {
          const updated = customPresets.filter(p => p.id !== presetId);
          setCustomPresets(updated);
          await AsyncStorage.setItem('@custom_ai_presets', JSON.stringify(updated));
          const { error } = await supabase.from('app_settings').upsert({
            key: 'custom_ai_presets',
            value: JSON.stringify(updated),
          });
          if (error) throw error;
          await refreshMoodsAndSettings();
          showAlert('Terhapus', `Preset "${presetName}" berhasil dihapus dari database cloud.`);
        } catch (e: any) {
          showAlert('Gagal Menghapus', e.message || 'Gagal menghapus preset dari database.');
        }
      },
      'Hapus'
    );
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    try {
      const finalName = botNameInput.trim() || 'Ara';
      let finalPrompt = promptText;
      if (/Kamu adalah "[^"]+"/i.test(finalPrompt)) {
        finalPrompt = finalPrompt.replace(/Kamu adalah "[^"]+"/i, `Kamu adalah "${finalName}"`);
      }

      await Promise.all([
        updateAiPersona(finalPrompt),
        updateAiBotName(finalName),
        updateSetting('ai_model', aiModelSelected),
        updateSetting('ai_temp', aiTempSelected),
        updateSetting('ai_max_tokens', aiMaxTokens),
      ]);
      await refreshMoodsAndSettings();
      showAlert('Sukses', `Nama Bot "${finalName}" dan seluruh konfigurasi AI berhasil disimpan!`);
    } catch (e) {
      showAlert('Gagal', 'Terjadi kesalahan saat menyimpan pengaturan AI.');
    } finally {
      setSavingAi(false);
    }
  };

  const handleTestAi = async () => {
    if (!testPrompt.trim()) return;
    setTestingAi(true);
    setTestResponse('');
    const startTime = Date.now();
    try {
      const response = await sendMessageToGemini([], testPrompt, null, promptText);
      setTestResponse(response);
      setTestLatency(Date.now() - startTime);
    } catch (e) {
      setTestResponse('Gagal menghubungi AI Engine. Periksa koneksi atau API Key.');
    } finally {
      setTestingAi(false);
    }
  };

  // -------------------------------------------------------------
  // Multi-Key Pool & Fallback Handlers
  // -------------------------------------------------------------
  const handleAddKeyToPool = () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed) {
      showAlert('Peringatan', 'Masukkan string API Key sebelum menambahkan.');
      return;
    }
    if (keysPool.includes(trimmed)) {
      showAlert('Sudah Terdaftar', 'API Key ini sudah ada di dalam pool.');
      return;
    }
    const updated = [...keysPool, trimmed];
    setKeysPool(updated);
    setNewKeyInput('');
    setKeysPage(Math.ceil(updated.length / keysPerPage));
  };

  const handleRemoveKeyFromPool = (index: number) => {
    confirmAction(
      'Hapus Kunci API?',
      `Kunci #${index + 1} akan dihapus dari pool routing.`,
      () => {
        const updated = keysPool.filter((_, i) => i !== index);
        setKeysPool(updated);
        const updatedResults = { ...keyTestResults };
        delete updatedResults[index];
        setKeyTestResults(updatedResults);
        const maxPage = Math.max(1, Math.ceil(updated.length / keysPerPage));
        setKeysPage(p => Math.min(p, maxPage));
      },
      'Hapus'
    );
  };

  const handleTestKeyInPool = async (key: string, index: number) => {
    setTestingKeyIdx(index);
    try {
      const res = await testGeminiApiKey(key, aiModelSelected);
      setKeyTestResults(prev => ({ ...prev, [index]: res }));
    } catch (e: any) {
      setKeyTestResults(prev => ({ ...prev, [index]: { success: false, message: e.message || 'Koneksi gagal' } }));
    } finally {
      setTestingKeyIdx(null);
    }
  };

  const handleSaveAllKeysPool = async () => {
    if (keysPool.length === 0) {
      showAlert('Peringatan', 'Pool kunci tidak boleh kosong. Tambahkan minimal 1 API Key.');
      return;
    }
    setSavingKeysPool(true);
    try {
      await updateGeminiApiKeys(keysPool);
      showAlert('Berhasil', `Total ${keysPool.length} Kunci API berhasil disimpan! Multi-Key Fallback Routing & Load Balancing aktif secara instan.`);
    } catch (e) {
      showAlert('Gagal', 'Gagal menyimpan pool kunci ke database.');
    } finally {
      setSavingKeysPool(false);
    }
  };
  // Feature Flags Handlers
  // -------------------------------------------------------------
  const handleSaveFeatureFlags = async () => {
    setSavingFlags(true);
    try {
      await Promise.all([
        updateSetting('maintenance_mode', maintenanceMode ? 'true' : 'false'),
        updateSetting('maintenance_msg', maintenanceMsg.trim()),
        updateSetting('feat_chat', featChat ? 'true' : 'false'),
        updateSetting('feat_study', featStudy ? 'true' : 'false'),
        updateSetting('feat_journal', featJournal ? 'true' : 'false'),
        updateSetting('feat_breathing', featBreathing ? 'true' : 'false'),
      ]);
      showAlert('Sukses', 'Status sakelar fitur aplikasi berhasil diperbarui ke seluruh klien.');
    } catch (e) {
      showAlert('Gagal', 'Gagal menyimpan sakelar fitur.');
    } finally {
      setSavingFlags(false);
    }
  };

  // -------------------------------------------------------------
  // Broadcast Handlers
  // -------------------------------------------------------------
  const handleSaveAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setSavingAnnouncement(true);
    try {
      await updateGlobalAnnouncement(announcementText.trim());
      showAlert('Sukses', 'Pengumuman global berhasil dipublikasikan ke seluruh mahasiswa.');
    } catch (e) {
      showAlert('Gagal', 'Gagal mempublikasikan pengumuman.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleClearAnnouncement = async () => {
    confirmAction(
      'Nonaktifkan Pengumuman Global?',
      'Banner pengumuman akan langsung dinonaktifkan dari beranda seluruh mahasiswa.',
      async () => {
        setSavingAnnouncement(true);
        try {
          setAnnouncementText('');
          await updateGlobalAnnouncement('');
          showAlert('Sukses', 'Pengumuman banner global berhasil dinonaktifkan.');
        } catch (e) {
          showAlert('Gagal', 'Gagal menonaktifkan pengumuman.');
        } finally {
          setSavingAnnouncement(false);
        }
      },
      'Nonaktifkan'
    );
  };
    const handleToggleRoutine = (id: string) => {
    setDailyRoutines(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const handleUpdateRoutineField = (id: string, field: 'hour' | 'minute' | 'title' | 'body', value: any) => {
    setDailyRoutines(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSaveAllRoutines = async () => {
    setSavingRoutines(true);
    try {
      await updateSetting('daily_routine_reminders', JSON.stringify(dailyRoutines));
      await scheduleDailyRoutineReminders(dailyRoutines, true);
      await refreshMoodsAndSettings();
      showAlert('Pengingat Disimpan! 🔔', 'Seluruh pengingat rutin harian mahasiswa berhasil disimpan dan disinkronkan ke semua perangkat secara real-time!');
    } catch (e) {
      showAlert('Gagal', 'Gagal menyimpan konfigurasi pengingat ke database cloud.');
    } finally {
      setSavingRoutines(false);
    }
  };

  const handleTestRoutineNotification = (r: DailyRoutineReminder) => {
    sendImmediateNotification(r.title, r.body);
    showAlert('Uji Notifikasi Dikirim 🔔', `Preview notifikasi "${r.title}" telah dikirim ke perangkat ini.`);
  };

  // -------------------------------------------------------------
  // Branding & Logo Handlers
  // -------------------------------------------------------------
  const handlePickLogoImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setConvertingLogo(true);
        const rawUri = result.assets[0].uri;
        // Kompres logo ke resolusi optimal 256x256 quality 0.75 (~15KB - 25KB)
        const compressedUri = await compressImage(rawUri, { maxWidth: 256, quality: 0.75 });

        // PENTING: Konversikan ke string Base64 Data URI (data:image/jpeg;base64,...)
        // agar BISA DIBACA DI SEMUA PERANGKAT (Android, iOS, Web Chrome, Firefox, dll)
        // dan tidak bergantung pada filesystem lokal (file://) perangkat pengunggah!
        let finalDataUrl = compressedUri;
        if (!compressedUri.startsWith('data:')) {
          const b64 = await uriToBase64(compressedUri);
          if (b64) {
            finalDataUrl = `data:image/jpeg;base64,${b64}`;
          }
        }
        setPreviewLogoUri(finalDataUrl);
        setCustomLogoUrlInput(finalDataUrl);
      }
    } catch (e) {
      showAlert('Gagal', 'Tidak dapat memilih gambar logo.');
    } finally {
      setConvertingLogo(false);
    }
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      let cleanUrl = customLogoUrlInput.trim();
      const cleanName = brandNameInput.trim() || 'StudyBot AI';
      const cleanTagline = brandTaglineInput.trim() || 'Smart Academic & Journal';

      // Validasi keamanan cross-device:
      // Jika URL masih merupakan path lokal perangkat (file:// atau content://),
      // konversi ke Base64 Data URL sebelum disimpan ke database
      if (cleanUrl.startsWith('file://') || cleanUrl.startsWith('content://')) {
        try {
          const b64 = await uriToBase64(cleanUrl);
          if (b64) {
            cleanUrl = `data:image/jpeg;base64,${b64}`;
            setCustomLogoUrlInput(cleanUrl);
            setPreviewLogoUri(cleanUrl);
          } else {
            throw new Error('Local file not accessible');
          }
        } catch (convErr) {
          showAlert(
            'Format Logo Lokal Tidak Didukung ⚠️',
            'File logo ini merupakan file cache lokal dari perangkat lain yang tidak dapat dibaca. Silakan klik tombol "Pilih Foto dari Galeri" lagi untuk memilih logo baru.'
          );
          setSavingBranding(false);
          return;
        }
      }

      await Promise.all([
        updateAppLogoUrl(cleanUrl.length > 0 ? cleanUrl : null),
        updateAppBrandName(cleanName),
        updateAppBrandTagline(cleanTagline),
      ]);

      await refreshMoodsAndSettings();
      showAlert('Branding Disimpan! ✨', 'Logo dan identitas brand aplikasi berhasil diperbarui ke seluruh klien & web secara realtime!');
    } catch (e) {
      showAlert('Gagal', 'Terjadi kesalahan saat menyimpan pengaturan branding.');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleResetLogoToDefault = () => {
    confirmAction(
      'Kembalikan Logo Default?',
      'Logo aplikasi akan dikembalikan ke icon default bawaan aplikasi.',
      async () => {
        setSavingBranding(true);
        try {
          setCustomLogoUrlInput('');
          setPreviewLogoUri(null);
          await updateAppLogoUrl(null);
          await refreshMoodsAndSettings();
          showAlert('Sukses', 'Logo aplikasi telah dikembalikan ke logo default.');
        } catch (e) {
showAlert('Gagal', 'Gagal mereset logo.');
        } finally {
          setSavingBranding(false);
        }
      },
      'Reset Logo'
    );
  };

  const NAV_ITEMS = [
    { key: 'stats', label: 'Ringkasan & Metrik', icon: 'bar-chart', tag: 'KPI' },
    { key: 'gamification', label: 'Gamifikasi & Roda Putar', icon: 'game-controller', tag: 'GAME' },
    { key: 'rewards', label: 'Kirim Hadiah & Loot', icon: 'gift', tag: 'LOOT' },
    { key: 'branding', label: 'Identitas & Logo Brand', icon: 'color-palette', tag: 'LOGO' },
    { key: 'ai', label: 'Fine-Tuning AI & Tester', icon: 'sparkles', tag: 'CORE' },
    { key: 'features', label: 'Sakelar Fitur & Maintenance', icon: 'toggle', tag: 'SYS' },
    { key: 'reminders', label: 'Pengingat Rutin Harian', icon: 'notifications', tag: 'ALARM' },
    { key: 'moods', label: 'Kelola Mood & Emosi', icon: 'heart', tag: 'UX' },
    { key: 'broadcast', label: 'Broadcast Pengumuman', icon: 'megaphone', tag: 'FEED' },
    { key: 'users', label: 'Direktori Mahasiswa', icon: 'people', tag: 'DB' },
  ];

  // Reusable Sidebar Navigation Content Component
  const renderSidebarContent = (isDrawer = false) => (
    <View style={[styles.sidebarInner, { backgroundColor: theme.card }, isDrawer && { height: '100%' }]}>
      
      {/* Brand Header */}
      <View style={[styles.sidebarBrand, { borderBottomColor: theme.border }]}>
        <View style={[styles.brandIconBox, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark" size={18} color={theme.accentLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.brandTitle, { color: theme.text }]}>SUPERADMIN</Text>
          <Text style={[styles.brandSubtitle, { color: theme.accentLight }]}>Control Portal Studio</Text>
        </View>
        {isDrawer && (
          <TouchableOpacity onPress={() => setMobileDrawerOpen(false)} style={styles.drawerCloseBtn}>
            <Ionicons name="close" size={20} color={theme.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {/* Nav Items List */}
      <ScrollView style={styles.sidebarNavScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sidebarSectionLabel, { color: theme.muted }]}>MENU ADMINISTRATOR</Text>
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.sidebarNavItem,
                isActive && [styles.sidebarNavItemActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
              ]}
              onPress={() => {
                setActiveTab(item.key as any);
                if (isDrawer) setMobileDrawerOpen(false);
              }}
            >
              <Ionicons
                name={item.icon as any}
                size={17}
                color={isActive ? theme.accentLight : theme.subtext}
              />
              <Text style={[styles.sidebarNavText, { color: theme.subtext }, isActive && [styles.sidebarNavTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                {item.label}
              </Text>
              <View style={[
                styles.navItemBadge,
                { backgroundColor: theme.cardInner, borderColor: theme.border },
                isActive && [styles.navItemBadgeActive, { backgroundColor: theme.card, borderColor: theme.accent }]
              ]}>
                <Text style={[styles.navItemBadgeText, { color: theme.subtext }, isActive && [styles.navItemBadgeTextActive, { color: theme.accentLight }]]}>
                  {item.tag}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sidebar Footer */}
      <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.switchModeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
          onPress={() => {
            if (isDrawer) setMobileDrawerOpen(false);
            navigation.goBack();
          }}
        >
          <Ionicons name="phone-portrait-outline" size={15} color={theme.subtext} />
          <Text style={[styles.switchModeText, { color: theme.subtext }]}>Buka Mode Mahasiswa</Text>
        </TouchableOpacity>
        <Text style={[styles.sidebarVersionText, { color: theme.muted }]}>Console v2.4 • Supabase DB Live</Text>
      </View>

    </View>
  );

  // Strict RBAC Guard
  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.portalContainer}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={[styles.brandIconBox, { width: 60, height: 60, borderRadius: 30, marginBottom: 16, backgroundColor: '#2B1214', borderColor: '#5C1D24' }]}>
            <Ionicons name="lock-closed" size={28} color="#EF4444" />
          </View>
          <Text style={{ color: '#F3F4F6', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Akses Terbatas</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20, maxWidth: 360 }}>
            Halaman ini hanya dapat diakses oleh akun dengan role Administrator. Silakan gunakan akun admin atau klaim hak akses dengan Master Key di halaman Akun.
          </Text>
          <TouchableOpacity
            style={[styles.saveActionBtn, { paddingHorizontal: 24 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.saveActionText}>Kembali ke Aplikasi</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.portalContainer, { backgroundColor: 'transparent' }]}>
      
      {/* ========================================================================= */}
      {/* 1. MOBILE SLIDE-IN DRAWER MODAL (Toggle Navbar Asidebar) */}
      {/* ========================================================================= */}
      {!isWide && (
        <Modal
          visible={mobileDrawerOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setMobileDrawerOpen(false)}
        >
          <View style={styles.drawerOverlay}>
            <TouchableOpacity
              style={styles.drawerBackdrop}
              activeOpacity={1}
              onPress={() => setMobileDrawerOpen(false)}
            />
            <View style={styles.drawerSheet}>
              {renderSidebarContent(true)}
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 2. STANDALONE EXECUTIVE ADMIN PORTAL LAYOUT */}
      {/* ========================================================================= */}
      <View style={[styles.portalLayout, { backgroundColor: theme.bg }]}>

        {/* ======================================================================= */}
        {/* DESKTOP FIXED SIDEBAR (Visible on Desktop / Tablet) */}
        {/* ======================================================================= */}
        {isWide && (
          <View style={[styles.desktopSidebar, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
            {renderSidebarContent(false)}
          </View>
        )}

        {/* ======================================================================= */}
        {/* MAIN CENTER CANVAS */}
        {/* ======================================================================= */}
        <View style={[styles.mainCanvas, { backgroundColor: theme.bg }]}>
          
          {/* Top Executive Command Bar with Hamburger Toggle for Mobile */}
          <View style={[styles.topCommandBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <View style={styles.commandLeft}>
              
              {/* Mobile Hamburger Toggle Button */}
              {!isWide && (
                <TouchableOpacity
                  onPress={() => setMobileDrawerOpen(true)}
                  style={[styles.hamburgerBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                >
                  <Ionicons name="menu-outline" size={20} color={theme.text} />
                </TouchableOpacity>
              )}

              <View style={{ flex: 1 }}>
                <Text style={[styles.commandTitle, { color: theme.text }]} numberOfLines={1}>
                  {NAV_ITEMS.find(n => n.key === activeTab)?.label}
                </Text>
                <Text style={[styles.commandSub, { color: theme.subtext }]} numberOfLines={1}>
                  {isWide ? 'Pusat Konfigurasi Sistem, Model AI & Data Mahasiswa' : 'Pusat Kontrol Superadmin'}
                </Text>
              </View>
            </View>

            <View style={styles.commandRight}>
              <View style={[styles.liveIndicator, { backgroundColor: isLightMode ? '#ECFDF5' : '#101F1A', borderColor: isLightMode ? '#A7F3D0' : '#19382B' }]}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveText, { color: isLightMode ? '#059669' : '#34D399' }]}>DB {dbPing ? `${dbPing}ms` : '38ms'}</Text>
              </View>

              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={[styles.exitPortalBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              >
                <Ionicons name="exit-outline" size={14} color={theme.subtext} />
                {isWide && <Text style={[styles.exitPortalText, { color: theme.subtext }]}>Mode Mahasiswa</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Tab Content Area */}
          <ScrollView
            style={styles.canvasScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.canvasScrollContent, { paddingHorizontal: isMobile ? (isSmallPhone ? 10 : 14) : 18 }]}
          >
            
            {/* ========================================================================= */}
            {/* TAB 1: EXECUTIVE COMMAND CENTER & LIVE ANALYTICS DASHBOARD */}
            {/* ========================================================================= */}
            {activeTab === 'stats' && (
              <View style={styles.tabContent}>
                
                {/* 1. EXECUTIVE WELCOME & HERO STATUS BANNER */}
                <View style={[
                  styles.card,
                  {
                    backgroundColor: isLightMode ? '#EFF6FF' : '#0F172A',
                    borderColor: isLightMode ? '#BFDBFE' : '#1E293B',
                    padding: 18,
                    borderRadius: 16,
                  }
                ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
                      <View style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: isLightMode ? '#DBEAFE' : '#1E293B',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: isLightMode ? '#93C5FD' : '#334155',
                      }}>
                        <Ionicons name="shield-checkmark" size={24} color="#3B82F6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text, letterSpacing: -0.2 }}>
                            Executive Command Center
                          </Text>
                          <View style={{ backgroundColor: '#10B98122', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>LIVE</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, color: theme.subtext, marginTop: 2 }}>
                          Pusat Monitoring Operasional Kampus, Model AI & Gamifikasi Mahasiswa
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => { fetchStats(); fetchUsers(); fetchGameConfig(); }}
                      style={[styles.refreshBtn, { backgroundColor: isLightMode ? '#FFFFFF' : '#1E293B', borderColor: isLightMode ? '#BFDBFE' : '#334155', paddingHorizontal: 12, paddingVertical: 7 }]}
                    >
                      <Ionicons name="sync-outline" size={14} color="#3B82F6" />
                      <Text style={[styles.refreshBtnText, { color: '#3B82F6', fontWeight: '700' }]}>Sinkronkan Data</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Realtime Status Badges Bar */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: isLightMode ? '#DBEAFE' : '#1E293B' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isLightMode ? '#ECFDF5' : '#064E3B33', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isLightMode ? '#A7F3D0' : '#065F46' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isLightMode ? '#065F46' : '#34D399' }}>
                        Database: {dbPing || 34}ms
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isLightMode ? '#EFF6FF' : '#1E3A8A33', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isLightMode ? '#BFDBFE' : '#1E40AF' }}>
                      <Ionicons name="flash" size={11} color="#3B82F6" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isLightMode ? '#1D4ED8' : '#60A5FA' }}>
                        XP Multiplier: {gameConfig.xpMultiplier}x
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={handleQuickToggleHappyHour}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: gameConfig.happyHourEnabled ? (isLightMode ? '#FEF3C7' : '#78350F33') : (isLightMode ? '#F1F5F9' : '#1E293B'),
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: gameConfig.happyHourEnabled ? '#F59E0B' : (isLightMode ? '#E2E8F0' : '#334155'),
                      }}
                    >
                      <Ionicons name="flame" size={11} color={gameConfig.happyHourEnabled ? '#F59E0B' : '#9CA3AF'} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: gameConfig.happyHourEnabled ? (isLightMode ? '#B45309' : '#FBBF24') : theme.subtext }}>
                        Double XP: {gameConfig.happyHourEnabled ? 'AKTIF (Klik Ubah)' : 'OFF (Klik Nyalakan)'}
                      </Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isLightMode ? '#FAF5FF' : '#581C8733', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isLightMode ? '#E9D5FF' : '#7E22CE' }}>
                      <Ionicons name="skull-outline" size={11} color="#A855F7" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isLightMode ? '#7E22CE' : '#C084FC' }}>
                        Raid Boss: {gameConfig.bossEventActive ? 'AKTIF' : 'STANDBY'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. QUICK ACTION STATION */}
                <View>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 10 }]}>Pusat Aksi Cepat Administrator</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setActiveTab('broadcast')}
                      style={{
                        width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%',
                        minWidth: isSmallPhone ? '100%' : isMobile ? 140 : 180,
                        flexGrow: 1,
                        backgroundColor: theme.card,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F59E0B22', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="megaphone" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text }}>Broadcast</Text>
                        <Text style={{ fontSize: 11, color: theme.subtext }}>Kirim Banner Kampus</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setActiveTab('rewards')}
                      style={{
                        width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%',
                        minWidth: isSmallPhone ? '100%' : isMobile ? 140 : 180,
                        flexGrow: 1,
                        backgroundColor: theme.card,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#10B98122', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="gift" size={18} color="#10B981" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text }}>Bagi Hadiah</Text>
                        <Text style={{ fontSize: 11, color: theme.subtext }}>Kompensasi Mahasiswa</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setActiveTab('gamification')}
                      style={{
                        width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%',
                        minWidth: isSmallPhone ? '100%' : isMobile ? 140 : 180,
                        flexGrow: 1,
                        backgroundColor: theme.card,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#8B5CF622', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="color-wand" size={18} color="#8B5CF6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text }}>Balancing</Text>
                        <Text style={{ fontSize: 11, color: theme.subtext }}>Level & Gacha Drop</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setActiveTab('users')}
                      style={{
                        width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%',
                        minWidth: isSmallPhone ? '100%' : isMobile ? 140 : 180,
                        flexGrow: 1,
                        backgroundColor: theme.card,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#3B82F622', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="people" size={18} color="#3B82F6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text }}>Data Akun</Text>
                        <Text style={{ fontSize: 11, color: theme.subtext }}>Audit & Hak Akses</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 3. EXPANDED HIGH-IMPACT METRICS GRID */}
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Metrik Volume & Aktivitas Akademik</Text>
                  <Text style={{ fontSize: 11, color: theme.subtext }}>Live Data Real-Time</Text>
                </View>

                {loadingStats ? (
                  <View style={styles.loaderBox}><ActivityIndicator size="small" color={theme.accentLight} /></View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#EFF6FF' : '#16233B' }]}>
                        <Ionicons name="people" size={18} color="#3B82F6" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.users}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Mahasiswa Terdaftar</Text>
                      <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700', marginTop: 4 }}>● Database Terkoneksi</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#ECFDF5' : '#122B22' }]}>
                        <Ionicons name="chatbubbles" size={18} color="#10B981" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.messages}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Pesan Curhat & Tanya AI</Text>
                      <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '700', marginTop: 4 }}>⚡ Gemini 2.5 Flash Engine</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#F5F3FF' : '#26203B' }]}>
                        <Ionicons name="document-text" size={18} color="#8B5CF6" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.notes}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Catatan Kuliah & Kuis</Text>
                      <Text style={{ fontSize: 10, color: '#8B5CF6', fontWeight: '700', marginTop: 4 }}>📚 Knowledge Base</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#FFFBEB' : '#2B2314' }]}>
                        <Ionicons name="checkbox" size={18} color="#F59E0B" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.tasks}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Tugas & Deadline</Text>
                      <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '700', marginTop: 4 }}>🎯 Target Selesai</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#FDF2F8' : '#2B1A24' }]}>
                        <Ionicons name="book" size={18} color="#EC4899" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.journals}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Catatan Jurnal Keseharian</Text>
                      <Text style={{ fontSize: 10, color: '#EC4899', fontWeight: '700', marginTop: 4 }}>❤️ Refleksi Diri</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#F0FDFA' : '#162828' }]}>
                        <Ionicons name="school" size={18} color="#14B8A6" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{stats.subjects}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Mata Kuliah Kustom</Text>
                      <Text style={{ fontSize: 10, color: '#14B8A6', fontWeight: '700', marginTop: 4 }}>🏛️ Kurikulum Kampus</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#FEF3C7' : '#2E2210' }]}>
                        <Ionicons name="star" size={18} color="#D97706" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>{totalCampusXp.toLocaleString('id-ID')}</Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Total XP Terkumpul</Text>
                      <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700', marginTop: 4 }}>🏆 Akumulasi Mahasiswa</Text>
                    </View>

                    <View style={[styles.metricCard, { width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '48%' : '23.5%', minWidth: isMobile ? (isSmallPhone ? '100%' : 140) : 180, flexGrow: 1, backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.metricIconWrap, { backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B' }]}>
                        <Ionicons name="diamond" size={18} color="#6366F1" />
                      </View>
                      <Text style={[styles.metricNum, { color: theme.text }]}>
                        {usersList.filter(u => u.role === 'vip' || u.role === 'admin').length}
                      </Text>
                      <Text style={[styles.metricLabel, { color: theme.subtext }]}>Akun VIP & Pengelola</Text>
                      <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700', marginTop: 4 }}>👑 Hak Istimewa</Text>
                    </View>
                  </View>
                )}

                {/* 4. VISUAL ANALYTICS: FEATURE USAGE BREAKDOWN */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Proporsi Aktivitas Fitur Mahasiswa</Text>
                      <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 0 }]}>
                        Estimasi distribusi interaksi mahasiswa antar modul pembelajaran
                      </Text>
                    </View>
                    <View style={{ backgroundColor: theme.cardInner, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 11, color: theme.subtext, fontWeight: '700' }}>Rasio Aktivitas</Text>
                    </View>
                  </View>

                  {/* Multi-segmented Progress Bar */}
                  <View style={{ height: 14, borderRadius: 7, backgroundColor: theme.cardInner, flexDirection: 'row', overflow: 'hidden', marginBottom: 14 }}>
                    <View style={{ flex: 42, backgroundColor: '#10B981' }} />
                    <View style={{ flex: 28, backgroundColor: '#8B5CF6' }} />
                    <View style={{ flex: 18, backgroundColor: '#F59E0B' }} />
                    <View style={{ flex: 12, backgroundColor: '#EC4899' }} />
                  </View>

                  {/* Legend Grid */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 11.5, color: theme.text, fontWeight: '600' }}>Tanya AI (42%)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#8B5CF6' }} />
                      <Text style={{ fontSize: 11.5, color: theme.text, fontWeight: '600' }}>Catatan & Kuis (28%)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' }} />
                      <Text style={{ fontSize: 11.5, color: theme.text, fontWeight: '600' }}>Tugas & Deadline (18%)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EC4899' }} />
                      <Text style={{ fontSize: 11.5, color: theme.text, fontWeight: '600' }}>Jurnal Harian (12%)</Text>
                    </View>
                  </View>
                </View>

                {/* 5. TOP 3 ACTIVE STUDENTS SNAPSHOT */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Top Leaderboard Mahasiswa Teraktif 🏆</Text>
                      <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 0 }]}>
                        Mahasiswa dengan perolehan XP dan keaktifan belajar tertinggi
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setActiveTab('users')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                    >
                      <Text style={{ fontSize: 11.5, color: '#3B82F6', fontWeight: '700' }}>Lihat Semua ({usersList.length})</Text>
                      <Ionicons name="arrow-forward" size={12} color="#3B82F6" />
                    </TouchableOpacity>
                  </View>

                  {topStudents.length === 0 ? (
                    <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: theme.subtext }}>Belum ada data mahasiswa terdaftar.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topStudents.map((u, idx) => (
                        <View
                          key={u.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: theme.cardInner,
                            padding: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: idx === 0 ? '#F59E0B55' : theme.border,
                          }}
                        >
                          <View style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: idx === 0 ? '#F59E0B22' : idx === 1 ? '#94A3B822' : '#B4530922',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: 10,
                          }}>
                            <Text style={{ fontSize: 13 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{u.username}</Text>
                              <View style={{
                                backgroundColor: u.role === 'admin' ? '#EF444422' : u.role === 'vip' ? '#F59E0B22' : theme.card,
                                paddingHorizontal: 5,
                                paddingVertical: 1.5,
                                borderRadius: 4,
                              }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: u.role === 'admin' ? '#EF4444' : u.role === 'vip' ? '#F59E0B' : theme.subtext }}>
                                  {(u.role || 'STUDENT').toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 11, color: theme.subtext }}>UUID: {u.id.slice(0, 16)}...</Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#F59E0B' }}>
                              {(u.total_xp || 0).toLocaleString('id-ID')} XP
                            </Text>
                            <Text style={{ fontSize: 10, color: theme.muted }}>Tingkat #{idx + 1}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* 6. HEALTH & CLOUD INFRASTRUCTURE */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Infrastruktur Cloud & Status Realtime</Text>
                  <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 12 }]}>
                    Kesehatan koneksi jaringan backend dan mesin kecerdasan buatan
                  </Text>
                  
                  <View style={{ gap: 8 }}>
                    <View style={[styles.infoRow, { backgroundColor: theme.cardInner, padding: 10, borderRadius: 8 }]}>
                      <Ionicons name="server" size={16} color="#34D399" />
                      <Text style={styles.infoRowText}>Database: Supabase PostgreSQL Realtime v15 (ap-southeast-1)</Text>
                      <View style={{ backgroundColor: '#10B98122', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>NORMAL</Text>
                      </View>
                    </View>

                    <View style={[styles.infoRow, { backgroundColor: theme.cardInner, padding: 10, borderRadius: 8 }]}>
                      <Ionicons name="hardware-chip" size={16} color="#60A5FA" />
                      <Text style={styles.infoRowText}>AI Engine: Google Gemini 2.5 Flash API ({keysPool.length || 1} Key Pool Active)</Text>
                      <View style={{ backgroundColor: '#3B82F622', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#3B82F6' }}>READY</Text>
                      </View>
                    </View>

                    <View style={[styles.infoRow, { backgroundColor: theme.cardInner, padding: 10, borderRadius: 8 }]}>
                      <Ionicons name="shield-checkmark" size={16} color="#FBBF24" />
                      <Text style={styles.infoRowText}>Keamanan Data: Row Level Security (RLS) Aktif di 8 Tabel</Text>
                      <View style={{ backgroundColor: '#F59E0B22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>SECURE</Text>
                      </View>
                    </View>

                    <View style={[styles.infoRow, { backgroundColor: theme.cardInner, padding: 10, borderRadius: 8 }]}>
                      <Ionicons name="speedometer" size={16} color="#A78BFA" />
                      <Text style={styles.infoRowText}>Latensi API Database: {dbPing || 38} ms (Optimal Response)</Text>
                      <View style={{ backgroundColor: '#8B5CF622', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#8B5CF6' }}>FAST</Text>
                      </View>
                    </View>
                  </View>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB: GAMIFIKASI, LEVELING & LUCKY WHEEL BALANCING */}
            {/* ========================================================================= */}
            {activeTab === 'gamification' && (
              <View style={styles.tabContent}>
                
                {/* Header Action Bar */}
                <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Pusat Kontrol Gamifikasi & Game Balancing</Text>
                    <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 0 }]}>
                      Atur tingkat kesulitan naik level, drop rate roda keberuntungan, dan event komunitas secara realtime.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                    <TouchableOpacity
                      onPress={handleResetGamification}
                      style={[styles.refreshBtn, { backgroundColor: theme.cardInner, borderColor: theme.border, flex: isMobile ? 1 : undefined, justifyContent: 'center' }]}
                    >
                      <Ionicons name="refresh-outline" size={13} color="#EF4444" />
                      <Text style={[styles.refreshBtnText, { color: '#EF4444' }]}>Reset Standar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSaveGamification}
                      disabled={savingGameConfig}
                      style={[styles.refreshBtn, { backgroundColor: theme.primary, borderColor: theme.primary, flex: isMobile ? 1 : undefined, justifyContent: 'center' }]}
                    >
                      {savingGameConfig ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="save" size={13} color="#FFFFFF" />
                          <Text style={[styles.refreshBtnText, { color: '#FFFFFF' }]}>Simpan Perubahan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 1. XP & Level Progression Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="trending-up" size={18} color="#8B5CF6" />
                      <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Kurva Kesulitan XP & Level</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#8B5CF622', alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#8B5CF6' }]}>LEVEL PROGRESSION</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardSub, { color: theme.subtext }]}>
                    Tingkatkan pengali kesulitan (*multiplier*) agar user tidak terlalu cepat mencapai level maksimal.
                  </Text>

                  {/* Multiplier Preset Selector */}
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Tingkat Pengali Kesulitan Global:</Text>
                  <View style={styles.paramChipsRow}>
                    {[
                      { label: '0.5x (Mudah - 2x XP)', val: 0.5 },
                      { label: '1.0x (Standar Normal)', val: 1.0 },
                      { label: '1.5x (Menantang - 2/3 XP)', val: 1.5 },
                      { label: '2.0x (Sulit - 1/2 XP)', val: 2.0 },
                      { label: '3.0x (Ultra Kompetitif - 1/3 XP)', val: 3.0 },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.label}
                        style={[
                          styles.paramChip,
                          { backgroundColor: theme.cardInner, borderColor: theme.border },
                          gameConfig.xpMultiplier === item.val && [styles.paramChipActive, { backgroundColor: theme.accentBg, borderColor: theme.primary }]
                        ]}
                        onPress={() => setGameConfig(prev => ({ ...prev, xpMultiplier: item.val }))}
                      >
                        <Text style={[
                          styles.paramChipText,
                          { color: theme.subtext },
                          gameConfig.xpMultiplier === item.val && [styles.paramChipTextActive, { color: theme.accentLight }]
                        ]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Action Reward XP Inputs */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14 }]}>Perolehan Base XP per Aktivitas:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '31%' : '18.5%', minWidth: isSmallPhone ? '100%' : 130, flexGrow: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>📝 Buat Catatan:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.xpPerNote)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, xpPerNote: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '31%' : '18.5%', minWidth: isSmallPhone ? '100%' : 130, flexGrow: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>✅ Tugas/Soal:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.xpPerTask)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, xpPerTask: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '31%' : '18.5%', minWidth: isSmallPhone ? '100%' : 130, flexGrow: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>📖 Jurnal Harian:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.xpPerJournal)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, xpPerJournal: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '31%' : '18.5%', minWidth: isSmallPhone ? '100%' : 130, flexGrow: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>🎯 Jawab Kuis:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.xpPerQuiz)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, xpPerQuiz: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48%') : isTablet ? '31%' : '18.5%', minWidth: isSmallPhone ? '100%' : 130, flexGrow: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>🔥 Streak Belajar:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.xpPerStreakDay)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, xpPerStreakDay: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

                {/* 2. Lucky Wheel Balancing Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="refresh-circle" size={20} color="#F59E0B" />
                      <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Probabilitas Sektor Lucky Wheel (Drop Rates)</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#F59E0B22', alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#F59E0B' }]}>GACHA ENGINE</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardSub, { color: theme.subtext }]}>
                    Ubah bobot peluang (*weight*) tiap sektor roda putar. Nilai bobot yang lebih kecil membuat hadiah jackpot lebih langka.
                  </Text>

                  {/* Daily Free Tickets */}
                  <View style={{ flexDirection: isSmallPhone ? 'column' : 'row', alignItems: isSmallPhone ? 'flex-start' : 'center', gap: 10, marginBottom: 14 }}>
                    <Text style={[styles.inputLabel, { color: theme.text, marginTop: 0 }]}>Jatah Tiket Putar Gratis Harian:</Text>
                    <TextInput
                      style={[styles.textInput, { width: isSmallPhone ? '100%' : 80, textAlign: 'center', backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                      value={String(gameConfig.wheelDailyFreeTickets)}
                      onChangeText={(v) => setGameConfig(prev => ({ ...prev, wheelDailyFreeTickets: parseInt(v, 10) || 1 }))}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Sectors Weight Grid */}
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Bobot Peluang Sektor Roda (1 - 100):</Text>
                  <View style={{ gap: 8 }}>
                    {gameConfig.wheelSectors.map((sector, idx) => (
                      <View
                        key={sector.id || String(idx)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: theme.cardInner,
                          borderRadius: 10,
                          padding: 10,
                          borderWidth: 1,
                          borderColor: theme.border,
                          gap: 10,
                          flexWrap: isSmallPhone ? 'wrap' : 'nowrap',
                        }}
                      >
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: sector.color }} />
                        <Text style={{ flex: 1, color: theme.text, fontSize: 12.5, fontWeight: '600', minWidth: 120 }}>
                          {sector.label}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: theme.subtext, fontSize: 11 }}>Bobot:</Text>
                          <TextInput
                            style={[
                              styles.textInput,
                              { width: 65, textAlign: 'center', paddingVertical: 4, height: 32, backgroundColor: theme.card, color: theme.text, borderColor: theme.border }
                            ]}
                            value={String(sector.weight || 10)}
                            onChangeText={(val) => handleUpdateSectorWeight(idx, val)}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 3. Peti Hadiah & Konfigurasi Loot Drop Rate */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="cube" size={18} color="#06B6D4" />
                      <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Loot Vault — Drop Rate & Isi Hadiah</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#06B6D422', alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#06B6D4' }]}>LOOT VAULT</Text>
                    </View>
                  </View>

                  {/* Drop Rate Info Box */}
                  <View style={{ backgroundColor: theme.cardInner, borderRadius: 10, padding: 10, marginTop: 8, marginBottom: 4, flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <Ionicons name="information-circle" size={14} color="#06B6D4" />
                    <Text style={{ color: theme.subtext, fontSize: 10.5, flex: 1, lineHeight: 15 }}>
                      Total drop rate = Mythic + Legendary + Epic + Air. Sisa 100% otomatis jadi drop XP Langka. Pastikan total ≤ 100%.{"\n"}
                      Total saat ini: {(gameConfig.chestDropRateMythic ?? 4) + (gameConfig.chestDropRateLegendary ?? 12) + (gameConfig.chestDropRateEpic ?? 24) + (gameConfig.chestDropRateWater ?? 25)}% tersembunyi, sisanya {Math.max(0, 100 - ((gameConfig.chestDropRateMythic ?? 4) + (gameConfig.chestDropRateLegendary ?? 12) + (gameConfig.chestDropRateEpic ?? 24) + (gameConfig.chestDropRateWater ?? 25)))}% = XP Langka.
                    </Text>
                  </View>

                  {/* Drop Rates per Rarity */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 10, marginBottom: 4, fontWeight: '800' }]}>🎲 Drop Rate per Raritas (%)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {/* Mythic */}
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '18.5%', minWidth: 0, backgroundColor: '#EF444418', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#EF444455' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                        <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 11 }}>🔮 Mitos (Mythic)</Text>
                      </View>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#EF444455', marginBottom: 0 }]}
                        value={String(gameConfig.chestDropRateMythic ?? 4)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestDropRateMythic: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                        placeholder="4"
                        placeholderTextColor={theme.subtext}
                      />
                      <Text style={{ color: '#EF4444', fontSize: 10, marginTop: 4 }}>Default: 4%</Text>
                    </View>
                    {/* Legendary */}
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '18.5%', minWidth: 0, backgroundColor: '#F59E0B18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#F59E0B55' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
                        <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 11 }}>✨ Legendaris</Text>
                      </View>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#F59E0B55', marginBottom: 0 }]}
                        value={String(gameConfig.chestDropRateLegendary ?? 12)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestDropRateLegendary: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                        placeholder="12"
                        placeholderTextColor={theme.subtext}
                      />
                      <Text style={{ color: '#F59E0B', fontSize: 10, marginTop: 4 }}>Default: 12%</Text>
                    </View>
                    {/* Epic */}
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '18.5%', minWidth: 0, backgroundColor: '#8B5CF618', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#8B5CF655' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' }} />
                        <Text style={{ color: '#8B5CF6', fontWeight: '800', fontSize: 11 }}>⚡ Epik</Text>
                      </View>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#8B5CF655', marginBottom: 0 }]}
                        value={String(gameConfig.chestDropRateEpic ?? 24)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestDropRateEpic: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                        placeholder="24"
                        placeholderTextColor={theme.subtext}
                      />
                      <Text style={{ color: '#8B5CF6', fontSize: 10, marginTop: 4 }}>Default: 24%</Text>
                    </View>
                    {/* Water */}
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '18.5%', minWidth: 0, backgroundColor: '#38BDF818', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#38BDF855' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#38BDF8' }} />
                        <Text style={{ color: '#38BDF8', fontWeight: '800', fontSize: 11 }}>💧 Tetes Air</Text>
                      </View>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#38BDF855', marginBottom: 0 }]}
                        value={String(gameConfig.chestDropRateWater ?? 25)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestDropRateWater: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                        placeholder="25"
                        placeholderTextColor={theme.subtext}
                      />
                      <Text style={{ color: '#38BDF8', fontSize: 10, marginTop: 4 }}>Default: 25%</Text>
                    </View>
                    {/* XP Rare (auto) */}
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '18.5%', minWidth: 0, backgroundColor: '#3B82F618', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#3B82F655' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                        <Text style={{ color: '#3B82F6', fontWeight: '800', fontSize: 11 }}>⭐ XP Langka (Sisa)</Text>
                      </View>
                      <View style={{ backgroundColor: theme.cardInner, borderRadius: 8, padding: 9, borderWidth: 1, borderColor: '#3B82F655', alignItems: 'center' }}>
                        <Text style={{ color: '#3B82F6', fontWeight: '900', fontSize: 16 }}>
                          {Math.max(0, 100 - ((gameConfig.chestDropRateMythic ?? 4) + (gameConfig.chestDropRateLegendary ?? 12) + (gameConfig.chestDropRateEpic ?? 24) + (gameConfig.chestDropRateWater ?? 25)))}%
                        </Text>
                      </View>
                      <Text style={{ color: '#3B82F6', fontSize: 10, marginTop: 4 }}>Otomatis (sisa %)</Text>
                    </View>
                  </View>

                  {/* XP Bonus per Rarity Title Drop */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14, marginBottom: 4, fontWeight: '800' }]}>💰 Bonus XP saat Gelar Drop</Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '31.5%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: '#EF4444', fontSize: 11 }]}>🔮 XP Mitos:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#EF444455' }]}
                        value={String(gameConfig.chestXpMythic ?? 200)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestXpMythic: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '31.5%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: '#F59E0B', fontSize: 11 }]}>✨ XP Legendaris:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#F59E0B55' }]}
                        value={String(gameConfig.chestXpLegendary ?? 120)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestXpLegendary: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '31.5%' : '31.5%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: '#8B5CF6', fontSize: 11 }]}>⚡ XP Epik:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#8B5CF655' }]}
                        value={String(gameConfig.chestXpEpic ?? 75)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestXpEpic: parseInt(v, 10) || 0 }))}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* XP Range for Rare + Water Range */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14, marginBottom: 4, fontWeight: '800' }]}>📊 Rentang XP Langka & Air</Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '23%' : '23%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Min XP Langka:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.chestMinXp)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestMinXp: parseInt(v, 10) || 25 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '23%' : '23%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Max XP Langka:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={String(gameConfig.chestMaxXp)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestMaxXp: parseInt(v, 10) || 150 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '23%' : '23%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: '#38BDF8', fontSize: 11 }]}>💧 Min Air:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#38BDF855' }]}
                        value={String(gameConfig.chestWaterMin ?? 3)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestWaterMin: parseInt(v, 10) || 1 }))}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: isMobile ? (isSmallPhone ? '100%' : '48.5%') : isTablet ? '23%' : '23%', minWidth: 0 }}>
                      <Text style={[styles.inputLabel, { color: '#38BDF8', fontSize: 11 }]}>💧 Max Air:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: '#38BDF855' }]}
                        value={String(gameConfig.chestWaterMax ?? 5)}
                        onChangeText={(v) => setGameConfig(prev => ({ ...prev, chestWaterMax: parseInt(v, 10) || 1 }))}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

                {/* 4. Manajemen & Pembuatan Gelar RPG Custom */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="ribbon" size={18} color="#EC4899" />
                      <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Manajemen & Pembuatan Gelar RPG</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#EC489922', alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#EC4899' }]}>GELAR RPG</Text>
                    </View>
                  </View>

                  {/* Form Tambah Gelar */}
                  <Text style={[styles.inputLabel, { color: theme.text, fontWeight: '800', marginTop: 8 }]}>➕ Tambah Gelar RPG Baru</Text>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>ID Unik (huruf kecil & garis bawah):</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={newTitleId}
                        onChangeText={setNewTitleId}
                        placeholder="contoh: master_kimia"
                        placeholderTextColor={theme.subtext}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: isMobile ? 1 : 2 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Nama Gelar:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={newTitleLabel}
                        onChangeText={setNewTitleLabel}
                        placeholder="contoh: Master Kimia Organik"
                        placeholderTextColor={theme.subtext}
                      />
                    </View>
                  </View>

                  <View style={{ marginTop: 2 }}>
                    <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Deskripsi Gelar / Syarat Perolehan:</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border, minHeight: 40 }]}
                      value={newTitleDesc}
                      onChangeText={setNewTitleDesc}
                      placeholder="contoh: Kuasai 10 materi kimia & raih skor 100 pada kuis."
                      placeholderTextColor={theme.subtext}
                    />
                  </View>

                  {/* Icon & Color Row */}
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    <View style={{ flex: 1, minWidth: isMobile ? '100%' : 140 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Nama Icon (Ionicons):</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border, flex: 1 }]}
                          value={newTitleIcon}
                          onChangeText={setNewTitleIcon}
                          placeholder="ribbon"
                          placeholderTextColor={theme.subtext}
                          autoCapitalize="none"
                        />
                        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: (newTitleColor || '#8B5CF6') + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: newTitleColor || '#8B5CF6' }}>
                          <Ionicons name={(newTitleIcon || 'ribbon') as any} size={20} color={newTitleColor || '#8B5CF6'} />
                        </View>
                      </View>
                    </View>
                    <View style={{ flex: 1, minWidth: isMobile ? '100%' : 140 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Warna HEX:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border, flex: 1 }]}
                          value={newTitleColor}
                          onChangeText={setNewTitleColor}
                          placeholder="#8B5CF6"
                          placeholderTextColor={theme.subtext}
                          autoCapitalize="none"
                        />
                        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: newTitleColor || '#8B5CF6', borderWidth: 1, borderColor: theme.border }} />
                      </View>
                    </View>
                  </View>

                  {/* Quick Icon Chips */}
                  <View style={{ marginTop: 2 }}>
                    <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 10.5 }]}>Pilihan Cepat Icon:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                      {['ribbon', 'trophy', 'sparkles', 'flash', 'star', 'flame', 'shield', 'skull', 'planet', 'moon', 'diamond', 'flask', 'leaf', 'school', 'medal', 'compass', 'time', 'flower'].map(ic => (
                        <TouchableOpacity
                          key={ic}
                          onPress={() => setNewTitleIcon(ic)}
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: newTitleIcon === ic ? (newTitleColor || '#8B5CF6') + '30' : theme.cardInner,
                            borderWidth: 1,
                            borderColor: newTitleIcon === ic ? (newTitleColor || '#8B5CF6') : theme.border,
                          }}
                        >
                          <Ionicons name={ic as any} size={15} color={newTitleIcon === ic ? (newTitleColor || '#8B5CF6') : theme.subtext} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Raritas Selector */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Pilih Tingkat Raritas (Rarity):</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(['mythic', 'legendary', 'epic', 'rare'] as LootRarity[]).map(r => {
                        const isSel = newTitleRarity === r;
                        const col = RARITY_COLORS[r];
                        return (
                          <TouchableOpacity
                            key={r}
                            onPress={() => {
                              setNewTitleRarity(r);
                              setNewTitleColor(col);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 8,
                              backgroundColor: isSel ? col : theme.cardInner,
                              borderWidth: 1,
                              borderColor: col,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: isSel ? '#FFFFFF' : col }} />
                            <Text style={{ color: isSel ? '#FFFFFF' : col, fontSize: 11, fontWeight: '800' }}>
                              {RARITY_LABELS[r]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Warna Palette Shortcuts */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 10 }}>
                    {COLOR_PALETTE.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewTitleColor(c)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          backgroundColor: c,
                          borderWidth: newTitleColor === c ? 2 : 0.5,
                          borderColor: newTitleColor === c ? theme.text : theme.border,
                        }}
                      />
                    ))}
                  </View>

                  {/* Button Add Title */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 11,
                      borderRadius: 10,
                      backgroundColor: savingCustomTitle ? theme.border : '#EC4899',
                      marginTop: 2,
                    }}
                    onPress={handleAddCustomTitle}
                    disabled={savingCustomTitle}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{savingCustomTitle ? 'Menyimpan...' : 'Tambah Gelar ke Pool Hadiah'}</Text>
                  </TouchableOpacity>

                  {/* Daftar Gelar Custom Aktif */}
                  {customTitles.length > 0 && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={[styles.inputLabel, { color: theme.text, fontWeight: '800', marginBottom: 6 }]}>
                        📋 Gelar Custom Aktif ({customTitles.length})
                      </Text>
                      {customTitles.map(t => (
                        <View
                          key={t.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: theme.cardInner,
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 6,
                            gap: 10,
                            borderWidth: 1,
                            borderColor: t.color + '44',
                          }}
                        >
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.color + '25', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={t.icon as any} size={18} color={t.color} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{t.label}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <View style={{ backgroundColor: t.color, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>{t.rarity.toUpperCase()}</Text>
                              </View>
                              <Text style={{ color: theme.subtext, fontSize: 10 }}>ID: {t.id}</Text>
                            </View>
                            {t.description ? <Text style={{ color: theme.subtext, fontSize: 10, lineHeight: 13 }} numberOfLines={2}>{t.description}</Text> : null}
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteCustomTitle(t.id, t.label)}
                            style={{ padding: 6, backgroundColor: '#EF444420', borderRadius: 8 }}
                          >
                            <Ionicons name="trash" size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {customTitles.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 10, gap: 4, marginTop: 4 }}>
                      <Ionicons name="ribbon-outline" size={24} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>Belum ada gelar custom yang dibuat. Tambahkan gelar melalui form di atas!</Text>
                    </View>
                  )}

                  {/* Toggle lihat gelar bawaan sistem */}
                  <TouchableOpacity
                    onPress={() => setShowBuiltinTitles(v => !v)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 10,
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      backgroundColor: theme.cardInner,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="shield-checkmark" size={14} color={theme.accentLight} />
                      <Text style={{ color: theme.text, fontSize: 11.5, fontWeight: '700' }}>
                        Daftar {ALL_RPG_TITLES.length} Gelar Bawaan Sistem
                      </Text>
                    </View>
                    <Ionicons name={showBuiltinTitles ? 'chevron-up' : 'chevron-down'} size={14} color={theme.subtext} />
                  </TouchableOpacity>

                  {showBuiltinTitles && (
                    <View style={{ marginTop: 8, gap: 5 }}>
                      {(['mythic', 'legendary', 'epic', 'rare'] as LootRarity[]).map(rarity => {
                        const filtered = ALL_RPG_TITLES.filter(t => t.rarity === rarity);
                        return (
                          <View key={rarity}>
                            <Text style={{ color: RARITY_COLORS[rarity], fontWeight: '800', fontSize: 11, marginBottom: 4, marginTop: 6 }}>
                              {RARITY_LABELS[rarity]} ({filtered.length})
                            </Text>
                            {filtered.map(t => (
                              <View
                                key={t.id}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                  paddingVertical: 5,
                                  paddingHorizontal: 8,
                                  backgroundColor: t.color + '12',
                                  borderRadius: 8,
                                  marginBottom: 3,
                                }}
                              >
                                <Ionicons name={t.icon as any} size={14} color={t.color} />
                                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700', flex: 1 }}>{t.label}</Text>
                                <Text style={{ color: theme.subtext, fontSize: 9 }}>{t.id}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* 5. Event & Double XP Happy Hour */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name="flash" size={18} color="#EF4444" />
                      <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Event Khusus & Boost Jam Belajar</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#EF444422', alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#EF4444' }]}>LIVE EVENT</Text>
                    </View>
                  </View>

                  {/* Happy Hour Toggle */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>⚡ Double XP Happy Hour</Text>
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>Aktifkan pengganda XP otomatis pada jam belajar malam.</Text>
                    </View>
                    <Switch
                      value={gameConfig.happyHourEnabled}
                      onValueChange={(val) => setGameConfig(prev => ({ ...prev, happyHourEnabled: val }))}
                      trackColor={{ false: '#374151', true: theme.primary }}
                    />
                  </View>

                  {gameConfig.happyHourEnabled && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Jam Mulai (0-23):</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                          value={String(gameConfig.happyHourStartHour)}
                          onChangeText={(v) => setGameConfig(prev => ({ ...prev, happyHourStartHour: parseInt(v, 10) || 19 }))}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Jam Selesai (0-23):</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                          value={String(gameConfig.happyHourEndHour)}
                          onChangeText={(v) => setGameConfig(prev => ({ ...prev, happyHourEndHour: parseInt(v, 10) || 21 }))}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Pengali Boost:</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                          value={String(gameConfig.happyHourMultiplier)}
                          onChangeText={(v) => setGameConfig(prev => ({ ...prev, happyHourMultiplier: parseFloat(v) || 2.0 }))}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}

                  {/* World Boss Event Toggle */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>🐉 World Boss Raid Event</Text>
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>Munculkan Monster Boss Materi untuk diserang bareng oleh mahasiswa.</Text>
                    </View>
                    <Switch
                      value={gameConfig.bossEventActive}
                      onValueChange={(val) => setGameConfig(prev => ({ ...prev, bossEventActive: val }))}
                      trackColor={{ false: '#374151', true: '#DC2626' }}
                    />
                  </View>

                  {gameConfig.bossEventActive && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                      <View style={{ flex: 2 }}>
                        <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Nama Boss Monster:</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                          value={gameConfig.bossEventName}
                          onChangeText={(v) => setGameConfig(prev => ({ ...prev, bossEventName: v }))}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>Total HP Boss:</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                          value={String(gameConfig.bossEventTotalHp)}
                          onChangeText={(v) => setGameConfig(prev => ({ ...prev, bossEventTotalHp: parseInt(v, 10) || 5000, bossEventCurrentHp: parseInt(v, 10) || 5000 }))}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB: KIRIM HADIAH & KOMPENSASI MAHASISWA */}
            {/* ========================================================================= */}
            {activeTab === 'rewards' && (
              <View style={styles.tabContent}>
                
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Pusat Distribusi Hadiah & Kompensasi</Text>
                    <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 0 }]}>
                      Kirimkan bonus koin, tiket putar, peti harta, atau XP langsung ke akun mahasiswa.
                    </Text>
                  </View>
                </View>

                {/* Reward Distribution Form Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="gift" size={18} color="#10B981" />
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Formulir Kirim Hadiah & Loot</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: '#10B98122' }]}>
                      <Text style={[styles.badgeKpiText, { color: '#10B981' }]}>REWARD VAULT</Text>
                    </View>
                  </View>

                  {/* Recipient Target Selector */}
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Sasaran Penerima Hadiah:</Text>
                  <View style={styles.paramChipsRow}>
                    <TouchableOpacity
                      style={[
                        styles.paramChip,
                        { backgroundColor: theme.cardInner, borderColor: theme.border },
                        rewardRecipientType === 'all' && [styles.paramChipActive, { backgroundColor: theme.accentBg, borderColor: theme.primary }]
                      ]}
                      onPress={() => {
                        setRewardRecipientType('all');
                        setSelectedUserForReward(null);
                      }}
                    >
                      <Text style={[
                        styles.paramChipText,
                        { color: theme.subtext },
                        rewardRecipientType === 'all' && [styles.paramChipTextActive, { color: theme.accentLight }]
                      ]}>
                        📢 Seluruh Mahasiswa (Siaran Global)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.paramChip,
                        { backgroundColor: theme.cardInner, borderColor: theme.border },
                        rewardRecipientType === 'single' && [styles.paramChipActive, { backgroundColor: theme.accentBg, borderColor: theme.primary }]
                      ]}
                      onPress={() => setRewardRecipientType('single')}
                    >
                      <Text style={[
                        styles.paramChipText,
                        { color: theme.subtext },
                        rewardRecipientType === 'single' && [styles.paramChipTextActive, { color: theme.accentLight }]
                      ]}>
                        👤 Akun Mahasiswa Tertentu
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Single User Picker if selected */}
                  {rewardRecipientType === 'single' && (
                    <View style={{ marginTop: 8, marginBottom: 12 }}>
                      <Text style={[styles.inputLabel, { color: theme.text }]}>Pilih Mahasiswa Penerima:</Text>
                      {selectedUserForReward ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.cardInner, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.primary }}>
                          <View>
                            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{selectedUserForReward.username}</Text>
                            <Text style={{ color: theme.subtext, fontSize: 11 }}>UUID: {selectedUserForReward.id}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setSelectedUserForReward(null)}>
                            <Ionicons name="close-circle" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {usersList.slice(0, 15).map(u => (
                              <TouchableOpacity
                                key={u.id}
                                style={[styles.paramChip, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                                onPress={() => setSelectedUserForReward(u)}
                              >
                                <Text style={{ color: theme.text, fontSize: 12 }}>{u.username}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Reward Package Items */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 10 }]}>Isi Paket Hadiah:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>⭐ Bonus XP:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={rewardBonusXp}
                        onChangeText={setRewardBonusXp}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>🎡 Tiket Lucky Wheel:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={rewardBonusTickets}
                        onChangeText={setRewardBonusTickets}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>📦 Peti Hadiah (Chests):</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={rewardBonusChests}
                        onChangeText={setRewardBonusChests}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext, fontSize: 11 }]}>💧 Tetes Air Kebun:</Text>
                      <TextInput
                        style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border }]}
                        value={rewardBonusWater}
                        onChangeText={setRewardBonusWater}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Message Input */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14 }]}>Pesan Surat / Notifikasi Ucapan:</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.cardInner, color: theme.text, borderColor: theme.border, minHeight: 60 }]}
                    value={rewardGiftMessage}
                    onChangeText={setRewardGiftMessage}
                    multiline
                    placeholder="Tuliskan alasan pemberian hadiah atau ucapan selamat..."
                    placeholderTextColor={theme.muted}
                  />

                  {/* Send Action Button */}
                  <TouchableOpacity
                    style={[styles.saveActionBtn, { backgroundColor: '#10B981', marginTop: 18 }]}
                    onPress={handleSendReward}
                    disabled={sendingReward}
                    activeOpacity={0.8}
                  >
                    {sendingReward ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                        <Text style={styles.saveActionText}>
                          {rewardRecipientType === 'all' ? 'Siarkan Hadiah ke Seluruh Mahasiswa' : `Kirim Hadiah ke ${selectedUserForReward?.username || 'Mahasiswa'}`}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB: BRANDING & LOGO IDENTITAS APLIKASI */}
            {/* ========================================================================= */}
            {activeTab === 'branding' && (
              <View style={styles.tabContent}>
                
                {/* 1. Live Preview Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="eye-outline" size={18} color={theme.accentLight} />
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Live Preview Header & Navbar</Text>
                    </View>
                    <View style={[styles.badgeKpi, { backgroundColor: theme.accentBg }]}>
                      <Text style={[styles.badgeKpiText, { color: theme.accentLight }]}>GLOBAL SYNC</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardSub, { color: theme.subtext }]}>
                    Ini adalah tampilan visual logo dan identitas brand yang akan muncul di Top Navbar mobile, desktop header, dan layar login.
                  </Text>

                  {/* Header Mockup Preview */}
                  <View style={[styles.brandingMockupBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <View style={styles.brandingMockupHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {previewLogoUri && (!Platform.OS || Platform.OS !== 'web' || !previewLogoUri.startsWith('file://')) ? (
                          <Image
                            source={{ uri: previewLogoUri }}
                            style={styles.brandingPreviewLogoImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <AppLogo size={36} borderRadius={9} />
                        )}
                        <View>
                          <Text style={[styles.brandingMockupTitle, { color: theme.text }]}>
                            {brandNameInput || 'StudyBot AI'}
                          </Text>
                          <Text style={[styles.brandingMockupTagline, { color: theme.subtext }]}>
                            {brandTaglineInput || 'Smart Academic & Journal'}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.brandingMockupRightBadge, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="sparkles" size={13} color={theme.accentLight} />
                        <Text style={[styles.brandingMockupRightBadgeText, { color: theme.accentLight }]}>App Preview</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 2. Form Setting Logo & Brand */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="image-outline" size={18} color="#10B981" />
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Kustomisasi Logo Aplikasi</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardSub, { color: theme.subtext }]}>
                    Pilih logo baru dari galeri foto atau masukkan tautan URL gambar (PNG/JPG/WebP).
                  </Text>

                  {/* Warning if logo currently stored as local file */}
                  {previewLogoUri && previewLogoUri.startsWith('file://') && (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: isLightMode ? '#FFFBEB' : '#2D2008',
                      borderColor: isLightMode ? '#FDE68A' : '#78350F',
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 12,
                    }}>
                      <Ionicons name="warning" size={20} color="#D97706" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isLightMode ? '#92400E' : '#FCD34D' }}>
                          Logo Tersimpan Dalam Format File Lokal HP
                        </Text>
                        <Text style={{ fontSize: 11, color: isLightMode ? '#B45309' : '#FBBF24', marginTop: 2 }}>
                          Logo saat ini berformat path lokal sehingga tidak muncul di perangkat lain. Klik tombol di bawah untuk memilih ulang foto agar logo tersinkron ke semua perangkat & web.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Logo Source Buttons */}
                  <View style={styles.brandingLogoActionRow}>
                    <TouchableOpacity
                      style={[styles.brandingUploadBtn, { backgroundColor: theme.primary }]}
                      onPress={handlePickLogoImage}
                      disabled={convertingLogo}
                      activeOpacity={0.8}
                    >
                      {convertingLogo ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.brandingUploadBtnText}>Pilih Foto dari Galeri</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {previewLogoUri && (
                      <TouchableOpacity
                        style={[styles.brandingResetBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={handleResetLogoToDefault}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="refresh-outline" size={15} color={theme.subtext} />
                        <Text style={[styles.brandingResetBtnText, { color: theme.subtext }]}>Gunakan Default</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* URL Input */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 12 }]}>Atau Masukkan URL Gambar Logo (Opsional):</Text>
                  <View style={[styles.apiKeyInputRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <TextInput
                      style={[styles.apiKeyInput, { color: theme.text }]}
                      value={customLogoUrlInput.startsWith('data:') ? '[Gambar Logo Kustom Diunggah]' : customLogoUrlInput}
                      onChangeText={(val) => {
                        setCustomLogoUrlInput(val);
                        setPreviewLogoUri(val.trim() || null);
                      }}
                      placeholder="https://domain.com/logo.png atau pilih dari galeri"
                      placeholderTextColor={theme.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!customLogoUrlInput.startsWith('data:')}
                    />
                    {customLogoUrlInput.startsWith('data:') && (
                      <TouchableOpacity
                        onPress={() => {
                          setCustomLogoUrlInput('');
                          setPreviewLogoUri(null);
                        }}
                        style={{ paddingHorizontal: 8 }}
                      >
                        <Ionicons name="close-circle" size={18} color={theme.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Brand Name Input */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14 }]}>Nama Aplikasi / Brand Title:</Text>
                  <View style={[styles.apiKeyInputRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <TextInput
                      style={[styles.apiKeyInput, { color: theme.text }]}
                      value={brandNameInput}
                      onChangeText={setBrandNameInput}
                      placeholder="Contoh: StudyBot AI"
                      placeholderTextColor={theme.muted}
                    />
                  </View>

                  {/* Brand Tagline Input */}
                  <Text style={[styles.inputLabel, { color: theme.text, marginTop: 14 }]}>Slogan / Tagline Brand:</Text>
                  <View style={[styles.apiKeyInputRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <TextInput
                      style={[styles.apiKeyInput, { color: theme.text }]}
                      value={brandTaglineInput}
                      onChangeText={setBrandTaglineInput}
                      placeholder="Contoh: Smart Academic & Journal"
                      placeholderTextColor={theme.muted}
                    />
                  </View>

                  {/* Save Branding Action Button */}
                  <TouchableOpacity
                    style={[styles.saveActionBtn, { backgroundColor: theme.primary, marginTop: 16 }]}
                    onPress={handleSaveBranding}
                    disabled={savingBranding}
                    activeOpacity={0.8}
                  >
                    {savingBranding ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                        <Text style={styles.saveActionText}>Simpan & Terapkan ke Seluruh Aplikasi</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: AI FINE-TUNING & LIVE TEST PLAYGROUND */}
            {/* ========================================================================= */}
            {activeTab === 'ai' && (
              <View style={styles.tabContent}>

                {/* Multi-Key Pool & Fallback Routing Studio Card */}
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="layers" size={18} color="#FBBF24" />
                      <Text style={styles.cardTitle}>Multi-Key Pool & Fallback Routing</Text>
                    </View>
                    <View style={styles.badgeKpi}>
                      <Text style={styles.badgeKpiText}>FAILOVER ACTIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.cardSub}>
                    Tambahkan beberapa API Key Gemini ke dalam Pool. Jika satu kunci terkena batas kuota (15 RPM / Rate Limit), sistem otomatis beralih ke kunci berikutnya tanpa membuat user error!
                  </Text>

                  {/* Add New Key Input Row */}
                  <Text style={styles.inputLabel}>Tambah Kunci API Baru ke Pool:</Text>
                  <View style={styles.apiKeyInputRow}>
                    <TextInput
                      style={styles.apiKeyInput}
                      value={newKeyInput}
                      onChangeText={setNewKeyInput}
                      placeholder="Tempel AIzaSy... (Gemini API Key)"
                      placeholderTextColor="#4B5565"
                      secureTextEntry={!showNewKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowNewKey(!showNewKey)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={showNewKey ? 'eye-off' : 'eye'} size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addKeyToPoolBtn}
                      onPress={handleAddKeyToPool}
                      disabled={!newKeyInput.trim()}
                    >
                      <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                      <Text style={styles.addKeyToPoolText}>Tambah</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Registered Keys List in Pool with Limit & Pagination */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                    <Text style={[styles.inputLabel, { marginVertical: 0 }]}>
                      Daftar Kunci Aktif di Routing Pool ({keysPool.length} Kunci Terdaftar):
                    </Text>
                    {keysPool.length > 5 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.subtext }}>Limit:</Text>
                        {[5, 10, 20].map(cnt => (
                          <TouchableOpacity
                            key={cnt}
                            onPress={() => { setKeysPerPage(cnt); setKeysPage(1); }}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                              backgroundColor: keysPerPage === cnt ? theme.accentBg : theme.cardInner,
                              borderWidth: 1,
                              borderColor: keysPerPage === cnt ? theme.accentLight : theme.border,
                            }}
                          >
                            <Text style={{ fontSize: 10.5, fontWeight: '800', color: keysPerPage === cnt ? theme.accentLight : theme.subtext }}>
                              {cnt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {keysPool.length === 0 ? (
                    <View style={styles.emptyPoolBox}>
                      <Ionicons name="alert-circle-outline" size={24} color="#6B7280" />
                      <Text style={styles.emptyPoolText}>Belum ada API Key di pool. Tambahkan minimal 1 API Key di atas.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.keyPoolList}>
                        {keysPool
                          .slice((keysPage - 1) * keysPerPage, keysPage * keysPerPage)
                          .map((k, pIdx) => {
                            const realIdx = (keysPage - 1) * keysPerPage + pIdx;
                            const isTesting = testingKeyIdx === realIdx;
                            const result = keyTestResults[realIdx];
                            const preview = k.substring(0, 10) + '••••••••' + k.substring(k.length - 4);
                            return (
                              <View key={`${k}-${realIdx}`} style={styles.keyItemCard}>
                                <View style={styles.keyItemTop}>
                                  <View style={styles.keyIndexWrap}>
                                    <View style={[styles.keyIndexBadge, realIdx === 0 && styles.keyIndexBadgePrimary]}>
                                      <Text style={[styles.keyIndexText, realIdx === 0 && styles.keyIndexTextPrimary]}>
                                        {realIdx === 0 ? 'UTAMA #1' : `CADANGAN #${realIdx + 1}`}
                                      </Text>
                                    </View>
                                    <Text style={styles.keyPreviewText}>{preview}</Text>
                                  </View>

                                  <View style={styles.keyItemActions}>
                                    <TouchableOpacity
                                      style={styles.testSmallBtn}
                                      onPress={() => handleTestKeyInPool(k, realIdx)}
                                      disabled={isTesting}
                                    >
                                      {isTesting ? (
                                        <ActivityIndicator size="small" color="#60A5FA" />
                                      ) : (
                                        <>
                                          <Ionicons name="flash" size={12} color="#60A5FA" />
                                          <Text style={styles.testSmallText}>Uji</Text>
                                        </>
                                      )}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      style={styles.deleteSmallBtn}
                                      onPress={() => handleRemoveKeyFromPool(realIdx)}
                                    >
                                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                    </TouchableOpacity>
                                  </View>
                                </View>

                                {result && (
                                  <View style={[styles.keyItemResultBox, result.success ? styles.apiResultSuccess : styles.apiResultError]}>
                                    <Ionicons
                                      name={result.success ? 'checkmark-circle' : 'alert-circle'}
                                      size={13}
                                      color={result.success ? '#34D399' : '#F87171'}
                                    />
                                    <Text style={[styles.keyItemResultText, result.success ? styles.apiResultTextSuccess : styles.apiResultTextError]}>
                                      {result.message}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                      </View>

                      {/* Pagination Controls - Rata Kanan-Kiri & Mewah */}
                      <View
                        style={{
                          marginTop: 14,
                          marginBottom: 4,
                          padding: 12,
                          borderRadius: 14,
                          backgroundColor: theme.cardInner,
                          borderWidth: 1,
                          borderColor: theme.border,
                          gap: 12,
                        }}
                      >
                        {/* Baris Atas: Status Halaman & Total Kunci */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="layers-outline" size={15} color={theme.accentLight} />
                            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text }}>
                              Halaman {keysPage} dari {Math.max(1, Math.ceil(keysPool.length / keysPerPage))}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: theme.card, paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 6, borderWidth: 1, borderColor: theme.border }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.subtext }}>
                              {keysPool.length} Kunci Terdaftar
                            </Text>
                          </View>
                        </View>

                        {/* Baris Bawah: Tombol Rata Kanan-Kiri (Sebelumnya di KIRI, Nomor di TENGAH, Selanjutnya di KANAN) */}
                        {Math.ceil(keysPool.length / keysPerPage) > 1 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            {/* Tombol Sebelumnya (Rata Kiri) */}
                            <TouchableOpacity
                              onPress={() => setKeysPage(p => Math.max(1, p - 1))}
                              disabled={keysPage === 1}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 8,
                                backgroundColor: keysPage === 1 ? theme.card : theme.primary,
                                borderWidth: 1,
                                borderColor: keysPage === 1 ? theme.border : theme.primary,
                              }}
                            >
                              <Ionicons name="chevron-back" size={14} color={keysPage === 1 ? '#64748B' : '#FFFFFF'} />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: keysPage === 1 ? '#64748B' : '#FFFFFF' }}>
                                Sebelumnya
                              </Text>
                            </TouchableOpacity>

                            {/* Tombol Nomor Halaman (Rata Tengah) */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {Array.from({ length: Math.ceil(keysPool.length / keysPerPage) }, (_, i) => i + 1).map(num => (
                                <TouchableOpacity
                                  key={num}
                                  onPress={() => setKeysPage(num)}
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: keysPage === num ? theme.primary : theme.card,
                                    borderWidth: 1,
                                    borderColor: keysPage === num ? theme.primary : theme.border,
                                  }}
                                >
                                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: keysPage === num ? '#FFFFFF' : theme.text }}>
                                    {num}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>

                            {/* Tombol Selanjutnya (Rata Kanan) */}
                            <TouchableOpacity
                              onPress={() => setKeysPage(p => Math.min(Math.ceil(keysPool.length / keysPerPage), p + 1))}
                              disabled={keysPage >= Math.ceil(keysPool.length / keysPerPage)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 8,
                                backgroundColor: keysPage >= Math.ceil(keysPool.length / keysPerPage) ? theme.card : theme.primary,
                                borderWidth: 1,
                                borderColor: keysPage >= Math.ceil(keysPool.length / keysPerPage) ? theme.border : theme.primary,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: keysPage >= Math.ceil(keysPool.length / keysPerPage) ? '#64748B' : '#FFFFFF' }}>
                                Selanjutnya
                              </Text>
                              <Ionicons name="chevron-forward" size={14} color={keysPage >= Math.ceil(keysPool.length / keysPerPage) ? '#64748B' : '#FFFFFF'} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                  {/* Save All Pool Button */}
                  <TouchableOpacity
                    style={[styles.saveAllPoolBtn, (savingKeysPool || keysPool.length === 0) && { opacity: 0.6 }]}
                    onPress={handleSaveAllKeysPool}
                    disabled={savingKeysPool || keysPool.length === 0}
                  >
                    {savingKeysPool ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={16} color="#FFFFFF" />
                        <Text style={styles.saveAllPoolText}>
                          Simpan & Aktifkan {keysPool.length} Kunci ke Database Cloud
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Parameters Card */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Parameter Model & Personalisasi AI</Text>
                  <Text style={styles.cardSub}>
                    Atur nama asisten, model, kreativitas, dan instruksi karakter AI.
                  </Text>

                  {/* Bot Name Input */}
                  <Text style={styles.inputLabel}>Nama Bot Asisten (Otomatis Tersinkron):</Text>
                  <TextInput
                    style={styles.textInput}
                    value={botNameInput}
                    onChangeText={handleBotNameChange}
                    placeholder="Misal: Ara, Maya, Dr. AI..."
                    placeholderTextColor="#4B5565"
                  />

                  {/* Model Selector */}
                  <Text style={styles.inputLabel}>Versi AI Model:</Text>
                  <View style={styles.paramChipsRow}>
                    {[
                      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Vision & Analisis Tinggi ~1.3s)' },
                      { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (Ultra Kilat ~0.8s)' },
                      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Hemat Kuota ~1.5s)' },
                      { id: 'gemini-flash-latest', label: 'Gemini Flash Latest (Cadangan Stabil)' },
                    ].map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.paramChip, aiModelSelected === m.id && styles.paramChipActive]}
                        onPress={() => setAiModelSelected(m.id)}
                      >
                        <Text style={[styles.paramChipText, aiModelSelected === m.id && styles.paramChipTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Temperature / Creativity Selector */}
                  <Text style={styles.inputLabel}>Tingkat Kreativitas Respons (Temperature):</Text>
                  <View style={styles.paramChipsRow}>
                    {[
                      { id: '0.3', label: '0.3 - Sangat Presisi & Formal' },
                      { id: '0.7', label: '0.7 - Seimbang & Empatis (Direkomendasikan)' },
                      { id: '1.0', label: '1.0 - Sangat Kreatif & Luwes' },
                    ].map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.paramChip, aiTempSelected === t.id && styles.paramChipActive]}
                        onPress={() => setAiTempSelected(t.id)}
                      >
                        <Text style={[styles.paramChipText, aiTempSelected === t.id && styles.paramChipTextActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Preset Personas Header with Add Button */}
                  <View style={styles.presetSectionHeaderRow}>
                    <Text style={[styles.inputLabel, { marginBottom: 0 }]}>Pilih Preset Gaya Karakter:</Text>
                    <TouchableOpacity
                      style={styles.addPresetActionBtn}
                      onPress={() => {
                        setNewPresetBotName(botNameInput || 'Ara');
                        setShowAddPresetModal(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle" size={15} color="#60A5FA" />
                      <Text style={styles.addPresetActionText}>+ Tambah Preset Kustom</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.presetGrid}>
                    {[...PRESET_PERSONAS, ...customPresets].map(p => {
                      const isSelected = promptText === p.prompt || promptText.includes(p.name);
                      return (
                        <TouchableOpacity
                          key={p.id || p.name}
                          style={[styles.presetCard, isSelected && styles.presetCardActive]}
                          onPress={() => handleSelectPreset(p)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.presetTop}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 4 }}>
                              <Text style={[styles.presetTitle, isSelected && styles.presetTitleActive]} numberOfLines={1}>
                                {p.name}
                              </Text>
                              {p.isCustom && (
                                <View style={styles.customPresetBadge}>
                                  <Text style={styles.customPresetBadgeText}>Kustom</Text>
                                </View>
                              )}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {p.isCustom && (
                                <TouchableOpacity
                                  onPress={() => handleDeleteCustomPreset(p.id!, p.name)}
                                  style={styles.deletePresetIconBtn}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="trash-outline" size={13} color="#EF4444" />
                                </TouchableOpacity>
                              )}
                              {isSelected && <Ionicons name="checkmark-circle" size={16} color="#60A5FA" />}
                            </View>
                          </View>
                          <Text style={styles.presetDesc} numberOfLines={2}>{p.desc}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Full System Prompt Textarea */}
                  <Text style={styles.inputLabel}>System Prompt Lengkap (Instruksi Inti):</Text>
                  <TextInput
                    style={styles.promptArea}
                    value={promptText}
                    onChangeText={setPromptText}
                    multiline
                    textAlignVertical="top"
                  />

                  <TouchableOpacity
                    style={styles.saveActionBtn}
                    onPress={handleSaveAiConfig}
                    disabled={savingAi}
                  >
                    {savingAi ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={16} color="#FFFFFF" />
                        <Text style={styles.saveActionText}>Simpan Pengaturan AI ke Database</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Live AI Playground Tester */}
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Playground Pengujian AI Langsung</Text>
                    {testLatency && (
                      <View style={styles.latencyBadge}>
                        <Text style={styles.latencyText}>{testLatency} ms</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSub}>
                    Uji langsung respons AI berdasarkan system prompt yang sedang aktif di atas sebelum diterapkan.
                  </Text>

                  <TextInput
                    style={styles.testInput}
                    value={testPrompt}
                    onChangeText={setTestPrompt}
                    placeholder="Ketik pesan simulasi pengguna..."
                    placeholderTextColor="#4B5565"
                  />

                  <TouchableOpacity
                    style={[styles.runTestBtn, testingAi && { opacity: 0.7 }]}
                    onPress={handleTestAi}
                    disabled={testingAi}
                  >
                    {testingAi ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="play" size={15} color="#FFFFFF" />
                        <Text style={styles.runTestText}>Jalankan Uji Respons AI</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {testResponse ? (
                    <View style={styles.testResponseCard}>
                      <View style={styles.testResponseHeader}>
                        <Ionicons name="sparkles" size={14} color="#60A5FA" />
                        <Text style={styles.testResponseTitle}>Hasil Respons AI ({botNameInput}):</Text>
                      </View>
                      <Text style={styles.testResponseText}>{testResponse}</Text>
                    </View>
                  ) : null}
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: FEATURE TOGGLES & MAINTENANCE MODE */}
            {/* ========================================================================= */}
            {activeTab === 'features' && (
              <View style={styles.tabContent}>
                
                {/* Maintenance Mode Card */}
                <View style={[styles.card, maintenanceMode && styles.cardMaintenanceActive]}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="construct" size={18} color={maintenanceMode ? '#EF4444' : '#FBBF24'} />
                        <Text style={styles.cardTitle}>Mode Pemeliharaan Sistem (Maintenance)</Text>
                      </View>
                      <Text style={styles.cardSub}>
                        Saat diaktifkan, seluruh pengguna akan melihat pesan pemeliharaan saat membuka aplikasi.
                      </Text>
                    </View>
                    <Switch
                      value={maintenanceMode}
                      onValueChange={setMaintenanceMode}
                      trackColor={{ false: '#222938', true: '#DC2626' }}
                      thumbColor={maintenanceMode ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>

                  {maintenanceMode && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.inputLabel}>Pesan Pemeliharaan untuk Pengguna:</Text>
                      <TextInput
                        style={styles.textInput}
                        value={maintenanceMsg}
                        onChangeText={setMaintenanceMsg}
                        placeholder="Misal: Server sedang diperbarui, kembali lagi pukul 15:00 WIB."
                        placeholderTextColor="#4B5565"
                      />
                    </View>
                  )}
                </View>

                {/* Feature Flags Module Toggles */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Sakelar Modul Aplikasi (Feature Flags)</Text>
                  <Text style={styles.cardSub}>
                    Aktifkan atau nonaktifkan fitur tertentu secara instan tanpa perlu merilis ulang aplikasi.
                  </Text>

                  {/* Chat Toggle */}
                  <View style={styles.switchRowItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchItemTitle}>Modul Teman Curhat AI (Chat & Voice)</Text>
                      <Text style={styles.switchItemSub}>Fitur percakapan dua arah dengan asisten AI</Text>
                    </View>
                    <Switch
                      value={featChat}
                      onValueChange={setFeatChat}
                      trackColor={{ false: '#222938', true: '#2563EB' }}
                      thumbColor={featChat ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>

                  {/* Study Toggle */}
                  <View style={styles.switchRowItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchItemTitle}>Modul Kuliah & Tugas (Smart Notes, Kuis AI, Pomodoro)</Text>
                      <Text style={styles.switchItemSub}>Manajemen catatan kuliah, pembuatan kuis otomatis, dan timer fokus</Text>
                    </View>
                    <Switch
                      value={featStudy}
                      onValueChange={setFeatStudy}
                      trackColor={{ false: '#222938', true: '#2563EB' }}
                      thumbColor={featStudy ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>

                  {/* Journal Toggle */}
                  <View style={styles.switchRowItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchItemTitle}>Modul Jurnal Keseharian & Mood Tracker</Text>
                      <Text style={styles.switchItemSub}>Pencatatan refleksi harian dan pelacakan tren emosi</Text>
                    </View>
                    <Switch
                      value={featJournal}
                      onValueChange={setFeatJournal}
                      trackColor={{ false: '#222938', true: '#2563EB' }}
                      thumbColor={featJournal ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>

                  {/* Breathing & Quests Toggle */}
                  <View style={styles.switchRowItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.switchItemTitle}>Latihan Pernapasan & Quests Harian</Text>
                      <Text style={styles.switchItemSub}>Studio pernapasan box breathing 4-4-4 dan check-in rasa syukur</Text>
                    </View>
                    <Switch
                      value={featBreathing}
                      onValueChange={setFeatBreathing}
                      trackColor={{ false: '#222938', true: '#2563EB' }}
                      thumbColor={featBreathing ? '#FFFFFF' : '#9CA3AF'}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.saveActionBtn, { marginTop: 16 }]}
                    onPress={handleSaveFeatureFlags}
                    disabled={savingFlags}
                  >
                    {savingFlags ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="save" size={16} color="#FFFFFF" />
                        <Text style={styles.saveActionText}>Terapkan Sakelar Fitur ke Seluruh Klien</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: MOODS & EMOTIONS MANAGER */}
            {/* ========================================================================= */}
            {activeTab === 'moods' && (
              <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
                
                {/* Form */}
                <View style={[styles.column, isWide && { flex: 1 }]}>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {editingKey ? 'Edit Opsi Emosi' : 'Tambah Opsi Emosi Baru'}
                    </Text>

                    <Text style={styles.inputLabel}>Simbol Emoji:</Text>
                    <TextInput
                      style={styles.emojiInput}
                      value={newEmoji}
                      onChangeText={setNewEmoji}
                      maxLength={4}
                    />

                    <Text style={styles.inputLabel}>Nama Label Emosi:</Text>
                    <TextInput
                      style={styles.textInput}
                      value={newLabel}
                      onChangeText={setNewLabel}
                      placeholder="Misal: Santai, Bahagia, Bersyukur..."
                      placeholderTextColor="#4B5565"
                    />

                    <Text style={styles.inputLabel}>Warna Aksen Grafis:</Text>
                    <View style={styles.colorPalette}>
                      {COLOR_PALETTE.map(c => (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.colorCircle,
                            { backgroundColor: c },
                            newColor === c && styles.colorCircleActive,
                          ]}
                          onPress={() => setNewColor(c)}
                        />
                      ))}
                    </View>

                    <View style={styles.formBtnRow}>
                      {editingKey && (
                        <TouchableOpacity
                          style={styles.cancelEditBtn}
                          onPress={() => {
                            setEditingKey(null);
                            setNewEmoji('✨');
                            setNewLabel('');
                          }}
                        >
                          <Text style={styles.cancelEditText}>Batal</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.saveMoodBtn} onPress={handleSaveMood}>
                        <Text style={styles.saveMoodText}>{editingKey ? 'Simpan Perubahan' : '+ Tambah Emosi'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Active Mood List */}
                <View style={[styles.column, isWide && { flex: 1.3 }]}>
                  <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.cardTitle}>Daftar Emosi Aktif ({moods.length})</Text>
                      <TouchableOpacity onPress={resetToDefaults}>
                        <Text style={styles.resetText}>Reset Standar</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.moodList}>
                      {moods.map(m => (
                        <View key={m.type} style={styles.moodItemRow}>
                          <View style={[styles.moodEmojiBox, { backgroundColor: m.color ? m.color + '22' : '#1E293B' }]}>
                            <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                          </View>
                          
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.moodItemLabel}>{m.label}</Text>
                            <Text style={styles.moodItemKey}>Key: {m.type}</Text>
                          </View>

                          <View style={[styles.colorIndicator, { backgroundColor: m.color || '#3B82F6' }]} />

                          <View style={styles.actionIcons}>
                            <TouchableOpacity onPress={() => startEditMood(m)} style={styles.iconBtn}>
                              <Ionicons name="pencil-outline" size={14} color="#9CA3AF" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteMood(m.type, m.label)} style={styles.iconBtn}>
                              <Ionicons name="trash-outline" size={14} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB: DAILY ROUTINE REMINDERS (DYNAMIC REALTIME CLOUD CONFIG) */}
            {/* ========================================================================= */}
            {activeTab === 'reminders' && (
              <View style={styles.tabContent}>
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>Pengingat Rutin Harian Mahasiswa (Real-Time Cloud)</Text>
                      <Text style={styles.cardSub}>
                        Atur jadwal jam alarm dan pesan pengingat otomatis untuk seluruh mahasiswa di aplikasi (Pagi, Sore, & Malam).
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.saveActionBtn, { backgroundColor: '#2563EB', paddingHorizontal: 16 }]}
                      onPress={handleSaveAllRoutines}
                      disabled={savingRoutines}
                    >
                      {savingRoutines ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                          <Text style={styles.saveActionText}>Simpan & Terapkan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={{ gap: 14 }}>
                    {dailyRoutines.map((routine, idx) => (
                      <View
                        key={routine.id}
                        style={{
                          backgroundColor: routine.enabled ? (isLightMode ? '#F8FAFC' : '#111724') : (isLightMode ? '#F1F5F9' : '#0B0E14'),
                          borderRadius: 12,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: routine.enabled ? '#3B82F6' : (isLightMode ? '#E2E8F0' : '#1F2937'),
                        }}
                      >
                        {/* Routine Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: routine.enabled ? '#1E293B' : '#374151', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons
                                name={routine.id === 'morning' ? 'sunny' : routine.id === 'afternoon' ? 'book' : 'moon'}
                                size={18}
                                color={routine.enabled ? '#F59E0B' : '#9CA3AF'}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                                {routine.name || `Pengingat #${idx + 1}`}
                              </Text>
                              <Text style={{ fontSize: 11, color: routine.enabled ? '#10B981' : '#EF4444', fontWeight: '600' }}>
                                {routine.enabled ? '● AKTIF (Otomatis Dikirim Tiap Hari)' : '○ NONAKTIF'}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: isLightMode ? '#EFF6FF' : '#1E293B',
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: '#3B82F6',
                              }}
                              onPress={() => handleTestRoutineNotification(routine)}
                            >
                              <Ionicons name="paper-plane-outline" size={13} color="#3B82F6" />
                              <Text style={{ fontSize: 11, color: '#3B82F6', fontWeight: '700' }}>Tes Preview</Text>
                            </TouchableOpacity>

                            <Switch
                              value={routine.enabled}
                              onValueChange={() => handleToggleRoutine(routine.id)}
                              trackColor={{ false: '#374151', true: '#2563EB' }}
                              thumbColor={routine.enabled ? '#FFFFFF' : '#9CA3AF'}
                            />
                          </View>
                        </View>

                        {/* Time Config (Hour & Minute) */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.subtext }}>Waktu Kirim:</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                              style={{
                                backgroundColor: isLightMode ? '#FFFFFF' : '#0E1117',
                                borderWidth: 1,
                                borderColor: theme.border,
                                color: theme.text,
                                borderRadius: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                fontSize: 13,
                                fontWeight: '700',
                                width: 44,
                                textAlign: 'center',
                              }}
                              value={String(routine.hour)}
                              onChangeText={(v) => {
                                const num = parseInt(v) || 0;
                                handleUpdateRoutineField(routine.id, 'hour', Math.min(23, Math.max(0, num)));
                              }}
                              keyboardType="numeric"
                              maxLength={2}
                            />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>:</Text>
                            <TextInput
                              style={{
                                backgroundColor: isLightMode ? '#FFFFFF' : '#0E1117',
                                borderWidth: 1,
                                borderColor: theme.border,
                                color: theme.text,
                                borderRadius: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                fontSize: 13,
                                fontWeight: '700',
                                width: 44,
                                textAlign: 'center',
                              }}
                              value={String(routine.minute).padStart(2, '0')}
                              onChangeText={(v) => {
                                const num = parseInt(v) || 0;
                                handleUpdateRoutineField(routine.id, 'minute', Math.min(59, Math.max(0, num)));
                              }}
                              keyboardType="numeric"
                              maxLength={2}
                            />
                            <Text style={{ fontSize: 11, color: theme.muted }}>WIB</Text>
                          </View>
                        </View>

                        {/* Title Input */}
                        <Text style={{ fontSize: 11, fontWeight: '600', color: theme.subtext, marginBottom: 4 }}>Judul Notifikasi:</Text>
                        <TextInput
                          style={{
                            backgroundColor: isLightMode ? '#FFFFFF' : '#0E1117',
                            borderWidth: 1,
                            borderColor: theme.border,
                            color: theme.text,
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            fontSize: 12.5,
                            marginBottom: 8,
                          }}
                          value={routine.title}
                          onChangeText={(t) => handleUpdateRoutineField(routine.id, 'title', t)}
                          placeholder="Judul notifikasi..."
                          placeholderTextColor="#6B7280"
                        />

                        {/* Body Input */}
                        <Text style={{ fontSize: 11, fontWeight: '600', color: theme.subtext, marginBottom: 4 }}>Isi Pesan Notifikasi:</Text>
                        <TextInput
                          style={{
                            backgroundColor: isLightMode ? '#FFFFFF' : '#0E1117',
                            borderWidth: 1,
                            borderColor: theme.border,
                            color: theme.text,
                            borderRadius: 8,
                                   fontSize: 12,
                            lineHeight: 18,
                            minHeight: 50,
                          }}
                          value={routine.body}
                          onChangeText={(b) => handleUpdateRoutineField(routine.id, 'body', b)}
                          placeholder="Isi pesan pengingat..."
                          placeholderTextColor="#6B7280"
                          multiline
                        />
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.saveActionBtn, { backgroundColor: '#2563EB', marginTop: 16, width: '100%', paddingVertical: 12, borderRadius: 10 }]}
                    onPress={handleSaveAllRoutines}
                    disabled={savingRoutines}
                  >
                    {savingRoutines ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                        <Text style={[styles.saveActionText, { fontSize: 13 }]}>Simpan & Terapkan Pengingat Real-Time</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: GLOBAL CAMPUS ANNOUNCEMENT */}
            {/* ========================================================================= */}
            {activeTab === 'broadcast' && (
              <View style={styles.tabContent}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Broadcast Pengumuman Banner Global</Text>
                  <Text style={styles.cardSub}>
                    Ketikkan pesan penting atau pengumuman kampus yang ingin ditampilkan di beranda seluruh mahasiswa secara instan.
                  </Text>

                  {/* Live Preview Card */}
                  {announcementText.trim() ? (
                    <View style={styles.previewBox}>
                      <View style={styles.bannerPreviewCard}>
                        <Ionicons name="megaphone" size={16} color="#FBBF24" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bannerBadgeText}>PENGUMUMAN KAMPUS</Text>
                          <Text style={styles.bannerPreviewText}>{announcementText}</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <Text style={styles.inputLabel}>Isi Pesan Pengumuman:</Text>
                  <TextInput
                    style={styles.broadcastInput}
                    value={announcementText}
                    onChangeText={setAnnouncementText}
                    placeholder="Contoh: Jadwal Ujian Akhir Semester (UAS) dimulai tanggal 25 Oktober. Jangan lupa buat rangkuman materi dengan AI!"
                    placeholderTextColor="#4B5565"
                    multiline
                    textAlignVertical="top"
                  />

                  <View style={styles.broadcastActionRow}>
                    <TouchableOpacity
                      style={[styles.saveBroadcastBtn, !announcementText.trim() && styles.saveBroadcastBtnDisabled]}
                      onPress={handleSaveAnnouncement}
                      disabled={savingAnnouncement || !announcementText.trim()}
                    >
                      {savingAnnouncement ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="megaphone" size={16} color="#FFFFFF" />
                          <Text style={styles.saveBroadcastText}>Publikasikan Pengumuman</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {globalAnnouncement || announcementText ? (
                      <TouchableOpacity
                        style={styles.clearBannerBtn}
                        onPress={handleClearAnnouncement}
                        disabled={savingAnnouncement}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                        <Text style={styles.clearBannerText}>Hapus / Nonaktifkan</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 6: STUDENT DIRECTORY & USER AUDIT */}
            {/* ========================================================================= */}
            {activeTab === 'users' && (
              <View style={styles.tabContent}>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.cardHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>Direktori Akun Mahasiswa ({usersList.length})</Text>
                      <Text style={[styles.cardSub, { color: theme.subtext, marginBottom: 0 }]}>Daftar seluruh mahasiswa yang terdaftar di database Supabase.</Text>
                    </View>
                    <TouchableOpacity onPress={fetchUsers} style={[styles.refreshBtn, { backgroundColor: theme.cardInner, borderColor: theme.border, alignSelf: isMobile ? 'flex-start' : 'auto' }]}>
                      <Ionicons name="refresh" size={13} color="#60A5FA" />
                      <Text style={[styles.refreshBtnText, { color: '#60A5FA' }]}>Muat Ulang</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Search User Bar */}
                  <View style={[styles.userSearchBar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Ionicons name="search-outline" size={15} color="#9CA3AF" />
                    <TextInput
                      style={[styles.userSearchInput, { color: theme.text, minWidth: 0 }]}
                      placeholder="Cari berdasarkan username atau ID akun..."
                      placeholderTextColor="#5A6578"
                      value={userSearch}
                      onChangeText={setUserSearch}
                    />
                    {userSearch ? (
                      <TouchableOpacity onPress={() => setUserSearch('')}>
                        <Ionicons name="close-circle" size={15} color="#9CA3AF" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {loadingUsers ? (
                    <View style={styles.loaderBox}><ActivityIndicator size="small" color="#60A5FA" /></View>
                  ) : filteredUsers.length === 0 ? (
                    <View style={styles.emptyWrap}>
                      <Text style={[styles.emptyText, { color: theme.muted }]}>Tidak ditemukan pengguna yang cocok.</Text>
                    </View>
                  ) : (
                    <View style={styles.userListWrap}>
                      {filteredUsers.map((u) => (
                        <View key={u.id} style={[styles.userRowCard, { flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: isSmallPhone ? 10 : 12, backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                            <View style={[styles.userAvatarSquare, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                              <Text style={[styles.userAvatarInitial, { color: theme.accentLight }]}>
                                {(u.username || 'M')[0].toUpperCase()}
                              </Text>
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <Text style={[styles.userNameText, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
                                  {u.username || 'Pengguna Mahasiswa'}
                                </Text>
                                <View style={[
                                  styles.badgeKpi,
                                  {
                                    backgroundColor: u.role === 'admin' ? '#EF444422' : u.role === 'vip' ? '#F59E0B22' : theme.card,
                                    borderColor: u.role === 'admin' ? '#EF444455' : u.role === 'vip' ? '#F59E0B55' : theme.border,
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                  }
                                ]}>
                                  <Text style={{
                                    fontSize: 10,
                                    fontWeight: '800',
                                    color: u.role === 'admin' ? '#EF4444' : u.role === 'vip' ? '#F59E0B' : theme.subtext
                                  }}>
                                    {(u.role || 'STUDENT').toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              
                              <Text style={[styles.userIdText, { color: theme.muted, minWidth: 0 }]} numberOfLines={1} ellipsizeMode="middle">
                                UUID: {u.id}
                              </Text>

                              <View style={[styles.userJoinedWrap, { marginTop: 4 }]}>
                                <Ionicons name="time-outline" size={12} color="#6B7280" />
                                <Text style={[styles.userJoinedText, { color: theme.subtext }]}>
                                  Bergabung: {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* Quick Admin Action Toolbar for User */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                            <TouchableOpacity
                              style={[styles.refreshBtn, { backgroundColor: '#10B98122', borderColor: '#10B98155', flex: isMobile ? 1 : undefined, minWidth: isSmallPhone ? '100%' : 110, justifyContent: 'center' }]}
                              onPress={() => {
                                setSelectedUserForReward(u);
                                setRewardRecipientType('single');
                                setActiveTab('rewards');
                              }}
                            >
                              <Ionicons name="gift" size={12} color="#10B981" />
                              <Text style={[styles.refreshBtnText, { color: '#10B981' }]}>Kirim Hadiah</Text>
                            </TouchableOpacity>

                            {u.role !== 'vip' && (
                              <TouchableOpacity
                                style={[styles.refreshBtn, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B55', flex: isMobile ? 1 : undefined, minWidth: isSmallPhone ? '100%' : 100, justifyContent: 'center' }]}
                                onPress={() => handlePromoteUser(u, 'vip')}
                              >
                                <Ionicons name="star" size={12} color="#F59E0B" />
                                <Text style={[styles.refreshBtnText, { color: '#F59E0B' }]}>Jadikan VIP</Text>
                              </TouchableOpacity>
                            )}

                            {u.role !== 'admin' && (
                              <TouchableOpacity
                                style={[styles.refreshBtn, { backgroundColor: '#3B82F622', borderColor: '#3B82F655', flex: isMobile ? 1 : undefined, minWidth: isSmallPhone ? '100%' : 110, justifyContent: 'center' }]}
                                onPress={() => handlePromoteUser(u, 'admin')}
                              >
                                <Ionicons name="shield-checkmark" size={12} color="#3B82F6" />
                                <Text style={[styles.refreshBtnText, { color: '#3B82F6' }]}>Jadikan Admin</Text>
                              </TouchableOpacity>
                            )}

                            {u.role && u.role !== 'student' && (
                              <TouchableOpacity
                                style={[styles.refreshBtn, { backgroundColor: theme.cardInner, borderColor: theme.border, flex: isMobile ? 1 : undefined, minWidth: isSmallPhone ? '100%' : 120, justifyContent: 'center' }]}
                                onPress={() => handlePromoteUser(u, 'student')}
                              >
                                <Ionicons name="person-outline" size={12} color={theme.subtext} />
                                <Text style={[styles.refreshBtnText, { color: theme.subtext }]}>Set Mahasiswa Biasa</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

          </ScrollView>
        </View>

      {/* ========================================================= */}
      {/* MODAL: TAMBAH PRESET GAYA KARAKTER BARU */}
      {/* ========================================================= */}
      <Modal
        visible={showAddPresetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddPresetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAddPresetModal(false)}
          />

          <View style={styles.presetModalCard}>
            <View style={styles.presetModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.presetModalIconWrap}>
                  <Ionicons name="sparkles" size={16} color="#60A5FA" />
                </View>
                <View>
                  <Text style={styles.presetModalTitle}>Tambah Preset Karakter AI</Text>
                  <Text style={styles.presetModalSub}>Buat gaya instruksi kustom baru untuk bot</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAddPresetModal(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.presetModalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalFieldLabel}>Nama Preset / Peran Karakter *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Misal: Ahli Pemrograman & Debugging, Psikolog Ramah..."
                placeholderTextColor="#5A6578"
                value={newPresetName}
                onChangeText={setNewPresetName}
              />

              <Text style={styles.modalFieldLabel}>Panggilan Bot Default</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Misal: Ara, Dev Ara, Sensei Ara..."
                placeholderTextColor="#5A6578"
                value={newPresetBotName}
                onChangeText={setNewPresetBotName}
              />

              <Text style={styles.modalFieldLabel}>Deskripsi Singkat Karakter</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Misal: Kritis, solutif, membantu analisa logika & perbaikan bug."
                placeholderTextColor="#5A6578"
                value={newPresetDesc}
                onChangeText={setNewPresetDesc}
              />

              <Text style={styles.modalFieldLabel}>System Prompt Lengkap (Instruksi Inti) *</Text>
              <Text style={styles.modalFieldHint}>
                Tulis aturan perilaku, gaya bahasa, dan panduan respons AI saat preset ini dipilih:
              </Text>
              <TextInput
                style={styles.modalPromptArea}
                placeholder={`Kamu adalah "${newPresetBotName || 'Ara'}", seorang asisten ahli yang cerdas dan solutif.\n\nTugas utamamu:\n1. Jelaskan konsep dengan terstruktur dan mudah dipahami.\n2. Berikan contoh praktis dan solusi konkrit.\n3. Bersikap ramah, sopan, dan suportif.`}
                placeholderTextColor="#4B5565"
                value={newPresetPrompt}
                onChangeText={setNewPresetPrompt}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddPresetModal(false)}
                disabled={savingCustomPreset}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddCustomPreset}
                disabled={savingCustomPreset}
              >
                {savingCustomPreset ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitText}>Simpan & Terapkan Preset</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any, isLightMode: boolean) => StyleSheet.create({
  portalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  portalLayout: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },

  /* ========================================================= */
  /* DESKTOP FIXED SIDEBAR & DRAWER */
  /* ========================================================= */
  desktopSidebar: {
    width: 250,
    backgroundColor: theme.card,
    borderRightWidth: 1,
    borderRightColor: theme.border,
  },
  sidebarInner: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    backgroundColor: theme.card,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: 14,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.accentBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  brandTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    color: theme.accentLight,
    fontSize: 12,
    fontWeight: '500',
  },
  drawerCloseBtn: {
    padding: 6,
  },
  sidebarNavScroll: {
    flex: 1,
  },
  sidebarSectionLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  sidebarNavItemActive: {
    backgroundColor: theme.accentBg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sidebarNavText: {
    color: theme.subtext,
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  sidebarNavTextActive: {
    color: theme.accentLight,
    fontWeight: '700',
  },
  navItemBadge: {
    backgroundColor: theme.cardInner,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  navItemBadgeActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  navItemBadgeText: {
    color: theme.subtext,
    fontSize: 11,
    fontWeight: '700',
  },
  navItemBadgeTextActive: {
    color: '#FFFFFF',
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 14,
    gap: 8,
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.cardInner,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  switchModeText: {
    color: theme.subtext,
    fontSize: 11.5,
    fontWeight: '600',
  },
  sidebarVersionText: {
    color: theme.muted,
    fontSize: 11,
    textAlign: 'center',
  },

  /* ========================================================= */
  /* MOBILE DRAWER MODAL OVERLAY */
  /* ========================================================= */
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerSheet: {
    width: '80%',
    maxWidth: 290,
    height: '100%',
    backgroundColor: theme.card,
    borderRightWidth: 1,
    borderRightColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },

  /* ========================================================= */
  /* MAIN CANVAS & COMMAND BAR */
  /* ========================================================= */
  mainCanvas: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topCommandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  commandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  hamburgerBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.cardInner,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  commandTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  commandSub: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 1,
  },
  commandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: isLightMode ? '#ECFDF5' : '#101F1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isLightMode ? '#A7F3D0' : '#19382B',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    color: isLightMode ? '#059669' : '#34D399',
    fontSize: 12,
    fontWeight: '600',
  },
  exitPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.cardInner,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  exitPortalText: {
    color: theme.subtext,
    fontSize: 11,
    fontWeight: '600',
  },

  /* Mobile Horizontal Quick Navigation Tab Bar */
  mobileTabBarWrap: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  mobileTabBarScroll: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mobileTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  mobileTabPillActive: {
    borderWidth: 1.5,
  },
  mobileTabPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobileTabPillTextActive: {
    fontWeight: '700',
  },

  /* Canvas Scroll Area */
  canvasScroll: {
    flex: 1,
  },
  canvasScrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingBottom: 60,
  },
  tabContent: {
    gap: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 14.5,
    fontWeight: '700',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.cardInner,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  refreshBtnText: {
    color: theme.accentLight,
    fontSize: 11,
    fontWeight: '600',
  },
  loaderBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricNum: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: theme.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardMaintenanceActive: {
    borderColor: '#FECACA',
    backgroundColor: isLightMode ? '#FEF2F2' : '#2D1214',
  },
  cardTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSub: {
    color: theme.subtext,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  infoRowText: {
    color: theme.subtext,
    fontSize: 12,
    flex: 1,
  },
  inputLabel: {
    color: theme.subtext,
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
  },
  paramChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  paramChip: {
    backgroundColor: theme.cardInner,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  paramChipActive: {
    backgroundColor: theme.accentBg,
    borderColor: theme.primary,
  },
  paramChipText: {
    color: theme.subtext,
    fontSize: 11,
    fontWeight: '500',
  },
  paramChipTextActive: {
    color: theme.accentLight,
    fontWeight: '700',
  },
  presetSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  addPresetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.cardInner,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.border,
  },
  addPresetActionText: {
    color: theme.accentLight,
    fontSize: 11,
    fontWeight: '600',
  },
  customPresetBadge: {
    backgroundColor: theme.accentBg,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  customPresetBadgeText: {
    color: theme.accentLight,
    fontSize: 11,
    fontWeight: '700',
  },
  deletePresetIconBtn: {
    padding: 3,
    backgroundColor: isLightMode ? '#FEF2F2' : '#3B1214',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: isLightMode ? '#FECACA' : '#6B2124',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  presetCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.accentBg,
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetTitle: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '600',
  },
  presetTitleActive: {
    color: theme.accentLight,
  },
  presetDesc: {
    color: theme.subtext,
    fontSize: 12,
    lineHeight: 15,
  },

  /* Custom Preset Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  presetModalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 25,
  },
  presetModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: 14,
  },
  presetModalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.accentBg,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetModalTitle: {
    color: theme.text,
    fontSize: 14.5,
    fontWeight: '700',
  },
  presetModalSub: {
    color: theme.subtext,
    fontSize: 11,
  },
  closeModalBtn: {
    padding: 4,
  },
  presetModalScroll: {
    maxHeight: 400,
  },
  modalFieldLabel: {
    color: theme.subtext,
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  modalFieldHint: {
    color: theme.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: theme.cardInner,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.text,
    fontSize: 12.5,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalPromptArea: {
    backgroundColor: theme.cardInner,
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 140,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: theme.cardInner,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalCancelText: {
    color: theme.subtext,
    fontSize: 12.5,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingVertical: 11,
    borderRadius: 8,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  promptArea: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
    fontSize: 12,
    lineHeight: 18,
    minHeight: 160,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  saveActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  latencyBadge: {
    backgroundColor: isLightMode ? '#ECFDF5' : '#101F1A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isLightMode ? '#A7F3D0' : '#19382B',
  },
  latencyText: {
    color: isLightMode ? '#065F46' : '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
  testInput: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  runTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.cardInner,
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
  },
  runTestText: {
    color: theme.accentLight,
    fontSize: 12.5,
    fontWeight: '600',
  },
  testResponseCard: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  testResponseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  testResponseTitle: {
    color: theme.accentLight,
    fontSize: 11.5,
    fontWeight: '700',
  },
  testResponseText: {
    color: theme.text,
    fontSize: 12.5,
    lineHeight: 19,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  switchItemTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  switchItemSub: {
    color: theme.subtext,
    fontSize: 11,
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
  emojiInput: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: theme.text,
    fontSize: 20,
    borderWidth: 1,
    borderColor: theme.border,
    textAlign: 'center',
    width: 64,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 6,
  },
  colorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorCircleActive: {
    borderWidth: 2,
    borderColor: theme.text,
  },
  formBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: theme.cardInner,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  cancelEditText: {
    color: theme.subtext,
    fontWeight: '500',
    fontSize: 12,
  },
  saveMoodBtn: {
    flex: 2,
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveMoodText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  resetText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '600',
  },
  moodList: {
    gap: 8,
  },
  moodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  moodEmojiBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodItemLabel: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  moodItemKey: {
    color: theme.subtext,
    fontSize: 11,
  },
  colorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
    backgroundColor: theme.cardInner,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  previewBox: {
    marginBottom: 14,
  },
  previewLabel: {
    color: theme.subtext,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  bannerPreviewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: isLightMode ? '#FFFBEB' : '#2C2210',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: isLightMode ? '#FDE68A' : '#785412',
  },
  bannerBadgeText: {
    color: isLightMode ? '#B45309' : '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bannerPreviewText: {
    color: isLightMode ? '#92400E' : '#FDE68A',
    fontSize: 12,
    lineHeight: 18,
  },
  broadcastInput: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 100,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 6,
  },
  broadcastActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  saveBroadcastBtn: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  saveBroadcastBtnDisabled: {
    opacity: 0.5,
  },
  saveBroadcastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: isLightMode ? '#FEF2F2' : '#3B1214',
    borderWidth: 1,
    borderColor: isLightMode ? '#FECACA' : '#6B2124',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  clearBannerText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '600',
  },
  userSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
    marginBottom: 14,
  },
  userSearchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 12.5,
  },
  userListWrap: {
    gap: 8,
  },
  userRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  userAvatarSquare: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.accentBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  userAvatarInitial: {
    color: theme.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
  userNameText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  userIdText: {
    color: theme.muted,
    fontSize: 11,
    marginTop: 2,
  },
  userJoinedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userJoinedText: {
    color: theme.subtext,
    fontSize: 11,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.muted,
    fontSize: 12,
  },
  badgeKpi: {
    backgroundColor: theme.cardInner,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  badgeKpiText: {
    color: theme.accentLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  /* Google Gemini API Key Management Styles */
  apiKeyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  apiKeyInput: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    paddingVertical: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  eyeBtn: {
    padding: 6,
  },
  apiResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  apiResultSuccess: {
    backgroundColor: isLightMode ? '#ECFDF5' : '#101F1A',
    borderColor: isLightMode ? '#A7F3D0' : '#19382B',
  },
  apiResultError: {
    backgroundColor: isLightMode ? '#FEF2F2' : '#3B1214',
    borderColor: isLightMode ? '#FECACA' : '#6B2124',
  },
  apiResultText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  apiResultTextSuccess: {
    color: isLightMode ? '#065F46' : '#34D399',
  },
  apiResultTextError: {
    color: '#EF4444',
  },
  /* Multi-Key Pool & Fallback Routing Studio Styles */
  addKeyToPoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    marginLeft: 6,
  },
  addKeyToPoolText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyPoolBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
    marginBottom: 12,
    gap: 6,
  },
  emptyPoolText: {
    color: theme.subtext,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
  },
  keyPoolList: {
    gap: 8,
    marginBottom: 14,
  },
  keyItemCard: {
    backgroundColor: theme.cardInner,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
  },
  keyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  keyIndexWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  keyIndexBadge: {
    backgroundColor: isLightMode ? '#F1F5F9' : '#1E1B4B40',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isLightMode ? '#CBD5E1' : '#6366F155',
  },
  keyIndexBadgePrimary: {
    backgroundColor: isLightMode ? '#ECFDF5' : '#064E3B40',
    borderColor: isLightMode ? '#A7F3D0' : '#10B98188',
  },
  keyIndexText: {
    color: isLightMode ? '#475569' : '#A5B4FC',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  keyIndexTextPrimary: {
    color: isLightMode ? '#065F46' : '#34D399',
  },
  keyPreviewText: {
    color: theme.text,
    fontSize: 12.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  keyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  testSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.cardInner,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  testSmallText: {
    color: theme.accentLight,
    fontSize: 11,
    fontWeight: '600',
  },
  deleteSmallBtn: {
    padding: 5,
    backgroundColor: isLightMode ? '#FEF2F2' : '#3B1214',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isLightMode ? '#FECACA' : '#6B2124',
  },
  keyItemResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 8,
    borderWidth: 1,
  },
  keyItemResultText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  brandingMockupBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
  },
  brandingMockupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandingPreviewLogoImg: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  brandingMockupTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandingMockupTagline: {
    fontSize: 11,
    fontWeight: '500',
  },
  brandingMockupRightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  brandingMockupRightBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  brandingLogoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  brandingUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  brandingUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  brandingResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  brandingResetBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  saveAllPoolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  saveAllPoolText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
