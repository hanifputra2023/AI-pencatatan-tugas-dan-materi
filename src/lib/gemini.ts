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
    } catch (e) { }
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

export const ACTIVE_MODELS = [
  'gemini-3.7-flash',         // Model tercepat & generasi terbaru (~1.2s, terverifikasi semua kunci)
  'gemini-3.5-flash',         // Cadangan generasi baru (~2s)
  'gemini-flash-latest',      // Cadangan stabil umum (~2-3s)
  'gemini-2.5-flash',         // Model generasi 2.5
  'gemini-3.1-flash-lite',    // Model hemat kuota
  'gemini-flash-lite-latest', // Model flash lite
];

let preferredModel = 'gemini-3.7-flash';

export const setPreferredModel = (model: string) => {
  if (model && model.trim()) {
    preferredModel = model.trim();
  }
};

export const testGeminiApiKey = async (
  key: string,
  modelPreference?: string
): Promise<{ success: boolean; message: string; latency?: number; modelUsed?: string }> => {
  const testKey = key.trim();
  if (!testKey) {
    return { success: false, message: 'Kunci API kosong. Masukkan API Key Gemini kamu.' };
  }
  const startTime = Date.now();
  let lastErr = '';

  const targetFirst = (modelPreference || preferredModel || 'gemini-2.5-flash').trim();
  const candidateModels = [
    targetFirst,
    ...ACTIVE_MODELS.filter(m => m !== targetFirst),
  ];

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
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
        const isFallback = i > 0;
        const msg = isFallback
          ? `Koneksi Berhasil via Fallback [${model}] (${latency}ms): "${reply.trim()}" (Model utama ${targetFirst} sedang sibuk)`
          : `Koneksi Berhasil! Model [${model}] merespon (${latency}ms): "${reply.trim()}"`;
        return { success: true, message: msg, latency, modelUsed: model };
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
   - Jika menulis rumus matematika / fisika / sains, HINDARI kode LaTeX mentah yang membingungkan (seperti $\\mathbf{A}$, $\\vec{A}$, atau \\frac{a}{b}). Selalu gunakan format Unicode teks yang bersih dan langsung terbaca (misal: "Vektor A (Aâƒ—)", "sin Î¸ = (sisi depan / sisi miring)", "|A| = âˆš(AxÂ² + AyÂ²)").
   - Jika pengguna mengirimkan teks mentah, data acak, log, kodingan, OCR catatan, tabel mentah, atau dokumen:
     * Secara OTOMATIS ubah dan rapikan teks mentah tersebut menjadi bentuk yang sangat mudah dibaca, terstruktur, dan indah (gunakan Heading, Bullet points, Tabel Markdown yang rapi, dan penekanan tebal pada poin penting).
     * Terjemahkan / jelaskan istilah sulit atau singkatan rumit agar mudah dipahami siapa saja.
3. ANALISIS VISUAL GAMBAR & DIAGRAM DALAM DOKUMEN / FOTO:
   - Jika pengguna melampirkan foto, dokumen PDF, slide kuliah, atau file yang memuat GAMBAR, DIAGRAM, GRAFIK, BAGAN, FLOWCHART, TABEL, atau SKEMA:
   - Analisis dan jelaskan secara detail informasi visual dari gambar atau diagram tersebut. Jangan lewatkan detail penting yang tertera pada visual.
4. Selalu validasi perasaan mereka dan berikan dorongan semangat atau saran solutif yang jelas.
5. Gunakan format Markdown yang indah (bold, italic, list, tabel, code block jika perlu) dan emoji yang ramah & relevan (âœ¨, ðŸ’¡, ðŸ“‹, ðŸŒ¸, ðŸ’œ).`;

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

export interface SendMessageOptions {
  isJsonMode?: boolean;
  maxTokens?: number;
  onToken?: (partialText: string) => void;
  deepThink?: boolean;
  temperature?: number;
  topP?: number;
  factual?: boolean;
  agent?: boolean;
  /** External signal that lets the caller cancel an in-flight request. */
  signal?: AbortSignal;
  /** Explicit model override (e.g. from appSettings.ai_model) */
  model?: string;
}

interface GeminiCallResult {
  text: string;
  finishReason?: string;
}

const CHAT_MAX_TOKENS = 8192;

const CONTINUE_PROMPT =
  'PESAN INTERNAL SISTEM: jawabanmu terpotong karena batas konteks, bukan karena kesalahan pengguna. ' +
  'LANJUTKAN jawabanmu persis dari kalimat terakhir yang kamu tulis, tanpa kalimat pembuka apa pun. ' +
  'DILARANG meminta maaf, menjelaskan bahwa jawaban terpotong, atau menulis komentar seperti ' +
  '"Maaf", "Sepertinya jawaban terpotong", "Kita lanjutkan lagi" dan sejenisnya. ' +
  'Kalimat baru yang kamu tulis harus langsung menjadi lanjutan kalimat sebelumnya hingga jawaban selesai tuntas.';

const AGENT_INSTRUCTIONS =
  '\n\nMODE AGENT AKTIF - KAMU BISA MELAKUKAN AKSI NYATA:\n' +
  'Jika pengguna MEMINTA AKSI (bukan sekadar bertanya), lakukan aksi dengan menambahkan blok JSON khusus di AKHIR jawabanmu. Formatnya persis seperti ini:\n' +
  '<AGENT_ACTION>{"action":"create_task","data":{"title":"...","due_date":"...","subject":"...","priority":"high|medium|low","notes":"..."}}</AGENT_ACTION>\n' +
  '\nAksi yang tersedia:\n' +
  '1. create_task - buat tugas/jadwal belajar. data: title (wajib), due_date ("besok", "2026-09-10", atau ISO), subject, priority (high/medium/low), notes.\n' +
  '2. update_task - ubah tugas yang sudah ada. data: title/id (untuk menemukan tugas), is_completed (true/false), due_date, subject, priority, notes.\n' +
  '3. delete_task - hapus tugas. data: title atau id.\n' +
  '4. save_journal - catat jurnal. data: content (wajib), title, mood (neutral/ceria/gelisah/capek dll), tags (array).\n' +
  '5. delete_journal - hapus jurnal. data: title atau id.\n' +
  '6. create_note - buat catatan belajar. data: title (wajib), content, subject, summary.\n' +
  '7. delete_note - hapus catatan. data: title atau id.\n' +
  '8. create_quiz - buat kuis & flashcard. data: title, subject, quiz (array {question, options[4], correctIndex, explanation}), flashcards (array {front, back}).\n' +
  '9. search_data - cari data pengguna. data: type ("tasks"/"notes"/"journals"/"all"), query, limit. Hasilnya akan ditampilkan otomatis sebagai pesan konfirmasi.\n' +
  '10. summarize - ringkas data. data: type, since ("minggu ini"/"bulan ini"), topic. Hasil rangkuman ditampilkan otomatis.\n' +
  '11. create_study_plan - buat rencana belajar multi-sesi. data: goal, subject, exam_date, sessions (array {title, due_date, priority, subject, notes}).\n' +
  '\nAturan:\n' +
  '- Hanya sertakan blok <AGENT_ACTION> jika pengguna benar-benar meminta aksi. Jika ragu, JANGAN sertakan blok lalu cukup jawab dan tanya konfirmasi.\n' +
  '- Untuk aksi search_data / summarize, jawaban teksmu cukup singkat saja ("Sebentar, saya cari dulu ya..."), karena hasil datanya akan muncul sebagai pesan konfirmasi terpisah.\n' +
  '- Jawaban tetap kamu tulis secara alami; blok JSON hanyalah lampiran di akhir, tidak perlu disebutkan ke pengguna.\n' +
  '- Tanggal "besok" berarti besok, "nanti malam" berarti hari ini, "minggu ini" = 7 hari terakhir terhitung awal pekan.\n';

const FACTUAL_GUARDRAIL =
  '\n\nATURAN KETAT KEABSAHAN DATA (WAJIB DIPATUHI):\n' +
  '1. Jawab HANYA berdasarkan fakta yang tersedia dalam konteks percakapan dan lampiran dokumen yang diberikan. Jangan menambahkan hal di luar itu.\n' +
  '2. Jika pertanyaan tidak bisa dijawab dari konteks/lampiran yang tersedia, katakan jujur "Data tidak ditemukan di konteks yang tersedia." DILARANG menebak, mengarang, atau berasumsi.\n' +
  '3. Jangan melakukan ekstrapolasi atau menambahkan angka, nama, tanggal, kutipan, atau pernyataan yang tidak tertulis dalam konteks.\n' +
  '4. Jangan mengulang pernyataan dari dokumen secara keliru; kutip isi dokumen secara akurat jika diminta.\n' +
  '5. Jawab secara bertahap dan terstruktur, serta bedakan jelas antara fakta dari konteks dan saran/penjelasan umum yang kamu berikan sebagai AI.';

async function callSingleModelWithKey(
  apiKey: string,
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string,
  options?: SendMessageOptions
): Promise<GeminiCallResult> {
  // Use SSE streaming for progressive token delivery when a token callback is requested
  if (options?.onToken && !options?.isJsonMode) {
    return streamSingleModelWithKey(apiKey, modelName, contents, systemPrompt, options);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const isJson = options?.isJsonMode === true;
  const maxOutputTokens = options?.maxTokens || (isJson ? 4096 : CHAT_MAX_TOKENS);

  // Sampling control: explicit option wins, Deep Thinking prefers a balanced
  // temperature, otherwise fall back to defaults (JSON mode stays deterministic)
  const temperature =
    options?.temperature !== undefined
      ? options.temperature
      : options?.deepThink && !isJson
        ? 0.7
        : isJson
          ? 0.2
          : 0.85;
  const topP = options?.topP !== undefined ? options.topP : 0.95;

  const requestBody: any = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature,
      topK: 40,
      topP,
      maxOutputTokens,
      ...(isJson ? { responseMimeType: 'application/json' } : {}),
    },
  };

  // Thinking budget: explicitly set 0 for normal mode agar model tidak
  // melakukan internal reasoning yang membuang ~10 detik. Mode Deep Think
  // menggunakan budget terbatas (1024) — cukup untuk analisis mendalam
  // tanpa mengorbankan kecepatan respons secara berlebihan.
  if (!isJson) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingBudget: options?.deepThink ? 1024 : 0,
    };
  }

  const controller = new AbortController();
  let userCancelled = false;
  const externalSignal = options?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      userCancelled = true;
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => {
        userCancelled = true;
        controller.abort();
      }, { once: true });
    }
  }
  // Deep thinking needs more time to reason; otherwise 14 detik auto-timeout
  const timeoutMs = options?.deepThink ? 30000 : 14000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errorMessage = err?.error?.message || `HTTP ${response.status}`;
      const customErr: any = new Error(errorMessage);
      customErr.status = response.status;
      throw customErr;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    // Filter bagian "thought" internal AI agar tidak bocor ke tampilan chat.
    // Gemini 2.5+ mengembalikan array parts: part bertanda thought:true adalah
    // monolog penalaran internal yang TIDAK boleh ditampilkan ke pengguna.
    const replyText = candidate?.content?.parts
      ?.filter((p: any) => !p.thought)
      ?.map((p: any) => p.text || '')
      ?.join('') || '';
    if (!replyText) {
      throw new Error('AI tidak memberikan respon teks.');
    }

    return { text: replyText, finishReason: candidate?.finishReason };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      if (userCancelled) {
        const cancelledErr: any = new Error('Percakapan dihentikan oleh pengguna.');
        cancelledErr.cancelled = true;
        throw cancelledErr;
      }
      throw new Error(`Model ${modelName} timeout. Mengalihkan ke model cepat...`);
    }
    throw error;
  }
}

// Strip a duplicated tail that the model re-emits at the start of a continuation.
// Handles both full-sentence repeats and partial mid-sentence overlaps by finding
// the LONGEST suffix of `prev` that also prefixes `next`, so no real content is lost
// and no duplicate content is kept.
function stripRepeatedTail(prev: string, next: string): string {
  const cleanPrev = prev.trimEnd();
  const cleanNext = next.trimStart();
  if (!cleanPrev || !cleanNext) return cleanNext;

  // Fast path: exact tail sentence(s) repeated
  const pieces = cleanPrev.match(/[^.!?\n]+[.!?\n]*/g);
  if (pieces && pieces.length > 0) {
    const lastSent = pieces[pieces.length - 1].trim();
    const lastTwo = pieces.length >= 2
      ? (pieces[pieces.length - 2] + pieces[pieces.length - 1]).trim()
      : '';
    for (const candidate of [lastTwo, lastSent]) {
      if (candidate && candidate.length >= 4 && cleanNext.startsWith(candidate)) {
        return cleanNext.slice(candidate.length).trimStart();
      }
    }
  }

  // General overlap: longest suffix of prev that is a prefix of next.
  // Search backwards so we prefer the longest match (fewest characters removed).
  const maxSearch = Math.min(cleanPrev.length, cleanNext.length, 200);
  let bestLen = 0;
  for (let len = maxSearch; len >= 12; len--) {
    const suffix = cleanPrev.slice(-len);
    if (suffix === cleanNext.slice(0, len)) {
      bestLen = len;
      break;
    }
  }
  if (bestLen > 0) {
    return cleanNext.slice(bestLen).trimStart();
  }

  // Fallback: strip a short trailing chunk if repeated verbatim
  const tail = cleanPrev.slice(-90);
  if (tail.length >= 12 && cleanNext.startsWith(tail)) {
    return cleanNext.slice(tail.length).trimStart();
  }

  return cleanNext;
}

// Streamed chat call menggunakan XHR + onprogress.
// XHR.onprogress dipanggil setiap kali byte baru tiba dari server — inilah
// yang memungkinkan teks muncul kata-per-kata secara progresif di layar.
// fetch/ReadableStream TIDAK bekerja di React Native (hanya di browser),
// sehingga implementasi sebelumnya selalu jatuh ke fallback response.text()
// yang membaca seluruh body dulu baru menampilkan semua teks sekaligus.
async function streamSingleModelWithKey(
  apiKey: string,
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string,
  options: SendMessageOptions
): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const isJson = options?.isJsonMode === true;
  const maxOutputTokens = options?.maxTokens || (isJson ? 4096 : CHAT_MAX_TOKENS);

  const temperature =
    options?.temperature !== undefined
      ? options.temperature
      : options?.deepThink && !isJson
        ? 0.7
        : isJson
          ? 0.2
          : 0.85;
  const topP = options?.topP !== undefined ? options.topP : 0.95;

  const requestBody: any = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature,
      topK: 40,
      topP,
      maxOutputTokens,
      ...(isJson ? { responseMimeType: 'application/json' } : {}),
    },
  };

  // Thinking budget: eksplisit matikan (0) untuk mode biasa agar model tidak
  // menghabiskan 10-15 detik untuk internal reasoning sebelum menjawab.
  // Mode Deep Think menggunakan budget 1024 — cukup mendalam, tetap responsif.
  if (!isJson) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingBudget: options?.deepThink ? 1024 : 0,
    };
  }

  const timeoutMs = options?.deepThink ? 120000 : 60000;
  const bodyStr = JSON.stringify(requestBody);

  return new Promise<GeminiCallResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = timeoutMs;

    let fullText = '';
    let finishReason: string | undefined;
    let processedLength = 0;
    let userCancelled = false;

    // Sambungkan AbortSignal external (tombol Stop di chat) ke XHR
    const externalSignal = options?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        userCancelled = true;
        xhr.abort();
      } else {
        externalSignal.addEventListener('abort', () => {
          userCancelled = true;
          xhr.abort();
        }, { once: true });
      }
    }

    // Parse setiap baris SSE dari chunk yang baru masuk
    const parseNewChunk = (rawChunk: string) => {
      const lines = rawChunk.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          const candidate = data.candidates?.[0];
          // Filter bagian "thought" (monolog penalaran internal AI) agar tidak
          // bocor ke streaming bubble chat pengguna. Hanya ambil part non-thought.
          const parts: any[] = candidate?.content?.parts || [];
          const delta = parts
            .filter((p: any) => !p.thought)
            .map((p: any) => p.text || '')
            .join('');
          if (delta) {
            fullText += delta;
            options.onToken?.(fullText);
          }
          if (candidate?.finishReason) {
            finishReason = candidate.finishReason;
          }
        } catch (e) {
          // Abaikan chunk SSE yang belum lengkap / malformed
        }
      }
    };

    // onprogress: dipanggil setiap kali byte baru tiba dari server.
    // Ini adalah inti dari streaming kata-per-kata yang sesungguhnya.
    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      if (newChunk) parseNewChunk(newChunk);
    };

    xhr.onload = () => {
      // Proses sisa data yang mungkin belum ter-cover oleh onprogress terakhir
      const remaining = xhr.responseText.slice(processedLength);
      if (remaining.trim()) parseNewChunk(remaining);

      if (xhr.status >= 400) {
        try {
          const errData = JSON.parse(xhr.responseText);
          const msg = errData?.error?.message || `HTTP ${xhr.status}`;
          const customErr: any = new Error(msg);
          customErr.status = xhr.status;
          reject(customErr);
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
        return;
      }

      if (!fullText) {
        reject(new Error('AI tidak memberikan respon teks.'));
        return;
      }
      resolve({ text: fullText, finishReason });
    };

    xhr.onerror = () => {
      reject(new Error(`Model ${modelName} gagal terhubung. Mengalihkan ke model cepat...`));
    };

    xhr.onabort = () => {
      if (userCancelled) {
        const cancelledErr: any = new Error('Percakapan dihentikan oleh pengguna.');
        cancelledErr.cancelled = true;
        reject(cancelledErr);
      } else {
        reject(new Error(`Model ${modelName} timeout saat streaming. Mengalihkan ke model cepat...`));
      }
    };

    xhr.ontimeout = () => {
      reject(new Error(`Model ${modelName} timeout saat streaming. Mengalihkan ke model cepat...`));
    };

    xhr.send(bodyStr);
  });
}


export function extractJsonFromText<T>(text: string): T {
  if (!text) throw new Error('Respon AI kosong.');

  // 1. Direct parse after stripping markdown blocks
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) { }

  // 2. Extract valid array [ ... ]
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
    const arrStr = text.substring(startArr, endArr + 1);
    try {
      return JSON.parse(arrStr);
    } catch (e) { }
  }

  // 3. Extract valid object { ... }
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    const objStr = text.substring(startObj, endObj + 1);
    try {
      return JSON.parse(objStr);
    } catch (e) { }
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
      } catch (e) { }
    }
  }

  throw new Error('Respon AI tidak berformat JSON yang valid. Silakan klik Buat Kuis sekali lagi.');
}

// =========================================================================
// MULTI-KEY & MULTI-MODEL SMART FAILOVER ROUTING ENGINE
// =========================================================================

// Join a continuation piece onto the accumulated answer, choosing a connector that
// preserves natural sentence flow. If the text was cut mid-sentence, continue on the
// same line instead of inserting a blank line.
function joinContinuation(prevText: string, nextText: string): string {
  const stripped = stripRepeatedTail(prevText, nextText);
  const prevEnd = prevText.trimEnd();

  // If the previous chunk ended mid-sentence (no terminal punctuation) treat the
  // continuation as a natural extension with a single space.
  const endsWithSentenceEnding = /[.!?â€¦]$/.test(prevEnd);
  const nextStartsWithLower = /^[a-z0-9(]/.test(stripped);

  if (!endsWithSentenceEnding && nextStartsWithLower && stripped.length > 0) {
    return prevEnd + ' ' + stripped;
  }

  // Otherwise break paragraphs with a single blank line for readability.
  return prevEnd + '\n\n' + stripped;
}

// Models occasionally react to the continuation prompt with meta-commentary instead of
// just continuing (e.g. "Maaf ya, teksnya kepotong... Kita lanjutin lagi!"). Strip such
// leading filler so the final answer reads as one seamless text.
function stripContinuationFiller(text: string): string {
  const fillerRegex =
    /^(?:(?:maaf|maap|mohon maaf|sorry|oh maaf)[^.!?\n]*[.!?]?\s*|(?:sepertinya|jawaban|teks|pesan|respon|balasan)(?: (?:terpotong|kepotong|terputus|tidak lengkap))?[^.!?\n]*[.!?]?\s*|(?:kita lanjutkan|kita lanjutin|lanjutkan lagi|lanjutin lagi|oke? kita lanjutkan)[^.!?\n]*[.!?]?\s*)/i;
  let t = text.trimStart();
  while (fillerRegex.test(t)) {
    t = t.replace(fillerRegex, '').trimStart();
  }
  return t;
}

// Auto-continue truncated responses (finishReason === 'MAX_TOKENS') until complete
async function continueUntilComplete(
  apiKey: string,
  modelName: string,
  contents: GeminiMessage[],
  systemPrompt: string,
  options: SendMessageOptions | undefined,
  firstResult: GeminiCallResult
): Promise<string> {
  // JSON mode must not be extended (would corrupt the structure) - return as-is
  if (options?.isJsonMode) {
    return firstResult.text;
  }

  const MAX_CONTINUE_STEPS = 5;
  let fullText = firstResult.text;
  let currentContents = contents;
  let current = firstResult;

  // The response is considered truncated when the model flagged it (MAX_TOKENS / SAFETY /
  // RECITATION) OR when the stream just stopped while the text was left hanging
  // mid-sentence (no sentence/closing markdown delimiter), which is exactly the
  // "putus tengah jalan" symptom the user reports with Deep Thinking.
  const hasFinishedCleanly = (text: string): boolean => {
    const t = text.trimEnd();
    if (!t) return true;
    // Completed sentence, closing code fence, or ends on a fresh line (finished a
    // list/paragraph) -> considered finished. Anything else is treated as hanging.
    return /[.!?â€¦[:;](\s*```\s*)?$/.test(t) || /```$/.test(t) || /\n\s*$/.test(t);
  };

  const shouldContinue = (result: GeminiCallResult): boolean => {
    if (result.finishReason && result.finishReason !== 'STOP') return true;
    // No explicit finishReason but text hung mid-sentence -> continue
    return result.text.trim().length > 0 && !hasFinishedCleanly(result.text);
  };

  for (let step = 0; step < MAX_CONTINUE_STEPS && shouldContinue(current); step++) {
    try {
      currentContents = [
        ...currentContents,
        { role: 'model', parts: [{ text: current.text }] },
        { role: 'user', parts: [{ text: CONTINUE_PROMPT }] },
      ];

      // Keep streaming across continuations: report the full accumulated answer,
      // stripping any tail repeated from the previous piece. CRITICAL: disable
      // deep-thinking on the continuation call, otherwise the model would think
      // from scratch again (huge latency + often re-starts the answer from zero).
      const continuationOptions: SendMessageOptions | undefined = options
        ? {
            ...options,
            deepThink: false,
            onToken: options.onToken
              ? (partial: string) => {
                  options.onToken?.(joinContinuation(fullText, stripContinuationFiller(partial)));
                }
              : undefined,
          }
        : options;

      current = await callSingleModelWithKey(apiKey, modelName, currentContents, systemPrompt, continuationOptions);
      fullText = joinContinuation(fullText, stripContinuationFiller(current.text));
    } catch (e: any) {
      console.warn(`[Auto-Continue] Gagal melanjutkan respon (${e.message}). Memakai teks yang sudah ada.`);
      break;
    }
  }

  return fullText;
}

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

  let systemPrompt = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
  // Faktual/akurat mode: tambahkan guardrails ketat anti halusinasi
  if (options?.factual) {
    systemPrompt += FACTUAL_GUARDRAIL;
  }
  // Agent mode: izinkan AI melakukan aksi nyata (task/jurnal/catatan)
  if (options?.agent) {
    systemPrompt += AGENT_INSTRUCTIONS;
  }

  let lastError: any = null;
  const totalKeys = keysPool.length;
  const startOffset = Math.floor(Math.random() * totalKeys);

  // Daftar model yang akan dicoba secara berurutan:
  // Mulai dari model pilihan aktif, lalu otomatis fallback ke model generasi baru / stabil / lite
  const activePreferred = (options?.model || preferredModel || 'gemini-3.7-flash').trim();
  const modelsToTry = [
    activePreferred,
    ...ACTIVE_MODELS.filter(m => m !== activePreferred),
  ];

  // 1. TIER 1 (MODEL FAILOVER): Jika sebuah model limit (429), timeout, atau overload di server,
  // sistem OTOMATIS beralih ke model cadangan berikutnya (gemini-3.5-flash -> gemini-2.5-flash -> gemini-flash-lite)
  for (const model of modelsToTry) {
    // 2. TIER 2 (MULTI-KEY LOAD BALANCING): Untuk model yang sedang dicoba,
    // coba kunci-kunci di pool secara bergantian
    for (let step = 0; step < totalKeys; step++) {
      const keyIdx = (startOffset + step) % totalKeys;
      const currentKey = keysPool[keyIdx];
      const keyPreview = currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4);

      try {
        const result = await callSingleModelWithKey(currentKey, model, contents, systemPrompt, options);
        return await continueUntilComplete(currentKey, model, contents, systemPrompt, options, result);
      } catch (err: any) {
        lastError = err;

        // Jika user sengaja membatalkan via tombol stop chat, jangan coba kunci/model lain
        if (err?.cancelled) {
          throw err;
        }

        const isAuthError =
          err.status === 401 ||
          err.status === 403 ||
          (err.status === 400 && (err.message?.includes('API_KEY') || err.message?.includes('key') || err.message?.includes('credentials')));

        const isQuotaError =
          err.status === 429 ||
          (err.message && (err.message.includes('quota') || err.message.includes('ResourceExhausted') || err.message.includes('rate limit')));

        if (isAuthError) {
          console.warn(`[Multi-Key Failover] Kunci #${keyIdx + 1} (${keyPreview}) tidak valid/terblokir (${err.message}). Mencoba kunci lain...`);
          continue;
        }

        if (isQuotaError) {
          console.warn(`[Quota Limit] Model ${model} pada Kunci #${keyIdx + 1} (${keyPreview}) terkena limit kuota/RPM. Mencoba kunci/model cadangan...`);
          // Coba kunci berikutnya di pool untuk model ini
          continue;
        }

        console.warn(`[Model Timeout/Busy] Model ${model} pada Kunci #${keyIdx + 1} sibuk (${err.message}). Melanjutkan failover...`);
        await new Promise(res => setTimeout(res, 200));
      }
    }

    console.warn(`[Auto-Model Fallback] Model ${model} tidak tersedia di seluruh kunci. Otomatis beralih ke model cadangan berikutnya...`);
  }

  throw new Error(
    lastError?.message ||
    'Seluruh model AI dan API Key di pool sedang dalam batas kuota / antrean padat. Silakan coba beberapa saat lagi!'
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

