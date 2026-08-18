import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useSubjects } from '../contexts/SubjectContext';
import { supabase } from '../lib/supabase';
import { StudyNote, StudentTask } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { confirmAction, showAlert } from '../lib/alert';
import SubjectManagerModal from '../components/SubjectManagerModal';

const POMODORO_DURATIONS = [
  { label: '25 Menit (Fokus)', value: 25 * 60 },
  { label: '50 Menit (Deep Work)', value: 50 * 60 },
  { label: '5 Menit (Istirahat)', value: 5 * 60 },
];

export default function StudyNotesScreen() {
  const { user } = useAuth();
  const { subjects } = useSubjects();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop, isTablet, isMobile } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'pomodoro'>('notes');

  // Notes state
  const [notes, setNotes] = useState<StudyNote[]>([]);
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

    if (!user) return;

    const channel = supabase
      .channel('study_realtime_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes', filter: `user_id=eq.${user.id}` }, () => fetchNotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_tasks', filter: `user_id=eq.${user.id}` }, () => fetchTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotes, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
      fetchTasks();
    }, [fetchNotes, fetchTasks])
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
    <SafeAreaView style={styles.container}>
      
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Belajar & Kuliah</Text>
          <Text style={styles.subtitle}>Catatan pintar AI, manajemen tugas & fokus nugas</Text>
        </View>
        
        {activeTab === 'notes' && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('StudyNoteDetail', {})}
          >
            <Ionicons name="add" size={17} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Catatan Baru</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'tasks' && isMobile && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowTaskForm(!showTaskForm)}
          >
            <Ionicons name={showTaskForm ? 'close' : 'add'} size={17} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{showTaskForm ? 'Tutup' : 'Tugas Baru'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mode Switcher Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'notes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('notes')}
        >
          <Ionicons name="document-text-outline" size={15} color={activeTab === 'notes' ? '#F3F4F6' : '#6B7280'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'notes' && styles.tabTextActive]}>
            Catatan ({notes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'tasks' && styles.tabBtnActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Ionicons name="checkbox-outline" size={15} color={activeTab === 'tasks' ? '#F3F4F6' : '#6B7280'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>
            Tugas & Deadline ({tasks.filter(t => !t.is_completed).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pomodoro' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pomodoro')}
        >
          <Ionicons name="timer-outline" size={15} color={activeTab === 'pomodoro' ? '#F3F4F6' : '#6B7280'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'pomodoro' && styles.tabTextActive]}>
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
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari materi kuliah, rumus, judul bab, atau isi catatan..."
                placeholderTextColor="#5A6578"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Search feedback info badge when searching */}
            {searchQuery ? (
              <View style={styles.searchFeedbackRow}>
                <Text style={styles.searchFeedbackText}>
                  Menemukan {filteredNotes.length} catatan untuk "{searchQuery}"
                </Text>
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.resetSearchText}>Reset</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Subject Filter Row + Manage Courses Button */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
              {allFilterSubjects.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.subjectChip, selectedSubject.toLowerCase() === s.toLowerCase() && styles.subjectChipActive]}
                  onPress={() => setSelectedSubject(s)}
                >
                  <Text style={[styles.subjectChipText, selectedSubject.toLowerCase() === s.toLowerCase() && styles.subjectChipTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
              
              <TouchableOpacity
                style={styles.manageSubjFilterBtn}
                onPress={() => setShowSubjectModal(true)}
              >
                <Ionicons name="settings-outline" size={13} color="#60A5FA" />
                <Text style={styles.manageSubjFilterText}>Kelola Matkul</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {loadingNotes ? (
            <View style={styles.loaderCenter}><ActivityIndicator size="small" color="#9CA3AF" /></View>
          ) : filteredNotes.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="book-outline" size={28} color="#6B7280" />
              </View>
              <Text style={styles.emptyTitle}>Belum ada catatan kuliah</Text>
              <Text style={styles.emptySub}>Catat materi kuliah dan biarkan AI merangkumnya jadi poin ujian.</Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
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
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.noteCard, isWide && styles.noteCardWide]}
                  onPress={() => navigation.navigate('StudyNoteDetail', { noteId: item.id })}
                  onLongPress={() => deleteNote(item.id)}
                >
                  <View style={styles.noteTopRow}>
                    <View style={styles.subjectBadge}>
                      <Text style={styles.subjectBadgeText}>{item.subject}</Text>
                    </View>
                    <Text style={styles.noteDate}>
                      {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>

                  <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.noteSnippet} numberOfLines={3}>{item.content}</Text>

                  {/* AI Badges */}
                  <View style={styles.noteAiFooter}>
                    {item.summary ? (
                      <View style={styles.aiBadge}>
                        <Ionicons name="sparkles" size={11} color="#60A5FA" />
                        <Text style={styles.aiBadgeText}>Rangkuman AI</Text>
                      </View>
                    ) : null}
                    {item.quiz_data && item.quiz_data.length > 0 ? (
                      <View style={styles.aiBadge}>
                        <Ionicons name="school" size={11} color="#34D399" />
                        <Text style={styles.aiBadgeText}>{item.quiz_data.length} Soal Kuis</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
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
                <View style={styles.taskFormCard}>
                  <Text style={styles.taskFormTitle}>Tambah Tugas Kuliah</Text>

                  <TextInput
                    style={styles.taskInput}
                    placeholder="Nama tugas (misal: Laporan Praktikum Bab 2)"
                    placeholderTextColor="#5A6578"
                    value={newTaskTitle}
                    onChangeText={setNewTaskTitle}
                  />

                  {/* Course Picker for Task */}
                  <Text style={styles.formMiniLabel}>Pilih Mata Kuliah:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.subjectRow, { marginBottom: 10 }]}>
                    {subjects.map(s => {
                      const isSel = newTaskSubject.toLowerCase() === s.name.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.subjectChip, isSel && styles.subjectChipActive]}
                          onPress={() => setNewTaskSubject(s.name)}
                        >
                          <Text style={[styles.subjectChipText, isSel && styles.subjectChipTextActive]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={styles.addNewSubjChip}
                      onPress={() => setShowSubjectModal(true)}
                    >
                      <Ionicons name="add" size={13} color="#60A5FA" />
                      <Text style={styles.addNewSubjText}>Matkul Baru</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {/* Deadline Input */}
                  <Text style={styles.formMiniLabel}>Tenggat / Deadline:</Text>
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Misal: Besok 23:59, 25 Okt"
                    placeholderTextColor="#5A6578"
                    value={newTaskDueDate}
                    onChangeText={setNewTaskDueDate}
                  />

                  {/* Priority Picker */}
                  <Text style={styles.formMiniLabel}>Tingkat Prioritas:</Text>
                  <View style={styles.priorityRow}>
                    {(['high', 'medium', 'low'] as const).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.priorityChip, newTaskPriority === p && styles.priorityChipActive]}
                        onPress={() => setNewTaskPriority(p)}
                      >
                        <Text style={[styles.priorityText, newTaskPriority === p && styles.priorityTextActive]}>
                          {p === 'high' ? '🔥 Mendesak' : p === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={styles.saveTaskBtn} onPress={handleAddTask}>
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
                  style={[styles.taskFilterChip, taskFilter === 'pending' && styles.taskFilterActive]}
                  onPress={() => setTaskFilter('pending')}
                >
                  <Text style={[styles.taskFilterText, taskFilter === 'pending' && styles.taskFilterTextActive]}>
                    Belum Selesai ({tasks.filter(t => !t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.taskFilterChip, taskFilter === 'completed' && styles.taskFilterActive]}
                  onPress={() => setTaskFilter('completed')}
                >
                  <Text style={[styles.taskFilterText, taskFilter === 'completed' && styles.taskFilterTextActive]}>
                    Selesai ({tasks.filter(t => t.is_completed).length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.taskFilterChip, taskFilter === 'all' && styles.taskFilterActive]}
                  onPress={() => setTaskFilter('all')}
                >
                  <Text style={[styles.taskFilterText, taskFilter === 'all' && styles.taskFilterTextActive]}>
                    Semua ({tasks.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingTasks ? (
                <View style={styles.loaderCenter}><ActivityIndicator size="small" color="#9CA3AF" /></View>
              ) : filteredTasks.length === 0 ? (
                <View style={styles.emptyTaskWrap}>
                  <Ionicons name="checkbox-outline" size={32} color="#4B5565" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyTitle}>Tidak ada tugas dalam kategori ini</Text>
                  <Text style={styles.emptySub}>Semua rapi dan terkontrol.</Text>
                </View>
              ) : (
                <View style={styles.taskListContainer}>
                  {filteredTasks.map(t => {
                    const isHigh = t.priority === 'high';
                    return (
                      <View key={t.id} style={[styles.taskCard, t.is_completed && styles.taskCardDone]}>
                        <TouchableOpacity onPress={() => toggleTask(t)} style={styles.taskCheckbox}>
                          <View style={[styles.taskCircle, t.is_completed && styles.taskCircleActive]}>
                            {t.is_completed && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                          </View>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                          <View style={styles.taskHeaderRow}>
                            <View style={styles.taskSubjectBadge}>
                              <Text style={styles.taskSubjectText}>{t.subject}</Text>
                            </View>
                            {t.due_date ? (
                              <View style={[styles.dueBadge, isHigh && styles.dueBadgeHigh]}>
                                <Ionicons name="calendar-outline" size={11} color={isHigh ? '#EF4444' : '#9CA3AF'} />
                                <Text style={[styles.dueText, isHigh && styles.dueTextHigh]}>{t.due_date}</Text>
                              </View>
                            ) : null}
                          </View>

                          <Text style={[styles.taskTitle, t.is_completed && styles.taskTitleDone]}>
                            {t.title}
                          </Text>
                        </View>

                        <TouchableOpacity onPress={() => deleteTask(t.id)} style={styles.deleteTaskBtn}>
                          <Ionicons name="trash-outline" size={14} color="#6B7280" />
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
            
            <Text style={styles.pomoHeader}>Studio Fokus Belajar</Text>
            <Text style={styles.pomoSub}>Tingkatkan konsentrasi belajar dengan teknik Pomodoro teruji.</Text>

            {/* Duration Selector */}
            <View style={styles.pomoPresetsRow}>
              {POMODORO_DURATIONS.map(d => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.pomoPresetChip, pomoTotalTime === d.value && styles.pomoPresetActive]}
                  onPress={() => setPomoDuration(d.value)}
                >
                  <Text style={[styles.pomoPresetText, pomoTotalTime === d.value && styles.pomoPresetTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Big Timer Circle Display */}
            <View style={styles.pomoClockCircle}>
              <Text style={styles.pomoTimerText}>{formatPomoTime(pomoTimeLeft)}</Text>
              <Text style={styles.pomoStatusText}>
                {pomoActive ? 'Sedang Fokus Nugas...' : 'Siap Mulai'}
              </Text>
            </View>

            {/* Controller Buttons */}
            <View style={styles.pomoControlsRow}>
              <TouchableOpacity style={styles.pomoResetBtn} onPress={resetPomodoro}>
                <Ionicons name="refresh" size={16} color="#9CA3AF" />
                <Text style={styles.pomoResetText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pomoPlayBtn, pomoActive && styles.pomoPlayBtnPause]}
                onPress={togglePomodoro}
              >
                <Ionicons name={pomoActive ? 'pause' : 'play'} size={18} color="#FFFFFF" />
                <Text style={styles.pomoPlayText}>{pomoActive ? 'Jeda' : 'Mulai Fokus'}</Text>
              </TouchableOpacity>
            </View>

            {/* Focus Mindful Tip */}
            <View style={styles.pomoTipCard}>
              <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
              <Text style={styles.pomoTipText}>
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
