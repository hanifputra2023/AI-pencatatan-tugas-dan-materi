import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Animated, Platform, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useResponsive } from '../../hooks/useResponsive';
import { useTheme, getSemanticColors } from '../../contexts/ThemeContext';
import { useMoods } from '../../contexts/MoodContext';
import AppLogo from '../../components/AppLogo';

export const ONBOARDING_STORAGE_KEY = '@has_seen_onboarding_v1';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
};

interface SlideData {
  id: string;
  category: string;
  categoryIcon: keyof typeof Ionicons.glyphMap;
  title: string;
  highlightText: string;
  description: string;
  bulletPoints: {
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
  }[];
}

const SLIDES: SlideData[] = [
  {
    id: 'welcome',
    category: 'STUDYBOT AI ECOSYSTEM',
    categoryIcon: 'sparkles',
    title: 'Asisten Kuliah Cerdas &',
    highlightText: 'Ruang Refleksi Mahasiswa',
    description: 'Satu aplikasi terintegrasi untuk menata seluruh materi kuliah, mengelola deadline tugas tanpa stres, dan merawat ketenangan pikiran setiap hari.',
    bulletPoints: [
      { icon: 'school-outline', text: 'Catatan materi kuliah Markdown terstruktur' },
      { icon: 'timer-outline', text: 'Timer fokus Pomodoro dan pelacak deadline' },
      { icon: 'chatbubble-ellipses-outline', text: 'Teman cerita AI empatik dan pencatat suasana hati' },
    ],
  },
  {
    id: 'academic',
    category: 'SMART ACADEMIC & OCR',
    categoryIcon: 'book-outline',
    title: 'Catat Materi Cepat dengan',
    highlightText: 'AI Camera Scanner',
    description: 'Foto catatan fisik dari papan tulis atau buku referensi. AI secara otomatis mengekstraksi teks menjadi format digital Markdown yang rapi.',
    bulletPoints: [
      { icon: 'scan-outline', text: 'Ekstraksi teks otomatis dari foto (OCR Cerdas)' },
      { icon: 'code-slash-outline', text: 'Dukungan format rumus, checklist, dan kode' },
      { icon: 'folder-outline', text: 'Pengelompokan teratur per mata kuliah dan semester' },
    ],
  },
  {
    id: 'tasks-pomodoro',
    category: 'PRODUCTIVITY & FOCUS',
    categoryIcon: 'timer-outline',
    title: 'Fokus Belajar Terarah &',
    highlightText: 'Kendalikan Jadwal Tugas',
    description: 'Bagi waktu belajar dengan siklus Pomodoro dan atur prioritas tugas akademik berdasarkan tanggal jatuh tempo agar tidak menumpuk di akhir.',
    bulletPoints: [
      { icon: 'flag-outline', text: 'Tingkat prioritas tugas: Mendesak, Sedang, dan Normal' },
      { icon: 'notifications-outline', text: 'Pengingat dan notifikasi pergantian siklus belajar' },
      { icon: 'flame-outline', text: 'Pelacak konsistensi streak belajar harian' },
    ],
  },
  {
    id: 'wellness',
    category: 'MENTAL WELLNESS & AI',
    categoryIcon: 'heart-outline',
    title: 'Ruang Aman untuk Berbagi',
    highlightText: 'Cerita dan Keluh Kesah',
    description: 'Kesehatan mental sama pentingnya dengan pencapaian akademik. Ceritakan keresahan perkuliahan kapan pun dibutuhkan tanpa rasa cemas.',
    bulletPoints: [
      { icon: 'happy-outline', text: 'Pencatat suasana hati (Daily Mood Tracker)' },
      { icon: 'leaf-outline', text: 'Latihan pernapasan terpandu untuk meredakan cemas' },
      { icon: 'lock-closed-outline', text: 'Jurnal refleksi pribadi dengan enkripsi aman' },
    ],
  },
  {
    id: 'studio-offline',
    category: 'PERSONALIZATION & OFFLINE',
    categoryIcon: 'color-palette-outline',
    title: 'Ruang Belajar yang Estetis,',
    highlightText: 'Siap Digunakan Kapan Saja',
    description: 'Pilih dari beragam palet tema bawaan atau gunakan wallpaper kustom sendiri. Semua data tersimpan aman secara offline dan tersinkronisasi saat online.',
    bulletPoints: [
      { icon: 'moon-outline', text: 'Pilihan tema Mode Gelap dan Mode Terang yang presisi' },
      { icon: 'cloud-offline-outline', text: 'Dukungan kerja offline penuh dengan auto-sync' },
      { icon: 'laptop-outline', text: 'Tata letak responsif untuk ponsel, tablet, dan desktop' },
    ],
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;
  const { theme, isLightMode, allThemes } = useTheme();
  const { appBrandName } = useMoods();
  const sem = getSemanticColors(isLightMode);

  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideTransX = useRef(new Animated.Value(0)).current;

  const currentSlide = SLIDES[currentIndex];
  const isLastSlide = currentIndex === SLIDES.length - 1;

  const animateToSlide = (targetIndex: number) => {
    if (targetIndex === currentIndex) return;
    const direction = targetIndex > currentIndex ? -1 : 1;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(slideTransX, {
        toValue: direction * 20,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentIndex(targetIndex);
      slideTransX.setValue(-direction * 20);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(slideTransX, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      animateToSlide(currentIndex + 1);
    } else {
      handleComplete('Register');
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      animateToSlide(currentIndex - 1);
    }
  };

  const handleComplete = async (target: 'Register' | 'Login') => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (e) {
      console.log('Error saving onboarding state:', e);
    }
    navigation.replace(target);
  };

  // Render clean UI mockup previews matching the current theme perfectly
  const renderMockupPreview = () => {
    switch (currentSlide.id) {
      case 'welcome':
        return (
          <View style={[styles.mockupContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.mockupTopBar}>
              <View style={[styles.statusDot, { backgroundColor: sem.success }]} />
              <Text style={[styles.mockupTopBarTitle, { color: theme.subtext }]}>Dasbor Mahasiswa</Text>
              <View style={[styles.streakBadge, { backgroundColor: sem.warningBg, borderColor: sem.warningBorder }]}>
                <Ionicons name="flame" size={13} color={sem.warning} />
                <Text style={[styles.streakBadgeText, { color: sem.warning }]}>Streak 5 Hari</Text>
              </View>
            </View>

            <View style={[styles.previewGreetingBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.previewGreetingKicker, { color: theme.muted }]}>FOKUS HARI INI</Text>
              <Text style={[styles.previewGreetingName, { color: theme.text }]}>Ikhtisar Akademik & Refleksi</Text>
              <Text style={[styles.previewGreetingSub, { color: theme.subtext }]}>3 Tugas Mendekati Deadline • 1 Catatan Kuliah</Text>
            </View>

            <View style={styles.previewQuickGrid}>
              <View style={[styles.previewMiniCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="book-outline" size={17} color={theme.accentLight} />
                <Text style={[styles.previewMiniTitle, { color: theme.text }]}>12 Catatan</Text>
                <Text style={[styles.previewMiniSub, { color: theme.subtext }]}>4 Mata Kuliah</Text>
              </View>
              <View style={[styles.previewMiniCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="checkbox-outline" size={17} color={sem.warning} />
                <Text style={[styles.previewMiniTitle, { color: theme.text }]}>3 Tugas Aktif</Text>
                <Text style={[styles.previewMiniSub, { color: sem.danger }]}>1 Jatuh Tempo</Text>
              </View>
            </View>
          </View>
        );

      case 'academic':
        return (
          <View style={[styles.mockupContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.mockupTopBar}>
              <View style={[styles.matkulChip, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                <Ionicons name="folder-outline" size={12} color={theme.accentLight} style={{ marginRight: 4 }} />
                <Text style={[styles.matkulChipText, { color: theme.accentLight }]}>Struktur Data & Algoritma</Text>
              </View>
              <View style={[styles.ocrBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="scan-outline" size={12} color={theme.subtext} />
                <Text style={[styles.ocrBadgeText, { color: theme.subtext }]}>OCR Terverifikasi</Text>
              </View>
            </View>

            <View style={[styles.noteContentPreview, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.noteHeadingText, { color: theme.text }]}># Konsep Binary Search Tree</Text>
              <Text style={[styles.noteBodyText, { color: theme.subtext }]}>
                Struktur data pohon biner dengan aturan: setiap elemen pada subtree kiri bernilai lebih kecil dari root node.
              </Text>
              <View style={[styles.codeBlockPreview, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Text style={[styles.codeText, { color: theme.accentLight }]}>
                  {`function search(root, target) {\n  if (!root || root.val === target) return root;\n  return target < root.val ? search(root.left, target) : search(root.right, target);\n}`}
                </Text>
              </View>
            </View>
          </View>
        );

      case 'tasks-pomodoro':
        return (
          <View style={[styles.mockupContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            {/* Pomodoro Timer Preview */}
            <View style={[styles.pomoTimerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.pomoHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="timer-outline" size={15} color={theme.accentLight} />
                  <Text style={[styles.pomoModeText, { color: theme.text }]}>Sesi Fokus Belajar</Text>
                </View>
                <View style={[styles.pomoStatusPill, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                  <Text style={[styles.pomoStatusText, { color: theme.accentLight }]}>Berjalan</Text>
                </View>
              </View>
              <Text style={[styles.pomoDigits, { color: theme.text }]}>24:58</Text>
              <Text style={[styles.pomoSub, { color: theme.subtext }]}>Interval 25 Menit • Istirahat 5 Menit</Text>
            </View>

            {/* Task Item Preview */}
            <View style={[styles.taskItemPreview, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.taskItemTitle, { color: theme.text }]}>Laporan Praktikum Jaringan</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="time-outline" size={12} color={sem.danger} />
                  <Text style={[styles.taskItemDeadline, { color: sem.danger }]}>Besok, 23:59 WIB</Text>
                </View>
              </View>
              <View style={[styles.priorityPill, { backgroundColor: sem.dangerBg, borderColor: sem.dangerBorder }]}>
                <Text style={[styles.priorityPillText, { color: sem.danger }]}>Mendesak</Text>
              </View>
            </View>
          </View>
        );

      case 'wellness':
        return (
          <View style={[styles.mockupContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.mockupTopBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.botAvatarCircle, { backgroundColor: theme.primary }]}>
                  <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                </View>
                <Text style={[styles.botNameHeader, { color: theme.text }]}>Teman Cerita AI</Text>
              </View>
              <View style={[styles.onlinePill, { backgroundColor: sem.successBg, borderColor: sem.successBorder }]}>
                <View style={[styles.onlineDot, { backgroundColor: sem.success }]} />
                <Text style={[styles.onlinePillText, { color: sem.success }]}>Aktif 24/7</Text>
              </View>
            </View>

            {/* Chat Bubble User */}
            <View style={[styles.chatBubbleUser, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
              <Text style={[styles.chatBubbleUserText, { color: theme.text }]}>
                Banyak tugas yang mendekati tenggat waktu secara bersamaan, terasa cukup melelahkan.
              </Text>
            </View>

            {/* Chat Bubble AI */}
            <View style={[styles.chatBubbleBot, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.chatBubbleBotText, { color: theme.text }]}>
                Perasaan lelah saat beban tugas menumpuk sangat wajar dialami. Mari kita petakan tugas berdasarkan prioritas dan selesaikan satu per satu dengan tenang.
              </Text>
            </View>
          </View>
        );

      case 'studio-offline':
        return (
          <View style={[styles.mockupContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.mockupTopBar}>
              <Text style={[styles.mockupTopBarTitle, { color: theme.text }]}>Penyesuaian Visual & Status</Text>
              <View style={[styles.offlineReadyPill, { backgroundColor: sem.successBg, borderColor: sem.successBorder }]}>
                <Ionicons name="cloud-done-outline" size={12} color={sem.success} />
                <Text style={[styles.offlineReadyPillText, { color: sem.success }]}>Siap Offline</Text>
              </View>
            </View>

            <Text style={[styles.swatchSectionLabel, { color: theme.subtext }]}>Pilihan Preset Tema Sistem:</Text>
            <View style={styles.swatchPaletteGrid}>
              {allThemes.slice(0, 6).map((sw, idx) => (
                <View
                  key={sw.id || idx}
                  style={[
                    styles.swatchItemBox,
                    { backgroundColor: sw.bg, borderColor: sw.id === theme.id ? theme.accent : theme.border },
                    sw.id === theme.id && { borderWidth: 1.5 }
                  ]}
                >
                  <View style={[styles.swatchCircleDot, { backgroundColor: sw.primary }]} />
                  <Text style={[styles.swatchItemName, { color: sw.text }]} numberOfLines={1}>
                    {sw.name.split(' (')[0]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <AppLogo size={28} borderRadius={7} />
          <Text style={[styles.brandNameText, { color: theme.text }]}>{appBrandName || 'StudyBot AI'}</Text>
        </View>

        {/* Segmented Progress Bars */}
        <View style={styles.segmentProgressRow}>
          {SLIDES.map((_, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => animateToSlide(idx)}
              style={[
                styles.segmentBar,
                {
                  backgroundColor: idx === currentIndex
                    ? theme.accentLight
                    : idx < currentIndex
                    ? theme.primary
                    : isLightMode ? '#E2E8F0' : '#1E2430',
                },
              ]}
            />
          ))}
        </View>

        {/* Skip Action */}
        {!isLastSlide ? (
          <TouchableOpacity
            style={[styles.topSkipBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={() => handleComplete('Login')}
            activeOpacity={0.7}
          >
            <Text style={[styles.topSkipBtnText, { color: theme.subtext }]}>Lewati</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 54 }} />
        )}
      </View>

      {/* Main Content Layout */}
      <ScrollView
        contentContainerStyle={[styles.scrollBody, isWide && styles.scrollBodyWide]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.contentWrapper,
            isWide && styles.contentWrapperWide,
            { opacity: fadeAnim, transform: [{ translateX: slideTransX }] },
          ]}
        >
          {/* Left Narrative Column */}
          <View style={[styles.leftNarrativeCol, isWide && styles.leftNarrativeColWide]}>
            {/* Category Kicker Badge */}
            <View style={[styles.categoryKickerBadge, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
              <Ionicons name={currentSlide.categoryIcon} size={12} color={theme.accentLight} />
              <Text style={[styles.categoryKickerText, { color: theme.accentLight }]}>
                {currentSlide.category}
              </Text>
            </View>

            {/* Main Headline */}
            <Text style={[styles.heroHeadline, { color: theme.text }]}>
              {currentSlide.title}{' '}
              <Text style={{ color: theme.accentLight }}>{currentSlide.highlightText}</Text>
            </Text>

            {/* Clear Subtitle */}
            <Text style={[styles.heroSubtitle, { color: theme.subtext }]}>
              {currentSlide.description}
            </Text>

            {/* Bullet Points */}
            <View style={styles.bulletPointsGroup}>
              {currentSlide.bulletPoints.map((pt, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <View style={[styles.bulletIconWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Ionicons name={pt.icon} size={14} color={theme.accentLight} />
                  </View>
                  <Text style={[styles.bulletText, { color: theme.text }]}>
                    {pt.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right Mockup Preview Column */}
          <View style={[styles.rightMockupCol, isWide && styles.rightMockupColWide]}>
            {renderMockupPreview()}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Bottom Sticky Control Bar */}
      <View style={[styles.bottomControlBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <View style={[styles.bottomControlInner, isWide && styles.bottomControlInnerWide]}>
          {/* Step Counter Indicator */}
          <View style={styles.stepCounterTextWrap}>
            <Text style={[styles.stepCounterNumber, { color: theme.text }]}>
              0{currentIndex + 1} <Text style={[styles.stepCounterTotal, { color: theme.muted }]}>/ 0{SLIDES.length}</Text>
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.bottomActionButtons}>
            {currentIndex > 0 && (
              <TouchableOpacity
                style={[styles.prevButton, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={handlePrev}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={16} color={theme.text} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.nextMainButton,
                { backgroundColor: theme.primary },
                currentIndex === 0 && { minWidth: 160 },
              ]}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextMainButtonText}>
                {isLastSlide ? 'Mulai Sekarang' : 'Lanjut'}
              </Text>
              <Ionicons
                name={isLastSlide ? 'checkmark' : 'arrow-forward'}
                size={16}
                color="#FFFFFF"
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Existing Account Footer Link on Last Slide */}
        {isLastSlide && (
          <TouchableOpacity
            style={styles.directLoginFooter}
            onPress={() => handleComplete('Login')}
            activeOpacity={0.7}
          >
            <Text style={[styles.directLoginFooterText, { color: theme.subtext }]}>
              Sudah memiliki akun? <Text style={{ color: theme.accentLight, fontWeight: '700' }}>Masuk di sini</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 14,
    gap: 12,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogoImage: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  brandNameText: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  segmentProgressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: 220,
    alignItems: 'center',
  },
  segmentBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  topSkipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  topSkipBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  scrollBodyWide: {
    paddingHorizontal: 40,
    paddingVertical: 32,
    justifyContent: 'center',
    flexGrow: 1,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 1060,
    alignSelf: 'center',
    gap: 28,
  },
  contentWrapperWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 48,
  },
  leftNarrativeCol: {
    width: '100%',
  },
  leftNarrativeColWide: {
    flex: 1.1,
  },
  categoryKickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 14,
  },
  categoryKickerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroHeadline: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 33,
    letterSpacing: -0.6,
    marginBottom: 10,
    textAlign: 'left',
  },
  heroSubtitle: {
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: '400',
    marginBottom: 20,
    textAlign: 'left',
  },
  bulletPointsGroup: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulletText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  rightMockupCol: {
    width: '100%',
  },
  rightMockupColWide: {
    flex: 0.95,
  },
  mockupContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      },
      default: {
        elevation: 3,
      },
    }),
  },
  mockupTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mockupTopBarTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  streakBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewGreetingBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewGreetingKicker: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewGreetingName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  previewGreetingSub: {
    fontSize: 11.5,
  },
  previewQuickGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  previewMiniCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  previewMiniTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },
  previewMiniSub: {
    fontSize: 11,
  },
  matkulChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  matkulChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ocrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  ocrBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noteContentPreview: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  noteHeadingText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  noteBodyText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  codeBlockPreview: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  codeText: {
    fontSize: 10.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 15,
  },
  pomoTimerCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  pomoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pomoModeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  pomoStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  pomoStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pomoDigits: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
    marginVertical: 2,
  },
  pomoSub: {
    fontSize: 11,
  },
  taskItemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  taskItemTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  taskItemDeadline: {
    fontSize: 11,
    fontWeight: '600',
  },
  priorityPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  priorityPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  botAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botNameHeader: {
    fontSize: 12,
    fontWeight: '700',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlinePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    padding: 9,
    borderRadius: 10,
    borderTopRightRadius: 2,
    borderWidth: 1,
  },
  chatBubbleUserText: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  chatBubbleBot: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    padding: 10,
    borderRadius: 10,
    borderTopLeftRadius: 2,
    borderWidth: 1,
  },
  chatBubbleBotText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  offlineReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  offlineReadyPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  swatchSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  swatchPaletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  swatchItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: '48%',
    flex: 1,
  },
  swatchCircleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  swatchItemName: {
    fontSize: 11,
    fontWeight: '600',
  },
  bottomControlBar: {
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 22 : 12,
  },
  bottomControlInner: {
    width: '100%',
    maxWidth: 1060,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomControlInnerWide: {
    maxWidth: 1060,
  },
  stepCounterTextWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  stepCounterNumber: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  stepCounterTotal: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  bottomActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prevButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextMainButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextMainButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  directLoginFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  directLoginFooterText: {
    fontSize: 11.5,
  },
});
