import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Image, ActivityIndicator, ScrollView, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useResponsive } from '../hooks/useResponsive';
import { RootStackParamList } from '../navigation/AppNavigator';
import { confirmAction, showAlert } from '../lib/alert';

export default function ProfileScreen() {
  const { user, signOut, isAdmin, role, claimAdminRole, refreshProfileRole } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

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
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator color="#60A5FA" size="small" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Akun Pengguna</Text>
          <Text style={styles.subtitle}>Informasi profil dan pengaturan aplikasi</Text>
        </View>

        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          
          {/* Left Column (Avatar & Profile Data) */}
          <View style={[styles.column, isWide && { flex: 1 }]}>
            <View style={styles.avatarSection}>
              
              <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {(username || user?.email || 'M')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.cameraBtn}>
                  <Ionicons name="camera" size={13} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              {/* Role Badge */}
              <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeStudent]}>
                <Ionicons
                  name={isAdmin ? 'shield-checkmark' : 'school-outline'}
                  size={12}
                  color={isAdmin ? '#60A5FA' : '#9CA3AF'}
                />
                <Text style={[styles.roleBadgeText, isAdmin ? styles.roleBadgeTextAdmin : styles.roleBadgeTextStudent]}>
                  {isAdmin ? 'ADMINISTRATOR' : 'MAHASISWA'}
                </Text>
              </View>

              {editing ? (
                <TextInput
                  style={styles.nameInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Nama Pengguna"
                  placeholderTextColor="#4B5565"
                  autoFocus
                />
              ) : (
                <Text style={styles.userName}>{username || 'Mahasiswa'}</Text>
              )}

              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>

            {editing ? (
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnCancel} onPress={() => { setEditing(false); fetchProfile(); }}>
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSave} onPress={saveProfile} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnSaveText}>Simpan</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="pencil-outline" size={15} color="#9CA3AF" />
                <Text style={styles.editBtnText}>Edit Profil</Text>
              </TouchableOpacity>
            )}

            {/* ========================================================================= */}
            {/* ADMIN PANEL BUTTON (HANYA MUNCUL JIKA USER ADALAH ADMIN) */}
            {/* ========================================================================= */}
            {isAdmin ? (
              <TouchableOpacity
                style={styles.adminBtn}
                onPress={() => navigation.navigate('Admin')}
              >
                <View style={styles.adminBtnLeft}>
                  <View style={[styles.adminIconWrap, { backgroundColor: '#16233B' }]}>
                    <Ionicons name="shield-checkmark" size={17} color="#60A5FA" />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.adminBtnTitle}>Pusat Kontrol Admin</Text>
                      <View style={{ backgroundColor: '#1E293B', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ color: '#60A5FA', fontSize: 9, fontWeight: '700' }}>SUPERADMIN</Text>
                      </View>
                    </View>
                    <Text style={styles.adminBtnSub}>Kelola AI, Fitur, Moods & Database</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </TouchableOpacity>
            ) : null}

          </View>

          {/* Right Column (Stats & App Info) */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total Jurnal</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{stats.streak}</Text>
                <Text style={styles.statLabel}>Hari Streak</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{stats.chats}</Text>
                <Text style={styles.statLabel}>Sesi Cerita</Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
                <Text style={styles.infoText}>Data tersimpan privat & aman (RLS Active)</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="sync-outline" size={18} color="#3B82F6" />
                <Text style={styles.infoText}>Sinkronisasi real-time cloud aktif</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="sparkles-outline" size={18} color="#9CA3AF" />
                <Text style={styles.infoText}>AI Model Engine: Gemini 2.5 Flash</Text>
              </View>
            </View>

            {user && (
              <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                <Text style={styles.logoutText}>Keluar dari Akun</Text>
              </TouchableOpacity>
            )}

            {/* Tap version 5 times as secret shortcut for developer/admin */}
            <TouchableOpacity onPress={handleSecretTap} activeOpacity={0.7} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={styles.versionText}>Aplikasi Teman Belajar & AI v2.4 • Supabase DB</Text>
            </TouchableOpacity>

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
          <View style={styles.claimModalCard}>
            
            <View style={styles.claimModalHeader}>
              <View style={styles.claimIconCircle}>
                <Ionicons name="shield-checkmark" size={20} color="#60A5FA" />
              </View>
              <Text style={styles.claimModalTitle}>Otorisasi Akses Sistem</Text>
              <Text style={styles.claimModalDesc}>
                Masukkan kode otorisasi rahasia untuk memverifikasi hak akses Administrator pada akun ini:
              </Text>
            </View>

            <TextInput
              style={styles.passcodeInput}
              value={passcodeInput}
              onChangeText={setPasscodeInput}
              placeholder="••••••••••••"
              placeholderTextColor="#4B5565"
              secureTextEntry
              autoCapitalize="characters"
            />

            <View style={styles.claimBtnRow}>
              <TouchableOpacity
                style={styles.claimCancelBtn}
                onPress={() => {
                  setShowClaimModal(false);
                  setPasscodeInput('');
                }}
              >
                <Text style={styles.claimCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.claimSubmitBtn}
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
    backgroundColor: '#0E1117',
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 40,
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
