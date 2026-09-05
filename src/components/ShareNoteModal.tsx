import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StudyNote } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  shareNoteAsJsonFile,
  sanitizeFilename,
  copyFormattedNoteToClipboard,
  exportAndShareNotePdf,
} from '../lib/noteSharer';

interface ShareNoteModalProps {
  visible: boolean;
  note: StudyNote | null;
  onClose: () => void;
}

export default function ShareNoteModal({ visible, note, onClose }: ShareNoteModalProps) {
  const { theme, isLightMode } = useTheme();
  const { user, profile } = useAuth();
  const [sharingJson, setSharingJson] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  if (!note) return null;

  const username = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Mahasiswa';
  const jsonFileName = `${sanitizeFilename(note.title)}.json`;

  const handleShareJson = async () => {
    setSharingJson(true);
    try {
      await shareNoteAsJsonFile(note, username);
    } finally {
      setSharingJson(false);
    }
  };

  const handleSharePdf = async () => {
    setSharingPdf(true);
    try {
      await exportAndShareNotePdf(note, username);
    } finally {
      setSharingPdf(false);
    }
  };

  const handleCopy = async () => {
    await copyFormattedNoteToClipboard(note, username);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconPill, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="share-social" size={18} color={theme.accentLight} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Bagikan Catatan ke Teman</Text>
                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                  Kirim file dokumen utuh agar format tidak berantakan
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          {/* Note Info Card Preview */}
          <View style={[styles.notePreviewCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.badgeRow}>
              <View style={[styles.subjBadge, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="school-outline" size={12} color={theme.accentLight} />
                <Text style={[styles.subBadgeText, { color: theme.accentLight }]}>
                  {note.subject || 'Kuliah Umum'}
                </Text>
              </View>
              {note.quiz_data && note.quiz_data.length > 0 && (
                <View style={[styles.quizBadge, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554' }]}>
                  <Ionicons name="help-circle-outline" size={12} color="#3B82F6" />
                  <Text style={[styles.quizBadgeText, { color: '#3B82F6' }]}>
                    {note.quiz_data.length} Kuis
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={2}>
              {note.title || 'Materi Catatan Kuliah'}
            </Text>

            <View style={[styles.filenamePill, { backgroundColor: isLightMode ? '#F1F5F9' : '#0E131F', borderColor: theme.border }]}>
              <Ionicons name="document-attach-outline" size={13} color={theme.accentLight} />
              <Text style={[styles.filenameText, { color: theme.text }]} numberOfLines={1}>
                {jsonFileName}
              </Text>
            </View>
          </View>

          {/* Action Options */}
          <View style={styles.actionsList}>
            {/* 1. Share as JSON File (Recommended) */}
            <TouchableOpacity
              style={[
                styles.actionItem,
                styles.recommendedItem,
                { backgroundColor: isLightMode ? '#F0FDF4' : '#052918', borderColor: isLightMode ? '#86EFAC' : '#166534' },
              ]}
              onPress={handleShareJson}
              disabled={sharingJson}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#10B981' }]}>
                {sharingJson ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="code-slash" size={20} color="#FFFFFF" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.actionTitle, { color: isLightMode ? '#065F46' : '#86EFAC' }]}>
                    Kirim File Dokumen JSON
                  </Text>
                  <View style={[styles.recommendBadge, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.recommendBadgeText}>TERBAIK</Text>
                  </View>
                </View>
                <Text style={[styles.actionDesc, { color: isLightMode ? '#047857' : '#A7F3D0' }]}>
                  Kirim via WhatsApp/File sebagai "{jsonFileName}". Format 100% utuh & bisa di-import teman!
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isLightMode ? '#059669' : '#34D399'} />
            </TouchableOpacity>

            {/* 2. Share PDF Document */}
            <TouchableOpacity
              style={[
                styles.actionItem,
                { backgroundColor: isLightMode ? '#EFF6FF' : '#132038', borderColor: isLightMode ? '#BFDBFE' : '#1E3A8A' },
              ]}
              onPress={handleSharePdf}
              disabled={sharingPdf}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#2563EB' }]}>
                {sharingPdf ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="document-text" size={20} color="#FFFFFF" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: isLightMode ? '#1E40AF' : '#93C5FD' }]}>
                  Bagikan Dokumen PDF Siap Cetak
                </Text>
                <Text style={[styles.actionDesc, { color: isLightMode ? '#1D4ED8' : '#BFDBFE' }]}>
                  Layout modul rapi lengkap dengan bab, rumus & kunci kuis
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isLightMode ? '#2563EB' : '#60A5FA'} />
            </TouchableOpacity>

            {/* 3. Copy to Clipboard */}
            <TouchableOpacity
              style={[
                styles.actionItem,
                { backgroundColor: theme.cardInner, borderColor: theme.border },
              ]}
              onPress={handleCopy}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: theme.border }]}>
                <Ionicons name="copy-outline" size={18} color={theme.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>
                  Salin Teks Ringkas ke Clipboard
                </Text>
                <Text style={[styles.actionDesc, { color: theme.subtext }]}>
                  Salin teks materi untuk ditempel langsung ke chat
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notePreviewCard: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  subjBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  subBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quizBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quizBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  filenamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filenameText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionsList: {
    marginTop: 16,
    gap: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  recommendedItem: {
    borderWidth: 1.5,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  recommendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionDesc: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
});
