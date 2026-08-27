import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Image, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { sendMessageToGemini } from '../lib/gemini';
import { compressImage, uriToBase64 } from '../lib/imageCompressor';
import { processPickedFile } from '../lib/fileReader';
import { showAlert } from '../lib/alert';
import { ChatAttachment } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

export type ScanRewriteMode = 'smart_rewrite' | 'ocr_exact' | 'summary' | 'qa_breakdown';

export interface ScannedSourceItem {
  id: string;
  name: string;
  type: 'image' | 'document';
  uri: string;
  mimeType?: string;
  base64?: string;
  textContent?: string;
  size?: number;
}

interface ScanNoteModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (data: {
    content: string;
    title?: string;
    subject?: string;
    mode: 'replace' | 'append';
  }) => void;
  hasExistingContent?: boolean;
  availableSubjects?: { id: string; name: string }[];
}

export default function ScanNoteModal({
  visible,
  onClose,
  onApply,
  hasExistingContent = false,
  availableSubjects = [],
}: ScanNoteModalProps) {
  const { theme, isLightMode } = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [sourceItems, setSourceItems] = useState<ScannedSourceItem[]>([]);
  const [scanMode, setScanMode] = useState<ScanRewriteMode>('smart_rewrite');
  const [customInstruction, setCustomInstruction] = useState('');
  const [loading, setLoading] = useState(false);

  // Result state
  const [aiResultText, setAiResultText] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string>('');
  const [suggestedSubject, setSuggestedSubject] = useState<string>('');
  const [resultTab, setResultTab] = useState<'preview' | 'raw'>('preview');

  const resetAll = () => {
    setSourceItems([]);
    setAiResultText(null);
    setSuggestedTitle('');
    setSuggestedSubject('');
    setCustomInstruction('');
    setLoading(false);
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
        const newItems: ScannedSourceItem[] = [];
        for (const asset of res.assets) {
          try {
            const compressedUri = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
            const b64 = await uriToBase64(compressedUri);
            newItems.push({
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: asset.fileName || `Foto_${newItems.length + 1}.jpg`,
              type: 'image',
              uri: compressedUri,
              base64: b64,
              mimeType: asset.mimeType || 'image/jpeg',
              size: asset.fileSize,
            });
          } catch (err) {
            newItems.push({
              id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: asset.fileName || 'Foto.jpg',
              type: 'image',
              uri: asset.uri,
              mimeType: asset.mimeType || 'image/jpeg',
              size: asset.fileSize,
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
        showAlert('Izin Kamera Ditolak', 'Aplikasi memerlukan izin kamera untuk memotret materi catatan.');
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
        const newItem: ScannedSourceItem = {
          id: 'cam_' + Date.now(),
          name: `Foto Kamera (${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`,
          type: 'image',
          uri: compressedUri,
          base64: b64,
          mimeType: 'image/jpeg',
          size: asset.fileSize,
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
        const newItems: ScannedSourceItem[] = [];
        for (const file of res.assets) {
          try {
            const processed = await processPickedFile(file);
            newItems.push({
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: file.name || 'Dokumen',
              type: processed.type === 'image' ? 'image' : 'document',
              uri: file.uri,
              base64: processed.base64,
              textContent: processed.textContent,
              mimeType: processed.mimeType,
              size: file.size,
            });
          } catch (err) {
            newItems.push({
              id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: file.name || 'Dokumen',
              type: 'document',
              uri: file.uri,
              mimeType: file.mimeType,
              size: file.size,
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
    setSourceItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAnalyzeWithAI = async () => {
    if (sourceItems.length === 0) {
      showAlert('Pilih Dokumen / Foto', 'Silakan unggah dokumen (PDF, Word, TXT, dll) atau foto materi terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      let promptTask = '';
      if (scanMode === 'smart_rewrite') {
        promptTask = `Tugasmu adalah menganalisis seluruh dokumen dan foto materi pelajaran/kuliah ini, lalu MENULISKAN ULANG (Smart Rewrite) menjadi catatan belajar yang SANGAT RAPI, terstruktur, komprehensif, dan berformat Markdown yang indah.
- Gunakan Hierarki Judul & Subjudul (#, ##, ###) yang jelas.
- Rombak paragraf panjang menjadi poin-poin penjelasan (-) yang terstruktur dan mudah dipahami.
- Tebalkan (**istilah penting / definisi**) agar mencolok.
- Tuliskan rumus matematika, persamaan, atau kode pemrograman dalam blok format yang rapi.
- Perbaiki typo, kalimat terpotong, atau bahasa yang sulit dimengerti dari file aslinya agar enak dibaca.`;
      } else if (scanMode === 'ocr_exact') {
        promptTask = `Tugasmu adalah melakukan ekstraksi teks persis (Transkripsi Lengkap) dari seluruh materi dokumen dan foto ini.
- Salin seluruh teks yang terbaca secara lengkap, sistematis, dan akurat apa adanya tanpa memotong informasi penting.`;
      } else if (scanMode === 'qa_breakdown') {
        promptTask = `Tugasmu adalah menganalisis dokumen dan materi ini, lalu menyusunnya menjadi format "Tanya Jawab & Penjelasan Konsep" (Q&A Study Guide) yang sangat efektif untuk belajar persiapan ujian.`;
      } else {
        promptTask = `Tugasmu adalah membaca seluruh materi dokumen dan foto ini lalu membuatkan RANGKUMAN INTISARI konsep utama dan poin-poin paling esensial dalam format Markdown ringkas, padat, dan jelas.`;
      }

      if (customInstruction.trim()) {
        promptTask += `\n\nInstruksi Khusus Tambahan dari Mahasiswa: "${customInstruction.trim()}"`;
      }

      promptTask += `\n\nATURAN MUTLAK & FORMAT JAWABAN:
1. JANGAN PERNAH menuliskan pendahuluan tentang dirimu sebagai AI ("Sebagai asisten AI...", "Tugas utama saya..."), jangan menyalin ulang instruksi sistem, dan jangan membuat basa-basi.
2. ANALISIS VISUAL GAMBAR & DIAGRAM: Jika di dalam dokumen atau foto terdapat GAMBAR, DIAGRAM, GRAFIK, FLOWCHART, SKEMA RANGKAIAN, atau TABEL, baca dan jelaskan makna konsep visual tersebut secara mendalam ke dalam catatan.
3. LANGSUNG tuliskan isi materi catatan belajar dari dokumen/foto yang dilampirkan.
4. Jawabanmu WAJIB diawali dengan 2 baris metadata persis seperti ini:
JUDUL_DISARANKAN: [Tuliskan judul catatan yang singkat, jelas, dan representatif]
MATA_KULIAH_DISARANKAN: [Tuliskan nama mata pelajaran atau mata kuliah yang paling sesuai]
---
[Langsung tuliskan seluruh isi materi catatan kuliah sesuai topik dokumen di sini dalam format Markdown]`;

      const academicSystemInstruction = `Kamu adalah Asisten AI Pencatat Materi Kuliah & Vision Specialist. Tugasmu adalah membaca seluruh teks, gambar, diagram, dan formula pada dokumen atau foto yang dilampirkan dan menuliskannya kembali menjadi catatan Markdown berkualitas tinggi. JANGAN PERNAH memperkenalkan diri atau mengulang instruksi.`;

      // Map all source items to chat attachments
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
        promptTask,
        chatAttachments,
        academicSystemInstruction,
        { maxTokens: 4096 }
      );

      // Parse metadata
      let parsedTitle = '';
      let parsedSubject = '';
      let cleanMarkdown = aiReply;

      const titleMatch = aiReply.match(/JUDUL_DISARANKAN\s*:\s*([^\n\r]+)/i);
      if (titleMatch && titleMatch[1]) {
        parsedTitle = titleMatch[1].trim().replace(/^[*_#\s]+|[*_#\s]+$/g, '');
      }

      const subjectMatch = aiReply.match(/MATA_KULIAH_DISARANKAN\s*:\s*([^\n\r]+)/i);
      if (subjectMatch && subjectMatch[1]) {
        parsedSubject = subjectMatch[1].trim().replace(/^[*_#\s]+|[*_#\s]+$/g, '');
      }

      // Remove the metadata header up to ---
      cleanMarkdown = cleanMarkdown.replace(/^[\s\S]*?(?:---|===|\*\*\*)\s*\n+/i, '').trim();

      if (!cleanMarkdown) {
        cleanMarkdown = aiReply
          .replace(/JUDUL_DISARANKAN\s*:[^\n\r]+/gi, '')
          .replace(/MATA_KULIAH_DISARANKAN\s*:[^\n\r]+/gi, '')
          .trim();
      }

      // Try to find matching subject from availableSubjects
      let matchedSubject = '';
      if (parsedSubject && availableSubjects.length > 0) {
        const found = availableSubjects.find(
          s => s.name.toLowerCase() === parsedSubject.toLowerCase() ||
               parsedSubject.toLowerCase().includes(s.name.toLowerCase()) ||
               s.name.toLowerCase().includes(parsedSubject.toLowerCase())
        );
        if (found) {
          matchedSubject = found.name;
        }
      }

      setSuggestedTitle(parsedTitle || (sourceItems[0] ? sourceItems[0].name.replace(/\.[^/.]+$/, '') : 'Catatan Kuliah'));
      setSuggestedSubject(matchedSubject || parsedSubject);
      setAiResultText(cleanMarkdown);
    } catch (e: any) {
      showAlert('Gagal Menganalisis Dokumen', e.message || 'Terjadi kesalahan saat AI memproses dokumen.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (mode: 'replace' | 'append') => {
    if (!aiResultText) return;
    onApply({
      content: aiResultText,
      title: suggestedTitle,
      subject: suggestedSubject,
      mode,
    });
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
              <View style={[styles.headerIconBox, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554' }]}>
                <Ionicons name="sparkles" size={18} color={isLightMode ? '#2563EB' : '#60A5FA'} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  {aiResultText ? 'Hasil Tulis Ulang Catatan AI' : 'AI Scan & Tulis Ulang Materi'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
                  {aiResultText ? 'Periksa materi hasil analisis AI sebelum diterapkan ke catatan' : 'Upload dokumen atau foto materi untuk dianalisis & ditulis rapi oleh AI'}
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

          {/* PHASE 1: Upload & Configuration Screen */}
          {!aiResultText ? (
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Step 1: Upload Source Buttons */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  1. Pilih Dokumen atau Foto Materi:
                </Text>

                <View style={styles.uploadButtonsRow}>
                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: isLightMode ? '#F0F9FF' : '#082F49', borderColor: isLightMode ? '#BAE6FD' : '#0369A1' }]}
                    onPress={pickDocuments}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text" size={20} color={isLightMode ? '#0284C7' : '#38BDF8'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadActionBtnTitle, { color: isLightMode ? '#0369A1' : '#E0F2FE' }]}>
                        Upload Dokumen / PDF
                      </Text>
                      <Text style={[styles.uploadActionBtnSub, { color: isLightMode ? '#0284C7' : '#7DD3FC' }]}>
                        PDF, Word, TXT, Excel, Code, dll
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.uploadActionBtn, { backgroundColor: isLightMode ? '#FDF4FF' : '#3B0764', borderColor: isLightMode ? '#F5D0FE' : '#7E22CE' }]}
                    onPress={pickImagesFromGallery}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="images" size={20} color={isLightMode ? '#A855F7' : '#C084FC'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadActionBtnTitle, { color: isLightMode ? '#7E22CE' : '#FAF5FF' }]}>
                        Pilih Banyak Foto
                      </Text>
                      <Text style={[styles.uploadActionBtnSub, { color: isLightMode ? '#A855F7' : '#E9D5FF' }]}>
                        Slide kuliah, papan tulis, buku
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
                    <Text style={[styles.uploadActionBtnSmallText, { color: theme.text }]}>Kamera</Text>
                  </TouchableOpacity>
                </View>

                {/* Source Items Selected List */}
                {sourceItems.length > 0 && (
                  <View style={[styles.selectedItemsCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <View style={styles.selectedItemsHeader}>
                      <Text style={[styles.selectedItemsHeaderText, { color: theme.subtext }]}>
                        {sourceItems.length} File / Foto Terpilih:
                      </Text>
                      <TouchableOpacity onPress={() => setSourceItems([])}>
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

              {/* Step 2: Choose AI Rewrite Style */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  2. Pilih Gaya Penulisan Ulang AI:
                </Text>

                <View style={styles.modeGrid}>
                  {[
                    {
                      key: 'smart_rewrite' as ScanRewriteMode,
                      title: '✨ Smart Rewrite (Rapi & Lengkap)',
                      desc: 'Merombak materi menjadi catatan kuliah Markdown yang sangat terstruktur, jelas, dan berbobot.',
                    },
                    {
                      key: 'summary' as ScanRewriteMode,
                      title: '⚡ Rangkuman Intisari Ujian',
                      desc: 'Meringkas materi hanya pada konsep kunci dan poin-poin paling sering keluar di ujian.',
                    },
                    {
                      key: 'qa_breakdown' as ScanRewriteMode,
                      title: '🎯 Tanya Jawab & Panduan Ujian',
                      desc: 'Mengubah materi menjadi format Q&A interaktif untuk menguji pemahaman konsep.',
                    },
                    {
                      key: 'ocr_exact' as ScanRewriteMode,
                      title: '📄 Transkripsi Lengkap (Persis)',
                      desc: 'Menyalin seluruh isi teks dokumen/foto secara akurat apa adanya tanpa pengurangan.',
                    },
                  ].map(m => {
                    const isSel = scanMode === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[
                          styles.modeOptionCard,
                          { backgroundColor: theme.cardInner, borderColor: theme.border },
                          isSel && [styles.modeOptionCardActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                        ]}
                        onPress={() => setScanMode(m.key)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.modeOptionHeader}>
                          <Text style={[styles.modeOptionTitle, { color: theme.text }, isSel && { color: theme.accentLight, fontWeight: '700' }]}>
                            {m.title}
                          </Text>
                          {isSel && <Ionicons name="checkmark-circle" size={16} color={theme.accentLight} />}
                        </View>
                        <Text style={[styles.modeOptionDesc, { color: theme.subtext }]}>{m.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Step 3: Optional Instruction & Trigger Button */}
              <View style={styles.sectionWrap}>
                <Text style={[styles.sectionTitle, { color: theme.subtext }]}>
                  Instruksi Tambahan (Opsional):
                </Text>
                <TextInput
                  style={[styles.instructionInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Contoh: Fokuskan pada rumus fisika bab 2, gunakan bahasa yang sangat santai..."
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
                  onPress={handleAnalyzeWithAI}
                  disabled={sourceItems.length === 0 || loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.analyzeBtnText}>AI Sedang Membaca & Menulis Ulang Materi...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                      <Text style={styles.analyzeBtnText}>
                        Analisis & Tulis Ulang Catatan ({sourceItems.length} File)
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* PHASE 2: Clean Result Screen */
            <View style={styles.resultContainer}>
              {/* Result Meta Bar */}
              <View style={[styles.resultMetaBar, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultMetaLabel, { color: theme.muted }]}>Judul Disarankan:</Text>
                  <Text style={[styles.resultSuggestedTitle, { color: theme.text }]} numberOfLines={1}>
                    {suggestedTitle || 'Catatan Baru'}
                  </Text>
                  {suggestedSubject ? (
                    <View style={[styles.subjectTag, { backgroundColor: theme.accentBg }]}>
                      <Text style={[styles.subjectTagText, { color: theme.accentLight }]}>
                        Matkul: {suggestedSubject}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Tab Switcher */}
                <View style={styles.tabToggleRow}>
                  <TouchableOpacity
                    style={[styles.tabBtn, resultTab === 'preview' && [styles.tabBtnActive, { backgroundColor: theme.card }]]}
                    onPress={() => setResultTab('preview')}
                  >
                    <Text style={[styles.tabBtnText, { color: theme.subtext }, resultTab === 'preview' && { color: theme.text, fontWeight: '700' }]}>
                      Pratinjau
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabBtn, resultTab === 'raw' && [styles.tabBtnActive, { backgroundColor: theme.card }]]}
                    onPress={() => setResultTab('raw')}
                  >
                    <Text style={[styles.tabBtnText, { color: theme.subtext }, resultTab === 'raw' && { color: theme.text, fontWeight: '700' }]}>
                      Teks Mentah
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Full-Height Scrollable Markdown Preview */}
              <ScrollView
                style={styles.previewScroll}
                contentContainerStyle={styles.previewScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {resultTab === 'preview' ? (
                  <MarkdownRenderer content={aiResultText} fontSize={14} textColor={theme.text} />
                ) : (
                  <Text style={[styles.rawText, { color: theme.text }]} selectable>
                    {aiResultText}
                  </Text>
                )}
              </ScrollView>

              {/* Bottom Sticky Action Footer */}
              <View style={[styles.resultFooter, { backgroundColor: theme.cardInner, borderTopColor: theme.border }]}>
                <TouchableOpacity
                  style={[styles.reScanBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => setAiResultText(null)}
                >
                  <Ionicons name="refresh" size={16} color={theme.subtext} />
                  <Text style={[styles.reScanBtnText, { color: theme.subtext }]}>Atur Ulang</Text>
                </TouchableOpacity>

                {hasExistingContent ? (
                  <View style={styles.applyActionsRow}>
                    <TouchableOpacity
                      style={[styles.applyBtnSecondary, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => handleApply('append')}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={theme.accentLight} />
                      <Text style={[styles.applyBtnSecondaryText, { color: theme.accentLight }]}>
                        Tambah di Akhir
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.applyBtnPrimary, { backgroundColor: theme.primary }]}
                      onPress={() => handleApply('replace')}
                    >
                      <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                      <Text style={styles.applyBtnPrimaryText}>Ganti Isi Catatan</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.applyBtnFull, { backgroundColor: theme.primary }]}
                    onPress={() => handleApply('replace')}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.applyBtnFullText}>Terapkan ke Catatan Kuliah</Text>
                  </TouchableOpacity>
                )}
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
    height: '90%',
    maxHeight: 740,
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
  modeGrid: {
    gap: 8,
  },
  modeOptionCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeOptionCardActive: {
    borderWidth: 1.5,
  },
  modeOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modeOptionTitle: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  modeOptionDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  instructionInput: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 12.5,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  resultMetaLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  resultSuggestedTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  subjectTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  subjectTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150,150,150,0.1)',
    borderRadius: 8,
    padding: 2,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabBtnText: {
    fontSize: 11.5,
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    padding: 18,
  },
  rawText: {
    fontSize: 13,
    lineHeight: 19,
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
  applyActionsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  applyBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  applyBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  applyBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  applyBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
