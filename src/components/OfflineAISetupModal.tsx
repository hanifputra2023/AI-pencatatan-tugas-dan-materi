/**
 * OfflineAISetupModal.tsx
 *
 * Modal interaktif untuk mengunduh, mengonfigurasi, dan mengelola Offline AI Engine.
 * - Nama AI dinamis mengikuti profil yang di-set user di "Kustomisasi Teman AI"
 * - Menjelaskan penyimpanan permanen di HP (tidak hilang saat update aplikasi)
 * - Tampilan visual modern dengan 4 state: PROMPT, DOWNLOADING, DONE, ERROR
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useOfflineAI } from '../hooks/useOfflineAI';
import { isDeviceOnline } from '../lib/offlineSync';

interface OfflineAISetupModalProps {
  visible: boolean;
  onClose: () => void;
  onSetupSuccess?: () => void;
}

type ModalState = 'PROMPT' | 'DOWNLOADING' | 'DONE' | 'ERROR';

export default function OfflineAISetupModal({
  visible,
  onClose,
  onSetupSuccess,
}: OfflineAISetupModalProps) {
  const { theme } = useTheme();
  const {
    isReady,
    isDownloading,
    downloadProgress,
    downloadedMb,
    fileTotalMb,
    statusText,
    currentFile,
    aiName,
    aiAvatar,
    totalSizeMb,
    hasNeuralModel,
    hardwareStatus,
    accelMode,
    changeAccelMode,
    downloadModels,
    cancelDownload,
    removeModels,
  } = useOfflineAI();

  const [modalState, setModalState] = useState<ModalState>('PROMPT');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleStartDownload = async () => {
    // 1. Verifikasi koneksi internet sebelum download
    const online = await isDeviceOnline(true);
    if (!online) {
      setErrorMessage(
        'Perangkat Anda sedang dalam Mode Offline (tidak ada internet).\n\nUntuk mengunduh model neural Qwen (~350 MB), silakan hubungkan perangkat ke WiFi atau aktifkan data internet terlebih dahulu.\n\nSetelah terunduh satu kali, model akan tersimpan permanen dan 100% aktif tanpa internet selamanya! Saat ini Anda tetap dapat berdiskusi menggunakan Smart Synthesizer (0 MB) yang sudah aktif.'
      );
      setModalState('ERROR');
      return;
    }

    setModalState('DOWNLOADING');
    setErrorMessage('');
    try {
      const res = await downloadModels();
      if (res.success) {
        setModalState('DONE');
        onSetupSuccess?.();
      } else if (res.cancelled) {
        setModalState('PROMPT');
      } else {
        setErrorMessage(
          res.error ||
          statusText ||
          'Gagal mengunduh model neural. Silakan periksa koneksi internet Anda lalu coba lagi.'
        );
        setModalState('ERROR');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat mengunduh model neural.');
      setModalState('ERROR');
    }
  };

  const handleSkipDownload = () => {
    cancelDownload();
    setModalState('PROMPT');
  };

  const handleClose = () => {
    if (isDownloading) {
      // Upgrade sedang berjalan tapi AI sudah aktif, lewati saja
      handleSkipDownload();
      return;
    }
    setModalState('PROMPT');
    onClose();
  };

  const handleDeleteModel = async () => {
    await removeModels();
    setModalState('PROMPT');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header Close Button (Hanya jika tidak sedang download) */}
          {!isDownloading && (
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.cardInner }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.subtext} />
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
            {/* Avatar Section */}
            <View style={[styles.avatarWrap, { borderColor: theme.accent, backgroundColor: theme.cardInner }]}>
              {aiAvatar ? (
                <Image source={{ uri: aiAvatar }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="hardware-chip-outline" size={44} color={theme.accent} />
              )}
              <View style={[styles.statusBadge, { backgroundColor: isReady ? '#10B981' : '#F59E0B' }]}>
                <Ionicons name={isReady ? 'checkmark' : 'cloud-offline'} size={12} color="#FFF" />
              </View>
            </View>

            {/* STATE 1: PROMPT */}
            {modalState === 'PROMPT' && (
              <>
                <View style={styles.activeBadgeRow}>
                  <View style={[styles.activeBadge, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text style={[styles.activeBadgeText, { color: '#10B981' }]}>Aktif Offline ✓</Text>
                  </View>
                </View>

                <Text style={[styles.title, { color: theme.text }]}>
                  {aiName} Offline Assistant
                </Text>

                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                  Belajar dan berdiskusi dari catatan materi Anda 100% tanpa internet.
                </Text>

                {/* Status Mesin AI */}
                <View style={[styles.featureBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <Text style={[styles.featureTitle, { color: theme.text }]}>⚙️ Mesin AI di Perangkat Ini</Text>

                  <View style={styles.engineRow}>
                    <Ionicons name="flash" size={16} color="#10B981" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.engineName, { color: theme.text }]}>Smart Synthesizer (0 MB)</Text>
                      <Text style={[styles.engineDesc, { color: theme.subtext }]}>Ekstraksi definisi, contoh & rumus instan</Text>
                    </View>
                    <View style={[styles.pillSmall, { backgroundColor: '#10B98120' }]}>
                      <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>Aktif</Text>
                    </View>
                  </View>

                  <View style={[styles.engineRow, { marginTop: 10 }]}>
                    <Ionicons name="hardware-chip" size={16} color={hasNeuralModel ? '#10B981' : theme.accent} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.engineName, { color: theme.text }]}>Qwen2.5-0.5B Neural LLM (~{fileTotalMb || totalSizeMb} MB)</Text>
                      <Text style={[styles.engineDesc, { color: theme.subtext }]}>
                        {hasNeuralModel ? 'Tersimpan permanen di HP' : 'Generasi bahasa mandiri bernalar tingkat tinggi'}
                      </Text>
                    </View>
                    <View style={[styles.pillSmall, { backgroundColor: hasNeuralModel ? '#10B98120' : '#F59E0B20' }]}>
                      <Text style={{ color: hasNeuralModel ? '#10B981' : '#F59E0B', fontSize: 11, fontWeight: '700' }}>
                        {hasNeuralModel ? 'Aktif' : 'Tersedia'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Panel Penyesuaian Akselerasi Hardware & GPU (Web & APK) */}
                <View style={[styles.hardwareBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <View style={styles.hardwareHeader}>
                    <Ionicons name="speedometer-outline" size={16} color={theme.accent} />
                    <Text style={[styles.featureTitle, { color: theme.text, marginBottom: 0, marginLeft: 6, flex: 1 }]}>
                      ⚡ Akselerasi Hardware & GPU
                    </Text>
                    <View style={[styles.pillSmall, { backgroundColor: hardwareStatus?.isGpuAvailable ? '#10B98120' : '#3B82F620' }]}>
                      <Text style={{ color: hardwareStatus?.isGpuAvailable ? '#10B981' : '#3B82F6', fontSize: 10, fontWeight: '700' }}>
                        {hardwareStatus?.isGpuAvailable ? 'GPU Tersedia' : 'CPU Mode'}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.hardwareStatusLine, { color: theme.text }]}>
                    {hardwareStatus?.providerLabel || '⚡ Akselerasi Hardware Aktif'}
                  </Text>

                  <Text style={[styles.hardwareDesc, { color: theme.subtext }]}>
                    {hardwareStatus?.description || 'Beban komputasi dialihkan ke GPU agar CPU tidak terbebani dan aplikasi tetap lancar.'}
                  </Text>

                  {/* Mode Selector: GPU vs Eco CPU */}
                  <View style={styles.accelToggleRow}>
                    <TouchableOpacity
                      style={[
                        styles.accelBtn,
                        accelMode !== 'cpu_eco'
                          ? [styles.accelBtnActive, { backgroundColor: theme.primary + '18', borderColor: theme.primary }]
                          : { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                      onPress={() => changeAccelMode('auto')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="flash"
                        size={13}
                        color={accelMode !== 'cpu_eco' ? theme.primary : theme.subtext}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.accelBtnText,
                          { color: accelMode !== 'cpu_eco' ? theme.primary : theme.subtext },
                        ]}
                      >
                        Akselerasi GPU
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.accelBtn,
                        accelMode === 'cpu_eco'
                          ? [styles.accelBtnActive, { backgroundColor: '#10B98118', borderColor: '#10B981' }]
                          : { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                      onPress={() => changeAccelMode('cpu_eco')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="leaf-outline"
                        size={13}
                        color={accelMode === 'cpu_eco' ? '#10B981' : theme.subtext}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.accelBtnText,
                          { color: accelMode === 'cpu_eco' ? '#10B981' : theme.subtext },
                        ]}
                      >
                        Hemat Daya (CPU)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Upgrade Button or Delete Option */}
                {!hasNeuralModel ? (
                  <TouchableOpacity
                    style={[styles.btnUpgrade, { backgroundColor: theme.cardInner, borderColor: theme.accent }]}
                    onPress={handleStartDownload}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cloud-download-outline" size={20} color={theme.accent} style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.btnUpgradeTitle, { color: theme.accent }]}>Unduh Qwen2.5-0.5B (~{fileTotalMb || totalSizeMb} MB)</Text>
                      <Text style={[styles.btnUpgradeSub, { color: theme.subtext }]}>
                        Generasi jawaban mandiri bernalar, 100% offline permanen
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.btnDelete, { borderColor: '#EF444440' }]}
                    onPress={handleDeleteModel}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={15} color="#EF4444" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Hapus Model Qwen (Kosongkan ~{fileTotalMb || totalSizeMb} MB)</Text>
                  </TouchableOpacity>
                )}

                {/* Mulai Chat Button */}
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: theme.primary, width: '100%', marginTop: 10 }]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.btnPrimaryText}>Mulai Belajar 🚀</Text>
                </TouchableOpacity>
              </>
            )}


            {/* STATE 2: DOWNLOADING */}
            {modalState === 'DOWNLOADING' && (
              <>
                <Text style={[styles.title, { color: theme.text }]}>
                  Mengunduh Neural {aiName}...
                </Text>

                <Text style={[styles.statusTextDesc, { color: theme.subtext }]}>
                  {statusText || 'Sedang memproses...'}
                </Text>

                {/* Nama file yang sedang diunduh */}
                {currentFile ? (
                  <View style={[styles.fileNamePill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <Ionicons name="document-outline" size={12} color={theme.accent} />
                    <Text style={[styles.fileNameText, { color: theme.accent }]} numberOfLines={1}>
                      {currentFile}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.fileNamePill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                    <ActivityIndicator size={10} color={theme.accent} />
                    <Text style={[styles.fileNameText, { color: theme.subtext }]}>
                      Menghubungi server...
                    </Text>
                  </View>
                )}

                {/* Progress Bar */}
                <View style={[styles.progressBarBg, { backgroundColor: theme.cardInner }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { backgroundColor: theme.primary, width: `${Math.max(downloadProgress, 3)}%` },
                    ]}
                  />
                </View>

                <View style={styles.progressRow}>
                  <Text style={[styles.progressNumber, { color: theme.primary }]}>
                    {downloadProgress}%
                  </Text>
                  <Text style={[styles.progressBytes, { color: theme.muted }]}>
                    {downloadedMb > 0 ? downloadedMb.toFixed(1) : ((downloadProgress / 100) * (fileTotalMb || totalSizeMb)).toFixed(1)} MB / {(fileTotalMb || totalSizeMb).toFixed(1)} MB
                  </Text>
                </View>

                {/* Info: AI sudah aktif, ini opsional */}
                <View style={[styles.skipInfoBox, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                  <Text style={[styles.skipInfoText, { color: '#10B981' }]}>
                    AI lokal sudah aktif! Ini adalah download peningkatan neural (~{(fileTotalMb || totalSizeMb).toFixed(0)} MB).
                  </Text>
                </View>

                {/* Tombol Lewati */}
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: theme.border }]}
                  onPress={handleSkipDownload}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={16} color={theme.subtext} style={{ marginRight: 6 }} />
                  <Text style={[styles.skipBtnText, { color: theme.subtext }]}>Lewati — Pakai AI Tanpa Upgrade</Text>
                </TouchableOpacity>

                <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 8 }} />
              </>
            )}


            {/* STATE 3: DONE */}
            {modalState === 'DONE' && (
              <>
                <View style={styles.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                </View>

                <Text style={[styles.title, { color: theme.text }]}>
                  {aiName} Siap Menemanimu!
                </Text>

                <Text style={[styles.subtitle, { color: theme.subtext }]}>
                  Model AI lokal telah tersimpan permanen di HP kamu. Sekarang kamu bisa bertanya, merangkum, dan mendiskusikan catatan belajarmu kapan saja bahkan di mode pesawat! ✈️📖
                </Text>

                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: '#10B981', width: '100%', marginTop: 16 }]}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnPrimaryText}>Oke, Siap Belajar! 🚀</Text>
                </TouchableOpacity>
              </>
            )}

            {/* STATE 4: ERROR */}
            {modalState === 'ERROR' && (
              <>
                <View style={styles.errorIconWrap}>
                  <Ionicons name="cloud-offline" size={56} color="#F59E0B" />
                </View>

                <Text style={[styles.title, { color: theme.text }]}>
                  Perlu Koneksi Internet
                </Text>

                <Text style={[styles.subtitle, { color: theme.subtext, textAlign: 'center', lineHeight: 20 }]}>
                  {errorMessage || 'Hubungkan ke WiFi atau internet untuk mengunduh model neural (~350 MB). Model akan tersimpan permanen di HP Anda.'}
                </Text>

                <View style={[styles.skipInfoBox, { backgroundColor: '#10B98115', borderColor: '#10B981', marginTop: 12, marginBottom: 16 }]}>
                  <Ionicons name="flash" size={16} color="#10B981" />
                  <Text style={[styles.skipInfoText, { color: '#10B981' }]}>
                    Smart Synthesizer (0 MB) sudah aktif! Anda tetap bisa bertanya secara offline sekarang juga tanpa perlu menunggu unduhan.
                  </Text>
                </View>

                <View style={[styles.actionRow, { width: '100%' }]}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: theme.border, flex: 1, marginRight: 8 }]}
                    onPress={handleClose}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnSecondaryText, { color: theme.text }]}>Chat Offline Saja</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: theme.primary, flex: 1 }]}
                    onPress={handleStartDownload}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.btnPrimaryText}>Coba Lagi</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  contentContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
    overflow: 'visible',
  },
  avatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  statusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  statusTextDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
    minHeight: 18,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  explainerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    width: '100%',
  },
  explainerText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fileNamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    maxWidth: '100%',
  },
  fileNameText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  progressNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBytes: {
    fontSize: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
    marginBottom: 8,
  },
  warningText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
  skipInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  skipInfoText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  successIconWrap: {
    marginBottom: 12,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  featureBox: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 4,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  featureItem: {
    fontSize: 12,
    lineHeight: 18,
  },
  upgradeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  upgradeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  upgradeDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  errorIconWrap: {
    marginBottom: 12,
  },
  engineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  engineName: {
    fontSize: 12,
    fontWeight: '700',
  },
  engineDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  pillSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  btnUpgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  btnUpgradeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  btnUpgradeSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  btnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  hardwareBox: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  hardwareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  hardwareStatusLine: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 2,
  },
  hardwareDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  accelToggleRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  accelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  accelBtnActive: {
    borderWidth: 1.5,
  },
  accelBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
