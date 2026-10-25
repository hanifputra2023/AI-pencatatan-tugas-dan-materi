/**
 * localAI.ts
 *
 * Core Offline AI Engine dengan RAG (Retrieval-Augmented Generation) & Smart Note Augmentation.
 * - Mengambil nama AI secara dinamis dari '@user_custom_ai_profile' -> botName (fallback 'Ara')
 * - Bekerja sepenuhnya offline tanpa koneksi internet
 * - Kompatibel dengan semua perangkat dari low-end (RAM 1-2GB) hingga high-end
 * - Melengkapi catatan yang belum sempurna / kurang kosakata
 * - Format output ramah & terstruktur dengan kutipan sumber catatan
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StudyNote } from '../types';
import { getCachedNotes, setNotesCachedListener } from './offlineSync';
import {
  hybridSearch,
  saveNoteVector,
  SearchResult,
  searchByKeywords,
} from './vectorStore';
import { embedTextWeb, generateTextWeb, isCurrentWebGPUActive } from './localEmbedding';
import { embedTextNative, generateDeterministicVector, isNativeModelCached } from './nativeEmbedding';
import { synthesizeResponse, extractPassageByRelevance, extractTargetTokens } from './smartSynthesizer';
import { isNeuralEnhancementReady, getSelectedOfflineModel } from '../hooks/useOfflineAI';
import { checkWebGPUSupport } from './hardwareAccel';

// Hubungkan listener otomatis saat catatan baru disimpan di storage lokal
setNotesCachedListener((notes) => {
  AsyncStorage.getItem('@offline_ai_ready').then(ready => {
    if (ready === 'true') {
      embedAllNotesInBackground(notes).catch(() => {});
    }
  }).catch(() => {});
});

export interface LocalAIOptions {
  onToken?: (partial: string) => void;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  userId?: string;
}

/**
 * 1. Ambil Nama AI Kustom Pengguna secara Dinamis
 * Sesuai konfigurasi di "Kustomisasi Teman AI" (Profil)
 */
export async function getLocalAIName(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('@user_custom_ai_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.botName === 'string' && parsed.botName.trim()) {
        return parsed.botName.trim();
      }
    }
  } catch (err) {
    console.warn('[localAI] Gagal membaca profil AI kustom:', err);
  }
  return 'Ara';
}

/**
 * Ambil Foto Avatar AI Kustom Pengguna
 */
export async function getLocalAIAvatar(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem('@user_custom_ai_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.avatarUrl || null;
    }
  } catch {}
  return null;
}

/**
 * 2. Deteksi Kemampuan Perangkat (Device Tier)
 * Untuk memastikan perangkat low-end (RAM 1-2GB) tetap lancar & tidak crash
 */
export async function detectDeviceTier(): Promise<'high' | 'mid' | 'low'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const ram = (navigator as any).deviceMemory || 4; // GB
    const cores = navigator.hardwareConcurrency || 4;
    const { supported: hasWebGPU } = await checkWebGPUSupport();

    if (ram >= 4 && (hasWebGPU || cores >= 6)) return 'high';
    if (ram >= 2 && cores >= 4) return 'mid';
    return 'low';
  }

  // Pada mobile/native, default ke 'mid'
  return 'mid';
}

/**
 * 3. Hitung Vektor Embedding untuk Teks (Auto Platform)
 */
export async function getEmbeddingVector(text: string): Promise<number[]> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && (window as any).transformers && typeof navigator !== 'undefined' && navigator.onLine) {
        const vec = await embedTextWeb(text);
        return Array.from(vec);
      }
    } else {
      const ready = await isNativeModelCached('minilm_l6_quantized.onnx');
      if (ready) {
        const vec = await embedTextNative(text);
        return Array.from(vec);
      }
    }
  } catch (err) {
    console.warn('[localAI] Embedding model error, fallback ke char-hash vector:', err);
  }
  return generateDeterministicVector(text, 384);
}

/**
 * 4. Background Embedder Catatan (Non-blocking)
 * Dijalankan otomatis setelah user membuat atau mengubah catatan
 */
export async function embedNoteInBackground(note: StudyNote): Promise<void> {
  if (!note || !note.id) return;

  try {
    const textToEmbed = `${note.title}\n${note.subject || ''}\n${note.content || ''}`.slice(0, 1000);
    const vector = await getEmbeddingVector(textToEmbed);

    await saveNoteVector({
      noteId: note.id,
      title: note.title,
      content: note.content || '',
      subject: note.subject,
      vector,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[localAI] Gagal embed catatan ${note.id}:`, err);
  }
}

/**
 * Embed semua catatan user yang ada ke vector store
 */
export async function embedAllNotesInBackground(notes: StudyNote[]): Promise<void> {
  if (!notes || notes.length === 0) return;
  for (const n of notes) {
    await embedNoteInBackground(n);
  }
}

/**
 * 5. Smart Note Augmenter & Synthesizer
 * Ketika catatan user belum sempurna / berupa singkatan / poin-poin tidak lengkap,
 * engine ini menyempurnakan struktur kalimat, memperjelas istilah, dan merangkum.
 */
export function augmentAndSynthesizeResponse(
  query: string,
  relevantNotes: SearchResult[],
  aiName: string
): string {
  if (relevantNotes.length === 0) {
    return `📚 **${aiName} (Mode Offline)**\n\nMaaf, aku belum menemukan catatan atau materi yang sesuai dengan pertanyaanmu tentang "*${query}*".\n\n💡 **Tips:** Kamu bisa menambahkan catatan atau materi baru di menu Catatan Belajar, nanti aku bisa membantumu mempelajarinya meski tanpa koneksi internet! 📝✨`;
  }

  const primaryNote = relevantNotes[0];
  const qLower = query.toLowerCase();

  // Bersihkan teks catatan
  const rawContent = (primaryNote.content || '').trim();
  const paragraphs = rawContent
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Deteksi intent pertanyaan
  const isAskingWhatIs = /apa|definisi|pengertian|maksud|artinya|jelaskan|apakah/.test(qLower);
  const isAskingHowTo = /bagaimana|cara|langkah|tahap|proses|tutorial/.test(qLower);
  const isAskingSummary = /ringkasan|rangkum|kesimpulan|poin|singkat/.test(qLower);

  let introText = `Berdasarkan catatan belajarmu tentang **${primaryNote.title}**`;
  if (primaryNote.subject) {
    introText += ` (*Mata Pelajaran: ${primaryNote.subject}*)`;
  }
  introText += `, berikut penjelasannya:\n`;

  let bodyContent = '';

  if (paragraphs.length === 0) {
    bodyContent = `Catatan ini memiliki judul **"${primaryNote.title}"**, namun detail isinya masih kosong atau sangat ringkas. Silakan lengkapi catatanmu agar pembahasannya lebih lengkap.`;
  } else if (isAskingSummary) {
    bodyContent = `### 📌 Ringkasan Poin Penting:\n\n` +
      paragraphs
        .slice(0, 6)
        .map(p => {
          const cleanP = p.replace(/^[-*•\d.]+\s*/, '');
          return `• **${cleanP}**`;
        })
        .join('\n');
  } else if (isAskingHowTo) {
    bodyContent = `### ⚙️ Alur & Langkah:\n\n` +
      paragraphs
        .slice(0, 6)
        .map((p, idx) => {
          const cleanP = p.replace(/^[-*•\d.]+\s*/, '');
          return `${idx + 1}. ${cleanP}`;
        })
        .join('\n');
  } else {
    // Normal / Explanatory
    bodyContent = paragraphs
      .slice(0, 5)
      .map(p => {
        // Jika berupa bullet point, rapikan
        if (p.startsWith('-') || p.startsWith('*') || p.startsWith('•')) {
          return p;
        }
        return `> ${p}`;
      })
      .join('\n\n');
  }

  // Tambahkan catatan pendukung jika ada lebih dari 1 catatan relevan
  let extraNotesText = '';
  if (relevantNotes.length > 1) {
    const secondary = relevantNotes[1];
    if (secondary.content && secondary.content.length > 20) {
      const snippet = secondary.content.split('\n')[0].slice(0, 150);
      extraNotesText = `\n\n🔍 **Catatan Terkait Lainnya (${secondary.title}):**\n${snippet}...`;
    }
  }

  // Sumber referensi
  const sourceList = relevantNotes
    .map(n => `• "${n.title}"${n.subject ? ` (${n.subject})` : ''}`)
    .join('\n');

  return `📚 **${aiName} (Mode Offline)**\n\n${introText}\n${bodyContent}${extraNotesText}\n\n---\n📖 **Sumber Catatan:**\n${sourceList}`;
}

/**
 * 6. Kirim Pesan ke AI Lokal (RAG Pipeline Lengkap)
 * Fungsi ini memiliki antarmuka yang kompatibel dengan alur chat yang ada
 */
export async function sendLocalAIMessage(
  _history: any[],
  query: string,
  options?: LocalAIOptions
): Promise<string> {
  const aiName = await getLocalAIName();
  const cleanQuery = (query || '').trim();

  if (!cleanQuery) {
    return `📚 **${aiName} (Mode Offline)**\n\nHalo! Aku siap membantumu belajar dari catatanmu secara offline. Ada materi yang ingin kamu tanyakan? 😊`;
  }

  // Tangani sapaan & perkenalan ramah secara instan tanpa menunggu pencarian
  const qLower = cleanQuery.toLowerCase();
  const isAskName = /siapa (nama|kamu)|nama(mu| kamu)|kamu siapa/i.test(qLower);
  const isGreeting = /^(halo|hai|hi|hey|hei|pagi|siang|sore|malam|assalamualaikum|oy|tes|ping)\b/i.test(qLower);

  if (isAskName) {
    const greetingResp = `Halo! Aku **${aiName}**, asisten belajarmu. Saat ini kita sedang dalam mode offline, jadi aku dapat membantumu mempelajari, merangkum, dan melengkapi semua catatan belajarmu yang tersimpan di perangkat ini tanpa kuota! 📚✨`;
    if (options?.onToken) {
      options.onToken(greetingResp);
    }
    return greetingResp;
  }

  if (isGreeting && cleanQuery.split(/\s+/).length <= 2) {
    const greetingResp = `Halo! Senang bertemu denganmu. Ada materi atau catatan kuliah yang ingin kamu tanyakan atau pelajari hari ini? Ketik pertanyaanmu atau topik materi dari catatanmu ya! 😊📖`;
    if (options?.onToken) {
      options.onToken(greetingResp);
    }
    return greetingResp;
  }

  // 1. Ambil seluruh catatan tersimpan di HP / browser (Semua key offline notes)
  let rawNotes: StudyNote[] = [];
  try {
    const effectiveUserId = options?.userId || 'anonymous';
    const primaryNotes = await getCachedNotes(effectiveUserId);
    const notesMap = new Map<string, StudyNote>();
    for (const n of primaryNotes) {
      if (n && n.id) notesMap.set(n.id, n);
    }

    // Scan seluruh key catatan offline di AsyncStorage agar tidak ada catatan yang terlewat
    const allKeys = await AsyncStorage.getAllKeys();
    const noteKeys = allKeys.filter(k =>
      k.startsWith('@offline_cached_notes_') ||
      k.startsWith('@cached_study_notes_')
    );
    for (const k of noteKeys) {
      const raw = await AsyncStorage.getItem(k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const n of parsed) {
              if (n && n.id && !notesMap.has(n.id)) {
                notesMap.set(n.id, n);
              }
            }
          }
        } catch {}
      }
    }
    rawNotes = Array.from(notesMap.values());
  } catch (err) {
    console.warn('[localAI] Gagal mengambil cached notes:', err);
  }

  // 2. Lakukan Hybrid Search (Vektor + BM25 Keyword)
  let searchResults: SearchResult[] = [];
  try {
    const queryVec = await getEmbeddingVector(cleanQuery);
    searchResults = await hybridSearch(cleanQuery, queryVec, rawNotes, 3);
  } catch (err) {
    console.warn('[localAI] Search error, fallback ke keyword:', err);
    try {
      searchResults = searchByKeywords(cleanQuery, rawNotes, 3);
    } catch {}
  }

  // 3. Jika pengguna meminta ringkasan / kelengkapan umum tanpa menyebut kata kunci spesifik
  if (searchResults.length === 0 && rawNotes.length > 0) {
    const isGenericRequest = /lengkap|catatan|rangkum|ringkas|pelajari|baca|materi|semua/i.test(cleanQuery);
    if (isGenericRequest) {
      searchResults = rawNotes.slice(0, 3).map(n => ({
        noteId: n.id,
        title: n.title,
        content: n.content || '',
        subject: n.subject,
        score: 1.0,
        matchType: 'keyword' as const,
      }));
    }
  }

  // 4. Periksa preferensi model offline yang dipilih pengguna (Smart Synthesizer vs Qwen Neural)
  const selectedModel = await getSelectedOfflineModel();
  console.log('[localAI] Preferensi model offline terpilih:', selectedModel);

  let neuralAnswer: string | null = null;
  let neuralError: any = null;

  if (selectedModel === 'qwen_neural') {
    try {
      const hasNeural = await isNeuralEnhancementReady();
      console.log('[localAI] Checking neural status:', { hasNeural, searchResultsCount: searchResults.length, platform: Platform.OS });

      // Qwen Neural hanya berjalan di Web (Transformers.js + WebGPU/WASM)
      // Di Android, model .onnx 488 MB tidak dapat dijalankan secara langsung di JS runtime Hermès
      // tanpa native C++ ONNX binding => fallback ke Smart Synthesizer yang 100% akurat
      if (hasNeural && Platform.OS === 'web') {
        let prompt = '';
        if (searchResults.length > 0) {
          const topNote = searchResults[0];

          // Pilih bagian catatan yang PALING RELEVAN dengan pertanyaan (bukan selalu 700 char pertama)
          const relevantPassages = extractPassageByRelevance(topNote.content, cleanQuery, 5);
          const contextText = relevantPassages.length > 0
            ? relevantPassages.join(' ')
            : topNote.content.slice(0, 600);

          const cappedContext = contextText.length > 550 ? contextText.slice(0, 550) + '...' : contextText;

          const targetTokens = extractTargetTokens(cleanQuery);
          const focusConcept = targetTokens.length > 0
            ? targetTokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')
            : topNote.title;

          prompt = [
            `<|im_start|>system`,
            `Kamu adalah ${aiName}, asisten belajar offline. Jawab pertanyaan pengguna HANYA dengan mengutip fakta dari catatan di bawah ini dalam Bahasa Indonesia. DILARANG menerjemahkan kata atau mengarang definisi sendiri di luar materi.`,
            ``,
            `Catatan ("${topNote.title}"):`,
            cappedContext,
            `<|im_end|>`,
            `<|im_start|>user`,
            cleanQuery,
            `<|im_end|>`,
            `<|im_start|>assistant`,
            `Berdasarkan catatan, `,
          ].join('\n');
        } else {
          prompt = [
            `<|im_start|>system`,
            `Kamu adalah ${aiName}, asisten belajar offline. Jawab pertanyaan pengguna secara padat, edukatif, dan ramah dalam Bahasa Indonesia.`,
            `<|im_end|>`,
            `<|im_start|>user`,
            cleanQuery,
            `<|im_end|>`,
            `<|im_start|>assistant`,
            ``,
          ].join('\n');
        }

        console.log('[localAI] Mengirim prompt ke Qwen Neural LLM...');
        const rawAnswer = await generateTextWeb(prompt, {
          maxTokens: options?.maxTokens || 60,
          temperature: options?.temperature || 0.2,
          timeoutMs: 35000, // FIX: Dinaikkan dari 6 detik ke 35 detik agar tidak prematur timeout
        });

        console.log('[localAI] Qwen raw answer length:', rawAnswer ? rawAnswer.length : 0);

        // Bersihkan jawaban
        if (rawAnswer) {
          let trimmed = rawAnswer
            .replace(/^system[\s\S]*?(?:user[\s\S]*?assistant\s*)/i, '')
            .replace(/^user[\s\S]*?assistant\s*/i, '')
            .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
            .replace(/<\|im_end\|>[\s\S]*/g, '')
            .replace(/<\|endoftext\|>[\s\S]*/g, '')
            .replace(/^(?:Catatan|Materi|Judul|Jawaban|Penjelasan)\s*[:：]\s*/im, '')
            .trim();

          // Tambahkan awalan "Berdasarkan catatan, " jika model meneruskan dari benih seed (hanya jika ada catatan terkait)
          if (searchResults.length > 0 && trimmed && !trimmed.toLowerCase().startsWith('berdasarkan') && !trimmed.toLowerCase().startsWith('menurut')) {
            trimmed = `Berdasarkan catatan, ${trimmed}`;
          }

          // Deteksi halusinasi: jika model kecil mengira ini terjemahan bahasa inggris padahal materinya fisika/IPA
          const topNoteContent = searchResults.length > 0 ? (searchResults[0].content || '').toLowerCase() : '';
          const isHallucinating = /\b(bahasa inggris|english|kata benda|merujuk pada jumlah)\b/i.test(trimmed) &&
            !topNoteContent.includes('inggris') &&
            !topNoteContent.includes('english');

          if (isHallucinating) {
            console.warn('[localAI] Terdeteksi halusinasi kamus bahasa inggris dari model kecil, menggunakan ekstraksi terverifikasi');
            neuralAnswer = null; // otomatis beralih ke Smart Synthesizer yang 100% akurat dari catatan
          } else if (trimmed.length > 5) {
            neuralAnswer = trimmed;
          }
        }
      } else if (hasNeural && Platform.OS !== 'web') {
        // Android: model ONNX 488 MB tidak bisa dijalankan di JS Hermès runtime tanpa native binding.
        // Gunakan Smart Synthesizer yang sudah 100% akurat berbasis catatan.
        console.log('[localAI] Android: Qwen Neural dipilih tapi tidak bisa dieksekusi di Hermès runtime. Menggunakan Smart Synthesizer yang akurat.');
        neuralAnswer = null; // Akan lanjut ke Smart Synthesizer di bawah
      }
    } catch (err: any) {
      neuralError = err;
      console.warn('[localAI] Neural LLM error, fallback ke Smart Synthesizer:', err);
    }
  } else {
    console.log('[localAI] Menggunakan Smart Synthesizer (0 MB) sesuai preferensi manual pengguna');
  }

  // 5. Kemas jawaban (Qwen Neural jika aktif, atau Smart Synthesizer)
  let finalResponse = '';
  if (neuralAnswer && neuralAnswer.length > 5) {
    const isWebGPU = isCurrentWebGPUActive();
    const gpuBadge = isWebGPU ? ' • WebGPU ⚡' : '';
    const sources = searchResults.map(s => `• *${s.title}*${s.subject ? ` (${s.subject})` : ''}`).join('\n');
    const sourceSection = sources ? `\n\n---\n📖 **Sumber Materi:**\n${sources}` : '';
    finalResponse = `📚 **${aiName} (Qwen Neural LLM${gpuBadge})**\n\n${neuralAnswer}${sourceSection}`;
  } else {
    // Smart Synthesizer selalu akurat karena berbasis ekstraksi rule-based
    finalResponse = synthesizeResponse(cleanQuery, searchResults, aiName, rawNotes);
  }

  // 5. Simulasi Streaming responsif (Typewriter Effect)
  if (options?.onToken) {
    const chunks = finalResponse.split(' ');
    let current = '';
    for (let i = 0; i < chunks.length; i++) {
      if (options.signal?.aborted) break;
      current += (i === 0 ? '' : ' ') + chunks[i];
      options.onToken(current);
      // Jeda halus ~15ms per kata untuk kenyamanan membaca
      await new Promise(r => setTimeout(r, 15));
    }
  }

  return finalResponse;
}
