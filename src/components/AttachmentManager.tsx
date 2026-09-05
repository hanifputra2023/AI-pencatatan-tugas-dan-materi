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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { useTheme } from '../contexts/ThemeContext';
import { NoteAttachment } from '../types';
import {
  pickMultipleImages,
  pickMultipleDocuments,
  takePhotoCamera,
  formatFileSize,
} from '../lib/attachmentPicker';
import { showAlert } from '../lib/alert';
import { readTextFileContent, isTextFile, isPdfFile, isDocxFile, extractTextFromDocxRaw } from '../lib/fileReader';

function getSafeWebDocumentUrl(doc: NoteAttachment): string {
  if (Platform.OS !== 'web') return doc.uri;

  // 1. If it's already a blob url and still valid
  if (doc.uri && doc.uri.startsWith('blob:')) {
    return doc.uri;
  }

  // 2. If base64 is available, create a fresh object URL
  if (doc.base64) {
    try {
      const isPdf = doc.name.toLowerCase().endsWith('.pdf') || doc.mimeType === 'application/pdf';
      const mime = doc.mimeType || (isPdf ? 'application/pdf' : 'application/octet-stream');
      const byteCharacters = atob(doc.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      return URL.createObjectURL(blob);
    } catch (e) {
      return `data:${doc.mimeType || 'application/pdf'};base64,${doc.base64}`;
    }
  }

  return doc.uri || '';
}

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
  const [copiedText, setCopiedText] = useState(false);

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

  // Open native high-resolution PDF reader directly on device (Zero AI)
  const handleOpenPdfDirect = async (item: NoteAttachment) => {
    try {
      if (Platform.OS === 'web') {
        const safeUri = getSafeWebDocumentUrl(item);
        if (typeof window !== 'undefined') {
          window.open(safeUri, '_blank');
        }
        return;
      }
      // On Android / iOS Native: Expo Print opens the native full-page PDF viewer!
      await Print.printAsync({ uri: item.uri });
    } catch (e: any) {
      handleOpenExternalApp(item);
    }
  };

  // Open in external dedicated app (Google Drive PDF / WPS Office / MS Word)
  const handleOpenExternalApp = async (item: NoteAttachment) => {
    try {
      if (Platform.OS === 'web') {
        const safeUri = getSafeWebDocumentUrl(item);
        if (typeof window !== 'undefined') {
          window.open(safeUri, '_blank');
        }
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        const isPdf = item.name.toLowerCase().endsWith('.pdf') || item.mimeType === 'application/pdf';
        await Sharing.shareAsync(item.uri, {
          mimeType: item.mimeType || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          dialogTitle: `Buka ${item.name}`,
        });
        return;
      }
      await Linking.openURL(item.uri);
    } catch (e: any) {
      showAlert('Buka Dokumen', 'Pastikan ada aplikasi pembaca dokumen (seperti Google Drive / WPS Office) di perangkatmu.');
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

  const handleItemPress = (item: NoteAttachment) => {
    if (item.type === 'image') {
      setPreviewImageUri(item.uri);
      return;
    }

    setPreviewDoc(item);

    // If PDF on Mobile: automatically open native full-page PDF reader immediately!
    if (Platform.OS !== 'web' && isPdfFile(item.name, item.mimeType)) {
      handleOpenPdfDirect(item);
      return;
    }

    // If text file (.txt, .md, .csv, .json, .py, etc.) and text not loaded yet, read file directly!
    if (!item.textContent && isTextFile(item.name, item.mimeType)) {
      readTextFileContent(item.uri)
        .then(txt => {
          if (txt && txt.trim()) {
            const updated = { ...item, textContent: txt.trim() };
            setPreviewDoc(updated);
            if (onUpdateAttachment) onUpdateAttachment(updated);
          }
        })
        .catch(() => {});
    }

    // If docx file and text not loaded yet, extract raw docx text directly!
    if (!item.textContent && isDocxFile(item.name, item.mimeType)) {
      readTextFileContent(item.uri)
        .then(raw => {
          const extracted = extractTextFromDocxRaw(raw);
          if (extracted && extracted.trim()) {
            const updated = { ...item, textContent: extracted.trim() };
            setPreviewDoc(updated);
            if (onUpdateAttachment) onUpdateAttachment(updated);
          }
        })
        .catch(() => {});
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
            const isPdf = isPdfFile(item.name, item.mimeType);
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
                    <View style={[
                      styles.docThumbnail,
                      { backgroundColor: isPdf ? (isLightMode ? '#FEE2E2' : '#450A0A') : (isLightMode ? '#F1F5F9' : '#1E293B') }
                    ]}>
                      <Ionicons
                        name={getDocIconName(item.name, item.mimeType)}
                        size={26}
                        color={isPdf ? '#EF4444' : theme.accentLight}
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
              <View style={[
                styles.docPreviewCard,
                styles.docPreviewCardLarge,
                { backgroundColor: theme.card, borderColor: theme.border }
              ]}>
                
                {/* Header info */}
                <View style={styles.docPreviewHeader}>
                  <View style={[
                    styles.docIconBox,
                    { backgroundColor: (previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType)) ? (isLightMode ? '#FEE2E2' : '#7F1D1D') : theme.accentBg }
                  ]}>
                    <Ionicons
                      name={previewDoc ? getDocIconName(previewDoc.name, previewDoc.mimeType) : 'document'}
                      size={24}
                      color={(previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType)) ? '#EF4444' : theme.accentLight}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.docPreviewTitle, { color: theme.text }]} numberOfLines={1}>
                      {previewDoc?.name}
                    </Text>
                    <Text style={[styles.docPreviewMeta, { color: theme.subtext }]}>
                      {formatFileSize(previewDoc?.size)} • Dokumen Asli ({previewDoc?.name.split('.').pop()?.toUpperCase() || 'FILE'})
                    </Text>
                  </View>

                  {/* Header Actions */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {Platform.OS === 'web' && previewDoc && (
                      <TouchableOpacity
                        style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => handleOpenExternalApp(previewDoc)}
                      >
                        <Ionicons name="open-outline" size={14} color={theme.accentLight} />
                        <Text style={[styles.headerActionBtnText, { color: theme.accentLight }]}>
                          Layar Penuh
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.headerCloseBtn, { backgroundColor: theme.cardInner }]}
                      onPress={() => setPreviewDoc(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={20} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Modal Body Content */}
                {Platform.OS === 'web' && previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType) ? (
                  /* WEB NATIVE PDF VIEWER - 100% Real Original PDF in iframe, Zero AI */
                  <View style={styles.iframeContainer}>
                    {/* @ts-ignore - Web iframe for native direct PDF reading */}
                    <iframe
                      src={getSafeWebDocumentUrl(previewDoc)}
                      style={{
                        width: '100%',
                        height: '100%',
                        minHeight: 480,
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: '#525659',
                      }}
                      title={previewDoc.name}
                    />
                  </View>
                ) : previewDoc?.textContent ? (
                  /* TEXT / CODE / DOCX CONTENT VIEWER - Exact raw file content from disk, Zero AI */
                  <View style={{ flex: 1, marginVertical: 8 }}>
                    <View style={styles.docContentHeaderRow}>
                      <Text style={[styles.docContentLabel, { color: theme.subtext }]}>
                        Isi Asli Dokumen ({previewDoc.textContent.split('\n').length} baris):
                      </Text>
                      <TouchableOpacity
                        style={[styles.copyTextBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => handleCopyDocText(previewDoc.textContent || '')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={copiedText ? 'checkmark' : 'copy-outline'} size={13} color={copiedText ? '#10B981' : theme.accentLight} />
                        <Text style={[styles.copyTextBtnLabel, { color: copiedText ? '#10B981' : theme.accentLight }]}>
                          {copiedText ? 'Tersalin' : 'Salin Semua Teks'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <ScrollView style={[styles.docContentScroll, { backgroundColor: isLightMode ? '#F8FAFC' : '#0B1120' }]}>
                      <Text style={[styles.docContentText, { color: theme.text, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]} selectable>
                        {previewDoc.textContent}
                      </Text>
                    </ScrollView>
                  </View>
                ) : (
                  /* MOBILE PDF VIEWER CARD - 100% Original Document */
                  <View style={styles.docUnextractedCard}>
                    <View style={[styles.docUnextractedIconBox, { backgroundColor: (previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType)) ? (isLightMode ? '#FEE2E2' : '#7F1D1D') : theme.accentBg }]}>
                      <Ionicons
                        name={previewDoc ? getDocIconName(previewDoc.name, previewDoc.mimeType) : 'document-text'}
                        size={46}
                        color={(previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType)) ? '#EF4444' : theme.accentLight}
                      />
                    </View>
                    <Text style={[styles.docUnextractedTitle, { color: theme.text }]}>
                      {previewDoc?.name}
                    </Text>
                    <Text style={[styles.docUnextractedDesc, { color: theme.subtext }]}>
                      Dokumen PDF Asli ({formatFileSize(previewDoc?.size)}).
                    </Text>

                    <View style={styles.docActionGrid}>
                      <TouchableOpacity
                        style={[styles.primaryAiBtn, { backgroundColor: (previewDoc && isPdfFile(previewDoc.name, previewDoc.mimeType)) ? '#EF4444' : theme.primary }]}
                        onPress={() => previewDoc && handleOpenPdfDirect(previewDoc)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="book-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryAiBtnText}>
                          Buka Halaman Dokumen Asli 📄
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.secondaryOpenBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => previewDoc && handleOpenExternalApp(previewDoc)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="open-outline" size={16} color={theme.accentLight} />
                        <Text style={[styles.secondaryOpenBtnText, { color: theme.text }]}>
                          Buka dengan Google Drive / WPS Office ↗️
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
                      onPress={() => handleOpenPdfDirect(previewDoc)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="reader-outline" size={15} color={theme.text} />
                      <Text style={[styles.footerOpenBtnText, { color: theme.text }]}>
                        {Platform.OS === 'web' ? 'Layar Penuh' : 'Buka Dokumen Asli'}
                      </Text>
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
    padding: 16,
  },
  docPreviewCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  docPreviewCardLarge: {
    maxWidth: 960,
    width: Platform.OS === 'web' ? '92%' : '96%',
    height: Platform.OS === 'web' ? '88%' : '85%',
    maxHeight: '92%',
    display: 'flex',
    flexDirection: 'column',
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
  },
  docPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  docPreviewMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  headerActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  headerCloseBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iframeContainer: {
    flex: 1,
    width: '100%',
    minHeight: 480,
    marginVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
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
    flex: 1,
    minHeight: 220,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
  },
  docContentText: {
    fontSize: 13,
    lineHeight: 20,
  },
  docUnextractedCard: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  docUnextractedIconBox: {
    width: 76,
    height: 76,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  docUnextractedTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  docUnextractedDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 380,
  },
  docActionGrid: {
    width: '100%',
    maxWidth: 360,
    gap: 10,
  },
  primaryAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
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
    paddingVertical: 11,
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
