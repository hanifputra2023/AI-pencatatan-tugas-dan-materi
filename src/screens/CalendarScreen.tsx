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
import { supabase } from '../lib/supabase';
import { JournalEntry, StudyNote, StudentTask } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

type TabFilter = 'all' | 'study' | 'journal' | 'tasks';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { moods } = useMoods();
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysIso = thirtyDaysAgo.toISOString();

    try {
      const [journalRes, notesRes, tasksRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', thirtyDaysIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('study_notes')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', thirtyDaysIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('student_tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (journalRes.data) setJournals(journalRes.data as JournalEntry[]);
      if (notesRes.data) setNotes(notesRes.data as StudyNote[]);
      if (tasksRes.data) setTasks(tasksRes.data as StudentTask[]);
    } catch (e) {
      console.log('Calendar fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();

    if (!user) return;

    const channel = supabase
      .channel('calendar_multi_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_tasks', filter: `user_id=eq.${user.id}` }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // 30-Day Grid calculation with multi-activity tracking
  const getDaysGrid = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toDateString();

      const dayJournals = journals.filter(e => new Date(e.created_at).toDateString() === dateStr);
      const dayNotes = notes.filter(n => new Date(n.created_at).toDateString() === dateStr);
      const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === dateStr);

      const mood = dayJournals.length > 0 ? moods.find(m => m.type === dayJournals[0].mood) : null;

      days.push({
        date,
        dateStr,
        dayNum: date.getDate(),
        mood,
        journalCount: dayJournals.length,
        noteCount: dayNotes.length,
        taskCount: dayTasks.length,
        hasActivity: dayJournals.length > 0 || dayNotes.length > 0 || dayTasks.length > 0,
      });
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

  const daysGrid = getDaysGrid();
  const weekData = getWeekData();
  const subjectStats = getSubjectStats();
  const moodStats = getMoodStats();
  const topMood = moodStats[0] ? moods.find(m => m.type === moodStats[0][0]) : null;

  // Selected Day Items
  const selectedDayJournals = journals.filter(e => new Date(e.created_at).toDateString() === selectedDateStr);
  const selectedDayNotes = notes.filter(n => new Date(n.created_at).toDateString() === selectedDateStr);
  const selectedDayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === selectedDateStr);
  const totalSelectedEvents = selectedDayJournals.length + selectedDayNotes.length + selectedDayTasks.length;

  const totalQuizzesGenerated = notes.reduce((acc, n) => acc + (n.quiz_data?.length || 0), 0);
  const completedTasksCount = tasks.filter(t => t.is_completed).length;

  if (loading) {
    return (
      <View style={styles.loaderCenter}>
        <ActivityIndicator size="small" color="#9CA3AF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Statistik & Kalender</Text>
          <Text style={styles.subtitle}>Rekapitulasi aktivitas belajar, materi kuliah & refleksi 30 hari</Text>
        </View>

        {/* Top Filter Switcher */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}
          >
            <Ionicons name="sparkles" size={13} color={filter === 'all' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
              Semua Aktivitas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'study' && styles.filterChipActive]}
            onPress={() => setFilter('study')}
          >
            <Ionicons name="school" size={13} color={filter === 'study' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.filterChipText, filter === 'study' && styles.filterChipTextActive]}>
              Materi ({notes.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'journal' && styles.filterChipActive]}
            onPress={() => setFilter('journal')}
          >
            <Ionicons name="book" size={13} color={filter === 'journal' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.filterChipText, filter === 'journal' && styles.filterChipTextActive]}>
              Jurnal ({journals.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filter === 'tasks' && styles.filterChipActive]}
            onPress={() => setFilter('tasks')}
          >
            <Ionicons name="checkbox" size={13} color={filter === 'tasks' ? '#60A5FA' : '#9CA3AF'} />
            <Text style={[styles.filterChipText, filter === 'tasks' && styles.filterChipTextActive]}>
              Tugas ({tasks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4 Summary Metric Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconBox}>
              <Ionicons name="school-outline" size={15} color="#60A5FA" />
            </View>
            <Text style={styles.summaryNum}>{notes.length}</Text>
            <Text style={styles.summaryLabel}>Materi Kuliah</Text>
            <Text style={styles.summarySub}>{totalQuizzesGenerated} Soal Kuis AI</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconBox, { backgroundColor: '#2E1065', borderColor: '#4C1D95' }]}>
              <Ionicons name="checkbox-outline" size={15} color="#C084FC" />
            </View>
            <Text style={styles.summaryNum}>{completedTasksCount}/{tasks.length}</Text>
            <Text style={styles.summaryLabel}>Tugas Selesai</Text>
            <Text style={styles.summarySub}>{tasks.length - completedTasksCount} Pending</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconBox, { backgroundColor: '#143825', borderColor: '#1F5A3B' }]}>
              <Ionicons name="book-outline" size={15} color="#4ADE80" />
            </View>
            <Text style={styles.summaryNum}>{journals.length}</Text>
            <Text style={styles.summaryLabel}>Total Jurnal</Text>
            <Text style={styles.summarySub}>{topMood?.emoji || '✨'} Dominan {topMood?.label || ''}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconBox, { backgroundColor: '#3B1A16', borderColor: '#6B2C24' }]}>
              <Ionicons name="flame-outline" size={15} color="#FB923C" />
            </View>
            <Text style={styles.summaryNum}>{weekData.filter(d => d.hasActivity).length}/7</Text>
            <Text style={styles.summaryLabel}>Aktif Minggu Ini</Text>
            <Text style={styles.summarySub}>Hari Produktif</Text>
          </View>
        </View>

        {/* Dual Column Layout (Desktop / Tablet / Mobile) */}
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: 30-Day Grid & Activity Inspector */}
          {/* ========================================================================= */}
          <View style={[styles.column, isWide && { flex: 1.2 }]}>
            
            {/* 30-Day Activity Calendar Grid */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <View>
                  <Text style={styles.cardTitle}>Kalender Aktivitas 30 Hari</Text>
                  <Text style={styles.cardSub}>Klik tanggal untuk melihat rincian materi & jurnal</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={styles.legendText}>Materi</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.legendText}>Jurnal</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.legendText}>Tugas</Text>
                  </View>
                </View>
              </View>

              <View style={styles.grid}>
                {daysGrid.map((d, i) => {
                  const isSelected = d.dateStr === selectedDateStr;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.gridCell,
                        d.hasActivity && styles.gridCellActive,
                        isSelected && styles.gridCellSelected,
                      ]}
                      onPress={() => setSelectedDateStr(d.dateStr)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.gridDay, isSelected && styles.gridDaySelected]}>
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
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={16} color="#60A5FA" />
                  <Text style={styles.cardTitle}>
                    {new Date(selectedDateStr).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
                <Text style={styles.badgeEventsCount}>
                  {totalSelectedEvents} Aktivitas
                </Text>
              </View>

              {totalSelectedEvents === 0 ? (
                <View style={styles.emptyDayWrap}>
                  <Ionicons name="cafe-outline" size={24} color="#6B7280" />
                  <Text style={styles.emptyDayText}>Tidak ada catatan materi, jurnal, atau tugas pada hari ini.</Text>
                </View>
              ) : (
                <View style={styles.dayEventList}>
                  
                  {/* Study Notes on Selected Day */}
                  {selectedDayNotes.map(n => (
                    <TouchableOpacity
                      key={n.id}
                      style={styles.eventItem}
                      onPress={() => navigation.navigate('StudyNoteDetail', { noteId: n.id })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.eventBadgeIcon, { backgroundColor: '#1E293B' }]}>
                        <Ionicons name="school" size={15} color="#60A5FA" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={styles.eventSubjectBadge}>{n.subject || 'Mata Kuliah'}</Text>
                          <Text style={styles.eventTimeText}>
                            {new Date(n.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={styles.eventTitle} numberOfLines={1}>{n.title}</Text>
                        <Text style={styles.eventSnippet} numberOfLines={1}>{n.content}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#6B7280" />
                    </TouchableOpacity>
                  ))}

                  {/* Journals on Selected Day */}
                  {selectedDayJournals.map(j => {
                    const mood = moods.find(m => m.type === j.mood);
                    return (
                      <TouchableOpacity
                        key={j.id}
                        style={styles.eventItem}
                        onPress={() => navigation.navigate('JournalEntry', { entryId: j.id })}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.eventBadgeIcon, { backgroundColor: '#143825' }]}>
                          <Text style={{ fontSize: 14 }}>{mood?.emoji || '📝'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.eventHeaderRow}>
                            <Text style={[styles.eventSubjectBadge, { color: '#4ADE80', backgroundColor: '#133522', borderColor: '#1F5A3B' }]}>
                              Jurnal {mood?.label || ''}
                            </Text>
                            <Text style={styles.eventTimeText}>
                              {new Date(j.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <Text style={styles.eventTitle} numberOfLines={1}>{j.title || 'Catatan Refleksi'}</Text>
                          <Text style={styles.eventSnippet} numberOfLines={1}>{j.content}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#6B7280" />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Tasks Due on Selected Day */}
                  {selectedDayTasks.map(t => (
                    <View key={t.id} style={styles.eventItem}>
                      <View style={[styles.eventBadgeIcon, { backgroundColor: '#3B2412' }]}>
                        <Ionicons name="checkbox" size={15} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={[styles.eventSubjectBadge, { color: '#FBBF24', backgroundColor: '#2E1E0C', borderColor: '#593914' }]}>
                            Tugas: {t.subject}
                          </Text>
                          <Text style={[styles.eventTimeText, { color: t.is_completed ? '#4ADE80' : '#F87171' }]}>
                            {t.is_completed ? 'Selesai' : 'Pending'}
                          </Text>
                        </View>
                        <Text style={styles.eventTitle} numberOfLines={1}>{t.title}</Text>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tren Aktivitas 7 Hari Terakhir</Text>
              <View style={styles.barChart}>
                {weekData.map((d, i) => (
                  <View key={i} style={styles.barCol}>
                    <Text style={styles.barEmoji}>{d.mood?.emoji ?? (d.noteCount > 0 ? '📖' : '•')}</Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: d.hasActivity ? '#3B82F6' : '#1E2430',
                          height: d.hasActivity ? Math.min(60, Math.max(20, d.totalEvents * 16)) : 6,
                        },
                      ]}
                    />
                    <Text style={styles.barDay}>{d.day}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Subject Study Breakdown */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <Text style={styles.cardTitle}>Distribusi Materi Kuliah</Text>
                <Text style={styles.cardSubCount}>{notes.length} Catatan</Text>
              </View>
              {subjectStats.length === 0 ? (
                <Text style={styles.emptyStatsText}>Belum ada catatan materi kuliah.</Text>
              ) : (
                subjectStats.map(([subjName, count]) => {
                  const pct = Math.round((count / (notes.length || 1)) * 100);
                  return (
                    <View key={subjName} style={styles.statRow}>
                      <Ionicons name="book-outline" size={13} color="#60A5FA" style={{ marginRight: 6 }} />
                      <Text style={styles.statLabel} numberOfLines={1}>{subjName}</Text>
                      <View style={styles.statBarBg}>
                        <View style={[styles.statBar, { width: `${pct}%` as any, backgroundColor: '#3B82F6' }]} />
                      </View>
                      <Text style={styles.statCount}>{count} ({pct}%)</Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Mood Sebaran Emosi */}
            {moodStats.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeaderBetween}>
                  <Text style={styles.cardTitle}>Sebaran Emosi & Jurnal</Text>
                  <Text style={styles.cardSubCount}>{journals.length} Jurnal</Text>
                </View>
                {moodStats.map(([moodType, count]) => {
                  const mood = moods.find(m => m.type === moodType);
                  const pct = Math.round((count / (journals.length || 1)) * 100);
                  return (
                    <View key={moodType} style={styles.statRow}>
                      <Text style={styles.statEmoji}>{mood?.emoji || '•'}</Text>
                      <Text style={styles.statLabel}>{mood?.label || moodType}</Text>
                      <View style={styles.statBarBg}>
                        <View style={[styles.statBar, { width: `${pct}%` as any, backgroundColor: '#10B981' }]} />
                      </View>
                      <Text style={styles.statCount}>{count} ({pct}%)</Text>
                    </View>
                  );
                })}
              </View>
            )}

          </View>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B0E',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090B0E',
  },
  scroll: {
    paddingHorizontal: 18,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#6B7280',
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
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    minWidth: 140,
    backgroundColor: '#11141C',
    borderRadius: 12,
    padding: 14,
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
    fontSize: 10,
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
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    fontSize: 9.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'flex-start',
  },
  gridCell: {
    width: 42,
    height: 48,
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
    fontSize: 9,
    marginTop: 1,
  },
  badgeEventsCount: {
    backgroundColor: '#1E293B',
    color: '#60A5FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 10.5,
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
    fontSize: 9.5,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#253856',
  },
  eventTimeText: {
    color: '#6B7280',
    fontSize: 9.5,
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
    height: 90,
    paddingTop: 10,
  },
  barCol: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  barEmoji: {
    fontSize: 12,
  },
  bar: {
    width: 14,
    borderRadius: 4,
  },
  barDay: {
    color: '#6B7280',
    fontSize: 10,
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
    fontSize: 10.5,
    minWidth: 50,
    textAlign: 'right',
  },
  emptyStatsText: {
    color: '#6B7280',
    fontSize: 11.5,
    paddingVertical: 10,
  },
});
