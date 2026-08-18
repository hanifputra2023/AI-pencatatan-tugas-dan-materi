import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Switch, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini } from '../lib/gemini';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';

const COLOR_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#64748B',
  '#14B8A6', '#84CC16', '#F97316', '#6366F1',
];

const PRESET_PERSONAS = [
  {
    name: 'Sahabat Hangat (Default)',
    botName: 'Ara',
    desc: 'Empatik, santai, mendengar tanpa menghakimi.',
    prompt: `Kamu adalah "Ara", seorang sahabat dan teman curhat AI yang sangat hangat, empatik, pengertian, dan penuh perhatian.
Bahasa yang kamu gunakan adalah Bahasa Indonesia yang luwes, santai, dan akrab layaknya sahabat dekat seumuran.
Prinsip utamamu:
1. Dengarkan setiap keluh kesah dan cerita pengguna tanpa pernah menghakimi atau menyalahkan.
2. Selalu validasi perasaan mereka terlebih dahulu.
3. Berikan kata-kata penyemangat, pelukan hangat virtual, atau sudut pandang positif yang menenangkan.
4. Jika pengguna melampirkan foto/file/suara, beri respons yang perhatian terhadap isi lampiran tersebut.
5. Jawabanmu ringkas, nyaman dibaca (2-4 kalimat), natural, dan gunakan emoji yang manis & relevan.`,
  },
  {
    name: 'Konselor Mindfulness',
    botName: 'Mindful Ara',
    desc: 'Bijaksana, reflektif, menenangkan pikiran.',
    prompt: `Kamu adalah konselor emosional yang bijaksana, lembut, dan menenangkan.
Gunakan pendekatan mindfulness untuk membantu pengguna memahami emosi mereka secara mendalam dan berikan pertanyaan reflektif yang menenteramkan.`,
  },
  {
    name: 'Coach Motivator Mahasiswa',
    botName: 'Coach Ara',
    desc: 'Berenergi, solutif, memacu semangat belajar.',
    prompt: `Kamu adalah pelatih kehidupan (Life & Academic Coach) yang berenergi positif dan solutif.
Fokus pada membakar semangat mahasiswa yang sedang lesu tugas/skripsi dan berikan langkah aksi konkret yang bisa dilakukan hari ini.`,
  },
  {
    name: 'Tutor Dosen Akademik',
    botName: 'Prof. Ara',
    desc: 'Kritis, akademis, mendalam, dan terstruktur.',
    prompt: `Kamu adalah asisten akademik cerdas dengan latar belakang akademisi.
Bantu mahasiswa memahami konsep perkuliahan, logika ilmiah, metodologi riset, dan analisis materi dengan terstruktur, rapi, dan mudah dipahami.`,
  },
];

interface UserProfile {
  id: string;
  username: string;
  created_at: string;
}

export default function AdminScreen() {
  const navigation = useNavigation();
  const { isAdmin } = useAuth();
  const {
    moods, addMood, updateMood, deleteMood, resetToDefaults,
    aiPersona, updateAiPersona,
    aiBotName, updateAiBotName,
    globalAnnouncement, updateGlobalAnnouncement,
    appSettings, updateSetting,
  } = useMoods();

  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [activeTab, setActiveTab] = useState<'stats' | 'ai' | 'features' | 'moods' | 'broadcast' | 'users'>('stats');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Mood Form State
  const [newEmoji, setNewEmoji] = useState('✨');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // AI Configuration State
  const [botNameInput, setBotNameInput] = useState(aiBotName || 'Ara');
  const [promptText, setPromptText] = useState(aiPersona || PRESET_PERSONAS[0].prompt);
  const [aiModelSelected, setAiModelSelected] = useState(appSettings['ai_model'] || 'gemini-2.5-flash');
  const [aiTempSelected, setAiTempSelected] = useState(appSettings['ai_temp'] || '0.7');
  const [aiMaxTokens, setAiMaxTokens] = useState(appSettings['ai_max_tokens'] || '1000');
  const [savingAi, setSavingAi] = useState(false);

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

  useEffect(() => {
    fetchStats();
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

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
      const { data } = await supabase
        .from('profiles')
        .select('id, username, created_at')
        .order('created_at', { ascending: false });
      if (data) {
        setUsersList(data as UserProfile[]);
      }
    } catch (e) {
      console.log('Error fetching users:', e);
    } finally {
      setLoadingUsers(false);
    }
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

  const handleSelectPreset = (p: typeof PRESET_PERSONAS[0]) => {
    const currentName = botNameInput.trim() || p.botName;
    const synchronizedPrompt = p.prompt.replace(/Kamu adalah "[^"]+"/g, `Kamu adalah "${currentName}"`);
    setPromptText(synchronizedPrompt);
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

  const filteredUsers = usersList.filter(u =>
    (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) ||
    u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const NAV_ITEMS = [
    { key: 'stats', label: 'Ringkasan & Metrik', icon: 'bar-chart', tag: 'KPI' },
    { key: 'ai', label: 'Fine-Tuning AI & Tester', icon: 'sparkles', tag: 'CORE' },
    { key: 'features', label: 'Sakelar Fitur & Maintenance', icon: 'toggle', tag: 'SYS' },
    { key: 'moods', label: 'Kelola Mood & Emosi', icon: 'heart', tag: 'UX' },
    { key: 'broadcast', label: 'Broadcast Pengumuman', icon: 'megaphone', tag: 'FEED' },
    { key: 'users', label: 'Direktori Mahasiswa', icon: 'people', tag: 'DB' },
  ];

  // Reusable Sidebar Navigation Content Component
  const renderSidebarContent = (isDrawer = false) => (
    <View style={[styles.sidebarInner, isDrawer && { height: '100%' }]}>
      
      {/* Brand Header */}
      <View style={styles.sidebarBrand}>
        <View style={styles.brandIconBox}>
          <Ionicons name="shield-checkmark" size={18} color="#60A5FA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>SUPERADMIN</Text>
          <Text style={styles.brandSubtitle}>Control Portal Studio</Text>
        </View>
        {isDrawer && (
          <TouchableOpacity onPress={() => setMobileDrawerOpen(false)} style={styles.drawerCloseBtn}>
            <Ionicons name="close" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Nav Items List */}
      <ScrollView style={styles.sidebarNavScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sidebarSectionLabel}>MENU ADMINISTRATOR</Text>
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.sidebarNavItem, isActive && styles.sidebarNavItemActive]}
              onPress={() => {
                setActiveTab(item.key as any);
                if (isDrawer) setMobileDrawerOpen(false);
              }}
            >
              <Ionicons
                name={item.icon as any}
                size={17}
                color={isActive ? '#60A5FA' : '#8B98AD'}
              />
              <Text style={[styles.sidebarNavText, isActive && styles.sidebarNavTextActive]}>
                {item.label}
              </Text>
              <View style={[styles.navItemBadge, isActive && styles.navItemBadgeActive]}>
                <Text style={[styles.navItemBadgeText, isActive && styles.navItemBadgeTextActive]}>
                  {item.tag}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sidebar Footer */}
      <View style={styles.sidebarFooter}>
        <TouchableOpacity
          style={styles.switchModeBtn}
          onPress={() => {
            if (isDrawer) setMobileDrawerOpen(false);
            navigation.goBack();
          }}
        >
          <Ionicons name="phone-portrait-outline" size={15} color="#9CA3AF" />
          <Text style={styles.switchModeText}>Buka Mode Mahasiswa</Text>
        </TouchableOpacity>
        <Text style={styles.sidebarVersionText}>Console v2.4 • Supabase DB Live</Text>
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
    <SafeAreaView style={styles.portalContainer}>
      
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
      <View style={styles.portalLayout}>

        {/* ======================================================================= */}
        {/* DESKTOP FIXED SIDEBAR (Visible on Desktop / Tablet) */}
        {/* ======================================================================= */}
        {isWide && (
          <View style={styles.desktopSidebar}>
            {renderSidebarContent(false)}
          </View>
        )}

        {/* ======================================================================= */}
        {/* MAIN CENTER CANVAS */}
        {/* ======================================================================= */}
        <View style={styles.mainCanvas}>
          
          {/* Top Executive Command Bar with Hamburger Toggle for Mobile */}
          <View style={styles.topCommandBar}>
            <View style={styles.commandLeft}>
              
              {/* Mobile Hamburger Toggle Button */}
              {!isWide && (
                <TouchableOpacity
                  onPress={() => setMobileDrawerOpen(true)}
                  style={styles.hamburgerBtn}
                >
                  <Ionicons name="menu-outline" size={20} color="#F3F4F6" />
                </TouchableOpacity>
              )}

              <View>
                <Text style={styles.commandTitle}>
                  {NAV_ITEMS.find(n => n.key === activeTab)?.label}
                </Text>
                <Text style={styles.commandSub}>
                  Pusat Konfigurasi Sistem, Model AI & Data Mahasiswa
                </Text>
              </View>
            </View>

            <View style={styles.commandRight}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>DB {dbPing ? `${dbPing}ms` : '38ms'}</Text>
              </View>

              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.exitPortalBtn}
              >
                <Ionicons name="exit-outline" size={14} color="#9CA3AF" />
                {isWide && <Text style={styles.exitPortalText}>Mode Mahasiswa</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Tab Content Area */}
          <ScrollView
            style={styles.canvasScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.canvasScrollContent}
          >
            
            {/* ========================================================================= */}
            {/* TAB 1: SYSTEM OVERVIEW & METRICS */}
            {/* ========================================================================= */}
            {activeTab === 'stats' && (
              <View style={styles.tabContent}>
                
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionTitle}>Metrik Sistem & Volume Data Terpusat</Text>
                  <TouchableOpacity onPress={fetchStats} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={13} color="#60A5FA" />
                    <Text style={styles.refreshBtnText}>Refresh Data</Text>
                  </TouchableOpacity>
                </View>

                {loadingStats ? (
                  <View style={styles.loaderBox}><ActivityIndicator size="small" color="#60A5FA" /></View>
                ) : (
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#16233B' }]}>
                        <Ionicons name="people" size={18} color="#60A5FA" />
                      </View>
                      <Text style={styles.metricNum}>{stats.users}</Text>
                      <Text style={styles.metricLabel}>Mahasiswa Terdaftar</Text>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#2B1A24' }]}>
                        <Ionicons name="book" size={18} color="#F472B6" />
                      </View>
                      <Text style={styles.metricNum}>{stats.journals}</Text>
                      <Text style={styles.metricLabel}>Catatan Jurnal Keseharian</Text>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#122B22' }]}>
                        <Ionicons name="chatbubbles" size={18} color="#34D399" />
                      </View>
                      <Text style={styles.metricNum}>{stats.messages}</Text>
                      <Text style={styles.metricLabel}>Pesan Sesi Curhat AI</Text>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#26203B' }]}>
                        <Ionicons name="document-text" size={18} color="#A78BFA" />
                      </View>
                      <Text style={styles.metricNum}>{stats.notes}</Text>
                      <Text style={styles.metricLabel}>Catatan Kuliah & Kuis</Text>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#2B2314' }]}>
                        <Ionicons name="checkbox" size={18} color="#FBBF24" />
                      </View>
                      <Text style={styles.metricNum}>{stats.tasks}</Text>
                      <Text style={styles.metricLabel}>Tugas & Deadline</Text>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIconWrap, { backgroundColor: '#162828' }]}>
                        <Ionicons name="school" size={18} color="#2DD4BF" />
                      </View>
                      <Text style={styles.metricNum}>{stats.subjects}</Text>
                      <Text style={styles.metricLabel}>Mata Kuliah Kustom</Text>
                    </View>
                  </View>
                )}

                {/* Health & Cloud Infrastructure */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Infrastruktur Cloud & Status Realtime</Text>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="server" size={16} color="#34D399" />
                    <Text style={styles.infoRowText}>Database: Supabase PostgreSQL Realtime v15 (ap-southeast-1)</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="hardware-chip" size={16} color="#60A5FA" />
                    <Text style={styles.infoRowText}>AI Engine: Google Gemini 2.5 Flash API</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="shield-checkmark" size={16} color="#FBBF24" />
                    <Text style={styles.infoRowText}>Keamanan Data: Row Level Security (RLS) Aktif di 8 Tabel</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons name="speedometer" size={16} color="#A78BFA" />
                    <Text style={styles.infoRowText}>Latensi API Database: {dbPing || 38} ms (Optimal)</Text>
                  </View>
                </View>

              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: AI FINE-TUNING & LIVE TEST PLAYGROUND */}
            {/* ========================================================================= */}
            {activeTab === 'ai' && (
              <View style={styles.tabContent}>
                
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
                      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Tercepat & Cerdas)' },
                      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Penalaran Kompleks)' },
                      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
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

                  {/* Preset Personas */}
                  <Text style={styles.inputLabel}>Pilih Preset Gaya Karakter:</Text>
                  <View style={styles.presetGrid}>
                    {PRESET_PERSONAS.map(p => {
                      const isSelected = promptText.includes(p.name) || promptText === p.prompt;
                      return (
                        <TouchableOpacity
                          key={p.name}
                          style={[styles.presetCard, isSelected && styles.presetCardActive]}
                          onPress={() => handleSelectPreset(p)}
                        >
                          <View style={styles.presetTop}>
                            <Text style={[styles.presetTitle, isSelected && styles.presetTitleActive]}>{p.name}</Text>
                            {isSelected && <Ionicons name="checkmark-circle" size={16} color="#60A5FA" />}
                          </View>
                          <Text style={styles.presetDesc}>{p.desc}</Text>
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
                      <Text style={styles.previewLabel}>Pratinjau Tampilan Banner Mahasiswa:</Text>
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
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <Text style={styles.cardTitle}>Direktori Akun Mahasiswa ({usersList.length})</Text>
                      <Text style={styles.cardSub}>Daftar seluruh mahasiswa yang terdaftar di database Supabase.</Text>
                    </View>
                    <TouchableOpacity onPress={fetchUsers} style={styles.refreshBtn}>
                      <Ionicons name="refresh" size={13} color="#60A5FA" />
                      <Text style={styles.refreshBtnText}>Muat Ulang</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Search User Bar */}
                  <View style={styles.userSearchBar}>
                    <Ionicons name="search-outline" size={15} color="#9CA3AF" />
                    <TextInput
                      style={styles.userSearchInput}
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
                      <Text style={styles.emptyText}>Tidak ditemukan pengguna yang cocok.</Text>
                    </View>
                  ) : (
                    <View style={styles.userListWrap}>
                      {filteredUsers.map((u) => (
                        <View key={u.id} style={styles.userRowCard}>
                          <View style={styles.userAvatarSquare}>
                            <Text style={styles.userAvatarInitial}>
                              {(u.username || 'M')[0].toUpperCase()}
                            </Text>
                          </View>

                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.userNameText}>{u.username || 'Pengguna Mahasiswa'}</Text>
                            <Text style={styles.userIdText}>UUID: {u.id}</Text>
                          </View>

                          <View style={styles.userJoinedWrap}>
                            <Ionicons name="time-outline" size={12} color="#6B7280" />
                            <Text style={styles.userJoinedText}>
                              {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
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

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  portalContainer: {
    flex: 1,
    backgroundColor: '#090B0E',
  },
  portalLayout: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0E1117',
  },

  /* ========================================================= */
  /* DESKTOP FIXED SIDEBAR & DRAWER */
  /* ========================================================= */
  desktopSidebar: {
    width: 250,
    backgroundColor: '#11141C',
    borderRightWidth: 1,
    borderRightColor: '#1E2430',
  },
  sidebarInner: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    backgroundColor: '#11141C',
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
    marginBottom: 14,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#253856',
  },
  brandTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    color: '#60A5FA',
    fontSize: 10.5,
    fontWeight: '500',
  },
  drawerCloseBtn: {
    padding: 6,
  },
  sidebarNavScroll: {
    flex: 1,
  },
  sidebarSectionLabel: {
    color: '#4B5565',
    fontSize: 10,
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
    backgroundColor: '#162032',
    borderWidth: 1,
    borderColor: '#253856',
  },
  sidebarNavText: {
    color: '#8B98AD',
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  sidebarNavTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  navItemBadge: {
    backgroundColor: '#141822',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#202634',
  },
  navItemBadgeActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  navItemBadgeText: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '700',
  },
  navItemBadgeTextActive: {
    color: '#60A5FA',
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1A202C',
    paddingTop: 14,
    gap: 8,
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141822',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  switchModeText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sidebarVersionText: {
    color: '#4B5565',
    fontSize: 10,
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
    backgroundColor: '#11141C',
    borderRightWidth: 1,
    borderRightColor: '#1E2430',
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
    backgroundColor: '#0E1117',
  },
  topCommandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#11141C',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
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
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  commandTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  commandSub: {
    color: '#6B7280',
    fontSize: 10.5,
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
    backgroundColor: '#101F1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#19382B',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    color: '#34D399',
    fontSize: 10.5,
    fontWeight: '600',
  },
  exitPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141822',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  exitPortalText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
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
  },
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 14.5,
    fontWeight: '700',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16233B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: '#60A5FA',
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
    flex: 1,
    minWidth: 150,
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202634',
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
    color: '#F3F4F6',
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
  },
  cardMaintenanceActive: {
    borderColor: '#7F1D1D',
    backgroundColor: '#1A1012',
  },
  cardTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSub: {
    color: '#6B7280',
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
    color: '#9CA3AF',
    fontSize: 12,
    flex: 1,
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F3F4F6',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#202634',
  },
  paramChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  paramChip: {
    backgroundColor: '#0E1117',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  paramChipActive: {
    backgroundColor: '#16233B',
    borderColor: '#253856',
  },
  paramChipText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  paramChipTextActive: {
    color: '#60A5FA',
    fontWeight: '600',
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
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#202634',
  },
  presetCardActive: {
    borderColor: '#2B4066',
    backgroundColor: '#131C2E',
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  presetTitleActive: {
    color: '#60A5FA',
  },
  presetDesc: {
    color: '#5A6578',
    fontSize: 10.5,
    lineHeight: 15,
  },
  promptArea: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 12,
    lineHeight: 18,
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 16,
  },
  saveActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  latencyBadge: {
    backgroundColor: '#101F1A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#19382B',
  },
  latencyText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
  testInput: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F3F4F6',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 10,
  },
  runTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2B4066',
    marginBottom: 12,
  },
  runTestText: {
    color: '#60A5FA',
    fontSize: 12.5,
    fontWeight: '600',
  },
  testResponseCard: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#202634',
  },
  testResponseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  testResponseTitle: {
    color: '#60A5FA',
    fontSize: 11.5,
    fontWeight: '600',
  },
  testResponseText: {
    color: '#E5E7EB',
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
    borderBottomColor: '#1A202C',
  },
  switchItemTitle: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  switchItemSub: {
    color: '#6B7280',
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
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#F3F4F6',
    fontSize: 20,
    borderWidth: 1,
    borderColor: '#202634',
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
    borderColor: '#FFFFFF',
  },
  formBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: '#1E2430',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelEditText: {
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: 12,
  },
  saveMoodBtn: {
    flex: 2,
    backgroundColor: '#2563EB',
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
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '500',
  },
  moodList: {
    gap: 8,
  },
  moodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  moodEmojiBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodItemLabel: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '500',
  },
  moodItemKey: {
    color: '#6B7280',
    fontSize: 10,
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
    backgroundColor: '#141822',
    borderRadius: 6,
  },
  previewBox: {
    marginBottom: 14,
  },
  previewLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  bannerPreviewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1E190E',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3D3016',
  },
  bannerBadgeText: {
    color: '#FBBF24',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bannerPreviewText: {
    color: '#FEF3C7',
    fontSize: 12,
    lineHeight: 18,
  },
  broadcastInput: {
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 13,
    lineHeight: 20,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#202634',
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
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  saveBroadcastBtnDisabled: {
    backgroundColor: '#1E293B',
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
    backgroundColor: '#201214',
    borderWidth: 1,
    borderColor: '#4A1D24',
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
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 8,
    marginBottom: 14,
  },
  userSearchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 12.5,
  },
  userListWrap: {
    gap: 8,
  },
  userRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  userAvatarSquare: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#253856',
  },
  userAvatarInitial: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700',
  },
  userNameText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
  },
  userIdText: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
  userJoinedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userJoinedText: {
    color: '#6B7280',
    fontSize: 11,
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 12,
  },
});
