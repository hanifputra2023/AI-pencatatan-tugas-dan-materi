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

export const setInMemoryApiKey = (key: string) => {
  if (key && key.trim() !== '') {
    inMemoryApiKeys = [key.trim(), ...inMemoryApiKeys.filter(k => k !== key.trim())];
  }
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

// Candidate models in order of instant vision intelligence & reliability
const ACTIVE_MODELS = [
  'gemini-2.5-flash',         // Intelligence & Vision tier (Diagrams, charts, images in docs)
  'gemini-1.5-flash',         // Standard stable multimodal fallback
  'gemini-flash-lite-latest', // Fast backup
  'gemini-2.5-flash-lite',    // Lightweight fast tier
  'gemini-3.6-flash',         // Backup tier
];

export const testGeminiApiKey = async (key: string): Promise<{ success: boolean; message: string; latency?: number }> => {
  const testKey = key.trim();
  if (!testKey) {
    return { success: false, message: 'Kunci API kosong. Masukkan API Key Gemini kamu.' };
  }
  const startTime = Date.now();
  let lastErr = '';

  for (const model of ACTIVE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${testKey}`;
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
        return { success: true, message: `Koneksi Berhasil! Model [${model}] merespon (${latency}ms): "${reply.trim()}"`, latency };
      } else {
        const err = await res.json().catch(() => ({}));
        lastErr = err?.error?.message || `HTTP ${res.status}`;
      }
    } catch (e: any) {
      lastErr = e.message || 'Gagal menghubungi server Gemini.';
    }
  }

  const latency = Date.now() - startTime;
  return { success: false, message: `Koneksi Gagal (${lastErr})`, latency };
};

const DEFAULT_SYSTEM_INSTRUCTION = `Kamu adalah "Ara", seorang asisten & sahabat AI cerdas yang sangat hangat, empatik, pengertian, dan solutif.
Bahasa yang kamu gunakan adalah Bahasa Indonesia yang luwes, santai, dan akrab layaknya sahabat dekat seumuran.
Prinsip utamamu:
1. Dengarkan setiap keluh kesah, pertanyaan, dan cerita pengguna tanpa menghakimi.
2. FORMATTING TEKS MENTAH & RUMUS / DOKUMEN:
   - Jika menulis rumus matematika / fisika / sains, HINDARI kode LaTeX mentah yang membingungkan (seperti $\\mathbf{A}$, $\\vec{A}$, atau \\frac{a}{b}). Selalu gunakan format Unicode teks yang bersih dan langsung terbaca (misal: "Vektor A (A⃗)", "sin θ = (sisi depan / sisi miring)", "|A| = √(Ax² + Ay²)").
   - Jika pengguna mengirimkan teks mentah, data acak, log, kodingan, OCR catatan, tabel mentah, atau dokumen:
     * Secara OTOMATIS ubah dan rapikan teks mentah tersebut menjadi bentuk yang sangat mudah dibaca, terstruktur, dan indah (gunakan Heading, Bullet points, Tabel Markdown yang rapi, dan penekanan tebal pada poin penting).
     * Terjemahkan / jelaskan istilah sulit atau singkatan rumit agar mudah dipahami siapa saja.
3. ANALISIS VISUAL GAMBAR & DIAGRAM DALAM DOKUMEN / FOTO:
   - Jika pengguna melampirkan foto, dokumen PDF, slide kuliah, atau file yang memuat GAMBAR, DIAGRAM, GRAFIK, BAGAN, FLOWCHART, TABEL, atau SKEMA:
   - Analisis dan jelaskan secara detail informasi visual dari gambar atau diagram tersebut. Jangan lewatkan detail penting yang tertera pada visual.
4. Selalu validasi perasaan mereka dan berikan dorongan semangat atau saran solutif yang jelas.
5. Gunakan format Markdown yang indah (bold, italic, list, tabel, code block jika perlu) dan emoji yang ramah & relevan (✨, 💡, 📋, 🌸, 💜).`;

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

export interface SendMessageOptions {
  isJsonMode?: boolean;
  maxTokens?: number;
}

async function callSingleModelWithKey(
  apiKey: string,
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string,
  options?: SendMessageOptions
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const isJson = options?.isJsonMode === true;
  const maxOutputTokens = options?.maxTokens || (isJson ? 4096 : 1200);

  const requestBody: any = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: isJson ? 0.2 : 0.85,
      topK: 40,
      topP: 0.95,
      maxOutputTokens,
      ...(isJson ? { responseMimeType: 'application/json' } : {}),
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

// Helper to safely extract and parse JSON from AI response even if wrapped in conversational text or markdown
export function extractJsonFromText<T>(text: string): T {
  if (!text) throw new Error('Respon AI kosong.');

  // 1. Direct parse after stripping markdown blocks
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // 2. Extract valid array [ ... ]
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
    const arrStr = text.substring(startArr, endArr + 1);
    try {
      return JSON.parse(arrStr);
    } catch (e) {}
  }

  // 3. Extract valid object { ... }
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    const objStr = text.substring(startObj, endObj + 1);
    try {
      return JSON.parse(objStr);
    } catch (e) {}
  }

  // 4. Salvage partially truncated JSON array: if starts with [ but cut off before ]
  if (startArr !== -1) {
    const partial = text.substring(startArr);
    const lastBrace = partial.lastIndexOf('}');
    if (lastBrace !== -1) {
      const salvagedStr = partial.substring(0, lastBrace + 1) + ']';
      try {
        const parsed = JSON.parse(salvagedStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as unknown as T;
        }
      } catch (e) {}
    }
  }

  throw new Error('Respon AI tidak berformat JSON yang valid. Silakan klik Buat Kuis sekali lagi.');
}

// =========================================================================
// MULTI-KEY & MULTI-MODEL SMART FAILOVER ROUTING ENGINE
// =========================================================================
export async function sendMessageToGemini(
  history: GeminiMessage[],
  newMessage: string,
  attachment?: ChatAttachment | ChatAttachment[] | null,
  customSystemInstruction?: string,
  options?: SendMessageOptions
): Promise<string> {
  const keysPool = getGeminiApiKeysPool();
  if (keysPool.length === 0) {
    throw new Error('Belum ada API Key Gemini yang aktif. Buka Panel Administrator > Fine-Tuning AI untuk menambahkan API Key.');
  }

  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  const MULTIMODAL_TYPES = ['image', 'audio', 'document'];
  const attachmentsList: ChatAttachment[] = Array.isArray(attachment)
    ? attachment
    : (attachment ? [attachment] : []);

  let accumulatedDocText = '';

  for (const att of attachmentsList) {
    const isPdf = (att.mimeType === 'application/pdf') || (att.name?.toLowerCase().endsWith('.pdf'));

    if (att.base64 && MULTIMODAL_TYPES.includes(att.type)) {
      const finalMime = isPdf ? 'application/pdf' : (att.mimeType || 'image/jpeg');
      userParts.push({
        inlineData: {
          mimeType: finalMime,
          data: att.base64,
        },
      });
    }

    if (att.textContent && att.textContent.trim()) {
      const fileSizeKb = ((att.size || att.textContent.length) / 1024).toFixed(1);
      accumulatedDocText += `\n\n[Lampiran Dokumen: "${att.name || 'Dokumen'}" (${fileSizeKb} KB)]\n` +
        `--- AWAL ISI DOKUMEN ---\n` +
        `${att.textContent.trim()}\n` +
        `--- AKHIR ISI DOKUMEN ---\n`;
    }
  }

  let fullPrompt = newMessage;
  if (accumulatedDocText) {
    fullPrompt = `${accumulatedDocText}\n\n${newMessage}`;
  }

  userParts.push({ text: fullPrompt || 'Halo Ara' });

  // Optimize history: Keep last 10 turns max & clamp older bulky text to keep response latency ultra-fast
  const sanitizedHistory: GeminiMessage[] = history
    .filter(m => m.parts && m.parts.length > 0)
    .slice(-10)
    .map((m, idx, arr) => {
      if (m.role === 'model' && idx < arr.length - 1) {
        const textPart = m.parts.find(p => p.text)?.text || '';
        if (textPart.length > 500) {
          return {
            ...m,
            parts: [{ text: textPart.substring(0, 500) + '... (dipersingkat)' }],
          };
        }
      }
      return m;
    });

  const contents: GeminiMessage[] = [
    ...sanitizedHistory,
    {
      role: 'user',
      parts: userParts,
    },
  ];

  const systemPrompt = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  let lastError: any = null;
  const totalKeys = keysPool.length;
  const startOffset = Math.floor(Math.random() * totalKeys);

  // 1. Iterate through each API Key in the Multi-Key Pool with smart load-balanced distribution
  for (let step = 0; step < totalKeys; step++) {
    const keyIdx = (startOffset + step) % totalKeys;
    const currentKey = keysPool[keyIdx];
    const keyPreview = currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4);

    // 2. Iterate through candidate models for this key
    for (const model of ACTIVE_MODELS) {
      try {
        const reply = await callSingleModelWithKey(currentKey, model, contents, systemPrompt, options);
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
