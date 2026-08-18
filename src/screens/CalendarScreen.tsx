import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { supabase } from '../lib/supabase';
import { JournalEntry } from '../types';
import { useResponsive } from '../hooks/useResponsive';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const { moods } = useMoods();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data } = await supabase
      .from('journal_entries')
      .select('id, mood, created_at')
      .eq('user_id', user.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });
    if (data) setEntries(data as JournalEntry[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEntries();

    if (!user) return;

    const channel = supabase
      .channel('calendar_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${user.id}` }, () => fetchEntries())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchEntries]);

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
  );

  const getDaysGrid = () => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toDateString();
      const entry = entries.find(e => new Date(e.created_at).toDateString() === dateStr);
      const mood = entry ? moods.find(m => m.type === entry.mood) : null;
      days.push({ date, mood, hasEntry: !!entry });
    }
    return days;
  };

  const getMoodStats = () => {
    const stats: Record<string, number> = {};
    entries.forEach(e => { stats[e.mood] = (stats[e.mood] || 0) + 1; });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 4);
  };

  const getWeekData = () => {
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toDateString();
      const entry = entries.find(e => new Date(e.created_at).toDateString() === dateStr);
      const mood = entry ? moods.find(m => m.type === entry.mood) : null;
      week.push({ day: DAYS[date.getDay()], mood, hasEntry: !!entry });
    }
    return week;
  };

  const daysGrid = getDaysGrid();
  const moodStats = getMoodStats();
  const weekData = getWeekData();
  const topMood = moodStats[0] ? moods.find(m => m.type === moodStats[0][0]) : null;

  if (loading) {
    return <View style={styles.loaderCenter}><ActivityIndicator size="small" color="#9CA3AF" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        <View style={styles.header}>
          <Text style={styles.title}>Statistik & Emosi</Text>
          <Text style={styles.subtitle}>Rekapitulasi 30 hari terakhir</Text>
        </View>

        {/* Summary Metric Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNum}>{entries.length}</Text>
            <Text style={styles.summaryLabel}>Total Jurnal</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNum}>{topMood?.emoji ?? '—'}</Text>
            <Text style={styles.summaryLabel}>Dominan</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNum}>{weekData.filter(d => d.hasEntry).length}/7</Text>
            <Text style={styles.summaryLabel}>Minggu Ini</Text>
          </View>
        </View>

        {/* Dual Column Layout */}
        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          
          {/* Left Column (Weekly Chart + Stats) */}
          <View style={[styles.column, isWide && { flex: 1 }]}>
            
            {/* 7-Day Bar Chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Aktivitas 7 Hari Terakhir</Text>
              <View style={styles.barChart}>
                {weekData.map((d, i) => (
                  <View key={i} style={styles.barCol}>
                    <Text style={styles.barEmoji}>{d.mood?.emoji ?? '•'}</Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: d.hasEntry ? '#3B82F6' : '#1F2430',
                          height: d.hasEntry ? 36 : 6,
                        },
                      ]}
                    />
                    <Text style={styles.barDay}>{d.day}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Distribution */}
            {moodStats.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Sebaran Emosi</Text>
                {moodStats.map(([moodType, count]) => {
                  const mood = moods.find(m => m.type === moodType);
                  const pct = Math.round((count / entries.length) * 100);
                  return (
                    <View key={moodType} style={styles.statRow}>
                      <Text style={styles.statEmoji}>{mood?.emoji || '•'}</Text>
                      <Text style={styles.statLabel}>{mood?.label || moodType}</Text>
                      <View style={styles.statBarBg}>
                        <View style={[styles.statBar, { width: `${pct}%` as any }]} />
                      </View>
                      <Text style={styles.statPct}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Right Column (30-Day Grid) */}
          <View style={[styles.column, isWide && { flex: 1.1 }]}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kalender 30 Hari</Text>
              <View style={styles.grid}>
                {daysGrid.map((d, i) => (
                  <View
                    key={i}
                    style={[
                      styles.gridCell,
                      d.hasEntry && styles.gridCellActive,
                    ]}
                  >
                    <Text style={styles.gridEmoji}>{d.mood?.emoji ?? ''}</Text>
                    <Text style={styles.gridDay}>{d.date.getDate()}</Text>
                  </View>
                ))}
              </View>
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
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  summaryNum: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  summaryLabel: {
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
  card: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#202634',
  },
  cardTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 14,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  barCol: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  barEmoji: {
    fontSize: 14,
  },
  bar: {
    width: 14,
    borderRadius: 4,
  },
  barDay: {
    color: '#6B7280',
    fontSize: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  gridCell: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1D2432',
    backgroundColor: '#10131A',
  },
  gridCellActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#182338',
  },
  gridEmoji: {
    fontSize: 14,
  },
  gridDay: {
    color: '#6B7280',
    fontSize: 8,
    marginTop: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  statEmoji: {
    fontSize: 14,
    width: 20,
  },
  statLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    width: 60,
  },
  statBarBg: {
    flex: 1,
    backgroundColor: '#1E2430',
    borderRadius: 4,
    height: 6,
  },
  statBar: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  statPct: {
    color: '#6B7280',
    fontSize: 11,
    width: 30,
    textAlign: 'right',
  },
});
