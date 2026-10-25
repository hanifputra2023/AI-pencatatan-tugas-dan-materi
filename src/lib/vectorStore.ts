/**
 * vectorStore.ts
 *
 * Penyimpanan vektor embedding catatan lokal & pencarian kemiripan kosinus (Cosine Similarity).
 * Bekerja cross-platform (Web & Android/iOS) menggunakan AsyncStorage dengan caching in-memory.
 * Dilengkapi dengan Hybrid Search (Vector + Keyword BM25 fallback) untuk kompatibilitas perangkat low-end.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface VectorEntry {
  noteId: string;
  title: string;
  content: string;
  subject?: string;
  vector: number[];
  updatedAt: string;
}

export interface SearchResult {
  noteId: string;
  title: string;
  content: string;
  subject?: string;
  score: number;
  matchType: 'vector' | 'keyword' | 'hybrid';
}

const STORAGE_KEY = '@offline_vector_index_v1';

// In-memory cache agar pencarian instan tanpa read I/O berulang
let memoryCache: Record<string, VectorEntry> | null = null;

/**
 * Menghitung cosine similarity antara dua vektor
 */
export function cosineSimilarity(
  a: number[] | Float32Array,
  b: number[] | Float32Array
): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Muat semua indeks vektor ke memori
 */
export async function getAllVectors(): Promise<Record<string, VectorEntry>> {
  if (memoryCache !== null) {
    return memoryCache;
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      memoryCache = JSON.parse(raw);
      return memoryCache || {};
    }
  } catch (err) {
    console.warn('[vectorStore] Gagal membaca storage vektor:', err);
  }

  memoryCache = {};
  return memoryCache;
}

/**
 * Simpan atau perbarui vektor satu catatan
 */
export async function saveNoteVector(entry: VectorEntry): Promise<void> {
  const current = await getAllVectors();
  current[entry.noteId] = {
    ...entry,
    // Pastikan vector adalah array number murni untuk serialisasi JSON
    vector: Array.from(entry.vector),
    updatedAt: new Date().toISOString(),
  };

  memoryCache = current;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('[vectorStore] Gagal menyimpan vektor catatan:', err);
  }
}

/**
 * Simpan banyak vektor sekaligus (batch)
 */
export async function saveBatchVectors(entries: VectorEntry[]): Promise<void> {
  const current = await getAllVectors();
  for (const entry of entries) {
    current[entry.noteId] = {
      ...entry,
      vector: Array.from(entry.vector),
      updatedAt: new Date().toISOString(),
    };
  }

  memoryCache = current;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('[vectorStore] Gagal batch menyimpan vektor:', err);
  }
}

/**
 * Hapus vektor catatan tertentu saat catatan dihapus user
 */
export async function deleteNoteVector(noteId: string): Promise<void> {
  const current = await getAllVectors();
  if (current[noteId]) {
    delete current[noteId];
    memoryCache = current;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.error('[vectorStore] Gagal menghapus vektor:', err);
    }
  }
}

/**
 * Kosongkan seluruh store vektor
 */
export async function clearVectorStore(): Promise<void> {
  memoryCache = {};
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[vectorStore] Gagal membersihkan store vektor:', err);
  }
}

/**
 * Pencarian semantik murni menggunakan vektor query
 */
export async function searchSimilarVectors(
  queryVector: number[] | Float32Array,
  topK = 3,
  threshold = 0.25
): Promise<SearchResult[]> {
  const index = await getAllVectors();
  const entries = Object.values(index);
  if (entries.length === 0) return [];

  const results: SearchResult[] = [];

  for (const item of entries) {
    if (!item.vector || item.vector.length === 0) continue;
    const score = cosineSimilarity(queryVector, item.vector);
    if (score >= threshold) {
      results.push({
        noteId: item.noteId,
        title: item.title,
        content: item.content,
        subject: item.subject,
        score,
        matchType: 'vector',
      });
    }
  }

  // Urutkan dari score tertinggi ke terendah
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Tokenizer sederhana & stopwords bahasa Indonesia + Inggris
 */
const STOPWORDS = new Set([
  'yang', 'untuk', 'pada', 'ke', 'para', 'namun', 'menurut', 'antara', 'dia', 'dua',
  'ia', 'seperti', 'jika', 'sehingga', 'kembali', 'dan', 'ini', 'itu', 'karena', 'kepada',
  'oleh', 'saat', 'harus', 'sementara', 'setelah', 'belum', 'kami', 'sekitar', 'bagi',
  'serta', 'di', 'dari', 'apa', 'apakah', 'siapa', 'siapakah', 'bagaimana', 'bagaimanakah',
  'kenapa', 'mengapa', 'adalah', 'yaitu', 'ialah', 'merupakan', 'maksud', 'arti', 'artinya',
  'tentang', 'tersebut', 'suatu', 'sebuah', 'tolong', 'bantu', 'jelaskan',
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'of', 'for', 'to'
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Fallback keyword search: BM25 / Term Overlap
 * Berfungsi instan tanpa embedding model, cocok untuk perangkat low-end (RAM 1-2GB)
 */
export function searchByKeywords(
  query: string,
  notes: Array<{ id: string; title: string; content: string; subject?: string }>,
  topK = 3
): SearchResult[] {
  if (!query || !notes || notes.length === 0) return [];

  let queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Jika semua kata masuk stopword, gunakan kata apapun > 2 huruf
    queryTokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }
  if (queryTokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const note of notes) {
    const titleTokens = tokenize(note.title);
    const contentTokens = tokenize(note.content || '');
    const subjectTokens = tokenize(note.subject || '');

    let score = 0;
    let matchedTokenCount = 0;

    // Bonus jika judul catatan persis sama dengan kata yang dicari
    const cleanQ = query.toLowerCase().trim();
    const cleanTitle = note.title.toLowerCase().trim();
    if (cleanTitle === cleanQ) {
      score += 8.0;
    } else if (cleanTitle.startsWith(cleanQ)) {
      score += 4.0;
    }

    for (const q of queryTokens) {
      let tokenMatched = false;
      // Bobot tertinggi untuk kecocokan pada judul (x3.0)
      if (note.title.toLowerCase().includes(q)) { score += 3.0; tokenMatched = true; }
      if (titleTokens.includes(q)) { score += 2.0; tokenMatched = true; }

      // Bobot untuk mata pelajaran (x2.0)
      if (note.subject && note.subject.toLowerCase().includes(q)) { score += 2.0; tokenMatched = true; }
      if (subjectTokens.includes(q)) { score += 1.5; tokenMatched = true; }

      // Bobot untuk isi konten (x1.0)
      if (note.content && note.content.toLowerCase().includes(q)) { score += 1.0; tokenMatched = true; }
      const countInContent = contentTokens.filter(t => t === q).length;
      score += Math.min(countInContent * 0.3, 2.0);

      // Toleransi imbuhan & typo ringan (panjang kata >= 4)
      if (q.length >= 4) {
        const stem = q.slice(0, Math.min(q.length - 1, 5));
        if (note.title.toLowerCase().includes(stem)) score += 1.2;
        if (note.content && note.content.toLowerCase().includes(stem)) score += 0.5;
      }

      if (tokenMatched) matchedTokenCount++;
    }

    if (score > 0) {
      // Bonus besar jika cocok dengan lebih banyak kata kunci dari pertanyaan (Coordination Ratio)
      const coordinationRatio = matchedTokenCount / queryTokens.length;
      const finalScore = score * (1 + coordinationRatio * 1.5);

      results.push({
        noteId: note.id,
        title: note.title,
        content: note.content,
        subject: note.subject,
        score: finalScore,
        matchType: 'keyword',
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Hybrid Search: Menggabungkan hasil vektor semantik dengan keyword
 * Jika vektor belum dihitung atau model belum terpasang, otomatis memakai keyword fallback.
 */
export async function hybridSearch(
  query: string,
  queryVector?: number[] | Float32Array | null,
  rawNotes: Array<{ id: string; title: string; content: string; subject?: string }> = [],
  topK = 3
): Promise<SearchResult[]> {
  // 1. Jika ada vektor query, jalankan vector search
  let vectorResults: SearchResult[] = [];
  if (queryVector && queryVector.length > 0) {
    try {
      vectorResults = await searchSimilarVectors(queryVector, topK, 0.25);
    } catch (e) {
      console.warn('[vectorStore] Vector search error, fallback ke keyword:', e);
    }
  }

  // Filter hasil vektor agar hanya mencakup catatan yang masih ada
  if (rawNotes.length > 0 && vectorResults.length > 0) {
    const validIds = new Set(rawNotes.map(n => n.id));
    vectorResults = vectorResults.filter(vr => validIds.has(vr.noteId));
  }

  // 2. Keyword search
  const keywordResults = searchByKeywords(query, rawNotes, topK);

  // Jika keyword search menemukan hasil, prioritaskan keyword search!
  const map = new Map<string, SearchResult>();

  // Keyword match mendapat bobot utama (1.0)
  for (const kr of keywordResults) {
    map.set(kr.noteId, { ...kr, score: kr.score * 1.0 });
  }

  // Tambahkan boost dari vektor semantik jika ada kecocokan
  for (const vr of vectorResults) {
    const existing = map.get(vr.noteId);
    if (existing) {
      existing.score += vr.score * 0.4;
      existing.matchType = 'hybrid';
    } else if (vr.score >= 0.5) { // Hanya masukkan vektor murni jika similarity benar-benar tinggi
      map.set(vr.noteId, { ...vr, score: vr.score * 0.4 });
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}
