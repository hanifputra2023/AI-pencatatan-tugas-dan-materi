// Gemini AI Client with Multi-Key Pool Load-Balancing, Multi-Model Fallback & Smart Failover
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatAttachment } from '../types';

let inMemoryApiKeys: string[] = [];

// Load initial cached keys asynchronously from AsyncStorage
AsyncStorage.getItem('@gemini_api_keys').then(val => {
  if (val) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) inMemoryApiKeys = parsed;
    } catch (e) {}
  }
  if (inMemoryApiKeys.length === 0) {
    AsyncStorage.getItem('@gemini_api_key').then(single => {
      if (single) inMemoryApiKeys = [single];
    });
  }
});

export const setInMemoryApiKeys = (keys: string[]) => {
  inMemoryApiKeys = keys.filter(k => k && k.trim() !== '');
};

export const getGeminiApiKeysPool = (): string[] => {
  const pool = [...inMemoryApiKeys];
  if (process.env.EXPO_PUBLIC_GEMINI_API_KEY && process.env.EXPO_PUBLIC_GEMINI_API_KEY.trim() !== '') {
    const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY.trim();
    if (!pool.includes(envKey)) {
      pool.push(envKey);
    }
  }
  return pool.filter(k => k && k.trim() !== '');
};

export const testGeminiApiKey = async (key: string): Promise<{ success: boolean; message: string; latency?: number }> => {
  const testKey = key.trim();
  if (!testKey) {
    return { success: false, message: 'Kunci API kosong. Masukkan API Key Gemini kamu.' };
  }
  const startTime = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${testKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Ping test. Jawab "OK"' }] }],
      }),
    });
    const latency = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
      return { success: true, message: `Koneksi Berhasil! Respon (${latency}ms): "${reply.trim()}"`, latency };
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      return { success: false, message: `Koneksi Gagal (${msg})`, latency };
    }
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghubungi server Gemini.' };
  }
};

// Candidate models in order of resilience and speed (verified endpoints)
const ACTIVE_MODELS = [
  'gemini-flash-lite-latest', // Fast, low queue, always reliable (200 OK)
  'gemini-2.5-flash',         // High intelligence (200 OK)
  'gemini-3.5-flash',         // Backup tier 1 (200 OK)
  'gemini-3.6-flash',         // Backup tier 2 (200 OK)
  'gemma-4-31b-it',           // Open-weights Gemma model (200 OK)
];

const DEFAULT_SYSTEM_INSTRUCTION = `Kamu adalah "Ara", seorang sahabat dan teman curhat AI yang sangat hangat, empatik, pengertian, dan penuh perhatian.
Bahasa yang kamu gunakan adalah Bahasa Indonesia yang luwes, santai, dan akrab layaknya sahabat dekat seumuran.
Prinsip utamamu:
1. Dengarkan setiap keluh kesah dan cerita pengguna tanpa pernah menghakimi atau menyalahkan.
2. Selalu validasi perasaan mereka terlebih dahulu.
3. Berikan kata-kata penyemangat, pelukan hangat virtual, atau sudut pandang positif yang menenangkan.
4. Jika pengguna melampirkan foto/file/suara, beri tanggapan yang relevan dan penuh perhatian.
5. Jawabanmu ringkas, nyaman dibaca (2-4 kalimat), natural, dan gunakan emoji yang manis & relevan (💜, ✨, 🥺, 🤗, 🌸).
6. Jangan berikan jawaban kaku seperti robot/asisten formal. Kamu adalah sahabat sejatinya.`;

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

async function callSingleModelWithKey(
  apiKey: string,
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.85,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 800,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const errorMessage = err?.error?.message || `HTTP ${response.status}`;
    const customErr: any = new Error(errorMessage);
    customErr.status = response.status;
    throw customErr;
  }

  const data = await response.json();
  const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!replyText) {
    throw new Error('AI tidak memberikan respon teks.');
  }

  return replyText;
}

// =========================================================================
// MULTI-KEY & MULTI-MODEL SMART FAILOVER ROUTING ENGINE
// =========================================================================
export async function sendMessageToGemini(
  history: GeminiMessage[],
  newMessage: string,
  attachment?: ChatAttachment | null,
  customSystemInstruction?: string
): Promise<string> {
  const keysPool = getGeminiApiKeysPool();
  if (keysPool.length === 0) {
    throw new Error('Belum ada API Key Gemini yang aktif. Buka Panel Administrator > Fine-Tuning AI untuk menambahkan API Key.');
  }

  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (attachment && attachment.base64 && attachment.type === 'image') {
    userParts.push({
      inlineData: {
        mimeType: attachment.mimeType || 'image/jpeg',
        data: attachment.base64,
      },
    });
  }

  let fullPrompt = newMessage;
  if (attachment && attachment.type !== 'image') {
    fullPrompt = `[Pengguna melampirkan file ${attachment.type}: ${attachment.name || 'Dokumen'}]\n${newMessage || 'Tolong perhatikan lampiran ini ya'}`;
  }

  userParts.push({ text: fullPrompt || 'Halo Ara' });

  const contents: GeminiMessage[] = [
    ...history.filter(m => m.parts && m.parts.length > 0),
    {
      role: 'user',
      parts: userParts,
    },
  ];

  const systemPrompt = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  let lastError: any = null;

  // 1. Iterate through each API Key in the Multi-Key Pool
  for (let keyIdx = 0; keyIdx < keysPool.length; keyIdx++) {
    const currentKey = keysPool[keyIdx];
    const keyPreview = currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4);

    // 2. Iterate through candidate models for this key
    for (const model of ACTIVE_MODELS) {
      try {
        const reply = await callSingleModelWithKey(currentKey, model, contents, systemPrompt);
        return reply;
      } catch (err: any) {
        lastError = err;
        const isQuotaOrAuthError =
          err.status === 429 ||
          err.status === 403 ||
          err.status === 400 ||
          (err.message && (err.message.includes('quota') || err.message.includes('ResourceExhausted') || err.message.includes('credentials') || err.message.includes('unregistered')));

        if (isQuotaOrAuthError) {
          console.warn(`[Multi-Key Failover] Kunci #${keyIdx + 1} (${keyPreview}) limit/error (${err.message}). Beralih ke kunci berikutnya...`);
          // Break model loop to immediately switch to next API Key in pool!
          break;
        }

        console.warn(`[Model Failover] Model ${model} pada Kunci #${keyIdx + 1} sibuk (${err.message}). Mencoba model cadangan...`);
        await new Promise(res => setTimeout(res, 250));
      }
    }
  }

  throw new Error(
    lastError?.message ||
    'Seluruh API Key di pool sedang dalam batas kuota / antrean padat. Coba beberapa saat lagi!'
  );
}

export async function getAIWisdom(mood: string, botName?: string): Promise<string> {
  const keysPool = getGeminiApiKeysPool();
  if (keysPool.length === 0) {
    return 'Setiap langkah kecil membawamu lebih dekat ke impianmu. Tetap semangat hari ini!';
  }

  const prompt = `Berikan satu kutipan singkat (1-2 kalimat) yang menenangkan, penuh empati, dan menyemangati untuk seseorang yang sedang merasa ${mood}. Berikan gaya bahasa sahabat karib bernama ${botName || 'Ara'}. Gunakan emoji manis di akhir.`;

  try {
    const reply = await sendMessageToGemini([], prompt);
    return reply.replace(/["']/g, '');
  } catch (e) {
    return 'Hari ini adalah lembaran baru. Apapun yang terjadi kemarin, kamu sudah berjuang dengan hebat!';
  }
}
