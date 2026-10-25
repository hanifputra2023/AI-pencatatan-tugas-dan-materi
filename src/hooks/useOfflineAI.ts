/**
 * useOfflineAI.ts
 *
 * Custom hook & utility untuk status, download, dan manajemen model AI Offline.
 * Menjamin model tersimpan permanen di HP / browser dan survive app close / update APK.
 *
 * FIX: Progress animasi agar tidak "stuck" meski CDN tidak kirim Content-Length header.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalAIName, getLocalAIAvatar, detectDeviceTier } from '../lib/localAI';
import { initEmbeddingPipeline, initGenerationPipeline, verifyWebModelCache, clearWebModelCache } from '../lib/localEmbedding';
import { downloadNativeModel, getNativeModelsStatus, deleteNativeModels } from '../lib/nativeEmbedding';
import {
  getHardwareAccelStatus,
  getHardwareAccelMode,
  setHardwareAccelMode,
  HardwareAccelStatus,
  HardwareAccelMode,
} from '../lib/hardwareAccel';

export const OFFLINE_AI_STORAGE_KEYS = {
  READY: '@offline_ai_ready',
  DOWNLOAD_DATE: '@offline_ai_download_date',
  VERSION: '@offline_ai_version',
  TIER: '@offline_ai_tier',
};

const CURRENT_MODEL_VERSION = '1.0.0';

/**
 * Offline AI SELALU siap tanpa download — menggunakan Smart Synthesizer + BM25.
 */
export async function isOfflineAIReady(): Promise<boolean> {
  // Offline AI selalu bisa berjalan (Smart Synthesizer + BM25 + deterministik vektor)
  return true;
}

/**
 * Cek apakah Neural Enhancement (model ~23MB) sudah diunduh — opsional
 */
export async function isNeuralEnhancementReady(): Promise<boolean> {
  try {
    const ready = await AsyncStorage.getItem(OFFLINE_AI_STORAGE_KEYS.READY);
    if (ready === 'true') {
      return true;
    }

    if (Platform.OS === 'web') {
      const hasCache = await verifyWebModelCache();
      if (hasCache) {
        await AsyncStorage.setItem(OFFLINE_AI_STORAGE_KEYS.READY, 'true');
        return true;
      }
    } else {
      const status = await getNativeModelsStatus();
      if (status.generation || status.embedding) {
        await AsyncStorage.setItem(OFFLINE_AI_STORAGE_KEYS.READY, 'true');
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export interface DownloadResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

export function useOfflineAI() {
  const [isReady, setIsReady] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [aiName, setAiName] = useState<string>('Ara');
  const [aiAvatar, setAiAvatar] = useState<string | null>(null);
  const [deviceTier, setDeviceTier] = useState<'high' | 'mid' | 'low'>('mid');
  // Model Qwen2.5-0.5B ONNX Quantized (~488 MB)
  const [totalSizeMb, setTotalSizeMb] = useState<number>(488);
  const [downloadedMb, setDownloadedMb] = useState<number>(0);
  const [fileTotalMb, setFileTotalMb] = useState<number>(488);
  const [hasNeuralModel, setHasNeuralModel] = useState<boolean>(false);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareAccelStatus | null>(null);
  const [accelMode, setAccelMode] = useState<HardwareAccelMode>('auto');

  const abortRef = useRef<boolean>(false); // Flag untuk cancel download

  /**
   * Ubah mode akselerasi hardware (GPU / Auto / CPU Eco)
   */
  const changeAccelMode = useCallback(async (newMode: HardwareAccelMode) => {
    await setHardwareAccelMode(newMode);
    setAccelMode(newMode);
    const status = await getHardwareAccelStatus();
    setHardwareStatus(status);
  }, []);

  /**
   * Batalkan download yang sedang berjalan (AI tetap aktif tanpa model neural)
   */
  const cancelDownload = useCallback(() => {
    abortRef.current = true;
    setIsDownloading(false);
    setDownloadProgress(0);
    setDownloadedMb(0);
    setCurrentFile('');
    setStatusText('Upgrade dibatalkan. AI lokal tetap aktif! ✅');
  }, []);

  // Muat status awal
  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const [name, avatar, tier, neuralReady, hwStatus, curMode] = await Promise.all([
        getLocalAIName(),
        getLocalAIAvatar(),
        detectDeviceTier(),
        isNeuralEnhancementReady(),
        getHardwareAccelStatus(),
        getHardwareAccelMode(),
      ]);

      setAiName(name);
      setAiAvatar(avatar);
      setDeviceTier(tier);
      setIsReady(true); // Selalu ready
      setHasNeuralModel(neuralReady);
      setHardwareStatus(hwStatus);
      setAccelMode(curMode);

      if (Platform.OS !== 'web') {
        const nativeStatus = await getNativeModelsStatus();
        if (nativeStatus.totalSizeMb > 0) {
          setTotalSizeMb(nativeStatus.totalSizeMb);
          setFileTotalMb(nativeStatus.totalSizeMb);
        }
      }
    } catch (e) {
      console.warn('[useOfflineAI] Error checkStatus:', e);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  /**
   * Unduh Qwen2.5-0.5B Neural LLM (~488 MB)
   * Mengukur byte nyata yang terunduh (tidak ada timer persentase palsu)
   */
  const downloadModels = useCallback(async (): Promise<DownloadResult> => {
    abortRef.current = false;
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedMb(0);
    setCurrentFile('');
    setStatusText(`Menghubungi server untuk model neural Qwen ${aiName}...`);

    try {
      if (Platform.OS === 'web') {
        setStatusText(`Mengunduh model neural Qwen untuk ${aiName}...`);

        await initGenerationPipeline(undefined, (p: any) => {
          if (abortRef.current) throw new Error('CANCELLED');
          if (p?.file) {
            const fileName = p.file.split('/').pop() || p.file;
            setCurrentFile(fileName);
          }

          if (typeof p?.loaded === 'number') {
            const mb = Math.round((p.loaded / (1024 * 1024)) * 10) / 10;
            setDownloadedMb(mb);
          }

          if (typeof p?.total === 'number' && p.total > 0) {
            const totalMb = Math.round((p.total / (1024 * 1024)) * 10) / 10;
            setFileTotalMb(totalMb);
            if (typeof p?.loaded === 'number') {
              const pct = Math.min(Math.round((p.loaded / p.total) * 100), 99);
              setDownloadProgress(pct);
            }
          } else if (typeof p?.progress === 'number' && p.progress > 0) {
            const pct = Math.min(Math.round(p.progress * 100), 99);
            setDownloadProgress(pct);
            setDownloadedMb(Math.round(((pct / 100) * (fileTotalMb || 488)) * 10) / 10);
          }

          if (p?.status === 'init') {
            setStatusText(`Menyiapkan model Qwen di memori ${aiName}...`);
          }

          if (p?.status === 'ready' || p?.status === 'done') {
            setDownloadProgress(100);
            setDownloadedMb(fileTotalMb || 488);
          }
        });

        setCurrentFile('');
      } else {
        setStatusText(`Mengunduh model neural Qwen untuk ${aiName}...`);

        await downloadNativeModel('generation', (pct: number, loaded: number, total: number) => {
          if (abortRef.current) throw new Error('CANCELLED');
          setDownloadProgress(Math.min(pct, 99));
          if (total > 0) {
            setFileTotalMb(Math.round((total / (1024 * 1024)) * 10) / 10);
            setDownloadedMb(Math.round((loaded / (1024 * 1024)) * 10) / 10);
          }
          if (pct > 0) setCurrentFile('qwen_0.5b_quantized.onnx');
        });

        setCurrentFile('');
      }

      if (abortRef.current) {
        setIsDownloading(false);
        return { success: false, cancelled: true };
      }

      await AsyncStorage.multiSet([
        [OFFLINE_AI_STORAGE_KEYS.READY, 'true'],
        [OFFLINE_AI_STORAGE_KEYS.DOWNLOAD_DATE, new Date().toISOString()],
        [OFFLINE_AI_STORAGE_KEYS.VERSION, CURRENT_MODEL_VERSION],
      ]);

      setDownloadProgress(100);
      setDownloadedMb(fileTotalMb || totalSizeMb);
      setStatusText(`Peningkatan neural ${aiName} (Qwen 0.5B) berhasil dipasang! 🎉`);
      setHasNeuralModel(true);
      setIsDownloading(false);
      return { success: true };
    } catch (err: any) {
      if (err?.message === 'CANCELLED' || abortRef.current) {
        setStatusText('Upgrade dibatalkan. AI lokal tetap aktif! ✅');
        setIsDownloading(false);
        return { success: false, cancelled: true };
      }
      console.error('[useOfflineAI] Download neural model gagal:', err);
      const errMsg = err?.message || 'Koneksi internet terputus';
      setStatusText(`Gagal mengunduh: ${errMsg}`);
      setIsDownloading(false);
      return { success: false, error: errMsg };
    }
  }, [aiName, fileTotalMb, totalSizeMb]);

  /**
   * Hapus model dari penyimpanan perangkat
   */
  const removeModels = useCallback(async (): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        await clearWebModelCache();
      } else {
        await deleteNativeModels();
      }
      await AsyncStorage.multiRemove([
        OFFLINE_AI_STORAGE_KEYS.READY,
        OFFLINE_AI_STORAGE_KEYS.DOWNLOAD_DATE,
        OFFLINE_AI_STORAGE_KEYS.VERSION,
      ]);
      setIsReady(false);
      setDownloadProgress(0);
      setDownloadedMb(0);
      setStatusText('Model telah dihapus dari perangkat.');
    } catch (err) {
      console.error('[useOfflineAI] Gagal menghapus model:', err);
    }
  }, []);

  return {
    isReady,
    isChecking,
    isDownloading,
    downloadProgress,
    downloadedMb,
    fileTotalMb,
    statusText,
    currentFile,
    aiName,
    aiAvatar,
    deviceTier,
    totalSizeMb,
    hasNeuralModel,
    hardwareStatus,
    accelMode,
    changeAccelMode,
    refreshStatus: checkStatus,
    downloadModels,
    cancelDownload,
    removeModels,
  };
}
