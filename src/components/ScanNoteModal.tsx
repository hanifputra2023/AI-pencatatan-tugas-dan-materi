import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { sendMessageToGemini } from '../lib/gemini';
import { compressImage, uriToBase64 } from '../lib/imageCompressor';
import { showAlert } from '../lib/alert';
import { ChatAttachment } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

export type ScanRewriteMode = 'smart_rewrite' | 'ocr_exact' | 'summary';

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

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');

  const [scanMode, setScanMode] = useState<ScanRewriteMode>('smart_rewrite');
  const [customInstruction, setCustomInstruction] = useState('');
  const [loading, setLoading] = useState(false);

  // Result state
  const [aiResultText, setAiResultText] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string>('');
  const [suggestedSubject, setSuggestedSubject] = useState<string>('');
  const [resultTab, setResultTab] = useState<'preview' | 'raw'>('preview');

  const resetAll = () => {
    setImageUri(null);
    setImageBase64(null);
    setImageMime('image/jpeg');
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

  const pickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const compressedUri = await compressImage(asset.uri, { maxWidth: 1200, quality: 0.7 });
        const b64 = await uriToBase64(compressedUri);
        setImageUri(compressedUri);
        setImageBase64(b64);
        setImageMime(asset.mimeType || 'image/jpeg');
        setAiResultText(null);
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
        setImageUri(compressedUri);
        setImageBase64(b64);
        setImageMime('image/jpeg');
        setAiResultText(null);
      }
    } catch (e: any) {
      showAlert('Gagal Membuka Kamera', e.message || 'Terjadi kesalahan saat mengaktifkan kamera.');
    }
  };

  const handleAnalyzeWithAI = async () => {
    if (!imageBase64) {
      showAlert('Pilih Foto Dulu', 'Silakan ambil foto atau pilih gambar materi terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      let promptTask = '';
      if (scanMode === 'smart_rewrite') {
        promptTask = `Tugasmu adalah menganalisis foto materi pelajaran/kuliah ini dan menuliskan ulang (Smart Rewrite) menjadi catatan belajar yang SANGAT RAPI, terstruktur, lengkap, dan berformat Markdown indah.
- Gunakan Judul & Subjudul (#, ##, ###) yang jelas.
- Rombak poin-poin panjang menjadi bullet points (-) yang mudah dihafal.
- Tebalkan (**kata kunci**) istilah atau definisi penting.
- Tuliskan rumus matematika atau potongan kode jika ada dengan format blok yang rapi.
- Perbaiki tulisan yang tidak rapi, typo, atau kalimat terpotong dari foto aslinya agar enak dibaca.`;
      } else if (scanMode === 'ocr_exact') {
        promptTask = `Tugasmu adalah melakukan OCR Transkripsi Persis dari foto ini.
- Salin seluruh teks yang terbaca pada foto secara lengkap dan akurat apa adanya.
- Jangan kurangi informasi atau merubah kata aslinya.`;
      } else {
        promptTask = `Tugasmu adalah membaca materi pada foto ini lalu membuatkan RANGKUMAN INTISARI konsep utama dan poin-poin paling penting/esensial dalam format Markdown ringkas, padat, dan jelas.`;
      }

      if (customInstruction.trim()) {
        promptTask += `\n\nInstruksi Khusus Tambahan dari Siswa: "${customInstruction.trim()}"`;
      }

      promptTask += `\n\nFormat output WAJIB diawali dengan 2 baris metadata persis seperti ini (tanpa tanda kutip):
JUDUL_DISARANKAN: [Tuliskan judul catatan yang singkat dan representatif]
MATA_KULIAH_DISARANKAN: [Tuliskan nama mata pelajaran atau mata kuliah yang paling sesuai]
---
[Di bawah garis pemisah ini, langsung tuliskan seluruh isi materi catatan sesuai instruksi di atas tanpa basa-basi pembuka ataupun penutup]`;

      const academicSystemInstruction = `Kamu adalah Asisten AI Vision Akademik handal. Kamu sangat mahir membaca papan tulis, buku teks, tulisan tangan, serta slide perkuliahan dan mengubahnya menjadi catatan belajar mahasiswa/siswa yang berkualitas tinggi.`;

      const attachment: ChatAttachment = {
        type: 'image',
        uri: imageUri || '',
        mimeType: imageMime,
        base64: imageBase64,
      };

      const aiReply = await sendMessageToGemini(
        [],
        promptTask,
        attachment,
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

      setSuggestedTitle(parsedTitle);
      setSuggestedSubject(matchedSubject || parsedSubject);
      setAiResultText(cleanMarkdown);
    } catch (e: any) {
      showAlert('Gagal Menganalisis Foto', e.message || 'Terjadi kesalahan saat AI memproses gambar.');
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
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContainer,
            isWide && styles.modalContainerWide,
            { backgroundColor: theme.card, borderColor: theme.border }
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.iconWrap, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="camera" size={18} color={theme.accentLight} />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Scan Foto Materi AI</Text>
                <Text style={[styles.modalSub, { color: theme.muted }]}>
                  Analisis gambar & rewrite otomatis ke catatan
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: theme.cardInner }]}>
              <Ionicons name="close" size={18} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!aiResultText ? (
              <>
                {/* Step 1: Image Selector / Preview */}
                <Text style={[styles.sectionLabel, { color: theme.text }]}>1. Foto Materi Catatan / Buku / Papan Tulis:</Text>
                {imageUri ? (
                  <View style={[styles.previewCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Image source={{ uri: imageUri }} style={styles.imageThumbnail} resizeMode="contain" />
                    <View style={styles.previewActions}>
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={pickFromGallery}>
                        <Ionicons name="images-outline" size={13} color={theme.accentLight} />
                        <Text style={[styles.smallBtnText, { color: theme.accentLight }]}>Ganti Foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtnDanger, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1215', borderColor: isLightMode ? '#FECACA' : '#5A1B22' }]} onPress={() => setImageUri(null)}>
                        <Ionicons name="trash-outline" size={13} color="#EF4444" />
                        <Text style={[styles.smallBtnDangerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>Hapus</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pickBtnRow}>
                    <TouchableOpacity
                      style={[styles.pickChoiceBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={takePhoto}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pickIconCircle, { backgroundColor: isLightMode ? '#E0E7FF' : '#1E293B' }]}>
                        <Ionicons name="camera" size={22} color={theme.accentLight} />
                      </View>
                      <Text style={[styles.pickChoiceTitle, { color: theme.text }]}>Kamera Langsung</Text>
                      <Text style={[styles.pickChoiceSub, { color: theme.muted }]}>Foto papan tulis / buku sekarang</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.pickChoiceBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={pickFromGallery}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pickIconCircle, { backgroundColor: isLightMode ? '#ECFDF5' : '#132A22' }]}>
                        <Ionicons name="images" size={22} color="#10B981" />
                      </View>
                      <Text style={[styles.pickChoiceTitle, { color: theme.text }]}>Pilih dari Galeri</Text>
                      <Text style={[styles.pickChoiceSub, { color: theme.muted }]}>Upload foto / screenshot materi</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 2: Mode Selection */}
                <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 18 }]}>2. Pilih Mode Analisis AI:</Text>
                <View style={styles.modeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.modeCard,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                      scanMode === 'smart_rewrite' && [styles.modeCardActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setScanMode('smart_rewrite')}
                  >
                    <View style={styles.modeHeader}>
                      <Ionicons name="sparkles" size={16} color={scanMode === 'smart_rewrite' ? theme.accentLight : theme.muted} />
                      <Text style={[styles.modeTitle, { color: theme.text }, scanMode === 'smart_rewrite' && { color: theme.accentLight, fontWeight: '700' }]}>
                        Smart Note Rewrite ✨
                      </Text>
                      <View style={[styles.badgeRec, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F2618' }]}>
                        <Text style={[styles.badgeRecText, { color: isLightMode ? '#15803D' : '#34D399' }]}>Disarankan</Text>
                      </View>
                    </View>
                    <Text style={[styles.modeDesc, { color: theme.subtext }]}>
                      Menyusun ulang materi menjadi catatan Markdown yang terstruktur, lengkap, rapi, dan mudah dipahami.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeCard,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                      scanMode === 'ocr_exact' && [styles.modeCardActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setScanMode('ocr_exact')}
                  >
                    <View style={styles.modeHeader}>
                      <Ionicons name="document-text-outline" size={16} color={scanMode === 'ocr_exact' ? theme.accentLight : theme.muted} />
                      <Text style={[styles.modeTitle, { color: theme.text }, scanMode === 'ocr_exact' && { color: theme.accentLight, fontWeight: '700' }]}>
                        OCR Transkripsi Persis 📋
                      </Text>
                    </View>
                    <Text style={[styles.modeDesc, { color: theme.subtext }]}>
                      Menyalin seluruh teks di gambar secara kata-per-kata apa adanya tanpa pengubahan.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeCard,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                      scanMode === 'summary' && [styles.modeCardActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setScanMode('summary')}
                  >
                    <View style={styles.modeHeader}>
                      <Ionicons name="flash-outline" size={16} color={scanMode === 'summary' ? theme.accentLight : theme.muted} />
                      <Text style={[styles.modeTitle, { color: theme.text }, scanMode === 'summary' && { color: theme.accentLight, fontWeight: '700' }]}>
                        Rangkum Intisari Kilat ⚡
                      </Text>
                    </View>
                    <Text style={[styles.modeDesc, { color: theme.subtext }]}>
                      Meringkas poin-poin paling penting dan konsep esensial dari gambar secara cepat.
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Step 3: Optional Instruction */}
                <Text style={[styles.sectionLabel, { color: theme.text, marginTop: 16 }]}>
                  3. Instruksi Tambahan (Opsional):
                </Text>
                <TextInput
                  style={[styles.customInput, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }]}
                  placeholder="Misal: 'Fokuskan ke rumus Bab 3' atau 'Jelaskan istilah asingnya'..."
                  placeholderTextColor={theme.muted}
                  value={customInstruction}
                  onChangeText={setCustomInstruction}
                />

                {/* Action Trigger */}
                <TouchableOpacity
                  style={[
                    styles.processBtn,
                    { backgroundColor: theme.primary },
                    (!imageUri || loading) && { opacity: 0.6 }
                  ]}
                  onPress={handleAnalyzeWithAI}
                  disabled={!imageUri || loading}
                >
                  {loading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.processBtnText}>Sedang Menganalisis & Rewrite Materi...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="sparkles" size={17} color="#FFFFFF" />
                      <Text style={styles.processBtnText}>Mulai Analisis & Tulis Catatan</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              /* Step 4: Review & Apply Result */
              <View style={styles.resultContainer}>
                {/* Result Meta Banner */}
                <View style={[styles.resultMetaCard, { backgroundColor: isLightMode ? '#EFF6FF' : '#101B2E', borderColor: isLightMode ? '#BFDBFE' : '#1E355B' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                    <Text style={[styles.resultMetaTitle, { color: isLightMode ? '#1D4ED8' : theme.text }]}>
                      Hasil Analisis AI Selesai!
                    </Text>
                  </View>
                  {suggestedTitle ? (
                    <Text style={[styles.resultMetaSub, { color: theme.subtext, marginTop: 4 }]}>
                      💡 Usulan Judul: <Text style={{ fontWeight: '700', color: isLightMode ? '#1E40AF' : theme.accentLight }}>{suggestedTitle}</Text>
                    </Text>
                  ) : null}
                  {suggestedSubject ? (
                    <Text style={[styles.resultMetaSub, { color: theme.subtext, marginTop: 2 }]}>
                      📚 Usulan Matkul: <Text style={{ fontWeight: '600', color: theme.text }}>{suggestedSubject}</Text>
                    </Text>
                  ) : null}
                </View>

                {/* Switch between Markdown View & Raw Text */}
                <View style={styles.previewToggleRow}>
                  <Text style={[styles.sectionLabel, { color: theme.text, marginBottom: 0 }]}>Pratinjau Hasil Catatan:</Text>
                  <View style={[styles.tabMiniWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <TouchableOpacity
                      style={[styles.tabMiniBtn, resultTab === 'preview' && [styles.tabMiniBtnActive, { backgroundColor: theme.card }]]}
                      onPress={() => setResultTab('preview')}
                    >
                      <Text style={[styles.tabMiniText, { color: theme.subtext }, resultTab === 'preview' && { color: theme.accentLight, fontWeight: '700' }]}>
                        Pratinjau
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tabMiniBtn, resultTab === 'raw' && [styles.tabMiniBtnActive, { backgroundColor: theme.card }]]}
                      onPress={() => setResultTab('raw')}
                    >
                      <Text style={[styles.tabMiniText, { color: theme.subtext }, resultTab === 'raw' && { color: theme.accentLight, fontWeight: '700' }]}>
                        Teks Mentah
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.resultContentCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  {resultTab === 'preview' ? (
                    <MarkdownRenderer content={aiResultText} fontSize={14} textColor={theme.text} />
                  ) : (
                    <Text style={[styles.rawTextDisplay, { color: theme.text }]}>{aiResultText}</Text>
                  )}
                </View>

                {/* Apply Buttons */}
                <View style={styles.applyBtnGroup}>
                  {hasExistingContent ? (
                    <>
                      <TouchableOpacity
                        style={[styles.applyBtn, { backgroundColor: theme.primary }]}
                        onPress={() => handleApply('append')}
                      >
                        <Ionicons name="add-circle-outline" size={17} color="#FFFFFF" />
                        <Text style={styles.applyBtnText}>Tambahkan ke Bawah Catatan (Append)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.applyBtnOutline, { borderColor: theme.border, backgroundColor: theme.cardInner }]}
                        onPress={() => handleApply('replace')}
                      >
                        <Ionicons name="swap-horizontal-outline" size={17} color={theme.text} />
                        <Text style={[styles.applyBtnOutlineText, { color: theme.text }]}>Ganti Seluruh Catatan</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.applyBtn, { backgroundColor: theme.primary }]}
                      onPress={() => handleApply('replace')}
                    >
                      <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.applyBtnText}>Terapkan ke Catatan Saya</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.rescanBtn, { borderColor: theme.border }]}
                    onPress={() => setAiResultText(null)}
                  >
                    <Ionicons name="refresh-outline" size={15} color={theme.subtext} />
                    <Text style={[styles.rescanBtnText, { color: theme.subtext }]}>Scan Ulang / Ubah Mode</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalContainerWide: {
    maxWidth: 680,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickChoiceBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pickChoiceTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  pickChoiceSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  imageThumbnail: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnDangerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modeContainer: {
    gap: 8,
  },
  modeCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  modeCardActive: {
    borderColor: '#3B82F6',
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  badgeRec: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeRecText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modeDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginLeft: 22,
  },
  customInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12.5,
  },
  processBtn: {
    marginTop: 20,
    marginBottom: 10,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  resultContainer: {
    gap: 12,
    paddingBottom: 20,
  },
  resultMetaCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  resultMetaTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultMetaSub: {
    fontSize: 12,
  },
  previewToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  tabMiniWrap: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  tabMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tabMiniBtnActive: {
    shadowOpacity: 0.1,
  },
  tabMiniText: {
    fontSize: 11,
  },
  resultContentCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    maxHeight: 260,
    overflow: 'hidden',
  },
  rawTextDisplay: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  applyBtnGroup: {
    gap: 8,
    marginTop: 6,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  applyBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  applyBtnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  rescanBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
