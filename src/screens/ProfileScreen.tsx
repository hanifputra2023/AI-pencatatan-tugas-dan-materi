import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Image, ActivityIndicator, ScrollView, TextInput, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, isColorLight } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';
import { RootStackParamList } from '../navigation/AppNavigator';
import { confirmAction, showAlert } from '../lib/alert';

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

export default function ProfileScreen() {
  const { user, signOut, isAdmin, role, claimAdminRole, refreshProfileRole } = useAuth();
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
  } = useTheme();

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

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setUsername(data.username ?? '');
      setAvatarUrl(data.avatar_url);
    }
    setLoading(false);
  }, [user]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const [journalRes, chatRes] = await Promise.all([
      supabase.from('journal_entries').select('id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('chat_messages').select('id').eq('user_id', user.id).eq('role', 'user'),
    ]);
    const entries = journalRes.data ?? [];
    let streak = 0;
    let date = new Date();
    date.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const found = entries.find(e => new Date(e.created_at).toDateString() === date.toDateString());
      if (found) {
        streak++;
        date.setDate(date.getDate() - 1);
      } else break;
    }
    setStats({ total: entries.length, streak, chats: chatRes.data?.length ?? 0 });
  }, [user]);

  useEffect(() => {
    fetchProfile();
    fetchStats();

    if (!user) return;

    const channel = supabase
      .channel('profile_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, () => {
        fetchProfile();
        refreshProfileRole();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${user.id}` }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` }, () => fetchStats())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchProfile, fetchStats, refreshProfileRole]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchStats();
      refreshProfileRole();
    }, [fetchProfile, fetchStats, refreshProfileRole])
  );

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setAvatarUrl(result.assets[0].uri);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').upsert({ id: user.id, username, avatar_url: avatarUrl });
    setSaving(false);
    setEditing(false);
    showAlert('Sukses', 'Profil berhasil disimpan.');
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator color={theme.accentLight} size="small" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.bg }]}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Akun Pengguna</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>Informasi profil dan pengaturan aplikasi</Text>
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

            {/* ========================================================================= */}
            {/* ADMIN PANEL BUTTON (HANYA MUNCUL JIKA USER ADALAH ADMIN) */}
            {/* ========================================================================= */}
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
                        <Text style={{ color: theme.accentLight, fontSize: 9, fontWeight: '700' }}>SUPERADMIN</Text>
                      </View>
                    </View>
                    <Text style={[styles.adminBtnSub, { color: theme.subtext }]}>Kelola AI, Fitur, Moods & Database</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
              </TouchableOpacity>
            ) : null}

          </View>

          {/* Right Column (Stats & App Info) */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>
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
                            <Text style={{ fontSize: 15 }}>{t.emoji}</Text>
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
                            <Text style={{ fontSize: 15 }}>{t.emoji}</Text>
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
                        <Text style={{ color: theme.accentLight, fontSize: 9.5, fontWeight: '700' }}>KUSTOM AKTIF</Text>
                      </View>
                    </View>

                    <View style={[styles.miniInnerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600', marginBottom: 2 }}>
                        Kartu Komponen Aplikasi
                      </Text>
                      <Text style={{ color: theme.subtext, fontSize: 10, lineHeight: 14 }}>
                        Teks ini dan background di atas berubah sesuai palet yang Anda pilih di bawah.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        <View style={[styles.miniBtnPrimary, { backgroundColor: theme.primary }]}>
                          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Tombol Utama</Text>
                        </View>
                        <View style={[styles.miniBtnOutline, { borderColor: theme.border, backgroundColor: theme.cardInner }]}>
                          <Text style={{ color: theme.accentLight, fontSize: 10, fontWeight: '600' }}>Aksen</Text>
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
                        onPress={() => setCustomColor('bg', b.hex)}
                      >
                        {theme.bg === b.hex && <Ionicons name="checkmark" size={12} color={isColorLight(b.hex) ? '#000' : '#FFF'} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.hexInputRow}>
                    <Text style={[styles.hexInputPrefix, { color: theme.subtext }]}>HEX:</Text>
                    <TextInput
                      style={[styles.hexInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                      placeholder="#0E1117"
                      placeholderTextColor={theme.muted}
                      value={theme.bg}
                      onChangeText={(val) => {
                        if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                          setCustomColor('bg', val);
                        }
                      }}
                    />
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
                        onPress={() => setCustomColor('card', c.hex)}
                      >
                        {theme.card === c.hex && <Ionicons name="checkmark" size={12} color={isColorLight(c.hex) ? '#000' : '#FFF'} />}
                      </TouchableOpacity>
                    ))}
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
                        onPress={() => setCustomColor('primary', a)}
                      >
                        {theme.accent === a && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* 4. Text Contrast Option */}
                  <Text style={[styles.customFieldTitle, { color: theme.text, marginTop: 12 }]}>4. Kontras Warna Teks:</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[
                        styles.contrastOptionBtn,
                        { backgroundColor: '#0E1117', borderColor: theme.text === '#F3F4F6' ? theme.accentLight : theme.border }
                      ]}
                      onPress={() => setCustomColor('text', '#F3F4F6')}
                    >
                      <Text style={{ color: '#F3F4F6', fontSize: 11, fontWeight: '700' }}>Teks Putih / Terang</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.contrastOptionBtn,
                        { backgroundColor: '#FFFFFF', borderColor: theme.text === '#0F172A' ? theme.accent : theme.border }
                      ]}
                      onPress={() => setCustomColor('text', '#0F172A')}
                    >
                      <Text style={{ color: '#0F172A', fontSize: 11, fontWeight: '700' }}>Teks Hitam / Gelap</Text>
                    </TouchableOpacity>
                  </View>

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

              {/* Persistence note */}
              <View style={[styles.persistenceNote, { backgroundColor: isLightMode ? '#ECFDF5' : '#0F1A14', borderColor: isLightMode ? '#A7F3D0' : '#193324' }]}>
                <Ionicons name="cloud-done-outline" size={14} color="#10B981" />
                <Text style={[styles.persistenceNoteText, { color: isLightMode ? '#065F46' : '#34D399' }]}>
                  Kreasi tema Anda tersimpan permanen di cloud database & browser/aplikasi.
                </Text>
              </View>
            </View>

            <View style={[styles.infoSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
                <Text style={[styles.infoText, { color: theme.subtext }]}>Data tersimpan privat & aman (RLS Active)</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="sync-outline" size={18} color="#3B82F6" />
                <Text style={[styles.infoText, { color: theme.subtext }]}>Sinkronisasi real-time cloud aktif</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="sparkles-outline" size={18} color={theme.muted} />
                <Text style={[styles.infoText, { color: theme.subtext }]}>AI Model Engine: Gemini 2.5 Flash</Text>
              </View>
            </View>

            {user && (
              <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                <Text style={styles.logoutText}>Keluar dari Akun</Text>
              </TouchableOpacity>
            )}

            {/* Tap version 5 times as secret shortcut for developer/admin */}
            <TouchableOpacity onPress={handleSecretTap} activeOpacity={0.7} style={{ marginTop: 16, alignItems: 'center' }}>
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
          <View style={[styles.claimModalCard, { backgroundColor: isLightMode ? '#FFFFFF' : '#11141C', borderColor: isLightMode ? '#E2E8F0' : '#253856' }]}>
            
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1117',
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
    fontSize: 10,
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
  hexInput: {
    flex: 1,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
    fontSize: 10.5,
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
    fontSize: 10.5,
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
});
