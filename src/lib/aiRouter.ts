/**
 * aiRouter.ts
 *
 * Router pintar yang menjembatani Gemini Cloud API dan Offline Local AI Engine.
 * - Online + API Key tersedia -> Menggunakan Gemini Cloud (kualitas tertinggi)
 * - Offline / Tidak ada API Key / Mode Offline Aktif -> Otomatis beralih ke Local AI
 * - User memilih AI Lokal secara manual -> Menghormati pilihan meski online
 * - Transparan: signature sama persis dengan sendMessageToGemini, tidak merusak sistem yang ada.
 */

import {
  sendMessageToGemini,
  ensureApiKeysLoaded,
  getGeminiApiKeysPool,
  GeminiMessage,
  SendMessageOptions,
} from './gemini';
import { isDeviceOnline } from './offlineSync';
import { sendLocalAIMessage, LocalAIOptions } from './localAI';
import { ChatAttachment } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ExtendedAIMessageOptions extends SendMessageOptions {
  forceOffline?: boolean;
  userId?: string;
}

/**
 * Cek apakah user secara manual memilih AI lokal di pengaturan Offline AI.
 * Jika user sudah download model & memilih local, hormati pilihan itu meski online.
 */
async function isUserPreferringLocalAI(): Promise<boolean> {
  try {
    const selected = await AsyncStorage.getItem('@offline_ai_selected_model');
    // Jika user secara eksplisit memilih salah satu mode AI lokal, hormati
    if (selected === 'smart_synthesizer' || selected === 'qwen_neural') {
      // Cek apakah user pernah aktifkan/download AI lokal
      const everReady = await AsyncStorage.getItem('@offline_ai_ready');
      // Jika AI lokal pernah diaktifkan DAN user pilih smart_synthesizer -> pakai lokal
      if (selected === 'smart_synthesizer' && everReady === 'true') return true;
      // Jika user pilih qwen_neural -> pakai lokal (akan fallback ke synthesizer jika belum download)
      if (selected === 'qwen_neural') return true;
    }
  } catch {
    // Jika gagal baca storage, lanjut pakai cloud
  }
  return false;
}

/**
 * Cek apakah saat ini sistem harus menggunakan AI lokal
 */
export async function shouldUseLocalAI(forceOffline = false): Promise<boolean> {
  if (forceOffline) return true;

  const online = await isDeviceOnline();
  if (!online) return true;

  // Jika user secara manual memilih AI lokal di pengaturan -> hormati pilihan tsb
  const userPrefersLocal = await isUserPreferringLocalAI();
  if (userPrefersLocal) return true;

  try {
    await ensureApiKeysLoaded();
    const keys = getGeminiApiKeysPool();
    if (!keys || keys.length === 0) return true;
  } catch {
    return true;
  }

  return false;
}

/**
 * Unified AI Message Sender: Drop-in replacement untuk sendMessageToGemini
 */
export async function sendAIMessage(
  history: GeminiMessage[],
  newMessage: string,
  attachment?: ChatAttachment | ChatAttachment[] | null,
  customSystemInstruction?: string,
  options?: ExtendedAIMessageOptions
): Promise<string> {
  const useLocal = await shouldUseLocalAI(options?.forceOffline);

  if (useLocal) {
    const localOpts: LocalAIOptions = {
      onToken: options?.onToken,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      signal: options?.signal,
      userId: options?.userId,
    };
    return await sendLocalAIMessage(history, newMessage, localOpts);
  }

  // Coba kirim via Gemini Cloud
  try {
    return await sendMessageToGemini(history, newMessage, attachment, customSystemInstruction, options);
  } catch (err: any) {
    // Jika dibatalkan oleh pengguna (klik stop), teruskan
    if (err?.cancelled || options?.signal?.aborted) {
      throw err;
    }

    // Jika terjadi error koneksi / timeout / offline mendadak saat kirim
    console.warn('[aiRouter] Gemini cloud gagal, beralih mulus ke Local AI offline:', err?.message);

    const localOpts: LocalAIOptions = {
      onToken: options?.onToken,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      signal: options?.signal,
      userId: options?.userId,
    };
    return await sendLocalAIMessage(history, newMessage, localOpts);
  }
}
