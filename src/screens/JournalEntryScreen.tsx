import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { supabase } from '../lib/supabase';
import { JournalEntry } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import { showAlert } from '../lib/alert';

type JournalEntryRouteProp = RouteProp<RootStackParamList, 'JournalEntry'>;

const COMMON_TAGS = ['kerja', 'keluarga', 'percintaan', 'kesehatan', 'teman', 'sekolah', 'hobi', 'keuangan', 'lainnya'];

export default function JournalEntryScreen() {
  const { user } = useAuth();
  const { moods } = useMoods();
  const route = useRoute<JournalEntryRouteProp>();
  const navigation = useNavigation();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const entryId = route.params?.entryId;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string>(moods[0]?.type || 'neutral');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!entryId);

  useEffect(() => {
    if (entryId) fetchEntry();
  }, [entryId]);

  const fetchEntry = async () => {
    const { data } = await supabase.from('journal_entries').select('*').eq('id', entryId).single();
    if (data) {
      const entry = data as JournalEntry;
      setTitle(entry.title ?? '');
      setContent(entry.content);
      setMood(entry.mood);
      setTags(entry.tags ?? []);
      if (entry.image_url) setImageUri(entry.image_url);
    }
    setFetching(false);
  };

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

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

    if (user) {
      if (entryId) {
        await supabase.from('journal_entries').update(payload).eq('id', entryId);
      } else {
        await supabase.from('journal_entries').insert(payload);
      }
    }
    setLoading(false);
    navigation.goBack();
  };

  if (fetching) {
    return <View style={styles.loaderCenter}><ActivityIndicator size="small" color="#9CA3AF" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Title Input */}
        <TextInput
          style={styles.titleInput}
          placeholder="Judul catatan..."
          placeholderTextColor="#4B5565"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <View style={[styles.formLayout, isWide && styles.formLayoutWide]}>
          
          {/* Main Content Area */}
          <View style={[styles.mainEditor, isWide && { flex: 1.3 }]}>
            <TextInput
              style={styles.contentInput}
              placeholder="Tuliskan apa yang sedang kamu rasakan atau pikirkan..."
              placeholderTextColor="#4B5565"
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Sidebar / Options */}
          <View style={[styles.sideControls, isWide && { flex: 1 }]}>
            
            {/* Mood selector */}
            <Text style={styles.sectionLabel}>Mood saat menulis</Text>
            <View style={styles.moodGrid}>
              {moods.map(m => (
                <TouchableOpacity
                  key={m.type}
                  style={[
                    styles.moodBtn,
                    mood === m.type && styles.moodBtnActive,
                  ]}
                  onPress={() => setMood(m.type)}
                >
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={[styles.moodLabel, mood === m.type && styles.moodLabelActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tags */}
            <Text style={styles.sectionLabel}>Kategori / Tag</Text>
            <View style={styles.tagsRow}>
              {COMMON_TAGS.map(tag => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.tagChip, tags.includes(tag) && styles.tagChipActive]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.tagText, tags.includes(tag) && styles.tagTextActive]}>#{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Photo Attachment */}
            <Text style={styles.sectionLabel}>Foto (Opsional)</Text>
            <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={22} color="#6B7280" />
                  <Text style={styles.imagePlaceholderText}>Pilih Foto</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeImg}>
                <Ionicons name="close" size={14} color="#EF4444" />
                <Text style={styles.removeImgText}>Hapus foto</Text>
              </TouchableOpacity>
            )}

          </View>
        </View>

        {/* Action Save Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>{entryId ? 'Simpan Perubahan' : 'Simpan Jurnal'}</Text>
          )}
        </TouchableOpacity>

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
    paddingTop: 10,
  },
  titleInput: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
    paddingVertical: 12,
    marginBottom: 16,
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
