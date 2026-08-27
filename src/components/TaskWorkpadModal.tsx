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
import MarkdownRenderer from './MarkdownRenderer';
import { parseDeadline } from '../lib/dateUtils';
import { useNavigation } from '@react-navigation/native';

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
  const navigation = useNavigation<any>();
  const { theme, isLightMode } = useTheme();
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [copied, setCopied] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (task) {
      setContent(task.notes || '');
      setViewMode(task.notes && task.notes.trim().length > 0 ? 'preview' : 'edit');
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

  const handleSave = () => {
    if (!task) return;
    onSaveNotes(task.id, content.trim());
    onClose();
  };

  const handleCopy = () => {
    if (!content.trim()) return;
    copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateAiOutline = async (type: 'outline' | 'draft') => {
    if (!task) return;
    const online = await isDeviceOnline();
    if (!online) {
      showAlert('Mode Offline', 'Perlu koneksi internet untuk menghasilkan outline AI.');
      return;
    }

    setLoadingAi(true);
    try {
      let prompt = '';
      if (type === 'outline') {
        prompt = `Buatkan outline dan poin-poin pengerjaan tugas "${task.title}" mata kuliah ${task.subject || 'kuliah'}. Tuliskan dalam format Markdown yang rapi, padat, dan langsung to-the-point tanpa basa-basi.`;
      } else {
        prompt = `Tuliskan draft panduan penyelesaian awal untuk tugas "${task.title}" mata kuliah ${task.subject || 'kuliah'}. Tuliskan dalam format Markdown yang informatif, terstruktur, dan berbobot akademis.`;
      }

      const reply = await sendMessageToGemini([], prompt);
      if (reply) {
        setContent(prev => (prev.trim() ? `${prev}\n\n---\n### 💡 ${type === 'outline' ? 'Outline Tugas AI' : 'Draft Panduan AI'}\n${reply}` : reply));
        setViewMode('preview');
        showAlert('AI Berhasil! ✨', 'Rancangan tugas telah ditambahkan ke lembar kerja.');
      }
    } catch (err: any) {
      showAlert('Gagal AI', err.message || 'Server AI sedang sibuk.');
    } finally {
      setLoadingAi(false);
    }
  };

  if (!task) return null;

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

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
              
              {/* Header Info */}
              <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.subjectBadge, { backgroundColor: theme.accentBg }]}>
                      <Text style={[styles.subjectBadgeText, { color: theme.accentLight }]}>
                        {task.subject || 'Umum'}
                      </Text>
                    </View>
                    {task.due_date ? (
                      <View style={[styles.dueBadge, { backgroundColor: isLightMode ? '#FEF3C7' : '#2C1D06' }]}>
                        <Ionicons name="time-outline" size={11} color={isLightMode ? '#B45309' : '#FBBF24'} />
                        <Text style={[styles.dueBadgeText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>
                          {parseDeadline(task.due_date)?.formattedText || task.due_date}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={2}>
                    {task.title}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={18} color={theme.subtext} />
                </TouchableOpacity>
              </View>

              {/* View Mode Switcher + AI Action Toolbar */}
              <View style={[styles.toolbarRow, { borderBottomColor: theme.border, backgroundColor: theme.cardInner }]}>
                {/* View Mode Tabs */}
                <View style={styles.modeTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeTabBtn,
                      { borderColor: theme.border },
                      viewMode === 'preview' && [styles.modeTabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setViewMode('preview')}
                  >
                    <Ionicons name="eye-outline" size={13} color={viewMode === 'preview' ? theme.accentLight : theme.subtext} />
                    <Text style={[styles.modeTabBtnText, { color: viewMode === 'preview' ? theme.accentLight : theme.subtext }, viewMode === 'preview' && { fontWeight: '700' }]}>
                      Pratinjau Rapi
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeTabBtn,
                      { borderColor: theme.border },
                      viewMode === 'edit' && [styles.modeTabBtnActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                    ]}
                    onPress={() => setViewMode('edit')}
                  >
                    <Ionicons name="create-outline" size={13} color={viewMode === 'edit' ? theme.accentLight : theme.subtext} />
                    <Text style={[styles.modeTabBtnText, { color: viewMode === 'edit' ? theme.accentLight : theme.subtext }, viewMode === 'edit' && { fontWeight: '700' }]}>
                      Edit Teks
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* AI Actions Scroll */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.aiActionBarScroll}
                >
                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: isLightMode ? '#EFF6FF' : '#1E293B', borderColor: isLightMode ? '#BFDBFE' : '#3B82F6' }]}
                    onPress={() => {
                      if (!task) return;
                      onClose();
                      navigation.navigate('Main', {
                        screen: 'Chat',
                        params: {
                          initialMessage: `Halo Ara, bantu aku bedah ide, konsep, dan panduan langkah pengerjaan untuk tugas '${task.title}' mata kuliah '${task.subject || 'Umum'}' ya!\n\n${content ? `Catatan/Petunjuk Soal:\n${content}` : ''}`,
                          autoSend: true,
                          timestamp: Date.now(),
                        },
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubbles-outline" size={12} color={isLightMode ? '#2563EB' : '#60A5FA'} />
                    <Text style={[styles.aiActionBtnText, { color: isLightMode ? '#2563EB' : '#60A5FA', fontWeight: '700' }]}>Bahas di Chat</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => handleGenerateAiOutline('outline')}
                    disabled={loadingAi}
                    activeOpacity={0.7}
                  >
                    {loadingAi ? (
                      <ActivityIndicator size="small" color={theme.accentLight} style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                    )}
                    <Text style={[styles.aiActionBtnText, { color: theme.accentLight, fontWeight: '700' }]}>Outline AI</Text>
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

              {/* Main Content: Preview or Editor */}
              {viewMode === 'preview' ? (
                <ScrollView style={[styles.previewContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]} contentContainerStyle={{ padding: 14 }}>
                  {content.trim().length > 0 ? (
                    <MarkdownRenderer content={content} fontSize={13} textColor={theme.text} />
                  ) : (
                    <View style={styles.emptyPreviewBox}>
                      <Ionicons name="document-text-outline" size={32} color={theme.muted} />
                      <Text style={[styles.emptyPreviewText, { color: theme.subtext }]}>
                        Belum ada catatan atau lembar kerja. Klik tab "Edit Teks" untuk mulai menulis atau gunakan bantuan AI di atas.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              ) : (
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
              )}

              {/* Footer Stats & Actions */}
              <View style={styles.footerRow}>
                <Text style={[styles.counterText, { color: theme.muted }]}>
                  {wordCount} kata • {charCount} karakter
                </Text>

                <View style={styles.btnGroup}>
                  <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onClose}>
                    <Text style={[styles.cancelBtnText, { color: theme.subtext }]}>Tutup</Text>
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
    maxWidth: 680,
    height: '88%',
    maxHeight: 700,
    borderRadius: 18,
    borderWidth: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subjectBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    lineHeight: 20,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  modeTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  modeTabBtnActive: {
    borderWidth: 1.5,
  },
  modeTabBtnText: {
    fontSize: 11,
  },
  aiActionBarScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  aiActionBtnText: {
    fontSize: 11,
  },
  previewContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyPreviewBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyPreviewText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  editorContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  editorInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  counterText: {
    fontSize: 11,
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
    gap: 6,
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
