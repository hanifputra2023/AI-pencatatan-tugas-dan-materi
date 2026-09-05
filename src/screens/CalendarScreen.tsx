import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  ActivityIndicator, TouchableOpacity, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { JournalEntry, StudyNote, StudentTask } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';

import {
  getCachedJournals,
  getCachedNotes,
  getCachedTasks,
} from '../lib/offlineSync';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

type TabFilter = 'all' | 'study' | 'journal' | 'tasks';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { moods } = useMoods();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [filter, setFilter] = useState<TabFilter>('all');
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(new Date().toDateString());

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Instant load from offline cache
    try {
      const [cJournals, cNotes, cTasks] = await Promise.all([
        getCachedJournals(user.id),
        getCachedNotes(user.id),
        getCachedTasks(user.id),
      ]);
      setJournals(cJournals || []);
      setNotes(cNotes || []);
      setTasks(cTasks || []);
    } catch (e) {
      console.log('Calendar local fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateStr(today.toDateString());
  };

  const isCurrentViewingMonth = () => {
    const today = new Date();
    return (
      currentMonthDate.getMonth() === today.getMonth() &&
      currentMonthDate.getFullYear() === today.getFullYear()
    );
  };

  // Full Month Interactive Grid with Monday-Sunday column alignment
  const getMonthDaysGrid = () => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // 0 = Sunday, 1 = Monday, ... convert so Monday = 0, Sunday = 6
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

    const days: any[] = [];

    // 1. Previous month padding cells
    for (let p = 0; p < firstDayOfWeek; p++) {
      days.push({
        isEmpty: true,
        key: `pad_prev_${p}`,
      });
    }

    // 2. Days of the current viewing month
    const todayStr = new Date().toDateString();

    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const date = new Date(year, month, dayNum);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toDateString();

      const dayJournals = journals.filter(e => new Date(e.created_at).toDateString() === dateStr);
      const dayNotes = notes.filter(n => new Date(n.created_at).toDateString() === dateStr);
      const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === dateStr);

      const mood = dayJournals.length > 0 ? moods.find(m => m.type === dayJournals[0].mood) : null;

      const showNotes = filter === 'all' || filter === 'study';
      const showJournals = filter === 'all' || filter === 'journal';
      const showTasks = filter === 'all' || filter === 'tasks';

      const filteredNoteCount = showNotes ? dayNotes.length : 0;
      const filteredJournalCount = showJournals ? dayJournals.length : 0;
      const filteredTaskCount = showTasks ? dayTasks.length : 0;

      days.push({
        isEmpty: false,
        key: `day_${dayNum}`,
        date,
        dateStr,
        dayNum,
        isToday: dateStr === todayStr,
        mood,
        journalCount: filteredJournalCount,
        noteCount: filteredNoteCount,
        taskCount: filteredTaskCount,
        hasActivity: filteredNoteCount > 0 || filteredJournalCount > 0 || filteredTaskCount > 0,
      });
    }

    // 3. Next month padding cells to complete row
    const remainder = days.length % 7;
    if (remainder > 0) {
      const extra = 7 - remainder;
      for (let e = 0; e < extra; e++) {
        days.push({
          isEmpty: true,
          key: `pad_next_${e}`,
        });
      }
    }

    return days;
  };

  // 7-Day Weekly Chart Calculation
  const getWeekData = () => {
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toDateString();

      const dayJournals = journals.filter(e => new Date(e.created_at).toDateString() === dateStr);
      const dayNotes = notes.filter(n => new Date(n.created_at).toDateString() === dateStr);
      const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === dateStr);

      const mood = dayJournals.length > 0 ? moods.find(m => m.type === dayJournals[0].mood) : null;
      const totalEvents = dayJournals.length + dayNotes.length + dayTasks.length;

      week.push({
        day: DAYS[date.getDay()],
        dateStr,
        mood,
        noteCount: dayNotes.length,
        journalCount: dayJournals.length,
        totalEvents,
        hasActivity: totalEvents > 0,
      });
    }
    return week;
  };

  // Study Subject Distribution
  const getSubjectStats = () => {
    const stats: Record<string, number> = {};
    notes.forEach(n => {
      const subj = n.subject?.trim() || 'Umum';
      stats[subj] = (stats[subj] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  // Mood Distribution
  const getMoodStats = () => {
    const stats: Record<string, number> = {};
    journals.forEach(e => {
      stats[e.mood] = (stats[e.mood] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 4);
  };

  const daysGrid = getMonthDaysGrid();
  const weekData = getWeekData();
  const maxWeeklyEvents = Math.max(1, ...weekData.map(d => d.totalEvents));
  const totalWeeklyEvents = weekData.reduce((acc, d) => acc + d.totalEvents, 0);
  const subjectStats = getSubjectStats();
  const moodStats = getMoodStats();
  const topMood = moodStats[0] ? moods.find(m => m.type === moodStats[0][0]) : null;

  // Selected Day Items
  const allDayJournals = journals.filter(e => new Date(e.created_at).toDateString() === selectedDateStr);
  const allDayNotes = notes.filter(n => new Date(n.created_at).toDateString() === selectedDateStr);
  const allDayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === selectedDateStr);
  const totalAllSelectedEvents = allDayJournals.length + allDayNotes.length + allDayTasks.length;

  const showSelectedNotes = filter === 'all' || filter === 'study';
  const showSelectedJournals = filter === 'all' || filter === 'journal';
  const showSelectedTasks = filter === 'all' || filter === 'tasks';

  const selectedDayJournals = showSelectedJournals ? allDayJournals : [];
  const selectedDayNotes = showSelectedNotes ? allDayNotes : [];
  const selectedDayTasks = showSelectedTasks ? allDayTasks : [];
  const totalSelectedEvents = selectedDayJournals.length + selectedDayNotes.length + selectedDayTasks.length;

  const totalQuizzesGenerated = notes.reduce((acc, n) => acc + (n.quiz_data?.length || 0), 0);
  const completedTasksCount = tasks.filter(t => t.is_completed).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="small" color={theme.accentLight} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          isWide ? styles.scrollContentWide : styles.scrollContentMobile,
          { paddingBottom: 60 }
        ]}
      >
        <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

        {/* Top Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Statistik & Kalender</Text>
          <Text style={[styles.subtitle, { color: isLightMode ? theme.text : theme.accentLight }]}>Rekapitulasi aktivitas belajar, materi kuliah & refleksi 30 hari</Text>
        </View>

        {/* Top Filter Switcher */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              filter === 'all' && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
            ]}
            onPress={() => setFilter('all')}
          >
            <Ionicons name="sparkles" size={13} color={filter === 'all' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.filterChipText, { color: theme.subtext }, filter === 'all' && [styles.filterChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
              Semua Aktivitas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              filter === 'study' && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
            ]}
            onPress={() => setFilter('study')}
          >
            <Ionicons name="school" size={13} color={filter === 'study' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.filterChipText, { color: theme.subtext }, filter === 'study' && [styles.filterChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
              Materi ({notes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              filter === 'journal' && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
            ]}
            onPress={() => setFilter('journal')}
          >
            <Ionicons name="book" size={13} color={filter === 'journal' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.filterChipText, { color: theme.subtext }, filter === 'journal' && [styles.filterChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
              Jurnal ({journals.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              filter === 'tasks' && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
            ]}
            onPress={() => setFilter('tasks')}
          >
            <Ionicons name="checkbox" size={13} color={filter === 'tasks' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.filterChipText, { color: theme.subtext }, filter === 'tasks' && [styles.filterChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
              Tugas ({tasks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4 Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.summaryIconBox, { backgroundColor: isLightMode ? '#EFF6FF' : '#16233B', borderColor: isLightMode ? '#BFDBFE' : '#253856' }]}>
              <Ionicons name="school-outline" size={15} color="#3B82F6" />
            </View>
            <Text style={[styles.summaryNum, { color: theme.text }]}>{notes.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Materi Kuliah</Text>
            <Text style={[styles.summarySub, { color: theme.muted }]}>{totalQuizzesGenerated} Soal Kuis AI</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.summaryIconBox, { backgroundColor: isLightMode ? '#FFFBEB' : '#2B2314', borderColor: isLightMode ? '#FCD34D' : '#593914' }]}>
              <Ionicons name="checkbox-outline" size={15} color="#F59E0B" />
            </View>
            <Text style={[styles.summaryNum, { color: theme.text }]}>{completedTasksCount}/{tasks.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Tugas Selesai</Text>
            <Text style={[styles.summarySub, { color: theme.muted }]}>{tasks.length - completedTasksCount} Pending</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.summaryIconBox, { backgroundColor: isLightMode ? '#ECFDF5' : '#122B22', borderColor: isLightMode ? '#86EFAC' : '#194A35' }]}>
              <Ionicons name="book-outline" size={15} color="#10B981" />
            </View>
            <Text style={[styles.summaryNum, { color: theme.text }]}>{journals.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Total Jurnal</Text>
            <Text style={[styles.summarySub, { color: theme.muted }]}>{topMood?.emoji || '✨'} Dominan {topMood?.label || ''}</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.summaryIconBox, { backgroundColor: isLightMode ? '#FDF2F8' : '#2B1A24', borderColor: isLightMode ? '#FBCFE8' : '#4E203C' }]}>
              <Ionicons name="flame-outline" size={15} color="#EC4899" />
            </View>
            <Text style={[styles.summaryNum, { color: theme.text }]}>{weekData.filter(d => d.hasActivity).length}/7</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Aktif Minggu Ini</Text>
            <Text style={[styles.summarySub, { color: theme.muted }]}>Hari Produktif</Text>
          </View>
        </View>

        {/* Main 2-Column Responsive Body */}
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>

          {/* ========================================================================= */}
          {/* LEFT COLUMN: 30-Day Activity Calendar & Selected Day Inspector */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>

            {/* Interactive Monthly Activity Calendar Grid */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Header: Title & Legends */}
              <View style={styles.cardHeaderBetween}>
                <View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Kalender Aktivitas & Materi</Text>
                  <Text style={[styles.cardSub, { color: theme.subtext }]}>Pilih tanggal untuk melihat rincian materi, tugas & refleksi</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={[styles.legendText, { color: theme.subtext }]}>Materi</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={[styles.legendText, { color: theme.subtext }]}>Jurnal</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={[styles.legendText, { color: theme.subtext }]}>Tugas</Text>
                  </View>
                </View>
              </View>

              {/* Month Navigation Control Bar */}
              <View style={[styles.monthNavContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <TouchableOpacity
                  style={[styles.monthNavBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={handlePrevMonth}
                  activeOpacity={0.7}
                  accessibilityLabel="Bulan Sebelumnya"
                >
                  <Ionicons name="chevron-back" size={16} color={theme.text} />
                  <Text style={[styles.monthNavBtnText, { color: theme.text }]}>Bulan Lalu</Text>
                </TouchableOpacity>

                <View style={styles.monthCenterInfo}>
                  <Text style={[styles.monthTitleMain, { color: theme.text }]}>
                    {currentMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                  </Text>
                  {!isCurrentViewingMonth() && (
                    <TouchableOpacity
                      style={[styles.todayBadgeBtn, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}
                      onPress={handleToday}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.todayBadgeText, { color: theme.accentLight }]}>Bulan Ini</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.monthNavBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={handleNextMonth}
                  activeOpacity={0.7}
                  accessibilityLabel="Bulan Berikutnya"
                >
                  <Text style={[styles.monthNavBtnText, { color: theme.text }]}>Bulan Depan</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Weekday Column Headers (Monday - Sunday) */}
              <View style={styles.weekDayHeaderRow}>
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((dayName, idx) => (
                  <View key={dayName} style={styles.weekDayHeaderCell}>
                    <Text style={[
                      styles.weekDayHeaderText,
                      { color: idx >= 5 ? (isLightMode ? '#DC2626' : '#F87171') : theme.subtext },
                    ]}>
                      {dayName}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Month 7-Column Date Grid */}
              <View style={styles.monthGridContainer}>
                {daysGrid.map((d, i) => {
                  if (d.isEmpty) {
                    return <View key={d.key || i} style={styles.emptyGridCell} />;
                  }

                  const isSelected = d.dateStr === selectedDateStr;
                  return (
                    <TouchableOpacity
                      key={d.key || i}
                      style={[
                        styles.gridCellMonthly,
                        {
                          backgroundColor: isSelected
                            ? theme.primary
                            : d.hasActivity
                              ? (isLightMode ? '#EFF6FF' : '#141D2B')
                              : theme.cardInner,
                          borderColor: isSelected
                            ? theme.primary
                            : d.isToday
                              ? theme.accent
                              : d.hasActivity
                                ? (isLightMode ? '#BFDBFE' : '#2A3C59')
                                : theme.border,
                        },
                        d.isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.accentLight },
                      ]}
                      onPress={() => setSelectedDateStr(d.dateStr)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.gridDayNum,
                          {
                            color: isSelected
                              ? '#FFFFFF'
                              : d.isToday
                                ? theme.accentLight
                                : d.hasActivity
                                  ? (isLightMode ? '#1D4ED8' : '#60A5FA')
                                  : theme.text,
                            fontWeight: isSelected || d.isToday || d.hasActivity ? '700' : '500',
                          }
                        ]}
                      >
                        {d.dayNum}
                      </Text>

                      {/* Activity Indicator Badges */}
                      <View style={styles.dotRow}>
                        {d.noteCount > 0 && <View style={[styles.activityDot, { backgroundColor: '#3B82F6' }]} />}
                        {d.journalCount > 0 && <View style={[styles.activityDot, { backgroundColor: '#10B981' }]} />}
                        {d.taskCount > 0 && <View style={[styles.activityDot, { backgroundColor: '#F59E0B' }]} />}
                      </View>
                      {d.mood && !isSelected && (
                        <Text style={styles.gridEmojiSmall}>{d.mood.emoji}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Date Inspector Card */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={16} color={theme.accentLight} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {new Date(selectedDateStr).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
                <Text style={[styles.badgeEventsCount, { backgroundColor: theme.accentBg, color: theme.accentLight, borderColor: theme.border }]}>
                  {totalSelectedEvents} Aktivitas
                </Text>
              </View>

              {totalSelectedEvents === 0 ? (
                <View style={styles.emptyDayWrap}>
                  <Ionicons name="cafe-outline" size={24} color={theme.muted} />
                  <Text style={[styles.emptyDayText, { color: theme.subtext }]}>
                    {totalAllSelectedEvents > 0 && filter !== 'all'
                      ? `Tidak ada ${filter === 'study' ? 'materi' : filter === 'journal' ? 'jurnal' : 'tugas'} pada hari ini.`
                      : 'Tidak ada catatan materi, jurnal, atau tugas pada hari ini.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.dayEventList}>

                  {/* Study Notes on Selected Day */}
                  {selectedDayNotes.map(n => (
                    <TouchableOpacity
                      key={n.id}
                      style={[styles.eventItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={() => navigation.navigate('StudyNoteDetail', { noteId: n.id })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.eventBadgeIcon, { backgroundColor: theme.accentBg }]}>
                        <Ionicons name="school" size={15} color={theme.accentLight} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={[styles.eventSubjectBadge, { backgroundColor: theme.accentBg, color: theme.accentLight }]}>{n.subject || 'Mata Kuliah'}</Text>
                          <Text style={[styles.eventTimeText, { color: theme.muted }]}>
                            {new Date(n.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={1}>{n.title}</Text>
                        <Text style={[styles.eventSnippet, { color: theme.subtext }]} numberOfLines={1}>{n.content}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={theme.subtext} />
                    </TouchableOpacity>
                  ))}

                  {/* Journals on Selected Day */}
                  {selectedDayJournals.map(j => {
                    const mood = moods.find(m => m.type === j.mood);
                    return (
                      <TouchableOpacity
                        key={j.id}
                        style={[styles.eventItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => navigation.navigate('JournalEntry', { entryId: j.id })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.eventBadgeIcon, { backgroundColor: isLightMode ? '#DCFCE7' : '#143825' }]}>
                          <Text style={{ fontSize: 14 }}>{mood?.emoji || '📝'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.eventHeaderRow}>
                            <Text style={[styles.eventSubjectBadge, { color: isLightMode ? '#15803D' : '#4ADE80', backgroundColor: isLightMode ? '#DCFCE7' : '#133522', borderColor: isLightMode ? '#86EFAC' : '#1F5A3B' }]}>
                              Jurnal {mood?.label || ''}
                            </Text>
                            <Text style={[styles.eventTimeText, { color: theme.muted }]}>
                              {new Date(j.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={1}>{j.title || 'Catatan Refleksi'}</Text>
                          <Text style={[styles.eventSnippet, { color: theme.subtext }]} numberOfLines={1}>{j.content}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={theme.subtext} />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Tasks Due on Selected Day */}
                  {selectedDayTasks.map(t => (
                    <View key={t.id} style={[styles.eventItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                      <View style={[styles.eventBadgeIcon, { backgroundColor: isLightMode ? '#FEF3C7' : '#3B2412' }]}>
                        <Ionicons name="checkbox" size={15} color={isLightMode ? '#D97706' : '#F59E0B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={[styles.eventSubjectBadge, { color: isLightMode ? '#B45309' : '#FBBF24', backgroundColor: isLightMode ? '#FEF3C7' : '#2E1E0C', borderColor: isLightMode ? '#FCD34D' : '#593914' }]}>
                            Tugas: {t.subject}
                          </Text>
                          <Text style={[styles.eventTimeText, { color: t.is_completed ? '#10B981' : '#EF4444' }]}>
                            {t.is_completed ? 'Selesai' : 'Pending'}
                          </Text>
                        </View>
                        <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                      </View>
                    </View>
                  ))}

                </View>
              )}
            </View>

          </View>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Productivity & Breakdown Charts */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1 }]}>

            {/* 7-Day Activity Trend Bar Chart */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderBetween}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Tren Aktivitas 7 Hari Terakhir</Text>
                <Text style={[styles.cardSubCount, { color: theme.accentLight }]}>{totalWeeklyEvents} Aktivitas</Text>
              </View>

              <View style={styles.barChart}>
                {weekData.map((d, i) => {
                  const isSelected = d.dateStr === selectedDateStr;
                  const isToday = d.dateStr === new Date().toDateString();
                  const heightPercent = d.hasActivity ? Math.max(12, Math.round((d.totalEvents / maxWeeklyEvents) * 60)) : 6;

                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.barCol, isSelected && [styles.barColSelected, { backgroundColor: theme.cardInner, borderColor: theme.accent }]]}
                      onPress={() => setSelectedDateStr(d.dateStr)}
                      activeOpacity={0.7}
                    >
                      {/* Event Count & Emoji Header */}
                      <View style={styles.barHeaderInfo}>
                        {d.totalEvents > 0 ? (
                          <Text style={[styles.barCountText, { color: theme.accentLight }]}>
                            {d.totalEvents}
                          </Text>
                        ) : (
                          <Text style={[styles.barCountText, { color: 'transparent' }]}>-</Text>
                        )}
                        <Text style={styles.barEmoji}>
                          {d.mood?.emoji ?? (d.noteCount > 0 ? '📖' : '•')}
                        </Text>
                      </View>

                      {/* Bounded Bar Track (Fixed Maximum Constraint) */}
                      <View style={[styles.barTrack, { backgroundColor: theme.cardInner }]}>
                        <View
                          style={[
                            styles.bar,
                            {
                              backgroundColor: d.hasActivity ? theme.primary : 'transparent',
                              height: heightPercent,
                            },
                          ]}
                        />
                      </View>

                      {/* Day Label */}
                      <Text style={[
                        styles.barDay,
                        { color: theme.subtext },
                        isToday && { color: theme.accentLight, fontWeight: '700' },
                        isSelected && { color: theme.text, fontWeight: '700' }
                      ]}>
                        {d.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Subject Study Breakdown */}
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHeaderBetween}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Distribusi Materi Kuliah</Text>
                <Text style={[styles.cardSubCount, { color: theme.accentLight }]}>{notes.length} Catatan</Text>
              </View>
              {subjectStats.length === 0 ? (
                <Text style={[styles.emptyStatsText, { color: theme.subtext }]}>Belum ada catatan materi kuliah.</Text>
              ) : (
                subjectStats.map(([subjName, count]) => {
                  const pct = Math.round((count / (notes.length || 1)) * 100);
                  return (
                    <View key={subjName} style={styles.statRow}>
                      <Ionicons name="book-outline" size={13} color={theme.accentLight} style={{ marginRight: 6 }} />
                      <Text style={[styles.statLabel, { color: theme.text }]} numberOfLines={1}>{subjName}</Text>
                      <View style={[styles.statBarBg, { backgroundColor: theme.cardInner }]}>
                        <View style={[styles.statBar, { width: `${pct}%` as any, backgroundColor: theme.primary }]} />
                      </View>
                      <Text style={[styles.statCount, { color: theme.subtext }]}>{count} ({pct}%)</Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Mood Sebaran Emosi */}
            {moodStats.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.cardHeaderBetween}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>Sebaran Emosi & Jurnal</Text>
                  <Text style={[styles.cardSubCount, { color: theme.accentLight }]}>{journals.length} Jurnal</Text>
                </View>
                {moodStats.map(([moodType, count]) => {
                  const mood = moods.find(m => m.type === moodType);
                  const pct = Math.round((count / (journals.length || 1)) * 100);
                  return (
                    <View key={moodType} style={styles.statRow}>
                      <Text style={styles.statEmoji}>{mood?.emoji || '•'}</Text>
                      <Text style={[styles.statLabel, { color: theme.text }]}>{mood?.label || moodType}</Text>
                      <View style={[styles.statBarBg, { backgroundColor: theme.cardInner }]}>
                        <View style={[styles.statBar, { width: `${pct}%` as any, backgroundColor: isLightMode ? '#10B981' : '#059669' }]} />
                      </View>
                      <Text style={[styles.statCount, { color: theme.subtext }]}>{count} ({pct}%)</Text>
                    </View>
                  );
                })}
              </View>
            )}

          </View>

        </View>

        </View>
      </ScrollView>
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
    paddingBottom: 40,
  },
  scrollContentMobile: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  scrollContentWide: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  innerContainer: {
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1440,
    alignSelf: 'center',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#11141C',
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#11141C',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  summaryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#16233B',
    borderWidth: 1,
    borderColor: '#253856',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryNum: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  summaryLabel: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  summarySub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  mainLayout: {
    gap: 14,
  },
  mainLayoutWide: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  column: {
    width: '100%',
  },
  card: {
    backgroundColor: '#11141C',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#F9FAFB',
    fontSize: 13.5,
    fontWeight: '700',
  },
  cardSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  cardSubCount: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    color: '#6B7280',
    fontSize: 11,
  },
  monthNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  monthNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  monthNavBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  monthCenterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthTitleMain: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  todayBadgeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  weekDayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  weekDayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  weekDayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
  },
  monthGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
  },
  emptyGridCell: {
    width: '13.5%',
    height: 48,
    opacity: 0,
  },
  gridCellMonthly: {
    width: '13.5%',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 3,
  },
  gridDayNum: {
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  gridCell: {
    width: 42,
    minWidth: 34,
    flexGrow: 1,
    maxWidth: 48,
    height: 46,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A202C',
    backgroundColor: '#0E1117',
    paddingVertical: 2,
  },
  gridCellActive: {
    borderColor: '#243044',
    backgroundColor: '#121824',
  },
  gridCellSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
  },
  gridDay: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  gridDaySelected: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  gridEmojiSmall: {
    fontSize: 11,
    marginTop: 1,
  },
  badgeEventsCount: {
    backgroundColor: '#1E293B',
    color: '#60A5FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyDayWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyDayText: {
    color: '#6B7280',
    fontSize: 11.5,
    textAlign: 'center',
  },
  dayEventList: {
    gap: 8,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1A202C',
    gap: 10,
  },
  eventBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventSubjectBadge: {
    backgroundColor: '#16233B',
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#253856',
  },
  eventTimeText: {
    color: '#6B7280',
    fontSize: 11,
  },
  eventTitle: {
    color: '#F9FAFB',
    fontSize: 12.5,
    fontWeight: '600',
  },
  eventSnippet: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 1,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 12,
    paddingBottom: 4,
    gap: 4,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  barColSelected: {
    borderWidth: 1,
  },
  barHeaderInfo: {
    alignItems: 'center',
    marginBottom: 6,
    gap: 2,
  },
  barCountText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  barEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  barTrack: {
    width: 14,
    height: 64,
    borderRadius: 7,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  bar: {
    width: '100%',
    borderRadius: 7,
  },
  barDay: {
    fontSize: 11,
    fontWeight: '500',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statEmoji: {
    fontSize: 13,
    marginRight: 6,
  },
  statLabel: {
    color: '#9CA3AF',
    fontSize: 11.5,
    width: 85,
  },
  statBarBg: {
    flex: 1,
    backgroundColor: '#0E1117',
    borderRadius: 4,
    height: 6,
    marginHorizontal: 8,
  },
  statBar: {
    height: 6,
    borderRadius: 4,
  },
  statCount: {
    color: '#6B7280',
    fontSize: 12,
    minWidth: 50,
    textAlign: 'right',
  },
  emptyStatsText: {
    color: '#6B7280',
    fontSize: 11.5,
    paddingVertical: 10,
  },
});
