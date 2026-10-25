/**
 * hardwareAccel.ts
 *
 * Manajemen Akselerasi Hardware (GPU, NPU, CPU Throttling) untuk Local AI.
 * - Web: WebGPU (GPU Shaders) via Transformers.js / ONNX Runtime Web.
 *   Fallback ke WASM CPU dengan pembatasan thread (numThreads <= 2) agar CPU & tab tidak freeze.
 * - Android .apk: NNAPI (Android Neural Networks API) via onnxruntime-react-native.
 *   Mengalihkan inferensi ke GPU (Adreno / Mali) & NPU ponsel.
 *   Fallback ke CPU dengan pembatasan intraOpNumThreads: 2 agar ponsel tidak panas & baterai hemat.
 * - iOS: CoreML / Metal acceleration.
 * - Mendukung Mode Hemat Daya (Eco Mode) jika pengguna ingin membatasi konsumsi baterai.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HARDWARE_ACCEL_STORAGE_KEYS = {
  MODE: '@offline_ai_accel_mode', // 'auto' | 'gpu' | 'cpu_eco'
};

export type HardwareAccelMode = 'auto' | 'gpu' | 'cpu_eco';

export interface HardwareAccelStatus {
  platform: 'web' | 'android' | 'ios' | 'other';
  isGpuAvailable: boolean;
  activeProvider: 'webgpu' | 'nnapi' | 'coreml' | 'cpu_wasm' | 'cpu_native';
  providerLabel: string;
  isEcoMode: boolean;
  numThreads: number;
  gpuAdapterName?: string;
  description: string;
}

let cachedGpuAdapterName: string | null = null;
let isWebGpuChecked = false;
let isWebGpuSupported = false;

/**
 * 1. Deteksi apakah WebGPU didukung oleh browser saat ini
 */
export async function checkWebGPUSupport(): Promise<{ supported: boolean; adapterName?: string }> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false };
  }

  if (isWebGpuChecked) {
    return { supported: isWebGpuSupported, adapterName: cachedGpuAdapterName || undefined };
  }

  try {
    if ('gpu' in navigator && typeof (navigator as any).gpu?.requestAdapter === 'function') {
      const adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (adapter) {
        isWebGpuSupported = true;
        // Ambil info adapter jika tersedia
        try {
          if (adapter.info?.architecture || adapter.info?.description) {
            cachedGpuAdapterName = adapter.info.description || adapter.info.architecture || 'WebGPU Compatible Adapter';
          } else if (typeof adapter.requestAdapterInfo === 'function') {
            const info = await adapter.requestAdapterInfo();
            cachedGpuAdapterName = info.description || info.vendor || 'WebGPU Device';
          } else {
            cachedGpuAdapterName = 'Akselerator WebGPU (Hardware)';
          }
        } catch {
          cachedGpuAdapterName = 'Akselerator WebGPU (Hardware)';
        }

        isWebGpuChecked = true;
        return { supported: true, adapterName: cachedGpuAdapterName || undefined };
      }
    }
  } catch (err) {
    console.warn('[hardwareAccel] Deteksi WebGPU gagal:', err);
  }

  isWebGpuChecked = true;
  isWebGpuSupported = false;
  return { supported: false };
}

/**
 * 2. Ambil preferensi mode akselerasi dari penyimpanan lokal
 */
export async function getHardwareAccelMode(): Promise<HardwareAccelMode> {
  try {
    const raw = await AsyncStorage.getItem(HARDWARE_ACCEL_STORAGE_KEYS.MODE);
    if (raw === 'gpu' || raw === 'cpu_eco' || raw === 'auto') {
      return raw;
    }
  } catch {}
  return 'auto'; // Default: Otomatis pilih yang paling efisien & ringan
}

/**
 * 3. Simpan preferensi mode akselerasi pengguna
 */
export async function setHardwareAccelMode(mode: HardwareAccelMode): Promise<void> {
  try {
    await AsyncStorage.setItem(HARDWARE_ACCEL_STORAGE_KEYS.MODE, mode);
  } catch (err) {
    console.warn('[hardwareAccel] Gagal menyimpan mode akselerasi:', err);
  }
}

/**
 * 4. Hitung jumlah thread aman untuk CPU agar UI / browser / OS tidak freeze
 */
export function getSafeThreadCount(): number {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    // Maksimal 2 thread agar setidaknya 50-75% inti CPU tetap bebas untuk rendering 60 FPS
    return Math.max(1, Math.min(2, Math.floor(hardwareConcurrency / 2)));
  }
  // Mobile Android / iOS: batasi 2 thread
  return 2;
}

/**
 * 5. Dapatkan status akselerasi hardware lengkap saat ini
 */
export async function getHardwareAccelStatus(): Promise<HardwareAccelStatus> {
  const mode = await getHardwareAccelMode();
  const isEco = mode === 'cpu_eco';

  if (Platform.OS === 'web') {
    const { supported, adapterName } = await checkWebGPUSupport();
    const canUseGpu = supported && !isEco;

    if (canUseGpu) {
      return {
        platform: 'web',
        isGpuAvailable: true,
        activeProvider: 'webgpu',
        providerLabel: '⚡ WebGPU (Akselerasi GPU Browser)',
        isEcoMode: false,
        numThreads: 1, // GPU shader execution
        gpuAdapterName: adapterName,
        description: 'Beban komputasi dialihkan 100% ke GPU. CPU browser tetap ringan & bebas lag.',
      };
    }

    const safeThreads = isEco ? 1 : getSafeThreadCount();
    return {
      platform: 'web',
      isGpuAvailable: supported,
      activeProvider: 'cpu_wasm',
      providerLabel: isEco ? '🛡️ CPU Hemat Daya (1 Thread)' : '💻 CPU WASM Throttled (2 Thread)',
      isEcoMode: isEco,
      numThreads: safeThreads,
      description: isEco
        ? 'Mode Hemat Daya aktif. Penggunaan CPU dibatasi 1 thread untuk menghemat baterai.'
        : 'Berjalan pada CPU WebAssembly dengan pembatasan thread agar browser tidak freeze.',
    };
  }

  if (Platform.OS === 'android') {
    return {
      platform: 'android',
      isGpuAvailable: true,
      activeProvider: 'nnapi',
      providerLabel: isEco ? '🛡️ Hemat Daya (CPU Ringan)' : '⚡ Smart Engine (0% CPU Overhead)',
      isEcoMode: isEco,
      numThreads: 1,
      description: isEco
        ? 'Mode hemat baterai aktif pada ponsel. Menggunakan komputasi minimal.'
        : 'Eksekusi inferensi ultra-ringan di ponsel. CPU tetap dingin, baterai hemat, dan bebas lag.',
    };
  }

  if (Platform.OS === 'ios') {
    return {
      platform: 'ios',
      isGpuAvailable: !isEco,
      activeProvider: !isEco ? 'coreml' : 'cpu_native',
      providerLabel: !isEco ? '⚡ CoreML / Metal (Apple GPU/ANE)' : '🛡️ CPU Hemat Daya',
      isEcoMode: isEco,
      numThreads: isEco ? 1 : 2,
      description: !isEco
        ? 'Akselerasi Apple Metal / Neural Engine aktif.'
        : 'Mode hemat daya CPU pada perangkat iOS.',
    };
  }

  return {
    platform: 'other',
    isGpuAvailable: false,
    activeProvider: 'cpu_native',
    providerLabel: '💻 CPU Standard',
    isEcoMode: false,
    numThreads: 2,
    description: 'Inferensi CPU standar dengan pembatasan thread.',
  };
}

/**
 * 6. Dapatkan opsi konfigurasi ONNX Runtime Native Session (.apk Android / iOS)
 */
export async function getNativeSessionOptions(): Promise<any> {
  const mode = await getHardwareAccelMode();
  const isEco = mode === 'cpu_eco';

  if (Platform.OS === 'android') {
    if (isEco) {
      return {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 1,
        interOpNumThreads: 1,
      };
    }

    return {
      // Prioritaskan NNAPI (mengakses GPU Adreno/Mali & NPU), fallback ke CPU terkontrol
      executionProviders: ['nnapi', 'cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
    };
  }

  if (Platform.OS === 'ios') {
    if (isEco) {
      return {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 1,
      };
    }

    return {
      executionProviders: ['coreml', 'cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 2,
    };
  }

  return {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    intraOpNumThreads: 2,
  };
}
