import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { StudyNote, StudentTask } from '../types';
import { RootStackParamList, TabParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { confirmAction, showAlert } from '../lib/alert';
import SubjectManagerModal from '../components/SubjectManagerModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const POMODORO_DURATIONS = [
  { label: '25 Menit (Fokus)', value: 25 * 60 },
  { label: '50 Menit (Deep Work)', value: 50 * 60 },
  { label: '5 Menit (Istirahat)', value: 5 * 60 },
];

export default function StudyNotesScreen() {
  const { user } = useAuth();
  const { subjects } = useSubjects();
  const { theme, isLightMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Study'>>();
  const { isDesktop, isTablet, isMobile } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'pomodoro'>(
    route.params?.initialTab || 'notes'
  );

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  // Notes state
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [draftNote, setDraftNote] = useState<any>(null);
  const [selectedSubject, setSelectedSubject] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Subject Manager Modal
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<StudentTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Pomodoro state
  const [pomoTimeLeft, setPomoTimeLeft] = useState(25 * 60);
  const [pomoTotalTime, setPomoTotalTime] = useState(25 * 60);
  const [pomoActive, setPomoActive] = useState(false);
  const pomoTimerRef = useRef<any>(null);

  useEffect(() => {
    if (subjects.length > 0 && !newTaskSubject) {
      setNewTaskSubject(subjects[0].name);
    }
  }, [subjects]);

  const checkDraft = useCallback(async () => {
    try {
      const key = `@study_note_draft_${user?.id || 'anonymous'}`;
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.title?.trim() || parsed.content?.trim())) {
          setDraftNote(parsed);
          return;
        }
      }
    } catch (e) {}
    setDraftNote(null);
  }, [user]);

  const handleDiscardDraft = () => {
    confirmAction(
      'Hapus Draf Catatan?',
      'Draf catatan yang belum disimpan ini akan dibersihkan.',
      async () => {
        try {
          const key = `@study_note_draft_${user?.id || 'anonymous'}`;
          await AsyncStorage.removeItem(key);
          setDraftNote(null);
          showAlert('Draf Dihapus', 'Draf catatan berhasil dibersihkan.');
        } catch (e) {}
      },
      'Hapus Draf'
    );
  };

  const fetchNotes = useCallback(async () => {
    if (!user) {
      setLoadingNotes(false);
      return;
    }
    const { data } = await supabase
      .from('study_notes')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setNotes(data as StudyNote[]);
    setLoadingNotes(false);
  }, [user]);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setLoadingTasks(false);
      return;
    }
    const { data } = await supabase
      .from('student_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('is_completed', { ascending: true })
      .order('created_at', { ascending: false });
    if (data) setTasks(data as StudentTask[]);
    setLoadingTasks(false);
  }, [user]);

  useEffect(() => {
    fetchNotes();
    fetchTasks();
    checkDraft();

    if (!user) return;

    const channel = supabase
      .channel('study_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes', filter: `user_id=eq.${user.id}` }, () => fetchNotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_tasks', filter: `user_id=eq.${user.id}` }, () => fetchTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotes, fetchTasks, checkDraft]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
      fetchTasks();
      checkDraft();
    }, [fetchNotes, fetchTasks, checkDraft])
  );

  // Pomodoro Timer Controller
  useEffect(() => {
    if (pomoActive) {
      pomoTimerRef.current = setInterval(() => {
        setPomoTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(pomoTimerRef.current);
            setPomoActive(false);
            showAlert('🎉 Sesi Selesai!', 'Kerja bagus! Waktunya istirahat sejenak untuk menyegarkan pikiran.');
            return pomoTotalTime;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (pomoTimerRef.current) clearInterval(pomoTimerRef.current);
    }
    return () => {
      if (pomoTimerRef.current) clearInterval(pomoTimerRef.current);
    };
  }, [pomoActive, pomoTotalTime]);

  const togglePomodoro = () => {
    setPomoActive(!pomoActive);
  };

  const resetPomodoro = () => {
    setPomoActive(false);
    setPomoTimeLeft(pomoTotalTime);
  };

  const setPomoDuration = (seconds: number) => {
    setPomoActive(false);
    setPomoTotalTime(seconds);
    setPomoTimeLeft(seconds);
  };

  const formatPomoTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Add Task
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      showAlert('Perhatian', 'Judul tugas wajib diisi.');
      return;
    }
    if (!user) return;

    const chosenSubject = newTaskSubject.trim() || (subjects.length > 0 ? subjects[0].name : 'Umum');

    const newTask: Partial<StudentTask> = {
      user_id: user.id,
      title: newTaskTitle.trim(),
      subject: chosenSubject,
      priority: newTaskPriority,
      due_date: newTaskDueDate.trim() || null,
      is_completed: false,
    };

    const { data, error } = await supabase.from('student_tasks').insert(newTask).select().single();
    if (error) {
      showAlert('Gagal Menyimpan', error.message);
    } else if (data) {
      setTasks(prev => [data as StudentTask, ...prev]);
      setNewTaskTitle('');
      setNewTaskDueDate('');
      if (isMobile) setShowTaskForm(false);
      showAlert('Sukses', 'Tugas kuliah berhasil ditambahkan.');
    }
  };

  // Toggle Task Completion
  const toggleTask = async (task: StudentTask) => {
    const newStatus = !task.is_completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_completed: newStatus } : t));
    if (user) {
      await supabase.from('student_tasks').update({ is_completed: newStatus }).eq('id', task.id);
    }
  };

  // Delete Task
  const deleteTask = (taskId: string) => {
    confirmAction('Hapus Tugas?', 'Tugas ini akan dihapus dari daftar.', async () => {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (user) {
        await supabase.from('student_tasks').delete().eq('id', taskId);
      }
    }, 'Hapus');
  };

  // Delete Note
  const deleteNote = (noteId: string) => {
    confirmAction('Hapus Catatan?', 'Catatan kuliah ini akan dihapus permanen.', async () => {
      setNotes(prev => prev.filter(n => n.id !== noteId));
      if (user) {
        await supabase.from('study_notes').delete().eq('id', noteId);
      }
    }, 'Hapus');
  };

  const filteredNotes = notes.filter(n => {
    const matchSubject = selectedSubject === 'Semua' || n.subject?.toLowerCase() === selectedSubject.toLowerCase();
    const matchSearch = !searchQuery || n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSubject && matchSearch;
  });

  const filteredTasks = tasks.filter(t => {
    if (taskFilter === 'pending') return !t.is_completed;
    if (taskFilter === 'completed') return t.is_completed;
    return true;
  });

  // Collect all active subject names for top filters
  const allFilterSubjects = ['Semua', ...Array.from(new Set([...subjects.map(s => s.name), ...notes.map(n => n.subject?.trim()).filter(Boolean)]))];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Belajar & Kuliah</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>Catatan pintar AI, manajemen tugas & fokus nugas</Text>
        </View>

        {activeTab === 'notes' && (
          <View style={styles.topActionBtnGroup}>
            <TouchableOpacity
              style={[
                styles.scanQuickTopBtn,
                {
                  backgroundColor: isLightMode ? '#EEF2FF' : '#1E1B4B',
                  borderColor: isLightMode ? '#C7D2FE' : '#3730A3',
                }
              ]}
              onPress={() => navigation.navigate('StudyNoteDetail', { autoOpenScan: true })}
            >
              <Ionicons name="camera" size={15} color={isLightMode ? '#4F46E5' : '#A5B4FC'} />
              <Text style={[styles.scanQuickTopText, { color: isLightMode ? '#4F46E5' : '#A5B4FC' }]}>
                Scan Foto
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              onPress={() => navigation.navigate('StudyNoteDetail', {})}
            >
              <Ionicons name="add" size={17} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Catatan Baru</Text>
            </TouchableOpacity>
          </View>
        )}


        {activeTab === 'tasks' && isMobile && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.primary }]}
            onPress={() => setShowTaskForm(!showTaskForm)}
          >
            <Ionicons name={showTaskForm ? 'close' : 'add'} size={17} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{showTaskForm ? 'Tutup' : 'Tugas Baru'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mode Switcher Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'notes' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('notes')}
        >
          <Ionicons name="document-text-outline" size={15} color={activeTab === 'notes' ? theme.accentLight : theme.subtext} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, { color: activeTab === 'notes' ? theme.accentLight : theme.subtext }]}>
            Catatan ({notes.length}){draftNote ? ' • 📝 Draf' : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'tasks' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('tasks')}
        >
          <Ionicons name="checkbox-outline" size={15} color={activeTab === 'tasks' ? theme.accentLight : theme.subtext} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, { color: activeTab === 'tasks' ? theme.accentLight : theme.subtext }]}>
            Tugas & Deadline ({tasks.filter(t => !t.is_completed).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pomodoro' && [styles.tabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.border }]]}
          onPress={() => setActiveTab('pomodoro')}
        >
          <Ionicons name="timer-outline" size={15} color={activeTab === 'pomodoro' ? theme.accentLight : theme.subtext} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, { color: activeTab === 'pomodoro' ? theme.accentLight : theme.subtext }]}>
            Fokus Nugas
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* TAB 1: STUDY NOTES (RESPONSIVE MASONRY GRID) */}
      {/* ========================================================================= */}
      {activeTab === 'notes' && (
        <View style={{ flex: 1 }}>

          {/* Controls Area (Clean Search Bar + Filter Pills) */}
          <View style={styles.controlsArea}>

            {/* Dedicated Search Input Bar */}
            <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={16} color={theme.subtext} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Cari materi kuliah, rumus, judul bab, atau isi catatan..."
                placeholderTextColor={theme.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={16} color={theme.subtext} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Search feedback info badge when searching */}
            {searchQuery ? (
              <View style={[
                styles.searchFeedbackRow,
                {
                  backgroundColor: isLightMode ? '#EFF6FF' : '#101726',
                  borderColor: isLightMode ? '#BFDBFE' : '#1D2A42',
                }
              ]}>
                <Text style={[
                  styles.searchFeedbackText,
                  { color: isLightMode ? '#1D4ED8' : '#93C5FD' }
                ]}>
                  Menemukan {filteredNotes.length} catatan untuk "{searchQuery}"
                </Text>
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={[styles.resetSearchText, { color: theme.accentLight }]}>Reset</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Subject Filter Row + Manage Courses Button */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
              {draftNote ? (
                <TouchableOpacity
                  style={[styles.subjectChip, { backgroundColor: isLightMode ? '#FEF3C7' : '#261C08', borderColor: isLightMode ? '#FCD34D' : '#F59E0B' }]}
                  onPress={() => navigation.navigate('StudyNoteDetail', {})}
                >
                  <Text style={[styles.subjectChipText, { color: isLightMode ? '#B45309' : '#FBBF24', fontWeight: '700' }]}>
                    Draf Aktif (1)
                  </Text>
                </TouchableOpacity>
              ) : null}

              {allFilterSubjects.map(s => {
                const isSelected = selectedSubject.toLowerCase() === s.toLowerCase();
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.subjectChip,
                      { backgroundColor: theme.card, borderColor: theme.border },
                      isSelected && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setSelectedSubject(s)}
                  >
                    <Text style={[styles.subjectChipText, { color: theme.subtext }, isSelected && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.manageSubjFilterBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={() => setShowSubjectModal(true)}
              >
                <Ionicons name="settings-outline" size={13} color={theme.accentLight} />
                <Text style={[styles.manageSubjFilterText, { color: theme.accentLight }]}>Kelola Matkul</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {loadingNotes ? (
            <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.subtext} /></View>
          ) : filteredNotes.length === 0 ? (
            <View style={styles.emptyWrap}>
              {/* If draft exists, show draft card even if note list is empty */}
              {draftNote ? (
                <View style={[styles.draftCard, { backgroundColor: isLightMode ? '#FFFBEB' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#B45309', width: '100%', marginBottom: 20 }]}>
                  <View style={styles.draftCardHeader}>
                    <View style={[styles.draftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#382806', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
                      <Ionicons name="document-text" size={12} color="#FBBF24" />
                      <Text style={[styles.draftBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>DRAF BELUM TERSIMPAN</Text>
                    </View>
                    <TouchableOpacity onPress={handleDiscardDraft} style={[styles.draftDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418' }]}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.draftTitle, { color: isLightMode ? '#78350F' : '#FEF3C7' }]} numberOfLines={1}>
                    {draftNote.title || 'Catatan Baru (Tanpa Judul)'}
                  </Text>
                  <Text style={[styles.draftSnippet, { color: theme.subtext }]} numberOfLines={2}>
                    {draftNote.content || 'Belum ada isi materi...'}
                  </Text>

                  <View style={[styles.draftFooter, { borderTopColor: isLightMode ? '#FDE68A' : '#2C220E' }]}>
                    <View style={styles.draftMetaRow}>
                      <Ionicons name="school-outline" size={12} color={isLightMode ? '#B45309' : theme.muted} />
                      <Text style={[styles.draftSubjectText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>{draftNote.subject || 'Umum'}</Text>
                      {draftNote.savedAt ? (
                        <Text style={[styles.draftTimeText, { color: theme.muted }]}>
                          • {new Date(draftNote.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={[styles.draftContinueBtn, { backgroundColor: isLightMode ? '#D97706' : '#D97706' }]}
                      onPress={() => navigation.navigate('StudyNoteDetail', {})}
                    >
                      <Ionicons name="create" size={13} color="#FFFFFF" />
                      <Text style={styles.draftContinueText}>Lanjutkan Menulis</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={[styles.emptyIconBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Ionicons name="book-outline" size={28} color={theme.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Belum ada catatan kuliah</Text>
              <Text style={[styles.emptySub, { color: theme.subtext }]}>Catat materi kuliah dan biarkan AI merangkumnya jadi poin ujian.</Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('StudyNoteDetail', {})}
              >
                <Text style={styles.emptyAddText}>+ Buat Catatan Pertama</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredNotes}
              keyExtractor={item => item.id}
              numColumns={isWide ? 2 : 1}
              key={isWide ? 'grid-2' : 'list-1'}
              columnWrapperStyle={isWide ? { gap: 12 } : undefined}
              contentContainerStyle={styles.notesList}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                draftNote ? (
                  <View style={[styles.draftCard, { backgroundColor: isLightMode ? '#FFFBEB' : '#1C1608', borderColor: isLightMode ? '#FCD34D' : '#B45309' }]}>
                    <View style={styles.draftCardHeader}>
                      <View style={[styles.draftBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#382806', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}>
                        <Ionicons name="document-text" size={12} color="#FBBF24" />
                        <Text style={[styles.draftBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>DRAF BELUM TERSIMPAN</Text>
                      </View>
                      <TouchableOpacity onPress={handleDiscardDraft} style={[styles.draftDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1418' }]}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.draftTitle, { color: isLightMode ? '#78350F' : '#FEF3C7' }]} numberOfLines={1}>
                      {draftNote.title || 'Catatan Baru (Tanpa Judul)'}
                    </Text>
                    <Text style={[styles.draftSnippet, { color: theme.subtext }]} numberOfLines={2}>
                      {draftNote.content || 'Belum ada isi materi...'}
                    </Text>

                    <View style={[styles.draftFooter, { borderTopColor: isLightMode ? '#FDE68A' : '#2C220E' }]}>
                      <View style={styles.draftMetaRow}>
                        <Ionicons name="school-outline" size={12} color={isLightMode ? '#B45309' : theme.muted} />
                        <Text style={[styles.draftSubjectText, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>{draftNote.subject || 'Umum'}</Text>
                        {draftNote.savedAt ? (
                          <Text style={[styles.draftTimeText, { color: theme.muted }]}>
                            • {new Date(draftNote.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={[styles.draftContinueBtn, { backgroundColor: '#D97706' }]}
                        onPress={() => navigation.navigate('StudyNoteDetail', {})}
                      >
                        <Ionicons name="create" size={13} color="#FFFFFF" />
                        <Text style={styles.draftContinueText}>Lanjutkan Menulis</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const words = item.content?.trim() ? item.content.trim().split(/\s+/).length : 0;
                const readMin = Math.max(1, Math.ceil(words / 160));
                return (
                  <TouchableOpacity
                    style={[styles.noteCard, { backgroundColor: theme.card, borderColor: theme.border }, isWide && styles.noteCardWide]}
                    onPress={() => navigation.navigate('StudyNoteDetail', { noteId: item.id })}
                    onLongPress={() => deleteNote(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.noteTopRow}>
                      <View style={[styles.subjectBadge, { backgroundColor: theme.accentBg }]}>
                        <Text style={[styles.subjectBadgeText, { color: theme.accentLight }]}>{item.subject}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.noteReadTime, { color: theme.muted }]}>⏱️ {readMin} mnt</Text>
                        <Text style={[styles.noteDate, { color: theme.muted }]}>
                          {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.noteSnippet, { color: theme.subtext }]} numberOfLines={3}>{item.content}</Text>

                    {/* AI Badges & Open Detail Action */}
                    <View style={styles.noteAiFooter}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        {item.summary ? (
                          <View style={[styles.aiBadge, { backgroundColor: theme.accentBg }]}>
                            <Ionicons name="sparkles" size={11} color={theme.accentLight} />
                            <Text style={[styles.aiBadgeText, { color: theme.accentLight }]}>Rangkuman AI</Text>
                          </View>
                        ) : null}
                        {item.quiz_data && item.quiz_data.length > 0 ? (
                          <View style={[styles.aiBadge, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B' }]}>
                            <Ionicons name="school" size={11} color={isLightMode ? '#16A34A' : '#34D399'} />
                            <Text style={[styles.aiBadgeText, { color: isLightMode ? '#16A34A' : '#34D399' }]}>{item.quiz_data.length} Soal</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={[styles.openDetailPill, { backgroundColor: theme.accentBg }]}>
                        <Text style={[styles.openDetailText, { color: theme.accentLight }]}>Detail</Text>
                        <Ionicons name="arrow-forward" size={11} color={theme.accentLight} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TASKS & DEADLINES (RESPONSIVE DUAL-COLUMN DESKTOP) */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          <View style={[styles.taskLayout, isWide && styles.taskLayoutWide]}>

            {/* Left Column (Create Task Form - Permanent on Desktop, Collapsible on Mobile) */}
            {(isWide || showTaskForm) && (
              <View style={[styles.taskFormColumn, isWide && styles.taskFormColumnWide]}>
                <View style={[styles.taskFormCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.taskFormTitle, { color: theme.text }]}>Tambah Tugas Kuliah</Text>

                  <TextInput
                    style={[styles.taskInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    placeholder="Nama tugas (misal: Laporan Praktikum Bab 2)"
                    placeholderTextColor={theme.muted}
                    value={newTaskTitle}
                    onChangeText={setNewTaskTitle}
                  />

                  {/* Course Picker for Task */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Pilih Mata Kuliah:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.subjectRow, { marginBottom: 10 }]}>
                    {subjects.map(s => {
                      const isSel = newTaskSubject.toLowerCase() === s.name.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[
                            styles.subjectChip,
                            { backgroundColor: theme.cardInner, borderColor: theme.border },
                            isSel && [styles.subjectChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => setNewTaskSubject(s.name)}
                        >
                          <Text style={[styles.subjectChipText, { color: theme.subtext }, isSel && [styles.subjectChipTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.addNewSubjChip, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
                      onPress={() => setShowSubjectModal(true)}
                    >
                      <Ionicons name="add" size={13} color={theme.accentLight} />
                      <Text style={[styles.addNewSubjText, { color: theme.accentLight }]}>Matkul Baru</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {/* Deadline Input */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tenggat / Deadline:</Text>
                  <TextInput
                    style={[styles.taskInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                    placeholder="Misal: Besok 23:59, 25 Okt"
                    placeholderTextColor={theme.muted}
                    value={newTaskDueDate}
                    onChangeText={setNewTaskDueDate}
                  />

                  {/* Priority Picker */}
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tingkat Prioritas:</Text>
                  <View style={styles.priorityRow}>
                    {(['high', 'medium', 'low'] as const).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.priorityChip,
                          { backgroundColor: theme.cardInner, borderColor: theme.border },
                          newTaskPriority === p && [styles.priorityChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                        ]}
                        onPress={() => setNewTaskPriority(p)}
                      >
                        <Text style={[styles.priorityText, { color: theme.subtext }, newTaskPriority === p && [styles.priorityTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                          {p === 'high' ? '🔥 Mendesak' : p === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={[styles.saveTaskBtn, { backgroundColor: theme.primary }]} onPress={handleAddTask}>
                    <Text style={styles.saveTaskBtnText}>+ Simpan Tugas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Right Column (Tasks Filter & Lists) */}
            <View style={[styles.taskListColumn, isWide && styles.taskListColumnWide]}>

              {/* Filter Tabs */}
              <View style={styles.taskFilterRow}>
                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'pending' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('pending')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'pending' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Belum Selesai ({tasks.filter(t => !t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'completed' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('completed')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'completed' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Selesai ({tasks.filter(t => t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.taskFilterChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    taskFilter === 'all' && [styles.taskFilterActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setTaskFilter('all')}
                >
                  <Text style={[styles.taskFilterText, { color: theme.subtext }, taskFilter === 'all' && [styles.taskFilterTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    Semua ({tasks.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingTasks ? (
                <View style={styles.loaderCenter}><ActivityIndicator size="small" color={theme.subtext} /></View>
              ) : filteredTasks.length === 0 ? (
                <View style={[styles.emptyTaskWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Ionicons name="checkbox-outline" size={32} color={theme.muted} style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>Tidak ada tugas dalam kategori ini</Text>
                  <Text style={[styles.emptySub, { color: theme.subtext }]}>Semua rapi dan terkontrol.</Text>
                </View>
              ) : (
                <View style={styles.taskListContainer}>
                  {filteredTasks.map(t => {
                    const isHigh = t.priority === 'high';
                    return (
                      <View key={t.id} style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.border }, t.is_completed && styles.taskCardDone]}>
                        <TouchableOpacity onPress={() => toggleTask(t)} style={styles.taskCheckbox}>
                          <View style={[styles.taskCircle, { borderColor: theme.border }, t.is_completed && [styles.taskCircleActive, { backgroundColor: theme.primary, borderColor: theme.primary }]]}>
                            {t.is_completed && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                          </View>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                          <View style={styles.taskHeaderRow}>
                            <View style={[styles.taskSubjectBadge, { backgroundColor: theme.accentBg }]}>
                              <Text style={[styles.taskSubjectText, { color: theme.accentLight }]}>{t.subject}</Text>
                            </View>
                            {t.due_date ? (
                              <View style={[
                                styles.dueBadge,
                                { backgroundColor: theme.cardInner },
                                isHigh && {
                                  backgroundColor: isLightMode ? '#FEE2E2' : '#2B1417',
                                  borderColor: isLightMode ? '#FECACA' : '#451A20',
                                  borderWidth: 1,
                                }
                              ]}>
                                <Ionicons name="calendar-outline" size={11} color={isHigh ? (isLightMode ? '#DC2626' : '#EF4444') : theme.subtext} />
                                <Text style={[
                                  styles.dueText,
                                  { color: theme.subtext },
                                  isHigh && { color: isLightMode ? '#DC2626' : '#EF4444', fontWeight: '600' }
                                ]}>
                                  {t.due_date}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Text style={[styles.taskTitle, { color: theme.text }, t.is_completed && [styles.taskTitleDone, { color: theme.muted }]]}>
                            {t.title}
                          </Text>
                        </View>

                        <TouchableOpacity onPress={() => deleteTask(t.id)} style={styles.deleteTaskBtn}>
                          <Ionicons name="trash-outline" size={14} color={theme.muted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

            </View>

          </View>

        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: POMODORO FOCUS TIMER (CENTERED CONTAINER) */}
      {/* ========================================================================= */}
      {activeTab === 'pomodoro' && (
        <ScrollView contentContainerStyle={styles.pomodoroContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.pomodoroCenterBox}>

            <Text style={[styles.pomoHeader, { color: theme.text }]}>Studio Fokus Belajar</Text>
            <Text style={[styles.pomoSub, { color: theme.subtext }]}>Tingkatkan konsentrasi belajar dengan teknik Pomodoro teruji.</Text>

            {/* Duration Selector */}
            <View style={styles.pomoPresetsRow}>
              {POMODORO_DURATIONS.map(d => (
                <TouchableOpacity
                  key={d.value}
                  style={[
                    styles.pomoPresetChip,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    pomoTotalTime === d.value && [styles.pomoPresetActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                  ]}
                  onPress={() => setPomoDuration(d.value)}
                >
                  <Text style={[styles.pomoPresetText, { color: theme.subtext }, pomoTotalTime === d.value && [styles.pomoPresetTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Big Timer Circle Display */}
            <View style={[styles.pomoClockCircle, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.pomoTimerText, { color: theme.text }]}>{formatPomoTime(pomoTimeLeft)}</Text>
              <Text style={[styles.pomoStatusText, { color: theme.subtext }]}>
                {pomoActive ? 'Sedang Fokus Nugas...' : 'Siap Mulai'}
              </Text>
            </View>

            {/* Controller Buttons */}
            <View style={styles.pomoControlsRow}>
              <TouchableOpacity style={[styles.pomoResetBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={resetPomodoro}>
                <Ionicons name="refresh" size={16} color={theme.subtext} />
                <Text style={[styles.pomoResetText, { color: theme.subtext }]}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pomoPlayBtn, { backgroundColor: theme.primary }, pomoActive && styles.pomoPlayBtnPause]}
                onPress={togglePomodoro}
              >
                <Ionicons name={pomoActive ? 'pause' : 'play'} size={18} color="#FFFFFF" />
                <Text style={styles.pomoPlayText}>{pomoActive ? 'Jeda' : 'Mulai Fokus'}</Text>
              </TouchableOpacity>
            </View>

            {/* Focus Mindful Tip */}
            <View style={[styles.pomoTipCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={[styles.pomoTipText, { color: theme.subtext }]}>
                “Matikan notifikasi media sosial selama 25 menit ini. Fokus selesaikan 1 tugas kuliah.”
              </Text>
            </View>

          </View>
        </ScrollView>
      )}

      {/* Subject Manager Modal */}
      <SubjectManagerModal
        visible={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSelectSubject={(name) => setSelectedSubject(name)}
      />

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
  loaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
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
  topActionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanQuickTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
    borderWidth: 1,
  },
  scanQuickTopText: {
    fontSize: 12,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 3,
    marginHorizontal: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#202634',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  controlsArea: {
    paddingHorizontal: 18,
    marginBottom: 14,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 13,
  },
  clearSearchBtn: {
    padding: 2,
  },
  searchFeedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#101726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1D2A42',
  },
  searchFeedbackText: {
    color: '#93C5FD',
    fontSize: 11.5,
    fontWeight: '500',
  },
  resetSearchText: {
    color: '#60A5FA',
    fontSize: 11.5,
    fontWeight: '600',
  },
  subjectRow: {
    gap: 6,
    paddingVertical: 2,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#202634',
  },
  subjectChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  subjectChipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  subjectChipTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  manageSubjFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16233B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  manageSubjFilterText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  addNewSubjChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#26334A',
  },
  addNewSubjText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  notesList: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    gap: 10,
  },
  draftCard: {
    backgroundColor: '#1C1608',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#B45309',
    marginBottom: 12,
  },
  draftCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#382806',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#78350F',
  },
  draftBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  draftDeleteBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#2D1418',
  },
  draftTitle: {
    color: '#FEF3C7',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  draftSnippet: {
    color: '#D1D5DB',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  draftFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C220E',
  },
  draftMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  draftSubjectText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '600',
  },
  draftTimeText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  draftContinueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  draftContinueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  noteCard: {
    flex: 1,
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
  },
  noteCardWide: {
    minHeight: 140,
  },
  noteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectBadge: {
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subjectBadgeText: {
    color: '#60A5FA',
    fontSize: 10.5,
    fontWeight: '600',
  },
  noteDate: {
    color: '#6B7280',
    fontSize: 11,
  },
  noteTitle: {
    color: '#F3F4F6',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  noteSnippet: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  noteAiFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  noteReadTime: {
    color: '#6B7280',
    fontSize: 10.5,
    fontWeight: '500',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1726',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  aiBadgeText: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '500',
  },
  openDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#16233B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#253856',
  },
  openDetailText: {
    color: '#60A5FA',
    fontSize: 10.5,
    fontWeight: '700',
  },
  scrollArea: {
    paddingHorizontal: 18,
  },
  taskLayout: {
    gap: 14,
  },
  taskLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  taskFormColumn: {
    width: '100%',
  },
  taskFormColumnWide: {
    flex: 1,
    minWidth: 300,
  },
  taskListColumn: {
    width: '100%',
  },
  taskListColumnWide: {
    flex: 1.4,
    minWidth: 340,
  },
  taskFormCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 12,
  },
  taskFormTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  taskInput: {
    backgroundColor: '#0E1117',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F3F4F6',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#222836',
    marginBottom: 10,
  },
  formMiniLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    marginTop: 2,
  },
  priorityChip: {
    flex: 1,
    backgroundColor: '#0E1117',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222836',
  },
  priorityChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  priorityText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  priorityTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  saveTaskBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveTaskBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  taskFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  taskFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#141822',
    borderWidth: 1,
    borderColor: '#202634',
  },
  taskFilterActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  taskFilterText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  taskFilterTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  taskListContainer: {
    gap: 8,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
  },
  taskCardDone: {
    opacity: 0.5,
  },
  taskCheckbox: {
    padding: 2,
  },
  taskCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#263042',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCircleActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  taskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  taskSubjectBadge: {
    backgroundColor: '#1C2230',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  taskSubjectText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueBadgeHigh: {
    backgroundColor: '#2B1417',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dueText: {
    color: '#6B7280',
    fontSize: 10,
  },
  dueTextHigh: {
    color: '#EF4444',
    fontWeight: '600',
  },
  taskTitle: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '500',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  deleteTaskBtn: {
    padding: 4,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  emptyTaskWrap: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#202634',
  },
  emptyTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253856',
  },
  emptyAddText: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
  },
  pomodoroContainer: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  pomodoroCenterBox: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  pomoHeader: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  pomoSub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  pomoPresetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  pomoPresetChip: {
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  pomoPresetActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  pomoPresetText: {
    color: '#6B7280',
    fontSize: 11,
  },
  pomoPresetTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  pomoClockCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#141822',
    borderWidth: 3,
    borderColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  pomoTimerText: {
    color: '#F3F4F6',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pomoStatusText: {
    color: '#60A5FA',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 4,
  },
  pomoControlsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  pomoResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#181E29',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2430',
  },
  pomoResetText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '500',
  },
  pomoPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pomoPlayBtnPause: {
    backgroundColor: '#DC2626',
  },
  pomoPlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pomoTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141822',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    gap: 10,
    width: '100%',
  },
  pomoTipText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    lineHeight: 17,
    flex: 1,
  },
});
