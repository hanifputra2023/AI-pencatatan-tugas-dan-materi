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
import { useTheme } from '../contexts/ThemeContext';
import { NoteAttachment } from '../types';
import {
  pickMultipleImages,
  pickMultipleDocuments,
  takePhotoCamera,
  formatFileSize,
} from '../lib/attachmentPicker';
import { showAlert } from '../lib/alert';

interface AttachmentManagerProps {
  attachments: NoteAttachment[];
  onAddAttachments?: (newAttachments: NoteAttachment[]) => void;
  onRemoveAttachment?: (id: string) => void;
  isEditable?: boolean;
  title?: string;
}

export default function AttachmentManager({
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  isEditable = false,
  title = 'Lampiran File & Foto',
}: AttachmentManagerProps) {
  const { theme, isLightMode } = useTheme();
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<NoteAttachment | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

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

  const handleItemPress = (item: NoteAttachment) => {
    if (item.type === 'image') {
      setPreviewImageUri(item.uri);
    } else {
      setPreviewDoc(item);
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
              <View style={[styles.docPreviewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                  <TouchableOpacity onPress={() => setPreviewDoc(null)}>
                    <Ionicons name="close-circle" size={22} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                {previewDoc?.textContent ? (
                  <ScrollView style={styles.docContentScroll}>
                    <Text style={[styles.docContentLabel, { color: theme.subtext }]}>
                      Isi Teks Dokumen:
                    </Text>
                    <Text style={[styles.docContentText, { color: theme.text }]} selectable>
                      {previewDoc.textContent}
                    </Text>
                  </ScrollView>
                ) : (
                  <View style={styles.docNoTextWrap}>
                    <Ionicons name="information-circle-outline" size={20} color={theme.muted} />
                    <Text style={[styles.docNoTextDesc, { color: theme.subtext }]}>
                      Dokumen siap diakses.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.closeDocModalBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setPreviewDoc(null)}
                >
                  <Text style={styles.closeDocModalBtnText}>Tutup</Text>
                </TouchableOpacity>
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
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
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
  docContentScroll: {
    maxHeight: 250,
    marginVertical: 14,
  },
  docContentLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  docContentText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  docNoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  docNoTextDesc: {
    fontSize: 13,
  },
  closeDocModalBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  closeDocModalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
