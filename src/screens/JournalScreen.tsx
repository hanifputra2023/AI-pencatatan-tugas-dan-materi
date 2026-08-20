import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { JournalEntry } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { confirmAction } from '../lib/alert';

export default function JournalScreen() {
  const { user } = useAuth();
  const { moods } = useMoods();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'published' | 'drafts'>('published');
  const [filterMood, setFilterMood] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    let query = supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const { data } = await query;
    if (data) setEntries(data as JournalEntry[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEntries();

    if (!user) return;

    const channel = supabase
      .channel('journal_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${user.id}` }, payload => {
        if (payload.eventType === 'INSERT') {
          const newEntry = payload.new as JournalEntry;
          setEntries(prev => [newEntry, ...prev.filter(e => e.id !== newEntry.id)]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as JournalEntry;
          setEntries(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        } else if (payload.eventType === 'DELETE') {
          const oldId = payload.old.id;
          setEntries(prev => prev.filter(e => e.id !== oldId));
        }
      })
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

  const deleteEntry = (id: string, isDraft?: boolean) => {
    confirmAction(
      isDraft ? 'Hapus Draf?' : 'Hapus Jurnal?',
      'Catatan ini akan dihapus permanen.',
      async () => {
        setEntries(prev => prev.filter(e => e.id !== id));
        if (user) {
          await supabase.from('journal_entries').delete().eq('id', id);
        }
      },
      'Hapus'
    );
  };

  const publishedEntries = entries.filter(e => !e.is_draft);
  const draftEntries = entries.filter(e => !!e.is_draft);

  const displayedEntries = (activeTab === 'drafts' ? draftEntries : publishedEntries).filter(e => {
    if (!filterMood) return true;
    return e.mood === filterMood;
  });

  const renderItem = ({ item }: { item: JournalEntry }) => {
    const mood = moods.find(m => m.type === item.mood);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, isWide && styles.cardWide]}
        onPress={() => navigation.navigate('JournalEntry', { entryId: item.id })}
        onLongPress={() => deleteEntry(item.id, item.is_draft)}
      >
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            {item.is_draft && (
              <View style={[styles.draftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#3B2412', borderColor: isLightMode ? '#FCD34D' : '#78350F' }]}>
                <Ionicons name="document-text" size={10} color={isLightMode ? '#D97706' : '#FBBF24'} />
                <Text style={[styles.draftBadgeText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>Draf</Text>
              </View>
            )}
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title || (item.is_draft ? 'Draf Tanpa Judul' : 'Catatan Harian')}
            </Text>
          </View>
          <Text style={styles.cardEmoji}>{mood?.emoji || '•'}</Text>
        </View>
        <Text style={[styles.cardContent, { color: theme.subtext }]} numberOfLines={3}>{item.content}</Text>
        <View style={styles.cardFooter}>
          <Text style={[styles.cardDate, { color: theme.muted }]}>
            {new Date(item.created_at).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          {item.tags?.length > 0 && (
            <View style={styles.tagsRow}>
              {item.tags.slice(0, 3).map(tag => (
                <View key={tag} style={[styles.tag, { backgroundColor: theme.cardInner }]}>
                  <Text style={[styles.tagText, { color: theme.accentLight }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Jurnal Refleksi</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>Catatan perasaan & refleksi harianmu</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('JournalEntry', {})}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Tulis Jurnal</Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Segment (Jurnal vs Draf) */}
      <View style={styles.tabSegmentContainer}>
        <TouchableOpacity
          style={[
            styles.tabSegmentBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            activeTab === 'published' && [styles.tabSegmentBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
          ]}
          onPress={() => setActiveTab('published')}
        >
          <Ionicons name="book" size={13} color={activeTab === 'published' ? theme.accentLight : theme.subtext} />
          <Text style={[styles.tabSegmentText, { color: theme.subtext }, activeTab === 'published' && [styles.tabSegmentTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
            Semua Jurnal ({publishedEntries.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabSegmentBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            activeTab === 'drafts' && [styles.tabSegmentBtnActive, { backgroundColor: isLightMode ? '#FEF3C7' : '#332014', borderColor: isLightMode ? '#F59E0B' : '#78350F' }]
          ]}
          onPress={() => setActiveTab('drafts')}
        >
          <Ionicons name="document-text" size={13} color={activeTab === 'drafts' ? (isLightMode ? '#D97706' : '#FBBF24') : theme.subtext} />
          <Text style={[styles.tabSegmentText, { color: theme.subtext }, activeTab === 'drafts' && [styles.tabSegmentTextActive, { color: isLightMode ? '#B45309' : '#FDE68A', fontWeight: '700' }]]}>
            Draf Saya ({draftEntries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mood Filter Chips */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            { backgroundColor: theme.card, borderColor: theme.border },
            !filterMood && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
          ]}
          onPress={() => setFilterMood(null)}
        >
          <Text style={[styles.filterText, { color: theme.subtext }, !filterMood && [styles.filterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>Semua Mood</Text>
        </TouchableOpacity>
        {moods.map(m => (
          <TouchableOpacity
            key={m.type}
            style={[
              styles.filterChip,
              { backgroundColor: theme.card, borderColor: theme.border },
              filterMood === m.type && [styles.filterChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
            ]}
            onPress={() => setFilterMood(filterMood === m.type ? null : m.type)}
          >
            <Text style={[styles.filterText, { color: theme.subtext }, filterMood === m.type && [styles.filterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
              {m.emoji} {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.subtext} /></View>
      ) : displayedEntries.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name={activeTab === 'drafts' ? 'document-text-outline' : 'book-outline'} size={32} color={theme.muted} style={{ marginBottom: 10 }} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {activeTab === 'drafts' ? 'Tidak ada draf tersimpan' : 'Belum ada catatan jurnal'}
          </Text>
          <Text style={[styles.emptySub, { color: theme.subtext }]}>
            {activeTab === 'drafts' ? 'Tulisan yang kamu simpan sebagai draf akan muncul di sini.' : 'Mulai tulis jurnal pertama kamu hari ini.'}
          </Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.primary }]} onPress={() => navigation.navigate('JournalEntry', {})}>
            <Text style={styles.emptyBtnText}>+ Tulis Jurnal Baru</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedEntries}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={isWide ? 2 : 1}
          key={isWide ? 'grid-2' : 'list-1'}
          columnWrapperStyle={isWide ? { gap: 12 } : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1117',
  },
  innerContainer: {
    flex: 1,
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1440,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2430',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E384A',
    gap: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  tabSegmentContainer: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 10,
  },
  tabSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  tabSegmentBtnActive: {
    shadowOpacity: 0.1,
  },
  tabSegmentText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabSegmentTextActive: {
    fontSize: 12,
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  draftBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#141822',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 10,
  },
  card: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
  },
  cardWide: {
    minHeight: 120,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  cardEmoji: {
    fontSize: 16,
    marginLeft: 8,
  },
  cardContent: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  cardDate: {
    color: '#6B7280',
    fontSize: 11,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  tag: {
    backgroundColor: '#1C2230',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#D1D5DB',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: '#1E2430',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E384A',
  },
  emptyBtnText: {
    color: '#F3F4F6',
    fontWeight: '600',
    fontSize: 12,
  },
});
