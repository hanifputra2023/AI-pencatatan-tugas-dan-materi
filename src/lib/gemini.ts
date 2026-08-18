// Gemini AI Client with Multi-Model Fallback & Dynamic Admin API Key Management
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatAttachment } from '../types';

let inMemoryApiKey = '';

// Load initial cached key asynchronously
AsyncStorage.getItem('@gemini_api_key').then(val => {
  if (val) inMemoryApiKey = val;
});

export const setInMemoryApiKey = (key: string) => {
  inMemoryApiKey = key;
};

export const getGeminiApiKey = (): string => {
  if (inMemoryApiKey && inMemoryApiKey.trim() !== '') {
    return inMemoryApiKey.trim();
  }
  if (process.env.EXPO_PUBLIC_GEMINI_API_KEY && process.env.EXPO_PUBLIC_GEMINI_API_KEY.trim() !== '') {
    return process.env.EXPO_PUBLIC_GEMINI_API_KEY.trim();
  }
  return '';
};

export const testGeminiApiKey = async (key: string): Promise<{ success: boolean; message: string }> => {
  const testKey = key.trim();
  if (!testKey) {
    return { success: false, message: 'Kunci API kosong. Masukkan API Key Gemini kamu.' };
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${testKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Ping test. Jawab "OK"' }] }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
      return { success: true, message: `Koneksi Berhasil! Google Gemini merespon: "${reply.trim()}"` };
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      return { success: false, message: `Koneksi Gagal (${msg})` };
    }
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghubungi server Gemini.' };
  }
};

// Candidate models in order of resilience and speed (verified 200 OK endpoints)
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

async function callSingleModel(
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('API Key Google Gemini belum diatur di Panel Administrator. Buka menu Admin > Fine-Tuning AI untuk memasukkan API Key.');
  }

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

export async function sendMessageToGemini(
  history: GeminiMessage[],
  newMessage: string,
  attachment?: ChatAttachment | null,
  customSystemInstruction?: string
): Promise<string> {
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

  // Try each verified active model in sequence with automatic fallback
  let lastError: any = null;
  for (const model of ACTIVE_MODELS) {
    try {
      const reply = await callSingleModel(model, contents, systemPrompt);
      return reply;
    } catch (err: any) {
      console.warn(`[AI Fallback] Model ${model} mengalami kendala (Status ${err.status || err.message}). Otomatis beralih ke model cadangan...`);
      lastError = err;
      // Brief pause before querying the next model
      await new Promise(res => setTimeout(res, 300));
    }
  }

  throw new Error(
    lastError?.message ||
    'Semua model AI sedang dalam antrean padat. Coba beberapa saat lagi ya!'
  );
}

export async function getAIWisdom(mood: string, botName?: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
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
