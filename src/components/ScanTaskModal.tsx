import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { compressImage, uriToBase64 } from '../lib/imageCompressor';
import { processPickedFile } from '../lib/fileReader';
import { showAlert } from '../lib/alert';
import { ChatAttachment } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import { getDeadlinePresets } from '../lib/dateUtils';

export interface ScannedTaskResult {
  title: string;
  subject: string;
  dueDate?: string;
  priority: 'high' | 'medium' | 'low';
  subtasks: string[];
  notes: string;
}

interface ScanTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyTask: (result: ScannedTaskResult) => void;
  availableSubjects?: { id: string; name: string }[];
}

export default function ScanTaskModal({
  visible,
  onClose,
  onApplyTask,
  availableSubjects = [],
}: ScanTaskModalProps) {
  const { theme, isLightMode } = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  // Source Attachments
  const [sourceItems, setSourceItems] = useState<{
    id: string;
    name: string;
    type: 'image' | 'document';
    uri: string;
    mimeType?: string;
    base64?: string;
    textContent?: string;
  }[]>([]);

  // Pre-import Metadata Inputs
  const [manualTitle, setManualTitle] = useState('');
  const [manualSubject, setManualSubject] = useState(
    availableSubjects.length > 0 ? availableSubjects[0].name : 'Umum'
  );
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualPriority, setManualPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [customInstruction, setCustomInstruction] = useState('');

  const [loading, setLoading] = useState(false);
  const [taskResult, setTaskResult] = useState<ScannedTaskResult | null>(null);

  const deadlinePresets = getDeadlinePresets();

  const resetAll = () => {
    setSourceItems([]);
    setManualTitle('');
    setManualSubject(availableSubjects.length > 0 ? availableSubjects[0].name : 'Umum');
    setManualDueDate('');
    setManualPriority('medium');
    setCustomInstruction('');
    setLoading(false);
    setTaskResult(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const pickImagesFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 10,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const newItems: any[] = [];
        for (const asset of res.assets) {
          try {
            const compressedUri = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
            const b64 = await uriToBase64(compressedUri);
            newItems.push({
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: asset.fileName || `Foto_Soal_${newItems.length + 1}.jpg`,
              type: 'image',
              uri: compressedUri,
              base64: b64,
              mimeType: asset.mimeType || 'image/jpeg',
            });
          } catch (err) {
            newItems.push({
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: asset.fileName || 'Foto_Soal.jpg',
              type: 'image',
              uri: asset.uri,
              mimeType: asset.mimeType || 'image/jpeg',
            });
          }
        }
        setSourceItems(prev => [...prev, ...newItems]);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Galeri', e.message || 'Terjadi kesalahan saat memilih foto.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Izin Kamera Ditolak', 'Aplikasi memerlukan izin kamera untuk memotret soal tugas.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const compressedUri = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
        const b64 = await uriToBase64(compressedUri);
        const newItem = {
          id: 'cam_' + Date.now(),
          name: `Foto Soal Kamera (${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`,
          type: 'image' as const,
          uri: compressedUri,
          base64: b64,
          mimeType: 'image/jpeg',
        };
        setSourceItems(prev => [...prev, newItem]);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Kamera', e.message || 'Terjadi kesalahan saat mengaktifkan kamera.');
    }
  };

  const pickDocuments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const newItems: any[] = [];
        for (const file of res.assets) {
          try {
            const processed = await processPickedFile(file);
            newItems.push({
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: file.name || 'Dokumen_Soal',
              type: processed.type === 'image' ? 'image' : 'document',
              uri: file.uri,
              base64: processed.base64,
              textContent: processed.textContent,
              mimeType: processed.mimeType,
            });
          } catch (err) {
            newItems.push({
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: file.name || 'Dokumen_Soal',
              type: 'document',
              uri: file.uri,
              mimeType: file.mimeType,
            });
          }
        }
        setSourceItems(prev => [...prev, ...newItems]);
      }
    } catch (e: any) {
      showAlert('Gagal Memilih Dokumen', e.message || 'Terjadi kesalahan saat memilih dokumen.');
    }
  };

  const removeSourceItem = (id: string) => {
    setSourceItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (updated.length === 0) {
        setTaskResult(null);
      }
      return updated;
    });
  };

  const handleAnalyzeTask = async () => {
    if (sourceItems.length === 0) {
      showAlert('Pilih Dokumen / Foto', 'Silakan unggah dokumen soal (PDF, Word, TXT, dll) atau foto instruksi tugas terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      let prompt = `Analisis seluruh dokumen soal dan foto tugas kuliah yang dilampirkan.
Tugasmu adalah MENGEKSTRAK dan MENULISKAN ULANG menjadi komponen tugas kuliah mahasiswa yang lengkap dan terstruktur.

INFORMASI DARI MAHASISWA:
${manualTitle.trim() ? `- Judul yang Dikehendaki: "${manualTitle.trim()}"\n` : ''}
${manualSubject.trim() ? `- Mata Kuliah: "${manualSubject.trim()}"\n` : ''}
${manualDueDate.trim() ? `- Tenggat Waktu: "${manualDueDate.trim()}"\n` : ''}
${manualPriority ? `- Prioritas: "${manualPriority}"\n` : ''}
${customInstruction.trim() ? `- Instruksi Tambahan Khusus: "${customInstruction.trim()}"\n` : ''}

ATURAN MUTLAK:
1. JANGAN PERNAH menjelaskan tentang dirimu sebagai AI atau mengulang instruksi ini.
2. ANALISIS VISUAL SOAL: Jika di dalam dokumen soal atau foto terdapat GAMBAR SOAL, GRAFIK, DIAGRAM KASUS, FLOWCHART, atau SKEMA RANGKAIAN, baca dan jelaskan makna soal dari visual tersebut ke dalam lembar kerja 'notes' dan sertakan langkah pengerjaannya di 'subtasks'.
3. Kembalikan HANYA DALAM FORMAT JSON VALID persis seperti ini:
{
  "title": "${manualTitle.trim() ? manualTitle.trim() : '[Judul tugas yang spesifik dan jelas]'}",
  "subject": "${manualSubject.trim() ? manualSubject.trim() : '[Nama mata kuliah yang paling sesuai]'}",
  "priority": "${manualPriority}",
  "dueDate": "${manualDueDate.trim() ? manualDueDate.trim() : '[Tanggal deadline jika disebutkan di soal dalam format YYYY-MM-DD atau kosongkan]'}",
  "subtasks": [
    "Langkah 1 pengerjaan spesifik",
    "Langkah 2 pengerjaan spesifik",
    "Langkah 3 pengerjaan spesifik"
  ],
  "notes": "[Tuliskan ulang seluruh deskripsi soal, instruksi dosen, analisis gambar/diagram soal, kriteria penilaian, dan rumus/persyaratan tugas dalam format Markdown yang sangat rapi dan lengkap]"
}`;

      const chatAttachments: ChatAttachment[] = sourceItems.map(item => ({
        type: item.type,
        uri: item.uri,
        name: item.name,
        mimeType: item.mimeType || (item.type === 'image' ? 'image/jpeg' : 'application/pdf'),
        base64: item.base64,
        textContent: item.textContent,
      }));

      const aiReply = await sendMessageToGemini(
        [],
        prompt,
        chatAttachments,
        'Kamu adalah asisten akademik cerdas yang mengekstrak soal tugas menjadi data terstruktur JSON tanpa basa-basi.',
        { maxTokens: 4096 }
      );

      const parsed: any = extractJsonFromText(aiReply);
      if (parsed && typeof parsed === 'object' && (parsed.title || manualTitle)) {
        let matchedSubj = manualSubject || parsed.subject || '';
        if (matchedSubj && availableSubjects.length > 0) {
          const found = availableSubjects.find(
            s => s.name.toLowerCase() === matchedSubj.toLowerCase() ||
                 matchedSubj.toLowerCase().includes(s.name.toLowerCase()) ||
                 s.name.toLowerCase().includes(matchedSubj.toLowerCase())
          );
          if (found) matchedSubj = found.name;
        }

        setTaskResult({
          title: manualTitle.trim() || parsed.title || 'Tugas Kuliah Baru',
          subject: matchedSubj || (availableSubjects.length > 0 ? availableSubjects[0].name : 'Umum'),
          priority: manualPriority || (['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium'),
          dueDate: manualDueDate.trim() || parsed.dueDate || '',
          subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks.map(String) : [],
          notes: parsed.notes || '',
        });
      } else {
        showAlert('Gagal Mengekstrak Soal', 'AI tidak dapat menyusun struktur tugas dari file ini. Coba berikan instruksi tambahan.');
      }
    } catch (e: any) {
      showAlert('Gagal Menganalisis Soal', e?.message || 'Terjadi kesalahan saat memproses soal tugas.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!taskResult) return;
    onApplyTask(taskResult);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }, isWide && styles.modalCardWide]}>
          
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.headerIconBox, { backgroundColor: isLightMode ? '#FEF3C7' : '#451A03' }]}>
                <Ionicons name="flash" size={18} color={isLightMode ? '#D97706' : '#FBBF24'} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  {taskResult ? 'Hasil Ekstraksi Tugas AI' : 'AI Scan & Ekstrak Soal Tugas'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
                  {taskResult ? 'Periksa komponen tugas hasil analisis AI sebelum disimpan' : 'Masukkan informasi tugas & upload dokumen soal untuk diekstrak AI'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          {/* PHASE 1: Metadata Inputs & Upload Form */}
          {!taskResult ? (
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Step 1: Pre-Import Task Metadata Info */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  1. Informasi Tugas (Nama, Matkul & Tenggat):
                </Text>

                {/* Nama Tugas (Opsional) */}
                <TextInput
                  style={[styles.formInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Nama tugas (opsional, bisa dideteksi otomatis oleh AI)"
                  placeholderTextColor={theme.muted}
                  value={manualTitle}
                  onChangeText={setManualTitle}
                />

                {/* Subject Selector */}
                {availableSubjects.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Pilih Mata Kuliah:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScrollRow}>
                      {availableSubjects.map(s => {
                        const isSel = manualSubject.toLowerCase() === s.name.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.chipBtn,
                              { backgroundColor: theme.cardInner, borderColor: theme.border },
                              isSel && [styles.chipBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                            ]}
                            onPress={() => setManualSubject(s.name)}
                          >
                            <Text style={[styles.chipBtnText, { color: theme.subtext }, isSel && { color: theme.accentLight, fontWeight: '700' }]}>
                              {s.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Deadline Presets & Input */}
                <View style={{ marginTop: 4 }}>
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tenggat Waktu / Deadline:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScrollRow}>
                    {deadlinePresets.map(preset => {
                      const isSel = manualDueDate === preset.iso;
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          style={[
                            styles.chipBtn,
                            { backgroundColor: theme.cardInner, borderColor: theme.border },
                            isSel && [styles.chipBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => setManualDueDate(isSel ? '' : preset.iso)}
                        >
                          <Text style={[styles.chipBtnText, { color: theme.subtext }, isSel && { color: theme.accentLight, fontWeight: '700' }]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <TextInput
                    style={[styles.formInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text, marginTop: 6 }]}
                    placeholder="Atau ketik tanggal/jam (misal: 2026-09-05 23:59 atau Jumat depan)"
                    placeholderTextColor={theme.muted}
                    value={manualDueDate}
                    onChangeText={setManualDueDate}
                  />
                </View>

                {/* Priority Selector */}
                <View style={{ marginTop: 4 }}>
                  <Text style={[styles.formMiniLabel, { color: theme.subtext }]}>Tingkat Prioritas:</Text>
                  <View style={styles.priorityRow}>
                    {(['high', 'medium', 'low'] as const).map(p => {
                      const isSel = manualPriority === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.priorityBtn,
                            { backgroundColor: theme.cardInner, borderColor: theme.border },
                            isSel && [styles.priorityBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => setManualPriority(p)}
                        >
                          <Text style={[styles.priorityBtnText, { color: theme.subtext }, isSel && { color: theme.accentLight, fontWeight: '700' }]}>
                            {p === 'high' ? '🔥 Mendesak' : p === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Step 2: Upload Soal Buttons */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  2. Upload Dokumen Soal atau Foto Tugas:
                </Text>

                <View style={styles.uploadButtonsRow}>
                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: isLightMode ? '#FEF3C7' : '#451A03', borderColor: isLightMode ? '#FDE68A' : '#78350F' }]}
                    onPress={pickDocuments}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text" size={20} color={isLightMode ? '#D97706' : '#FBBF24'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadActionBtnTitle, { color: isLightMode ? '#92400E' : '#FEF3C7' }]}>
                        Upload Dokumen Soal / PDF
                      </Text>
                      <Text style={[styles.uploadActionBtnSub, { color: isLightMode ? '#B45309' : '#FDE68A' }]}>
                        PDF, Word, TXT, Soal Ujian, dll
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: isLightMode ? '#F0FDF4' : '#052E16', borderColor: isLightMode ? '#BBF7D0' : '#166534' }]}
                    onPress={pickImagesFromGallery}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="images" size={20} color={isLightMode ? '#16A34A' : '#4ADE80'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadActionBtnTitle, { color: isLightMode ? '#15803D' : '#F0FDF4' }]}>
                        Pilih Foto Soal (Banyak)
                      </Text>
                      <Text style={[styles.uploadActionBtnSub, { color: isLightMode ? '#16A34A' : '#BBF7D0' }]}>
                        Foto lembar soal, slide tugas dosen
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.uploadActionBtnSmall, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={takePhoto}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera" size={18} color={theme.accentLight} />
                    <Text style={[styles.uploadActionBtnSmallText, { color: theme.text }]}>Foto Kamera</Text>
                  </TouchableOpacity>
                </View>

                {/* Source Items Selected List */}
                {sourceItems.length > 0 && (
                  <View style={[styles.selectedItemsCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <View style={styles.selectedItemsHeader}>
                      <Text style={[styles.selectedItemsHeaderText, { color: theme.subtext }]}>
                        {sourceItems.length} File / Foto Soal Terpilih:
                      </Text>
                      <TouchableOpacity onPress={() => { setSourceItems([]); setTaskResult(null); }}>
                        <Text style={[styles.clearAllText, { color: '#EF4444' }]}>Hapus Semua</Text>
                      </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedItemsScroll}>
                      {sourceItems.map(item => (
                        <View key={item.id} style={[styles.itemPill, { backgroundColor: theme.card, borderColor: theme.border }]}>
                          {item.type === 'image' && item.uri ? (
                            <Image source={{ uri: item.uri }} style={styles.itemPillThumb} />
                          ) : (
                            <Ionicons name="document-text" size={16} color={theme.accentLight} />
                          )}
                          <Text style={[styles.itemPillName, { color: theme.text }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <TouchableOpacity onPress={() => removeSourceItem(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="close-circle" size={16} color={theme.muted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Step 3: Trigger Button */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
                  Instruksi Tambahan (Opsional):
                </Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Contoh: Pecah tugas menjadi 5 langkah, fokuskan pada bab 3..."
                  placeholderTextColor={theme.muted}
                  value={customInstruction}
                  onChangeText={setCustomInstruction}
                />

                <TouchableOpacity
                  style={[
                    styles.analyzeBtn,
                    { backgroundColor: theme.primary },
                    (sourceItems.length === 0 || loading) && { opacity: 0.6 }
                  ]}
                  onPress={handleAnalyzeTask}
                  disabled={sourceItems.length === 0 || loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.analyzeBtnText}>AI Sedang Membaca & Menyusun Tugas...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="flash" size={18} color="#FFFFFF" />
                      <Text style={styles.analyzeBtnText}>
                        Ekstrak Soal & Susun Tugas ({sourceItems.length} File)
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* PHASE 2: Clean Result Screen */
            <View style={styles.resultContainer}>
              {/* Meta Header */}
              <View style={[styles.resultMetaBar, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultMetaLabel, { color: theme.muted }]}>Judul Tugas:</Text>
                  <Text style={[styles.resultTitleText, { color: theme.text }]} numberOfLines={2}>
                    {taskResult.title}
                  </Text>

                  <View style={styles.metaBadgesRow}>
                    <View style={[styles.badgePill, { backgroundColor: theme.accentBg }]}>
                      <Text style={[styles.badgePillText, { color: theme.accentLight }]}>
                        Matkul: {taskResult.subject}
                      </Text>
                    </View>
                    <View style={[styles.badgePill, { backgroundColor: isLightMode ? '#FEF3C7' : '#451A03' }]}>
                      <Text style={[styles.badgePillText, { color: isLightMode ? '#D97706' : '#FBBF24' }]}>
                        Prioritas: {taskResult.priority === 'high' ? '🔥 Mendesak' : taskResult.priority === 'medium' ? '⚡ Sedang' : '🍃 Santai'}
                      </Text>
                    </View>
                    {taskResult.dueDate ? (
                      <View style={[styles.badgePill, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554' }]}>
                        <Text style={[styles.badgePillText, { color: isLightMode ? '#2563EB' : '#60A5FA' }]}>
                          Deadline: {taskResult.dueDate}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Scrollable Subtasks and Worksheet Content */}
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={styles.previewScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {/* Subtasks Checklist */}
                {taskResult.subtasks.length > 0 && (
                  <View style={[styles.subtasksBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Text style={[styles.subtasksBoxTitle, { color: theme.text }]}>
                      Langkah Pengerjaan ({taskResult.subtasks.length}):
                    </Text>
                    {taskResult.subtasks.map((st, i) => (
                      <View key={i} style={styles.subtaskItemRow}>
                        <Ionicons name="checkbox-outline" size={16} color={theme.accentLight} />
                        <Text style={[styles.subtaskItemText, { color: theme.text }]}>{st}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Task Notes / Worksheet Preview */}
                {taskResult.notes ? (
                  <View style={[styles.notesBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Text style={[styles.notesBoxTitle, { color: theme.text }]}>
                      Lembar Kerja & Petunjuk Soal:
                    </Text>
                    <MarkdownRenderer content={taskResult.notes} fontSize={13} textColor={theme.text} />
                  </View>
                ) : null}
              </ScrollView>

              {/* Fixed Footer Actions */}
              <View style={[styles.resultFooter, { backgroundColor: theme.cardInner, borderTopColor: theme.border }]}>
                <TouchableOpacity
                  style={[styles.reScanBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => setTaskResult(null)}
                >
                  <Ionicons name="refresh" size={16} color={theme.subtext} />
                  <Text style={[styles.reScanBtnText, { color: theme.subtext }]}>Atur Ulang</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.applyBtnFull, { backgroundColor: theme.primary }]}
                  onPress={handleApply}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.applyBtnFullText}>Terapkan & Buat Tugas Kuliah</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    height: '92%',
    maxHeight: 780,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalCardWide: {
    maxWidth: 720,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyScroll: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 18,
    gap: 16,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  formInput: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 12.5,
  },
  formMiniLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  chipsScrollRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipBtnActive: {
    borderWidth: 1.5,
  },
  chipBtnText: {
    fontSize: 11.5,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityBtnActive: {
    borderWidth: 1.5,
  },
  priorityBtnText: {
    fontSize: 11.5,
  },
  uploadButtonsRow: {
    gap: 8,
  },
  uploadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  uploadActionBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  uploadActionBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },
  uploadActionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  uploadActionBtnSmallText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  selectedItemsCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  selectedItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedItemsHeaderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectedItemsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  itemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 180,
  },
  itemPillThumb: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  itemPillName: {
    fontSize: 11,
    flex: 1,
  },
  analyzeBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  analyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  resultContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  resultMetaBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resultMetaLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  resultTitleText: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  metaBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    padding: 16,
    gap: 12,
  },
  subtasksBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  subtasksBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtaskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtaskItemText: {
    fontSize: 12,
    flex: 1,
  },
  notesBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  notesBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  resultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  reScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  reScanBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  applyBtnFull: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
  },
  applyBtnFullText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
