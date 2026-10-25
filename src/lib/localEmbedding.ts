/**
 * localEmbedding.ts
 *
 * Web / PWA Engine untuk Offline AI.
 * Menggunakan Transformers.js standalone bundle yang dimuat secara dinamis di browser:
 * - Menghindari kendala Metro Bundler (Unable to resolve ./pipelines.js)
 * - Model disimpan permanen di Cache Storage / IndexedDB browser (useBrowserCache = true)
 * - Tidak hilang saat tab ditutup, browser di-restart, atau PWA di-update
 * - Jika offline tanpa model terunduh, sistem otomatis fallback ke Smart Synthesizer
 */

import { Platform } from 'react-native';
import { checkWebGPUSupport, getHardwareAccelMode, getSafeThreadCount } from './hardwareAccel';

export const WEB_MODELS = {
  embedding: 'Xenova/all-MiniLM-L6-v2',
  generation: 'onnx-community/Qwen2.5-0.5B-Instruct',
  generationLight: 'onnx-community/Qwen2.5-0.5B-Instruct',
};

// Singleton pipeline instances
let embeddingPipeline: any = null;
let generationPipeline: any = null;
let isConfigured = false;
let transformersModule: any = null;
let isWebGPUActive = false;

/**
 * Cek apakah model saat ini dieksekusi dengan akselerasi WebGPU
 */
export function isCurrentWebGPUActive(): boolean {
  return isWebGPUActive;
}

/**
 * Pemuat dinamis Transformers.js di lingkungan Web browser
 */
export async function getTransformers(): Promise<any> {
  if (transformersModule) return transformersModule;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  // 1. Cek apakah sudah ada di global window
  if ((window as any).transformers) {
    transformersModule = (window as any).transformers;
    return transformersModule;
  }

  // 2. Coba dynamic import ES module dari @huggingface/transformers (v3.3.3 mendukung arsitektur Qwen)
  try {
    const dynamicImport = new Function('url', 'return import(url)');
    const mod = await dynamicImport('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
    if (mod && (mod.pipeline || mod.AutoModelForCausalLM)) {
      transformersModule = mod;
      (window as any).transformers = mod;
      return mod;
    }
  } catch (err) {
    console.warn('[localEmbedding] Dynamic import huggingface transformers gagal, mencoba script tag:', err);
  }

  // 3. Fallback: script tag injection dengan custom event
  return new Promise((resolve) => {
    try {
      const timeoutId = setTimeout(() => {
        resolve(null);
      }, 20000);

      const existingScript = document.querySelector('script[data-transformers]');
      if (existingScript) {
        if ((window as any).transformers) {
          clearTimeout(timeoutId);
          transformersModule = (window as any).transformers;
          resolve(transformersModule);
          return;
        }
        window.addEventListener('transformers-ready', () => {
          clearTimeout(timeoutId);
          transformersModule = (window as any).transformers;
          resolve(transformersModule);
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.setAttribute('data-transformers', 'true');
      script.textContent = `
        import * as tf from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
        window.transformers = tf;
        window.dispatchEvent(new CustomEvent('transformers-ready'));
      `;

      script.onerror = () => {
        clearTimeout(timeoutId);
        console.warn('[localEmbedding] Script tag module gagal dimuat');
        resolve(null);
      };

      window.addEventListener('transformers-ready', () => {
        clearTimeout(timeoutId);
        transformersModule = (window as any).transformers;
        resolve(transformersModule);
      }, { once: true });

      document.head.appendChild(script);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Konfigurasi env Transformers.js agar selalu menyimpan ke Browser Cache permanen
 * serta membatasi thread CPU agar browser tab & UI tidak freeze
 */
async function configureTransformersEnv() {
  if (isConfigured || Platform.OS !== 'web') return;

  try {
    const tf = await getTransformers();
    if (tf && tf.env) {
      // Simpan model di browser cache permanen (Cache API / IndexedDB)
      tf.env.useBrowserCache = true;
      tf.env.allowLocalModels = false;

      // Optimasi CPU WASM: batasi thread CPU (maks 2 thread) agar core lain tetap bebas untuk UI 60 FPS
      const safeThreads = getSafeThreadCount();
      if (tf.env.backends?.onnx?.wasm) {
        tf.env.backends.onnx.wasm.numThreads = safeThreads;
      }
    }
    isConfigured = true;
  } catch (err) {
    console.warn('[localEmbedding] Konfigurasi transformers env:', err);
  }
}

/**
 * Cek apakah model Transformers.js sudah tersimpan di Browser Cache
 */
export async function verifyWebModelCache(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }

  try {
    const cacheNames = await window.caches.keys();
    // Cache name bawaan Transformers.js: 'transformers-cache'
    const targetCache = cacheNames.find(n => n.includes('transformers-cache') || n.includes('transformers'));
    if (!targetCache) return false;

    const cache = await window.caches.open(targetCache);
    const requests = await cache.keys();
    // Minimal ada beberapa file ONNX/tokenizer tersimpan
    return requests.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Inisialisasi & Download model Embedding (MiniLM) dengan akselerasi WebGPU jika ada
 */
export async function initEmbeddingPipeline(
  onProgress?: (progress: { status: string; progress?: number; file?: string }) => void
): Promise<any> {
  if (Platform.OS !== 'web') {
    throw new Error('localEmbedding hanya dapat berjalan di Web / PWA');
  }

  await configureTransformersEnv();

  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  const tf = await getTransformers();
  if (!tf || !tf.pipeline) {
    throw new Error('Transformers library belum siap dimuat');
  }

  // Cek apakah WebGPU diizinkan dan tersedia
  const accelMode = await getHardwareAccelMode();
  let useWebGPU = false;
  if (accelMode !== 'cpu_eco') {
    const { supported } = await checkWebGPUSupport();
    useWebGPU = supported;
  }

  if (useWebGPU) {
    try {
      console.log('[localEmbedding] Mencoba memuat model embedding dengan WebGPU...');
      embeddingPipeline = await tf.pipeline('feature-extraction', WEB_MODELS.embedding, {
        device: 'webgpu',
        progress_callback: onProgress,
      });
      return embeddingPipeline;
    } catch (gpuErr) {
      console.warn('[localEmbedding] Embedding WebGPU gagal, fallback ke WASM (CPU):', gpuErr);
    }
  }

  embeddingPipeline = await tf.pipeline('feature-extraction', WEB_MODELS.embedding, {
    device: 'wasm',
    progress_callback: onProgress,
  });

  return embeddingPipeline;
}

/**
 * Inisialisasi & Download model Generation (Qwen) dengan akselerasi WebGPU & Fallback CPU Ringan
 */
export async function initGenerationPipeline(
  modelName: string = WEB_MODELS.generation,
  onProgress?: (progress: { status: string; progress?: number; file?: string }) => void
): Promise<any> {
  if (Platform.OS !== 'web') {
    throw new Error('localEmbedding hanya dapat berjalan di Web / PWA');
  }

  await configureTransformersEnv();

  if (generationPipeline) {
    return generationPipeline;
  }

  const tf = await getTransformers();
  if (!tf || !tf.pipeline) {
    throw new Error('Transformers library belum siap dimuat');
  }

  const accelMode = await getHardwareAccelMode();
  let tryWebGPU = accelMode !== 'cpu_eco';

  if (tryWebGPU) {
    const { supported, adapterName } = await checkWebGPUSupport();
    tryWebGPU = supported;
    if (tryWebGPU) {
      console.log(`[localEmbedding] ⚡ Menginisialisasi Qwen dengan WebGPU Hardware Acceleration (${adapterName || 'GPU'})...`);
    }
  }

  // 1. Coba inisialisasi dengan WebGPU (Beban CPU 0%, kecepatan inferensi 10-20x lipat)
  if (tryWebGPU) {
    try {
      generationPipeline = await tf.pipeline('text-generation', modelName, {
        device: 'webgpu',
        dtype: 'q4', // q4 sangat hemat VRAM dan super cepat pada WebGPU
        progress_callback: onProgress,
      });
      isWebGPUActive = true;
      console.log('[localEmbedding] ✅ Qwen Neural LLM aktif dengan WebGPU (GPU Akselerasi)!');
      return generationPipeline;
    } catch (errWebGPU: any) {
      console.warn('[localEmbedding] WebGPU q4 gagal, mencoba WebGPU q8:', errWebGPU?.message || errWebGPU);
      try {
        generationPipeline = await tf.pipeline('text-generation', modelName, {
          device: 'webgpu',
          dtype: 'q8',
          progress_callback: onProgress,
        });
        isWebGPUActive = true;
        console.log('[localEmbedding] ✅ Qwen Neural LLM aktif dengan WebGPU q8!');
        return generationPipeline;
      } catch (errWebGPU2: any) {
        console.warn('[localEmbedding] WebGPU tidak dapat digunakan di browser ini, beralih ke WASM (CPU Throttled):', errWebGPU2?.message || errWebGPU2);
        isWebGPUActive = false;
      }
    }
  }

  // 2. Fallback CPU WASM Terkontrol (Maksimal 2 thread agar UI tab tidak freeze)
  isWebGPUActive = false;
  try {
    generationPipeline = await tf.pipeline('text-generation', modelName, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: onProgress,
    });
    console.log('[localEmbedding] ✅ Qwen Neural LLM aktif dengan CPU WASM (Throttled)');
  } catch (err) {
    console.warn('[localEmbedding] Qwen load CPU q8 gagal, mencoba q4:', err);
    generationPipeline = await tf.pipeline('text-generation', modelName, {
      device: 'wasm',
      dtype: 'q4',
      progress_callback: onProgress,
    });
  }

  return generationPipeline;
}

/**
 * Menghitung vektor embedding 384-dimensi untuk teks input
 */
export async function embedTextWeb(text: string): Promise<Float32Array | number[]> {
  if (Platform.OS !== 'web') {
    throw new Error('localEmbedding hanya dapat berjalan di Web');
  }

  const pipe = await initEmbeddingPipeline();
  const output = await pipe(text, {
    pooling: 'mean',
    normalize: true,
  });

  // Output adalah Tensor; ambil data Float32Array-nya
  if (output && output.data) {
    return output.data as Float32Array;
  }

  return Array.from(output as any);
}

/**
 * Menghasilkan teks jawaban dari model lokal
 */
export async function generateTextWeb(
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    onToken?: (token: string) => void;
    timeoutMs?: number;
  }
): Promise<string> {
  if (Platform.OS !== 'web') {
    throw new Error('localEmbedding hanya dapat berjalan di Web');
  }

  const timeoutMs = options?.timeoutMs || 7000; // Maksimal 7 detik agar tidak stuck!

  const runGeneration = async () => {
    const pipe = await initGenerationPipeline();
    const maxTokens = Math.min(options?.maxTokens || 60, 80);

    const result = await pipe(prompt, {
      max_new_tokens: maxTokens,
      temperature: options?.temperature || 0.2,
      do_sample: false, // Greedy decoding: jauh lebih cepat di CPU WebAssembly
      repetition_penalty: 1.1,
    });

    if (Array.isArray(result) && result[0]?.generated_text) {
      const raw = result[0].generated_text;
      let text = raw;
      if (prompt && text.startsWith(prompt)) {
        text = text.slice(prompt.length).trim();
      } else {
        const markers = [
          '<|im_start|>assistant\n',
          '<|im_start|>assistant',
          '\nassistant\n',
          'assistant\n',
          'assistant:\n',
          'assistant:',
        ];
        for (const m of markers) {
          const idx = text.lastIndexOf(m);
          if (idx !== -1) {
            text = text.slice(idx + m.length).trim();
            break;
          }
        }
      }

      text = text
        .replace(/^system[\s\S]*?(?:user[\s\S]*?assistant\s*)/i, '')
        .replace(/^user[\s\S]*?assistant\s*/i, '')
        .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
        .replace(/<\|im_end\|>[\s\S]*/g, '')
        .replace(/<\|endoftext\|>[\s\S]*/g, '')
        .replace(/^(?:Catatan|Materi|Judul|Jawaban|Penjelasan)\s*[:：]\s*/im, '')
        .trim();

      return text;
    }

    return typeof result === 'string' ? result.trim() : JSON.stringify(result);
  };

  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => {
      reject(new Error('TIMEOUT_NEURAL_GENERATION'));
    }, timeoutMs);
  });

  return await Promise.race([runGeneration(), timeoutPromise]);
}

/**
 * Hapus seluruh cache model dari browser Cache Storage
 */
export async function clearWebModelCache(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  try {
    const keys = await window.caches.keys();
    for (const key of keys) {
      if (key.includes('transformers')) {
        await window.caches.delete(key);
      }
    }
    embeddingPipeline = null;
    generationPipeline = null;
    transformersModule = null;
  } catch (err) {
    console.error('[localEmbedding] Gagal menghapus web cache:', err);
  }
}
