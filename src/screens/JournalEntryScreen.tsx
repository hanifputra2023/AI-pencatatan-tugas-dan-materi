import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Image, AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { JournalEntry } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert, confirmAction } from '../lib/alert';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { sendMessageToGemini } from '../lib/gemini';

type JournalEntryRouteProp = RouteProp<RootStackParamList, 'JournalEntry'>;

const COMMON_TAGS = ['kerja', 'kuliah', 'keluarga', 'percintaan', 'kesehatan', 'teman', 'sekolah', 'hobi', 'keuangan', 'syukur', 'lainnya'];

export default function JournalEntryScreen() {
  const { user } = useAuth();
  const { moods, aiBotName } = useMoods();
  const { theme, isLightMode } = useTheme();
  const route = useRoute<JournalEntryRouteProp>();
  const navigation = useNavigation();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const entryId = route.params?.entryId;

  // View vs Edit Mode (Existing entry starts in Reader/Detail mode, new starts in Edit mode)
  const [isEditing, setIsEditing] = useState(!entryId);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string>(moods[0]?.type || 'neutral');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string>(new Date().toISOString());

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!entryId);

  // AI Reflection Insight
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingAiInsight, setLoadingAiInsight] = useState(false);

  // Draft state for new journal
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const draftTimerRef = useRef<any>(null);
  const contentInputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  // -------------------------------------------------------------
  // Fetch existing journal or restore draft
  // -------------------------------------------------------------
  const fetchEntry = useCallback(async () => {
    if (!entryId) return;
    try {
      const { data } = await supabase.from('journal_entries').select('*').eq('id', entryId).single();
      if (data) {
        const entry = data as JournalEntry;
        setTitle(entry.title ?? '');
        setContent(entry.content || '');
        setMood(entry.mood || 'neutral');
        setTags(entry.tags ?? []);
        if (entry.image_url) setImageUri(entry.image_url);
        if (entry.created_at) setCreatedAt(entry.created_at);
      }
    } catch (e) {
      console.log('Error fetching journal entry:', e);
    } finally {
      setFetching(false);
    }
  }, [entryId]);

  const loadDraft = useCallback(async () => {
    if (entryId) return;
    try {
      const key = `@journal_draft_${user?.id || 'anonymous'}`;
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.title || parsed.content) {
          setTitle(parsed.title || '');
          setContent(parsed.content || '');
          if (parsed.mood) setMood(parsed.mood);
          if (parsed.tags) setTags(parsed.tags);
          if (parsed.imageUri) setImageUri(parsed.imageUri);
          setDraftStatus('Draf sebelumnya dipulihkan');
        }
      }
    } catch (e) { }
  }, [entryId, user]);

  useEffect(() => {
    if (entryId) {
      fetchEntry();
    } else {
      loadDraft();
    }
  }, [entryId, fetchEntry, loadDraft]);

  // -------------------------------------------------------------
  // Auto-Save Draft for New Journal Entries
  // -------------------------------------------------------------
  const saveDraft = useCallback(async (t: string, c: string, m: string, tg: string[], img: string | null) => {
    if (entryId) return;
    if (!t.trim() && !c.trim()) return;
    try {
      const key = `@journal_draft_${user?.id || 'anonymous'}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        title: t,
        content: c,
        mood: m,
        tags: tg,
        imageUri: img,
        savedAt: new Date().toISOString(),
      }));
      setDraftStatus('Draf tersimpan otomatis');
    } catch (e) { }
  }, [entryId, user]);

  useEffect(() => {
    if (entryId) return;
    if (!title.trim() && !content.trim()) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(title, content, mood, tags, imageUri);
    }, 800);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [title, content, mood, tags, imageUri, entryId, saveDraft]);

  // Flush-save draft when app goes to background
  useEffect(() => {
    if (entryId) return;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState.match(/inactive|background/)) {
        if (title.trim() || content.trim()) {
          saveDraft(title, content, mood, tags, imageUri);
        }
      }
    });
    return () => subscription.remove();
  }, [title, content, mood, tags, imageUri, entryId, saveDraft]);

  // -------------------------------------------------------------
  // Markdown Format Helpers with Selection Wrapping
  // -------------------------------------------------------------
  const wrapSelection = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'teks') => {
    const { start, end } = selectionRef.current;
    if (start !== end && end > start) {
      const selected = content.substring(start, end);
      const isAlreadyWrapped = selected.startsWith(prefix) && selected.endsWith(suffix);
      let newText = '';
      if (isAlreadyWrapped) {
        const unwrapped = selected.slice(prefix.length, selected.length - suffix.length);
        newText = content.substring(0, start) + unwrapped + content.substring(end);
      } else {
        const wrapped = prefix + selected + suffix;
        newText = content.substring(0, start) + wrapped + content.substring(end);
      }
      setContent(newText);
    } else {
      const insertion = `${prefix}${defaultPlaceholder}${suffix}`;
      const newText = content.substring(0, start) + insertion + content.substring(start);
      setContent(newText);
    }
  };

  const prefixLine = (linePrefix: string, defaultPlaceholder: string = 'Catatan') => {
    const { start, end } = selectionRef.current;
    if (start !== end && end > start) {
      const selected = content.substring(start, end);
      const lines = selected.split('\n');
      const formatted = lines.map(line => line.startsWith(linePrefix) ? line.slice(linePrefix.length) : `${linePrefix}${line}`).join('\n');
      const newText = content.substring(0, start) + formatted + content.substring(end);
      setContent(newText);
    } else {
      const before = content.substring(0, start);
      const after = content.substring(start);
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      const insertion = `${needsNewline ? '\n' : ''}${linePrefix}${defaultPlaceholder}\n`;
      setContent(before + insertion + after);
    }
  };

  // -------------------------------------------------------------
  // Tags & Image Picker
  // -------------------------------------------------------------
  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  // -------------------------------------------------------------
  // AI Empathetic Reflection Insight
  // -------------------------------------------------------------
  const generateAiReflection = async () => {
    if (!content.trim()) return;
    setLoadingAiInsight(true);
    try {
      const currentMood = moods.find(m => m.type === mood);
      const prompt = `Sebagai sahabat suportif dan penuh empati bernama ${aiBotName || 'Ara'}, bacalah catatan jurnal berikut ini:
Judul: "${title || 'Tanpa Judul'}"
Mood: ${currentMood?.label || mood}
Isi Jurnal:
"""
${content}
"""

Berikan tanggapan yang hangat, menenangkan, validasi perasaannya, dan berikan 1 sudut pandang positif/dorongan semangat yang tulus dalam 2-3 kalimat singkat. Jangan terdengar seperti robot, gunakan panggilan yang akrab dan hangat.`;

      const reply = await sendMessageToGemini([], prompt);
      setAiInsight(reply.trim());
    } catch (e: any) {
      showAlert('Gagal Mendapat Refleksi AI', 'Pastikan koneksi internet stabil.');
    } finally {
      setLoadingAiInsight(false);
    }
  };

  // -------------------------------------------------------------
  // Save & Delete
  // -------------------------------------------------------------
  const handleSave = async () => {
    if (!content.trim()) {
      showAlert('Perhatian', 'Isi jurnal tidak boleh kosong.');
      return;
    }
    setLoading(true);

    const payload = {
      user_id: user?.id || 'anonymous',
      title: title.trim(),
      content: content.trim(),
      mood,
      tags,
      image_url: imageUri,
    };

    try {
      if (user) {
        if (entryId) {
          await supabase.from('journal_entries').update(payload).eq('id', entryId);
          setIsEditing(false);
          showAlert('Tersimpan ✨', 'Perubahan jurnal berhasil disimpan.');
        } else {
          await supabase.from('journal_entries').insert(payload);
          // Clear draft on new save
          const key = `@journal_draft_${user.id}`;
          await AsyncStorage.removeItem(key);
          navigation.goBack();
        }
      }
    } catch (e: any) {
      showAlert('Gagal Menyimpan', e.message || 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    confirmAction(
      'Hapus Jurnal?',
      'Catatan ini akan dihapus secara permanen dan tidak bisa dikembalikan.',
      async () => {
        if (user && entryId) {
          await supabase.from('journal_entries').delete().eq('id', entryId);
          navigation.goBack();
        }
      },
      'Hapus Permanen'
    );
  };

  const currentMood = moods.find(m => m.type === mood);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  if (fetching) {
    return (
      <View style={[styles.loaderCenter, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="small" color={theme.accentLight} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>

      {/* Top Header */}
      <View style={[styles.topHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.headerBackBtn, { backgroundColor: theme.cardInner }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <Text style={[styles.topHeaderTitle, { color: theme.text }]} numberOfLines={1}>
            {isEditing ? (entryId ? 'Edit Jurnal' : 'Tulis Jurnal Baru') : (title || 'Detail Jurnal')}
          </Text>
          <Text style={[styles.topHeaderSub, { color: theme.subtext }]}>
            {isEditing ? 'Mode Pengeditan' : 'Mode Baca Rapi'}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          {!isEditing && entryId ? (
            <>
              <TouchableOpacity
                style={[styles.headerEditBtn, { backgroundColor: theme.primary }]}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                <Text style={styles.headerEditBtnText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerDeleteBtn, { backgroundColor: isLightMode ? '#FEE2E2' : '#2C1216' }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.headerSaveBtn, { backgroundColor: theme.primary }, !content.trim() && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={loading || !content.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                  <Text style={styles.headerSaveText}>Simpan</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Draft Notification Banner */}
      {draftStatus && isEditing && !entryId && (
        <View style={[styles.draftBanner, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F2618', borderColor: isLightMode ? '#86EFAC' : '#1C4A2E' }]}>
          <Ionicons name="cloud-done-outline" size={13} color="#10B981" />
          <Text style={[styles.draftBannerText, { color: isLightMode ? '#15803D' : '#34D399' }]}>{draftStatus}</Text>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: DETAIL READER VIEW (TAMPILAN BACA RAPI & ESTETIK) */}
      {/* ========================================================================= */}
      {!isEditing ? (
        <ScrollView
          style={[styles.scroll, { backgroundColor: theme.bg }]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 50 }}
        >
          <View style={[styles.readerContainer, isWide && styles.readerContainerWide]}>

            {/* Meta Pill: Mood + Date */}
            <View style={styles.readerMetaRow}>
              <View style={[styles.readerMoodBadge, { backgroundColor: theme.cardInner, borderColor: currentMood?.color || theme.border }]}>
                <Text style={styles.readerMoodEmoji}>{currentMood?.emoji || '•'}</Text>
                <Text style={[styles.readerMoodText, { color: currentMood?.color || theme.accentLight }]}>
                  {currentMood?.label || mood}
                </Text>
              </View>

              <View style={styles.readerDateWrap}>
                <Ionicons name="time-outline" size={13} color={theme.muted} />
                <Text style={[styles.readerDateText, { color: theme.muted }]}>
                  {new Date(createdAt).toLocaleDateString('id-ID', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })} • {new Date(createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                </Text>
              </View>
            </View>

            {/* Journal Title */}
            <Text style={[styles.readerTitle, { color: theme.text }]}>
              {title || 'Catatan Harian Tanpa Judul'}
            </Text>

            {/* Tags Row */}
            {tags.length > 0 && (
              <View style={styles.readerTagsRow}>
                {tags.map(tag => (
                  <View key={tag} style={[styles.readerTagChip, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Text style={[styles.readerTagText, { color: theme.accentLight }]}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Attached Photo */}
            {imageUri ? (
              <View style={styles.readerImageWrap}>
                <Image source={{ uri: imageUri }} style={styles.readerImage} resizeMode="cover" />
              </View>
            ) : null}

            {/* Main Content Rendered via MarkdownRenderer */}
            <View style={[styles.readerContentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <MarkdownRenderer content={content} textColor={theme.text} />
            </View>

            {/* Word Count Stats Bar */}
            <View style={styles.readerStatsBar}>
              <Text style={[styles.readerStatsText, { color: theme.muted }]}>
                📝 {wordCount} Kata • {charCount} Karakter
              </Text>
            </View>

            {/* AI Empathetic Reflection Card */}
            <View style={[styles.aiInsightCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.aiInsightHeader}>
                <View style={[styles.aiInsightBadge, { backgroundColor: theme.accentBg }]}>
                  <Ionicons name="sparkles" size={14} color={theme.accentLight} />
                  <Text style={[styles.aiInsightBadgeText, { color: theme.accentLight }]}>Refleksi & Pesan {aiBotName || 'Ara'}</Text>
                </View>
                {!aiInsight && (
                  <TouchableOpacity
                    style={[styles.aiInsightRequestBtn, { backgroundColor: theme.primary }]}
                    onPress={generateAiReflection}
                    disabled={loadingAiInsight}
                  >
                    {loadingAiInsight ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="heart" size={12} color="#FFFFFF" />
                        <Text style={styles.aiInsightRequestText}>Minta Tanggapan Ara</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {aiInsight ? (
                <View style={styles.aiInsightBody}>
                  <Text style={[styles.aiInsightContent, { color: theme.text }]}>{aiInsight}</Text>
                  <TouchableOpacity
                    style={[styles.aiInsightRegenBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={generateAiReflection}
                    disabled={loadingAiInsight}
                  >
                    {loadingAiInsight ? (
                      <ActivityIndicator size="small" color={theme.subtext} />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={12} color={theme.subtext} />
                        <Text style={[styles.aiInsightRegenText, { color: theme.subtext }]}>Dapatkan Sudut Pandang Lain</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.aiInsightPlaceholder, { color: theme.subtext }]}>
                  Cerita atau perasaanmu berharga. Klik tombol di atas jika kamu ingin mendengar tanggapan hangat dan dorongan semangat dari Ara.
                </Text>
              )}
            </View>

            {/* Action Bar Footer */}
            <View style={styles.readerFooterActions}>
              <TouchableOpacity
                style={[styles.readerEditMainBtn, { backgroundColor: theme.primary }]}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="create-outline" size={16} color="#FFFFFF" />
                <Text style={styles.readerEditMainBtnText}>Edit Jurnal Ini</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      ) : (
        /* ========================================================================= */
        /* MODE 2: EDIT / WRITE MODE (FORMULIR INPUT DENGAN TOOLBAR) */
        /* ========================================================================= */
        <ScrollView
          style={[styles.scroll, { backgroundColor: theme.bg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 50 }}
        >
          {/* Title Input */}
          <TextInput
            style={[styles.titleInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
            placeholder="Judul catatan harian..."
            placeholderTextColor={theme.muted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Quick Format Toolbar */}
          <View style={[styles.formatToolbar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <TouchableOpacity style={styles.formatBtn} onPress={() => wrapSelection('**', '**', 'teks tebal')}>
              <Text style={[styles.formatBtnText, { color: theme.text, fontWeight: '900' }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.formatBtn} onPress={() => wrapSelection('*', '*', 'teks miring')}>
              <Text style={[styles.formatBtnText, { color: theme.text, fontStyle: 'italic' }]}>I</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.formatBtn} onPress={() => wrapSelection('__', '__', 'garis bawah')}>
              <Text style={[styles.formatBtnText, { color: theme.text, textDecorationLine: 'underline' }]}>U</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.formatBtn} onPress={() => prefixLine('- ', 'Poin')}>
              <Ionicons name="list" size={14} color={theme.subtext} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.formatBtn} onPress={() => prefixLine('> ', 'Kutipan')}>
              <Ionicons name="chatbox-ellipses-outline" size={14} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          <View style={[styles.formLayout, isWide && styles.formLayoutWide]}>

            {/* Main Content Area */}
            <View style={[styles.mainEditor, isWide && { flex: 1.3 }]}>
              <TextInput
                ref={contentInputRef}
                style={[styles.contentInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                placeholder="Tuliskan apa yang sedang kamu rasakan, alami, atau syukuri hari ini..."
                placeholderTextColor={theme.muted}
                value={content}
                onChangeText={setContent}
                onSelectionChange={(e) => {
                  selectionRef.current = e.nativeEvent.selection;
                }}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Sidebar / Options */}
            <View style={[styles.sideControls, isWide && { flex: 1 }]}>

              {/* Mood selector */}
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Mood saat menulis</Text>
              <View style={styles.moodGrid}>
                {moods.map(m => {
                  const isSel = mood === m.type;
                  return (
                    <TouchableOpacity
                      key={m.type}
                      style={[
                        styles.moodBtn,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        isSel && [styles.moodBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }],
                      ]}
                      onPress={() => setMood(m.type)}
                    >
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodLabel, { color: theme.subtext }, isSel && [styles.moodLabelActive, { color: theme.accentLight, fontWeight: '700' }]]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tags */}
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Kategori / Tag</Text>
              <View style={styles.tagsRow}>
                {COMMON_TAGS.map(tag => {
                  const isTagActive = tags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.tagChip,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        isTagActive && [styles.tagChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                      ]}
                      onPress={() => toggleTag(tag)}
                    >
                      <Text style={[styles.tagText, { color: theme.subtext }, isTagActive && [styles.tagTextActive, { color: theme.accentLight, fontWeight: '700' }]]}>#{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Photo Attachment */}
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Foto Kenangan (Opsional)</Text>
              <TouchableOpacity style={[styles.imageBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={22} color={theme.muted} />
                    <Text style={[styles.imagePlaceholderText, { color: theme.subtext }]}>Pilih Foto dari Galeri</Text>
                  </View>
                )}
              </TouchableOpacity>
              {imageUri && (
                <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeImg}>
                  <Ionicons name="close-circle" size={14} color="#EF4444" />
                  <Text style={styles.removeImgText}>Hapus foto lampiran</Text>
                </TouchableOpacity>
              )}

            </View>
          </View>

          {/* Action Save Button */}
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{entryId ? 'Simpan Perubahan' : 'Simpan Jurnal'}</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      )}

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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
    backgroundColor: '#11141C',
  },
  headerBackBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#161B24',
  },
  topHeaderTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  topHeaderSub: {
    color: '#6B7280',
    fontSize: 10.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerEditBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#2D1418',
  },
  headerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0D211A',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#16382D',
  },
  draftBannerText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '500',
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },

  // Reader Mode Styles
  readerContainer: {
    gap: 16,
  },
  readerContainerWide: {
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  readerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  readerMoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161B24',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  readerMoodEmoji: {
    fontSize: 16,
  },
  readerMoodText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  readerDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readerDateText: {
    color: '#9CA3AF',
    fontSize: 11.5,
  },
  readerTitle: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  readerTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  readerTagChip: {
    backgroundColor: '#182030',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  readerTagText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
  readerImageWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#202634',
  },
  readerImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
  },
  readerContentCard: {
    backgroundColor: '#141822',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202634',
    minHeight: 120,
  },
  readerStatsBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  readerStatsText: {
    color: '#6B7280',
    fontSize: 11,
  },
  aiInsightCard: {
    backgroundColor: '#13192B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
    gap: 10,
  },
  aiInsightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiInsightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiInsightBadgeText: {
    color: '#60A5FA',
    fontSize: 12.5,
    fontWeight: '700',
  },
  aiInsightRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  aiInsightRequestText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  aiInsightBody: {
    gap: 8,
  },
  aiInsightContent: {
    color: '#E0E7FF',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  aiInsightRegenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  aiInsightRegenText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  aiInsightPlaceholder: {
    color: '#818CF8',
    fontSize: 12,
    lineHeight: 18,
  },
  readerFooterActions: {
    paddingTop: 8,
  },
  readerEditMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  readerEditMainBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Edit Mode Styles
  titleInput: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
    paddingVertical: 10,
    marginBottom: 10,
  },
  formatToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141822',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 12,
  },
  formatBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#10131A',
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  formatBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
  },
  formLayout: {
    gap: 16,
  },
  formLayoutWide: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  mainEditor: {
    width: '100%',
  },
  sideControls: {
    width: '100%',
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  contentInput: {
    backgroundColor: '#141822',
    borderRadius: 12,
    padding: 14,
    color: '#F3F4F6',
    fontSize: 14,
    lineHeight: 22,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#202634',
    marginBottom: 12,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  moodBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
    backgroundColor: '#141822',
    minWidth: 64,
  },
  moodBtnActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 3,
  },
  moodLabelActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#141822',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#202634',
  },
  tagChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#3B82F6',
  },
  tagText: {
    color: '#6B7280',
    fontSize: 11,
  },
  tagTextActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  imageBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: '#141822',
    borderRadius: 10,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
    borderStyle: 'dashed',
    gap: 4,
  },
  imagePlaceholderText: {
    color: '#6B7280',
    fontSize: 11,
  },
  removeImg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  removeImgText: {
    color: '#EF4444',
    fontSize: 11,
  },
  saveBtn: {
    backgroundColor: '#1E2430',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2E384A',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
