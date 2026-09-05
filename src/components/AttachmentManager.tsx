import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
  Linking,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../contexts/ThemeContext';
import { NoteAttachment } from '../types';
import {
  pickMultipleImages,
  pickMultipleDocuments,
  takePhotoCamera,
  formatFileSize,
} from '../lib/attachmentPicker';
import { showAlert } from '../lib/alert';
import { sendMessageToGemini } from '../lib/gemini';
import { uriToBase64, readTextFileContent, isTextFile, isPdfFile } from '../lib/fileReader';

interface AttachmentManagerProps {
  attachments: NoteAttachment[];
  onAddAttachments?: (newAttachments: NoteAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onUpdateAttachment?: (updated: NoteAttachment) => void;
  isEditable?: boolean;
  title?: string;
}

export default function AttachmentManager({
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  onUpdateAttachment,
  isEditable = false,
  title = 'Lampiran File & Foto',
}: AttachmentManagerProps) {
  const { theme, isLightMode } = useTheme();
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<NoteAttachment | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [extractingAi, setExtractingAi] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [webDocTab, setWebDocTab] = useState<'text' | 'viewer'>('text');

  const handlePickImages = async () => {
    if (!onAddAttachments) return;
    setLoadingAction(true);
    try {
      const items = await pickMultipleImages();
      if (items.length > 0) {
        onAddAttachments(items);
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePickDocs = async () => {
    if (!onAddAttachments) return;
    setLoadingAction(true);
    try {
      const items = await pickMultipleDocuments();
      if (items.length > 0) {
        onAddAttachments(items);
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTakePhoto = async () => {
    if (!onAddAttachments) return;
    setLoadingAction(true);
    try {
      const item = await takePhotoCamera();
      if (item) {
        onAddAttachments([item]);
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleOpenFile = async (item: NoteAttachment) => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(item.uri, '_blank');
          return;
        }
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(item.uri, {
          mimeType: item.mimeType || 'application/pdf',
          dialogTitle: `Buka ${item.name}`,
        });
        return;
      }
      await Linking.openURL(item.uri);
    } catch (e: any) {
      showAlert('Buka Dokumen', 'Tidak dapat membuka dokumen secara langsung. Pastikan ada aplikasi pembaca PDF atau dokumen di perangkatmu.');
    }
  };

  const handleCopyDocText = async (text: string) => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
      showAlert('Teks Tersalin 📋', 'Seluruh isi teks dokumen berhasil disalin ke clipboard.');
    } catch (e) {}
  };

  const handleExtractDocWithAi = async (doc: NoteAttachment) => {
    setExtractingAi(true);
    try {
      let b64 = doc.base64 || '';
      if (!b64 && doc.uri) {
        b64 = await uriToBase64(doc.uri);
      }

      const isPdf = doc.name?.toLowerCase().endsWith('.pdf') || doc.mimeType === 'application/pdf';
      const attachmentsToSend: any[] = [];
      if (b64) {
        attachmentsToSend.push({
          type: 'document',
          mimeType: isPdf ? 'application/pdf' : (doc.mimeType || 'application/pdf'),
          base64: b64,
          name: doc.name,
        });
      }

      const prompt = `Kamu adalah Asisten Pembaca Dokumen Akademik Cerdas untuk mahasiswa.
Tolong baca seluruh isi dokumen "${doc.name}" ini secara cermat.
Sajikan isi teks dan materi dokumen ini secara terstruktur, jelas, dan komprehensif agar mahasiswa dapat membaca dan mempelajarinya langsung:
1. Ringkasan Singkat / Topik Utama
2. Poin-Poin Isi Lengkap Materi Dokumen (tuliskan isi pembahasan, bab, rumus, atau ketentuan yang ada secara detail)
3. Kesimpulan Penting

Sajikan dengan bahasa Indonesia yang jelas, gunakan bullet points dan heading rapi.`;

      const aiReply = await sendMessageToGemini(
        [],
        prompt,
        undefined,
        attachmentsToSend.length > 0 ? attachmentsToSend : undefined
      );

      if (aiReply && aiReply.trim()) {
        const updatedDoc: NoteAttachment = {
          ...doc,
          textContent: aiReply.trim(),
          base64: b64 || doc.base64,
        };
        setPreviewDoc(updatedDoc);
        if (onUpdateAttachment) {
          onUpdateAttachment(updatedDoc);
        }
        setWebDocTab('text');
        showAlert('Ekstraksi Berhasil ✨', 'Isi dokumen berhasil dibaca dan dirangkum secara lengkap oleh AI!');
      } else {
        throw new Error('AI tidak menghasilkan teks ekstraksi.');
      }
    } catch (e: any) {
      showAlert('Gagal Membaca Dokumen', e?.message || 'Server AI tidak dapat mengekstrak teks dari file ini. Silakan gunakan tombol "Buka Dokumen Asli" untuk membacanya.');
    } finally {
      setExtractingAi(false);
    }
  };

  const handleItemPress = (item: NoteAttachment) => {
    if (item.type === 'image') {
      setPreviewImageUri(item.uri);
    } else {
      setPreviewDoc(item);
      const isPdf = isPdfFile(item.name, item.mimeType);
      if (Platform.OS === 'web' && isPdf && !item.textContent) {
        setWebDocTab('viewer');
      } else {
        setWebDocTab('text');
      }

      // Auto-read plain text files if textContent is not yet loaded
      if (!item.textContent && isTextFile(item.name, item.mimeType)) {
        readTextFileContent(item.uri).then(txt => {
          if (txt && txt.trim()) {
            const updated = { ...item, textContent: txt.trim() };
            setPreviewDoc(updated);
            if (onUpdateAttachment) onUpdateAttachment(updated);
          }
        }).catch(() => {});
      }
    }
  };

  if (!isEditable && attachments.length === 0) {
    return null;
  }

  const getDocIconName = (name: string, mime?: string): any => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf' || mime === 'application/pdf') return 'document-text';
    if (['doc', 'docx'].includes(ext)) return 'document';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid';
    if (['ppt', 'pptx'].includes(ext)) return 'easel';
    if (['js', 'ts', 'tsx', 'py', 'html', 'css', 'json'].includes(ext)) return 'code-slash';
    if (['mp3', 'wav', 'm4a'].includes(ext)) return 'musical-notes';
    return 'document-attach';
  };

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="attach-outline" size={16} color={theme.accentLight} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {title} {attachments.length > 0 && `(${attachments.length})`}
          </Text>
        </View>
      </View>

      {/* Action Buttons (when editable) */}
      {isEditable && (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={handlePickImages}
            disabled={loadingAction}
            activeOpacity={0.7}
          >
            <Ionicons name="images-outline" size={15} color={isLightMode ? '#0284C7' : '#38BDF8'} />
            <Text style={[styles.actionBtnText, { color: isLightMode ? '#0284C7' : '#38BDF8' }]}>
              + Foto (Banyak)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={handlePickDocs}
            disabled={loadingAction}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={15} color={isLightMode ? '#D97706' : '#FBBF24'} />
            <Text style={[styles.actionBtnText, { color: isLightMode ? '#D97706' : '#FBBF24' }]}>
              + Dokumen / PDF
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnIconOnly, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={handleTakePhoto}
            disabled={loadingAction}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-outline" size={16} color={isLightMode ? '#16A34A' : '#34D399'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attachmentListScroll}
        >
          {attachments.map((item, idx) => {
            const isImg = item.type === 'image';
            return (
              <View
                key={item.id || `att-${idx}`}
                style={[
                  styles.attachmentItemCard,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.attachmentTouchArea}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.8}
                >
                  {isImg ? (
                    <Image source={{ uri: item.uri }} style={styles.imageThumbnail} resizeMode="cover" />
                  ) : (
                    <View style={[styles.docThumbnail, { backgroundColor: isLightMode ? '#F1F5F9' : '#1E293B' }]}>
                      <Ionicons
                        name={getDocIconName(item.name, item.mimeType)}
                        size={22}
                        color={theme.accentLight}
                      />
                    </View>
                  )}

                  <View style={styles.itemInfoWrap}>
                    <Text style={[styles.itemFileName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.itemFileSize, { color: theme.subtext }]}>
                      {formatFileSize(item.size)}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Remove Button */}
                {isEditable && onRemoveAttachment && (
                  <TouchableOpacity
                    style={[styles.removeBadgeBtn, { backgroundColor: '#EF4444' }]}
                    onPress={() => onRemoveAttachment(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Full-Screen Image Preview Modal */}
      <Modal
        visible={!!previewImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <TouchableWithoutFeedback onPress={() => setPreviewImageUri(null)}>
          <View style={styles.imagePreviewOverlay}>
            <View style={styles.imagePreviewCard}>
              <TouchableOpacity
                style={styles.closePreviewBtn}
                onPress={() => setPreviewImageUri(null)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              {previewImageUri && (
                <Image
                  source={{ uri: previewImageUri }}
                  style={styles.fullPreviewImage}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Document Detail Preview Modal */}
      <Modal
        visible={!!previewDoc}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewDoc(null)}
      >
        <TouchableWithoutFeedback onPress={() => setPreviewDoc(null)}>
          <View style={styles.docPreviewOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.docPreviewCard, styles.docPreviewCardLarge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                
                {/* Header info */}
                <View style={styles.docPreviewHeader}>
                  <View style={styles.docIconBox}>
                    <Ionicons
                      name={previewDoc ? getDocIconName(previewDoc.name, previewDoc.mimeType) : 'document'}
                      size={24}
                      color={theme.accentLight}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.docPreviewTitle, { color: theme.text }]} numberOfLines={2}>
                      {previewDoc?.name}
                    </Text>
                    <Text style={[styles.docPreviewMeta, { color: theme.subtext }]}>
                      {formatFileSize(previewDoc?.size)} • {previewDoc?.mimeType || 'Dokumen'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setPreviewDoc(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={24} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                {/* Web PDF Toggle Switcher */}
                {Platform.OS === 'web' && previewDoc && (previewDoc.mimeType === 'application/pdf' || previewDoc.name.toLowerCase().endsWith('.pdf')) && (
                  <View style={styles.webTabRow}>
                    <TouchableOpacity
                      style={[
                        styles.webTabBtn,
                        { borderColor: theme.border, backgroundColor: webDocTab === 'text' ? theme.accentBg : theme.cardInner },
                        webDocTab === 'text' && { borderColor: theme.accent }
                      ]}
                      onPress={() => setWebDocTab('text')}
                    >
                      <Ionicons name="document-text-outline" size={14} color={webDocTab === 'text' ? theme.accentLight : theme.subtext} />
                      <Text style={[styles.webTabText, { color: webDocTab === 'text' ? theme.accentLight : theme.subtext }, webDocTab === 'text' && { fontWeight: '700' }]}>
                        Teks & Ekstrak AI
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.webTabBtn,
                        { borderColor: theme.border, backgroundColor: webDocTab === 'viewer' ? theme.accentBg : theme.cardInner },
                        webDocTab === 'viewer' && { borderColor: theme.accent }
                      ]}
                      onPress={() => setWebDocTab('viewer')}
                    >
                      <Ionicons name="eye-outline" size={14} color={webDocTab === 'viewer' ? theme.accentLight : theme.subtext} />
                      <Text style={[styles.webTabText, { color: webDocTab === 'viewer' ? theme.accentLight : theme.subtext }, webDocTab === 'viewer' && { fontWeight: '700' }]}>
                        Tampilan Dokumen PDF
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Body Content */}
                {Platform.OS === 'web' && webDocTab === 'viewer' && previewDoc ? (
                  <View style={styles.iframeContainer}>
                    {/* @ts-ignore - Web iframe for native PDF reading */}
                    <iframe
                      src={previewDoc.uri}
                      style={{
                        width: '100%',
                        height: 340,
                        borderRadius: 10,
                        border: '1px solid ' + (isLightMode ? '#E2E8F0' : '#334155'),
                        backgroundColor: '#FFFFFF',
                      }}
                      title={previewDoc.name}
                    />
                  </View>
                ) : extractingAi ? (
                  <View style={styles.docLoadingBox}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text style={[styles.docLoadingTitle, { color: theme.text }]}>
                      🤖 Membaca Dokumen dengan Gemini AI...
                    </Text>
                    <Text style={[styles.docLoadingSub, { color: theme.subtext }]}>
                      Sedang mengekstrak materi, bab, rumus, dan konsep penting dari "{previewDoc?.name}"
                    </Text>
                  </View>
                ) : previewDoc?.textContent ? (
                  <View style={{ flex: 1, marginVertical: 10 }}>
                    <View style={styles.docContentHeaderRow}>
                      <Text style={[styles.docContentLabel, { color: theme.subtext }]}>
                        Isi & Ringkasan Materi Dokumen:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.copyTextBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                          onPress={() => handleCopyDocText(previewDoc.textContent || '')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={copiedText ? 'checkmark' : 'copy-outline'} size={13} color={copiedText ? '#10B981' : theme.accentLight} />
                          <Text style={[styles.copyTextBtnLabel, { color: copiedText ? '#10B981' : theme.accentLight }]}>
                            {copiedText ? 'Tersalin' : 'Salin Teks'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.copyTextBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                          onPress={() => handleExtractDocWithAi(previewDoc)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="sparkles" size={12} color="#F59E0B" />
                          <Text style={[styles.copyTextBtnLabel, { color: '#F59E0B' }]}>
                            Baca Ulang
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <ScrollView style={styles.docContentScroll}>
                      <Text style={[styles.docContentText, { color: theme.text }]} selectable>
                        {previewDoc.textContent}
                      </Text>
                    </ScrollView>
                  </View>
                ) : (
                  <View style={styles.docUnextractedCard}>
                    <View style={[styles.docUnextractedIconBox, { backgroundColor: theme.accentBg }]}>
                      <Ionicons name="document-text" size={32} color={theme.accentLight} />
                    </View>
                    <Text style={[styles.docUnextractedTitle, { color: theme.text }]}>
                      Isi Dokumen Siap Diakses
                    </Text>
                    <Text style={[styles.docUnextractedDesc, { color: theme.subtext }]}>
                      Dokumen "{previewDoc?.name}" tersimpan sebagai lampiran. Kamu dapat membaca isi dokumen ini langsung menggunakan AI, atau membukanya di aplikasi pembaca bawaan perangkatmu.
                    </Text>

                    <View style={styles.docActionGrid}>
                      <TouchableOpacity
                        style={[styles.primaryAiBtn, { backgroundColor: theme.primary }]}
                        onPress={() => previewDoc && handleExtractDocWithAi(previewDoc)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                        <Text style={styles.primaryAiBtnText}>
                          🤖 Baca & Ekstrak Isi Dokumen (AI)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.secondaryOpenBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => previewDoc && handleOpenFile(previewDoc)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="open-outline" size={15} color={theme.accentLight} />
                        <Text style={[styles.secondaryOpenBtnText, { color: theme.accentLight }]}>
                          ↗️ Buka di Aplikasi Pembaca / Tab Baru
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Footer Buttons */}
                <View style={styles.docModalFooterRow}>
                  {previewDoc && (
                    <TouchableOpacity
                      style={[styles.footerOpenBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={() => handleOpenFile(previewDoc)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={15} color={theme.text} />
                      <Text style={[styles.footerOpenBtnText, { color: theme.text }]}>Buka Dokumen Asli</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.closeDocModalBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={() => setPreviewDoc(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.closeDocModalBtnText, { color: theme.text }]}>Tutup</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnIconOnly: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentListScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  attachmentItemCard: {
    width: 140,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    position: 'relative',
  },
  attachmentTouchArea: {
    alignItems: 'center',
  },
  imageThumbnail: {
    width: '100%',
    height: 75,
    borderRadius: 6,
    marginBottom: 6,
  },
  docThumbnail: {
    width: '100%',
    height: 75,
    borderRadius: 6,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfoWrap: {
    width: '100%',
  },
  itemFileName: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemFileSize: {
    fontSize: 10,
    fontWeight: '500',
  },
  removeBadgeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  imagePreviewCard: {
    width: '100%',
    maxWidth: 600,
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  closePreviewBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 20,
  },
  fullPreviewImage: {
    width: '100%',
    height: '100%',
  },
  docPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  docPreviewCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  docPreviewCardLarge: {
    maxWidth: 620,
    maxHeight: '90%',
  },
  docPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  docIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150,150,150,0.1)',
  },
  docPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  docPreviewMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  webTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  webTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  webTabText: {
    fontSize: 12,
  },
  iframeContainer: {
    marginVertical: 10,
  },
  docLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  docLoadingTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  docLoadingSub: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  docContentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  docContentLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  copyTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  copyTextBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  docContentScroll: {
    maxHeight: 280,
    backgroundColor: 'rgba(150,150,150,0.05)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
  },
  docContentText: {
    fontSize: 13,
    lineHeight: 20,
  },
  docUnextractedCard: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  docUnextractedIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  docUnextractedTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  docUnextractedDesc: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 420,
  },
  docActionGrid: {
    width: '100%',
    gap: 10,
  },
  primaryAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primaryAiBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryOpenBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  docModalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
    paddingTop: 12,
  },
  footerOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  footerOpenBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeDocModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeDocModalBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
