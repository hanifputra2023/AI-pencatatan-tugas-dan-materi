import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, TouchableWithoutFeedback, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { StudentTask } from '../types';
import { copyToClipboard } from '../lib/clipboard';
import { sendMessageToGemini } from '../lib/gemini';
import { showAlert } from '../lib/alert';
import { isDeviceOnline } from '../lib/offlineSync';
import { exportTaskToPdf } from '../lib/pdfExporter';

import { parseDeadline } from '../lib/dateUtils';

interface TaskWorkpadModalProps {
  visible: boolean;
  task: StudentTask | null;
  onClose: () => void;
  onSaveNotes: (taskId: string, newNotes: string) => void;
}

export default function TaskWorkpadModal({
  visible,
  task,
  onClose,
  onSaveNotes,
}: TaskWorkpadModalProps) {
  const { theme, isLightMode } = useTheme();
  const [content, setContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (task) {
      setContent(task.notes || '');
      setCopied(false);
    }
  }, [task, visible]);

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (!task) return;
    setExportingPdf(true);
    try {
      await exportTaskToPdf(task, [], content);
    } catch (e: any) {
      showAlert('Gagal Cetak PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCopy = async () => {
    if (!content.trim()) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    if (!task) return;
    onSaveNotes(task.id, content);
    showAlert('Tersimpan! ✨', 'Catatan lembar kerja tugas berhasil diperbarui.');
    onClose();
  };

  const handleGenerateAiOutline = async (mode: 'outline' | 'draft') => {
    if (!task) return;
    const online = await isDeviceOnline();
    if (!online) {
      showAlert('Mode Offline ☁️', 'Fitur AI (Outline & Draft) memerlukan koneksi internet. Silakan sambungkan perangkat ke internet.');
      return;
    }

    setLoadingAi(true);
    try {
      const prompt = mode === 'outline'
        ? `Kamu adalah asisten akademik cerdas untuk mahasiswa. Buatkan kerangka pengerjaan (outline) terstruktur yang disesuaikan secara cerdas dengan jenis tugas kuliah berikut:
Judul Tugas: "${task.title}"
Mata Kuliah: "${task.subject}"

Panduan:
- Jika berupa Makalah / Essay: Berikan kerangka Bab I (Pendahuluan), Bab II (Tinjauan Teori), Bab III (Pembahasan & Analisis), Bab IV (Kesimpulan), serta referensi relevan.
- Jika berupa Laporan Praktikum / Proyek: Berikan alur Tujuan, Landasan Teori, Alat/Bahan/Metode, Analisis Hasil, dan Kesimpulan.
- Jika berupa Tugas Coding / Pemrograman: Berikan arsitektur sistem, alur logika/algoritma, modul program yang perlu dibuat, dan skenario pengujian.
- Jika berupa Analisis Kasus / Studi Kasus: Berikan identifikasi masalah utama, dasar hukum/teori terkait, metode analisis, dan rekomendasi solusi.
- Jika berupa Presentasi / Slide: Berikan poin-poin outline per slide dari pembuka hingga penutup.
- Jika berupa Soal / Latihan: Berikan langkah rumus, variabel yang dicari, dan sistematika penyelesaiannya.

Format jawaban dalam Markdown yang rapi, padat, dan langsung siap dipakai.`
        : `Kamu adalah asisten akademik mahasiswa. Buatkan draft pengerjaan / ringkasan awal materi yang mendalam dan komprehensif untuk tugas kuliah berikut:
Judul Tugas: "${task.title}"
Mata Kuliah: "${task.subject}"

Tuliskan draft penjelasan yang akademis, jelas, dan terstruktur sesuai topik untuk membantu mahasiswa memulai pengerjaan tugas ini.`;

      const aiText = await sendMessageToGemini(
        [],
        prompt,
        null,
        'Kamu adalah asisten akademik mahasiswa yang membantu menyusun outline dan draft tugas kuliah secara komprehensif, terstruktur, dan akademis.'
      );

      if (aiText && aiText.trim()) {
        setContent(prev => {
          const trimmed = prev.trim();
          if (!trimmed) return aiText.trim();
          return `${trimmed}\n\n---\n### 🤖 Panduan AI (${mode === 'outline' ? 'Outline Tugas' : 'Draft Pengerjaan'}):\n${aiText.trim()}`;
        });
      }
    } catch (e: any) {
      console.log('AI outline error:', e);
      showAlert('Gagal', e?.message || 'Tidak dapat menghasilkan bantuan AI saat ini.');
    } finally {
      setLoadingAi(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  if (!task) return null;

  const parsedDeadline = task.due_date ? parseDeadline(task.due_date) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={styles.metaRow}>
                    <View style={[styles.subjectBadge, { backgroundColor: theme.accentBg }]}>
                      <Text style={[styles.subjectText, { color: theme.accentLight }]}>{task.subject}</Text>
                    </View>
                    {parsedDeadline ? (
                      <View style={[styles.dueBadge, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <Ionicons name="calendar-outline" size={11} color={theme.accentLight} />
                        <Text style={[styles.dueText, { color: theme.text }]}>{parsedDeadline.formattedText}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={2}>
                    {task.title}
                  </Text>
                </View>

                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={theme.subtext} />
                </TouchableOpacity>
              </View>

              {/* AI Quick Actions Scrollable Bar */}
              <View style={[styles.aiActionBarWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.aiActionBarScroll}
                >
                  <View style={styles.aiLabelChip}>
                    <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                    <Text style={[styles.aiBarLabel, { color: theme.subtext }]}>Bantuan AI:</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}
                    onPress={() => handleGenerateAiOutline('outline')}
                    disabled={loadingAi}
                    activeOpacity={0.7}
                  >
                    {loadingAi ? (
                      <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                    )}
                    <Text style={[styles.aiActionBtnText, { color: theme.accentLight, fontWeight: '700' }]}>Buat Outline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => handleGenerateAiOutline('draft')}
                    disabled={loadingAi}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={12} color={theme.text} />
                    <Text style={[styles.aiActionBtnText, { color: theme.text }]}>Draft Jawaban</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: theme.card, borderColor: theme.border }, exportingPdf && { opacity: 0.6 }]}
                    onPress={handleExportPdf}
                    disabled={exportingPdf}
                    activeOpacity={0.7}
                  >
                    {exportingPdf ? (
                      <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="print-outline" size={12} color={theme.accentLight} />
                    )}
                    <Text style={[styles.aiActionBtnText, { color: theme.accentLight, fontWeight: '700' }]}>
                      Cetak PDF
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: copied ? '#10B981' : theme.card, borderColor: copied ? '#10B981' : theme.border }]}
                    onPress={handleCopy}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12} color={copied ? '#FFFFFF' : theme.subtext} />
                    <Text style={[styles.aiActionBtnText, { color: copied ? '#FFFFFF' : theme.subtext }]}>
                      {copied ? 'Tersalin!' : 'Salin'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Multiline Editor Area */}
              <View style={[styles.editorContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.editorInput, { color: theme.text }]}
                  placeholder="Tulis lembar kerja tugas, deskripsi soal dosen, draft jawaban, atau catatan referensi di sini..."
                  placeholderTextColor={theme.muted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Footer Stats & Actions */}
              <View style={styles.footerRow}>
                <Text style={[styles.counterText, { color: theme.muted }]}>
                  {wordCount} kata • {charCount} karakter
                </Text>

                <View style={styles.btnGroup}>
                  <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onClose}>
                    <Text style={[styles.cancelBtnText, { color: theme.subtext }]}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={handleSave}>
                    <Ionicons name="save-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Simpan Catatan</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    height: '88%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  subjectBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  subjectText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  dueText: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  aiActionBarWrap: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  aiActionBarScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  aiLabelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 2,
  },
  aiBarLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  aiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  aiActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  editorInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'inherit',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '500',
  },
  btnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
