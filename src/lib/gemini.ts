import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ChatAttachment } from '../types';
import { searchLiveWeb } from './webSearchService';

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

const blacklistedKeys = new Set<string>();

export const blacklistGeminiKey = (key: string) => {
  if (!key) return;
  const trimmed = key.trim();
  blacklistedKeys.add(trimmed);
  inMemoryApiKeys = inMemoryApiKeys.filter(k => k.trim() !== trimmed);
  AsyncStorage.setItem('@gemini_api_keys', JSON.stringify(inMemoryApiKeys)).catch(() => {});
};

export const setInMemoryApiKeys = (keys: string[]) => {
  inMemoryApiKeys = keys.filter(k => k && k.trim() !== '' && !blacklistedKeys.has(k.trim()));
};

export const setInMemoryApiKey = (key: string) => {
  if (key && key.trim() !== '') {
    const trimmed = key.trim();
    if (!blacklistedKeys.has(trimmed)) {
      inMemoryApiKeys = [trimmed, ...inMemoryApiKeys.filter(k => k !== trimmed)];
    }
  }
};

const DEFAULT_FALLBACK_KEY = '';

export const getGeminiApiKeysPool = (): string[] => {
  const pool = inMemoryApiKeys.filter(k => k && k.trim() !== '' && !blacklistedKeys.has(k.trim()));
  const envKey = (process.env.EXPO_PUBLIC_GEMINI_API_KEY || DEFAULT_FALLBACK_KEY).trim();
  if (envKey && !pool.includes(envKey) && !blacklistedKeys.has(envKey)) {
    pool.push(envKey);
  }
  return pool.filter(k => k && k.trim() !== '');
};

export const ACTIVE_MODELS = [
  'gemini-3-flash-preview',    // Model utama kilat & kuota tinggi (~1.5 detik, 100% stabil)
  'gemini-3.8-flash',          // Generasi 3.8 terbaru (Reasoning cerdas)
  'gemini-3.5-flash-lite',     // Ringan & hemat kuota
  'gemini-flash-latest',       // Alias produksi stabil
  'gemini-3.5-flash',          // Multimodal stabil
  'gemini-flash-lite-latest',  // Cadangan ultra ringan
];

export const sanitizeModel = (m?: string): string => {
  if (!m) return 'gemini-3-flash-preview';
  const trimmed = m.trim();
  const legacy: Record<string, string> = {
    'gemini-2.5-flash': 'gemini-3-flash-preview',
    'gemini-3.6-flash': 'gemini-3-flash-preview',
    'gemini-flash-latest': 'gemini-flash-latest',
    'gemini-2.0-flash': 'gemini-3-flash-preview',
    'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-1.5-flash': 'gemini-3-flash-preview',
    'gemini-pro': 'gemini-3-flash-preview',
  };
  return legacy[trimmed] || trimmed;
};

let preferredModel = 'gemini-3-flash-preview';

// Load cached preferred model asynchronously from AsyncStorage
AsyncStorage.getItem('@app_ai_model').then(val => {
  if (val && val.trim()) {
    const migrated = sanitizeModel(val.trim());
    preferredModel = migrated;
    if (migrated !== val.trim()) {
      AsyncStorage.setItem('@app_ai_model', migrated).catch(() => {});
    }
  }
});

export const setPreferredModel = (model: string) => {
  if (model && model.trim()) {
    const target = sanitizeModel(model.trim());
    preferredModel = target;
    AsyncStorage.setItem('@app_ai_model', target).catch(() => {});
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

  const targetFirst = (modelPreference || preferredModel || 'gemini-3-flash-preview').trim();
  const candidateModels = [
    targetFirst,
    ...ACTIVE_MODELS.filter(m => m !== targetFirst),
  ];

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${testKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Ping test. Jawab "OK"' }] }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
        const rawErr = err?.error?.message || `HTTP ${res.status}`;
        if (rawErr.includes('service account is deleted or disabled') || rawErr.includes('bound service account')) {
          blacklistGeminiKey(testKey);
          return {
            success: false,
            message: 'Kunci tidak aktif (Service Account Google Cloud terikat telah dinonaktifkan/dihapus)',
            latency,
          };
        } else if (rawErr.includes('API key not valid') || rawErr.includes('API_KEY_INVALID')) {
          blacklistGeminiKey(testKey);
          return {
            success: false,
            message: 'Kunci API tidak valid / salah',
            latency,
          };
        }
        lastErr = rawErr;
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
  webSearch?: boolean;
  codeExecution?: boolean;
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
  // 1. Coba SSE streaming HANYA di browser Web.
  // Di native Android & iOS (React Native), XMLHttpRequest tidak mendukung SSE chunking
  // dari OkHttp sehingga menyebabkan socket hang & timeout beruntun.
  if (Platform.OS === 'web' && options?.onToken && !options?.isJsonMode) {
    try {
      return await streamSingleModelWithKey(apiKey, modelName, contents, systemPrompt, options);
    } catch (streamErr: any) {
      // Jika pengguna menekan tombol stop/cancel di chat, teruskan pembatalan
      if (streamErr?.cancelled) {
        throw streamErr;
      }
      console.warn(`[Streaming Fallback] SSE streaming web gagal pada ${modelName} (${streamErr.message}). Beralih otomatis ke fetch standar...`);
    }
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
    // Safety: BLOCK_ONLY_HIGH agar AI bisa menjawab topik sensitif yang valid
    // (kesehatan mental, curhat, stress, hubungan) tanpa over-blocking.
    // Konten benar-benar berbahaya (instruksi kekerasan nyata, konten anak) tetap diblokir.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  // Tools: Python Code Execution
  const tools: any[] = [];
  if (options?.codeExecution) {
    tools.push({ codeExecution: {} });
  }
  if (tools.length > 0) {
    requestBody.tools = tools;
  }

  // Thinking budget: explicitly set 0 for normal mode agar model tidak
  // melakukan internal reasoning yang membuang waktu. Mode Deep Think
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

  // Safe timeout: 25 detik untuk normal mode agar AI di mobile punya cukup waktu menyusun respon, 50 detik untuk Deep Think
  const timeoutMs = options?.deepThink ? 50000 : 25000;
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
    // Parse juga executableCode dan codeExecutionResult jika ada.
    let replyText = candidate?.content?.parts
      ?.filter((p: any) => !p.thought)
      ?.map((p: any) => {
        if (p.text) return p.text;
        if (p.executableCode) {
          return `\n\`\`\`python\n${p.executableCode.code.trim()}\n\`\`\`\n`;
        }
        if (p.codeExecutionResult) {
          const out = p.codeExecutionResult.output ? p.codeExecutionResult.output.trim() : 'Selesai tanpa output';
          return `\n> 🐍 **Output Sandbox:**\n> \`\`\`\n> ${out}\n> \`\`\`\n`;
        }
        return '';
      })
      ?.join('') || '';

    // Cantumkan tautan referensi web jika tersedia dari Google Search Grounding
    if (candidate?.groundingMetadata?.groundingChunks?.length) {
      const sources: string[] = [];
      for (const chunk of candidate.groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          const title = chunk.web.title || chunk.web.uri;
          sources.push(`- [${title}](${chunk.web.uri})`);
        }
      }
      if (sources.length > 0) {
        replyText += `\n\n---\n🌐 **Sumber Rujukan Web:**\n${sources.slice(0, 5).join('\n')}`;
      }
    }

    if (!replyText) {
      throw new Error('AI tidak memberikan respon teks.');
    }

    // Jika pemanggil meminta streaming (onToken) tapi jatuh ke fallback ini,
    // segera kabari callback agar UI langsung mengupdate teks dan menghentikan loading indicator!
    if (options?.onToken && replyText) {
      try {
        options.onToken(replyText);
      } catch (tokenErr) {}
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
    // Safety: BLOCK_ONLY_HIGH agar AI bisa menjawab topik sensitif yang valid
    // (kesehatan mental, curhat, stress, hubungan) tanpa over-blocking.
    // Konten benar-benar berbahaya (instruksi kekerasan nyata, konten anak) tetap diblokir.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  // Tools: Python Code Execution
  const tools: any[] = [];
  if (options?.codeExecution) {
    tools.push({ codeExecution: {} });
  }
  if (tools.length > 0) {
    requestBody.tools = tools;
  }

  // Thinking budget: eksplisit matikan (0) untuk mode biasa agar model tidak
  // menghabiskan 10-15 detik untuk internal reasoning sebelum menjawab.
  // Mode Deep Think menggunakan budget 1024 — cukup mendalam, tetap responsif.
  if (!isJson) {
    requestBody.generationConfig.thinkingConfig = {
      thinkingBudget: options?.deepThink ? 1024 : 0,
    };
  }

  // Streaming timeout lebih lama karena token datang bertahap; short timeoutnya
  // ada di callSingleModelWithKey (non-streaming) untuk fast-fail 8 detik.
  const timeoutMs = options?.deepThink ? 90000 : 50000;
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
    let groundingSources = '';

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

          // Tangkap tautan sumber grounding web jika ada
          if (candidate?.groundingMetadata?.groundingChunks?.length) {
            const sources: string[] = [];
            for (const chunk of candidate.groundingMetadata.groundingChunks) {
              if (chunk.web?.uri) {
                const title = chunk.web.title || chunk.web.uri;
                sources.push(`- [${title}](${chunk.web.uri})`);
              }
            }
            if (sources.length > 0 && !groundingSources) {
              groundingSources = `\n\n---\n🌐 **Sumber Rujukan Web:**\n${sources.slice(0, 5).join('\n')}`;
            }
          }

          // Filter bagian "thought" (monolog penalaran internal AI) agar tidak
          // bocor ke streaming bubble chat pengguna. Hanya ambil part non-thought.
          const parts: any[] = candidate?.content?.parts || [];
          const delta = parts
            .filter((p: any) => !p.thought)
            .map((p: any) => {
              if (p.text) return p.text;
              if (p.executableCode) {
                return `\n\`\`\`python\n${p.executableCode.code.trim()}\n\`\`\`\n`;
              }
              if (p.codeExecutionResult) {
                const out = p.codeExecutionResult.output ? p.codeExecutionResult.output.trim() : 'Selesai tanpa output';
                return `\n> 🐍 **Output Sandbox:**\n> \`\`\`\n> ${out}\n> \`\`\`\n`;
              }
              return '';
            })
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

      // Cantumkan tautan referensi web jika ditemukan
      if (groundingSources && !fullText.includes('Sumber Rujukan Web')) {
        fullText += groundingSources;
        options.onToken?.(fullText);
      }

      if (xhr.status >= 400) {
        // KRITIS: Google kadang mengembalikan error 503/429 dalam format SSE ("data: {...}")
        // bukan plain JSON, sehingga JSON.parse langsung gagal. Kita coba dua cara parsing:
        let errMsg = `HTTP ${xhr.status}`;
        const rawText = xhr.responseText;
        try {
          // Coba 1: plain JSON
          const errData = JSON.parse(rawText);
          errMsg = errData?.error?.message || errMsg;
        } catch {
          // Coba 2: SSE format — ambil baris "data: {...}" pertama yang berisi error
          const sseMatch = rawText.match(/data:\s*(\{[\s\S]*?\})/m);
          if (sseMatch) {
            try {
              const errData = JSON.parse(sseMatch[1]);
              errMsg = errData?.error?.message || errMsg;
            } catch { /* tetap pakai errMsg default */ }
          }
        }
        const customErr: any = new Error(errMsg);
        customErr.status = xhr.status; // SELALU set status agar isModelUnavailable() bisa mendeteksi
        reject(customErr);
        return;
      }

      if (!fullText) {
        reject(new Error('AI tidak memberikan respon teks.'));
        return;
      }
      resolve({ text: fullText, finishReason });
    };

    xhr.onerror = () => {
      // Set status 503 agar outer failover loop langsung break ke model cadangan
      const e: any = new Error(`Model ${modelName} gagal terhubung. Mengalihkan ke model cepat...`);
      e.status = 503;
      reject(e);
    };

    xhr.onabort = () => {
      if (userCancelled) {
        const cancelledErr: any = new Error('Percakapan dihentikan oleh pengguna.');
        cancelledErr.cancelled = true;
        reject(cancelledErr);
      } else {
        // Timeout yang dipicu oleh AbortController (bukan XHR.timeout)
        const e: any = new Error(`Model ${modelName} timeout saat streaming. Mengalihkan ke model cepat...`);
        e.status = 503;
        reject(e);
      }
    };

    xhr.ontimeout = () => {
      // XHR native timeout — set status 503 agar fast-break ke model cadangan
      const e: any = new Error(`Model ${modelName} timeout saat streaming. Mengalihkan ke model cepat...`);
      e.status = 503;
      reject(e);
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
    // Selesai jika berakhiran tanda baca, markdown block, baris baru, atau unicode emoji / simbol
    return (
      /[.!?…[:;)\]"'](\s*```\s*)?$/.test(t) ||
      /```$/.test(t) ||
      /\n\s*$/.test(t) ||
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]$/u.test(t)
    );
  };

  const shouldContinue = (result: GeminiCallResult): boolean => {
    // Jika AI sudah selesai secara normal (STOP), JANGAN lakukan continue loop yang membuang waktu
    if (result.finishReason === 'STOP') return false;
    // Hanya lanjutkan jika dipotong oleh batas token output (MAX_TOKENS)
    if (result.finishReason === 'MAX_TOKENS') return true;
    // Jika tidak ada finishReason dan teks benar-benar tergantung tanpa tanda penutup
    return !result.finishReason && result.text.trim().length > 0 && !hasFinishedCleanly(result.text);
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

  let liveWebContext = '';
  if (options?.webSearch) {
    try {
      const searchRes = await searchLiveWeb(newMessage);
      if (searchRes && searchRes.contextText) {
        liveWebContext = `${searchRes.contextText}\n\n`;
      }
    } catch (webErr) {
      console.warn('[Live Web Search Exception]', webErr);
    }
  }

  let fullPrompt = newMessage;
  if (liveWebContext) {
    fullPrompt = `${liveWebContext}${newMessage}`;
  }
  if (accumulatedDocText) {
    fullPrompt = `${accumulatedDocText}\n\n${fullPrompt}`;
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
  // Selalu sanitasi model pilihan aktif, lalu otomatis siapkan seluruh model cadangan
  const activePreferred = sanitizeModel(options?.model || preferredModel || 'gemini-3-flash-preview');
  const modelsToTry = [
    activePreferred,
    ...ACTIVE_MODELS.filter(m => m !== activePreferred),
  ];

  // 1. TIER 1 (MODEL-LEVEL AUTO-SWITCH): Coba model utama, jika kena limit/overload LANGSUNG ganti model
  for (const model of modelsToTry) {
    let consecutiveQuotaOrOverloadCount = 0;

    // 2. TIER 2 (MULTI-KEY LOAD BALANCING): Untuk model yang sedang dicoba,
    // coba kunci di pool secara bergantian
    const maxKeyAttempts = Math.min(5, totalKeys);
    for (let step = 0; step < maxKeyAttempts; step++) {
      const keyIdx = (startOffset + step) % totalKeys;
      const currentKey = keysPool[keyIdx];
      const keyPreview = currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4);

      try {
        const result = await callSingleModelWithKey(currentKey, model, contents, systemPrompt, options);
        const finalReply = await continueUntilComplete(currentKey, model, contents, systemPrompt, options, result);

        // AUTO-HEAL: Jika berhasil menjawab menggunakan model fallback (berbeda dari preferredModel),
        // otomatis perbarui preferredModel agar permintaan berikutnya langsung mulus tanpa mencoba model yang limit!
        if (model !== preferredModel && !options?.model) {
          console.log(`[Auto-Heal] Berhasil beralih ke model ${model}. Mengupdate preferredModel.`);
          setPreferredModel(model);
        }

        return finalReply;
      } catch (err: any) {
        lastError = err;

        // Jika user sengaja membatalkan via tombol stop chat, jangan coba kunci/model lain
        if (err?.cancelled) {
          throw err;
        }

        // 1. Jika kunci mati permanen (service account dihapus/dinonaktifkan atau key invalid)
        const isKeyPermanentlyDead =
          err.status === 400 ||
          err.status === 403 ||
          (err.message && (
            err.message.includes('service account is deleted or disabled') ||
            err.message.includes('bound service account') ||
            err.message.includes('API key not valid') ||
            err.message.includes('API_KEY_INVALID')
          ));

        if (isKeyPermanentlyDead) {
          console.warn(`[Auto-Prune] Kunci ${keyPreview} tidak aktif / service account mati. Mengeluarkan dari pool.`);
          blacklistGeminiKey(currentKey);
          continue; // Langsung coba kunci berikutnya
        }

        // 2. Jika model pensiun / tidak ditemukan (404)
        const isModelPermanentlyGone =
          err.status === 404 ||
          (err.message && (
            err.message.includes('is no longer available') ||
            err.message.includes('not found')
          ));

        if (isModelPermanentlyGone) {
          console.warn(`[Silent-Auto-Switch] Model ${model} tidak tersedia (${err.message}). Otomatis beralih ke model berikutnya...`);
          break; // Keluar dari loop kunci untuk model ini, LANGSUNG COBA MODEL BERIKUTNYA!
        }

        // 3. Jika terkena batas kuota / rate limit (429) ATAU server overload / high demand (503)
        const isQuotaOrOverload =
          err.status === 429 ||
          err.status === 503 ||
          (err.message && (
            err.message.includes('Quota exceeded') ||
            err.message.includes('RESOURCE_EXHAUSTED') ||
            err.message.includes('rate-limits') ||
            err.message.includes('rate limit') ||
            err.message.includes('limit') ||
            err.message.includes('high demand') ||
            err.message.includes('overloaded') ||
            err.message.includes('temporarily unavailable')
          ));

        if (isQuotaOrOverload) {
          consecutiveQuotaOrOverloadCount++;
          console.warn(`[Auto-Failover] Model ${model} pada Kunci #${keyIdx + 1} (${keyPreview}) limit/overload (${err.message}).`);

          // Jika sudah 2 kunci mengembalikan limit pada model ini, ATAU pool kunci sedikit:
          // JANGAN buang waktu lagi! LANGSUNG GANTI KE MODEL AI BERIKUTNYA!
          if (consecutiveQuotaOrOverloadCount >= 2 || totalKeys <= 2) {
            console.warn(`[Silent-Auto-Switch] Model ${model} sedang mencapai batas kuota / antrean. Otomatis beralih ke model AI lain di pool...`);
            break; // LANGSUNG GANTI MODEL!
          }
          continue;
        }

        // Error lainnya: coba kunci berikutnya
        continue;
      }
    }

    console.warn(`[Auto-Model Fallback] Model ${model} selesai dievaluasi. Beralih otomatis ke model berikutnya di pool...`);
  }

  // Jika opsi webSearch aktif dan gagal karena kuota grounding, ulangi sekali lagi secara mulus tanpa webSearch
  if (options?.webSearch) {
    console.warn('[Web-Search Fallback] Grounding search kuota penuh. Mengulangi permintaan secara mulus tanpa grounding...');
    return sendMessageToGemini(history, newMessage, attachment, customSystemInstruction, {
      ...options,
      webSearch: false,
    });
  }

  // Pesan error terjemahan yang ramah jika SELURUH model cadangan sedang dicoba
  let userFriendlyMsg = lastError?.message || 'Layanan AI sedang sibuk. Silakan coba beberapa saat lagi!';
  if (userFriendlyMsg.includes('service account is deleted or disabled') || userFriendlyMsg.includes('bound service account')) {
    userFriendlyMsg = 'Koneksi AI sedang disinkronkan oleh sistem. Silakan coba kirim pesan sekali lagi.';
  } else if (userFriendlyMsg.includes('Quota exceeded') || userFriendlyMsg.includes('RESOURCE_EXHAUSTED')) {
    userFriendlyMsg = 'Batas kuota harian pada model ini telah tercapai. Sistem sedang mengalihkan ke model cadangan, silakan coba kirim pesan sekali lagi.';
  } else if (userFriendlyMsg.includes('is no longer available')) {
    userFriendlyMsg = 'Model AI versi lawas sudah dinonaktifkan oleh Google. Sistem telah beralih otomatis ke Gemini 3 Flash.';
  }

  throw new Error(userFriendlyMsg);
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

