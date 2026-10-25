/**
 * smartSynthesizer.ts
 *
 * Engine kecerdasan buatan lokal (Offline AI QA & Synthesis Engine).
 * Menjawab pertanyaan spesifik pengguna secara tepat sasaran dari catatan belajar:
 * - Menjawab definisi secara padat dan jelas (tanpa membuang seluruh isi materi)
 * - Mengekstrak contoh spesifik sesuai konsep yang ditanyakan (vektor vs skalar, dsb.)
 * - Mengekstrak rumus dan persamaan matematika
 * - Menjelaskan perbedaan / perbandingan antar-konsep
 * - Menyajikan poin tahapan, faktor, dan karakteristik
 * - Merangkum dan melengkapi catatan yang belum selesai
 */

import { SearchResult } from './vectorStore';

const INTENT_STOPWORDS = new Set([
  'contoh', 'misal', 'misalnya', 'seperti', 'sebutkan', 'daftar', 'apa', 'apakah', 'itu',
  'yang', 'ada', 'di', 'dalam', 'materi', 'catatan', 'besaran', 'konsep', 'teori', 'jenis',
  'macam', 'tolong', 'bantu', 'kasih', 'berikan', 'tahu', 'tentang', 'definisi', 'pengertian',
  'maksud', 'arti', 'artinya', 'jelaskan', 'makna', 'ialah', 'adalah', 'yaitu', 'merupakan',
  'bagaimana', 'cara', 'langkah', 'tahap', 'proses', 'rumus', 'formula', 'persamaan', 'beda',
  'bedanya', 'perbedaan', 'faktor', 'ciri', 'sifat', 'karakteristik'
]);

function cleanBullet(text: string): string {
  return (text || '').replace(/^[\s\-\*\u2022\u25CF\d]+[.):\s]*/u, '').trim();
}

function endDot(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
}

/**
 * Ekstrak kata kunci konsep spesifik dari pertanyaan pengguna
 * Contoh: "contoh besaran vektor yang ada di materi" -> ['vektor']
 */
export function extractTargetTokens(query: string): string[] {
  if (!query) return [];
  const raw = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const specific = raw.filter(t => !INTENT_STOPWORDS.has(t));
  return specific.length > 0 ? specific : raw;
}

/**
 * Ekstrak daftar contoh dari catatan berdasarkan konsep yang ditargetkan
 */
export function extractExamples(content: string, targetTokens: string[]): string[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const examples: string[] = [];

  let inTargetExampleSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    const isExampleHeader = /contoh|misal|seperti|misalnya|daftar|berikut/i.test(lineLower);
    const matchesTarget = targetTokens.length === 0 || targetTokens.some(t => lineLower.includes(t));

    // Jika masuk header contoh lain yang tidak cocok, tutup section
    if (isExampleHeader && !matchesTarget) {
      inTargetExampleSection = false;
      continue;
    }

    if (isExampleHeader && matchesTarget) {
      inTargetExampleSection = true;
      // Cek apakah contoh ada langsung setelah tanda titik dua (Contoh: gaya, kecepatan)
      if (line.includes(':')) {
        const afterColon = line.split(':')[1].trim();
        if (afterColon.length > 2) {
          const inlineItems = afterColon
            .split(/[,;\n•\-\*]+|(?:\s+dan\s+)/i)
            .map(s => cleanBullet(s))
            .filter(s => s.length > 1);
          examples.push(...inlineItems);
        }
      }
      continue;
    }

    if (inTargetExampleSection) {
      const isBullet = /^[\-\*•\d]/.test(line);
      const isShortItem = line.split(/\s+/).length <= 6;
      const isNewHeader = /^[A-Z][^:]*:/i.test(line) || /^#/.test(line) || /^(rumus|definisi|pengertian|catatan|fungsi|contoh)/i.test(lineLower);

      if (isNewHeader) {
        inTargetExampleSection = false;
      } else if (isBullet || isShortItem) {
        examples.push(cleanBullet(line));
        continue;
      } else {
        inTargetExampleSection = false;
      }
    }

    // Deteksi inline: "antara lain kecepatan dan percepatan"
    if (matchesTarget && /(?:contoh|misalnya|seperti|antara lain|meliputi)\s*(?:adalah|:)?\s*([^.]+)/i.test(line)) {
      const match = line.match(/(?:contoh|misalnya|seperti|antara lain|meliputi)\s*(?:adalah|:)?\s*([^.]+)/i);
      if (match && match[1]) {
        const items = match[1]
          .split(/[,;]+|(?:\s+dan\s+)/i)
          .map(s => cleanBullet(s))
          .filter(s => s.length > 1 && !/^(contoh|besaran|yaitu|adalah)/i.test(s));
        examples.push(...items);
      }
    }
  }

  // Deduplikasi & pembersihan
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const ex of examples) {
    const k = ex.toLowerCase();
    if (!seen.has(k) && ex.length > 1) {
      seen.add(k);
      unique.push(ex);
    }
  }
  return unique;
}

/**
 * Ekstrak definisi spesifik konsep dari catatan
 */
export function extractDefinition(content: string, targetTokens: string[]): string {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Format: "Besaran Vektor adalah besaran yang..."
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    const isDef = /\b(adalah|ialah|merupakan|yaitu|didefinisikan sebagai|merujuk pada|artinya|berarti)\b/i.test(lineLower);
    const matchesTarget = targetTokens.length === 0 || targetTokens.some(t => lineLower.includes(t));

    if (isDef && matchesTarget) {
      return cleanBullet(line);
    }
  }

  // 2. Format baris dengan titik dua: "Besaran Vektor: besaran fisika yang memiliki nilai dan arah"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    const matchesTarget = targetTokens.length === 0 || targetTokens.some(t => lineLower.includes(t));

    if (matchesTarget && line.includes(':')) {
      const parts = line.split(':');
      const after = parts.slice(1).join(':').trim();
      if (after.length > 10 && !/^(contoh|rumus|fungsi)/i.test(after)) {
        return cleanBullet(line);
      }
      // Jika setelah titik dua kosong (header) dan baris berikutnya adalah penjelasannya
      if (after.length <= 5 && i + 1 < lines.length) {
        const nextLine = cleanBullet(lines[i + 1]);
        if (nextLine.length > 10 && !/^#|contoh|rumus/i.test(nextLine)) {
          return `${cleanBullet(parts[0])}: ${nextLine}`;
        }
      }
    }
  }

  // 3. Cari baris apapun yang memuat token target dengan panjang kalimat wajar (> 25 karakter)
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    const matchesTarget = targetTokens.some(t => lineLower.includes(t));
    if (matchesTarget && line.length > 25 && !/^#|contoh|rumus/i.test(lineLower)) {
      return cleanBullet(line);
    }
  }

  // 4. Fallback ke baris pertama catatan
  return cleanBullet(lines[0] || '');
}

/**
 * Ekstrak rumus / formula matematika dari materi
 */
export function extractFormulas(content: string, targetTokens: string[]): string[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const formulas: string[] = [];

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    const hasEquals = line.includes('=');
    const hasFormulaKeyword = /rumus|persamaan|formula/i.test(lineLower);
    const matchesTarget = targetTokens.length === 0 || targetTokens.some(t => lineLower.includes(t));

    if ((hasEquals || hasFormulaKeyword) && matchesTarget) {
      formulas.push(cleanBullet(line));
    }
  }
  return formulas;
}

/**
 * Ekstrak baris perbandingan / perbedaan
 */
export function extractDifferences(content: string): string[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const diffLines: string[] = [];

  for (const line of lines) {
    const isContrast = /sedangkan|sementara|berbeda|namun|tetapi|perbedaan|dibanding/i.test(line);
    if (isContrast) {
      diffLines.push(cleanBullet(line));
    }
  }
  return diffLines;
}

/**
 * Pencarian segmen teks paling relevan (Passage Relevance Scoring)
 * Menggunakan pencocokan token + prefix + bobot baris definisi
 */
export function extractPassageByRelevance(content: string, query: string, topK = 3): string[] {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(apa|itu|yang|ada|dalam|materi|catatan|bisa|dan|ini|kan|kah|lah)$/i.test(w));

  if (queryTokens.length === 0) return [];

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const scored: Array<{ line: string; score: number }> = [];

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    let score = 0;

    // Skor berdasarkan exact token match
    for (const token of queryTokens) {
      if (lineLower.includes(token)) {
        score += 3;
      } else if (token.length >= 5) {
        // Prefix/stem matching (misal: "vektor" cocok dengan "vektorial")
        const prefix = token.slice(0, Math.floor(token.length * 0.75));
        if (lineLower.includes(prefix)) score += 1;
      }
    }

    // Bonus: baris definisi sangat relevan
    if (score > 0 && /\b(adalah|ialah|yaitu|merupakan|didefinisikan|artinya|berarti)\b/i.test(lineLower)) {
      score += 4;
    }
    // Bonus: baris berisi contoh spesifik
    if (score > 0 && /\b(contoh|misalnya|seperti|antara lain|meliputi)\b/i.test(lineLower)) {
      score += 2;
    }
    // Penalti: baris hanya berupa heading / judul pendek tanpa isi
    if (/^#{1,4}\s/.test(line) || (line.length < 25 && !/[.,:;]/.test(line))) {
      score = Math.max(0, score - 2);
    }
    // Penalti: baris terlalu pendek (kemungkinan label saja)
    if (line.length < 10) score = 0;

    if (score > 0) {
      scored.push({ line: cleanBullet(line), score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.line);
}

/**
 * Fungsi Utama: Mensintesis Jawaban Cerdas & Tepat Sasaran
 */
export function synthesizeResponse(
  query: string,
  notes: SearchResult[],
  aiName: string,
  allAvailableNotes?: Array<{ id: string; title: string; content?: string; subject?: string }>
): string {
  // 1. Jika tidak ada catatan yang cocok
  if (notes.length === 0) {
    if (allAvailableNotes && allAvailableNotes.length > 0) {
      const list = allAvailableNotes
        .slice(0, 5)
        .map(n => `• **${n.title}**${n.subject ? ` *(${n.subject})*` : ''}`)
        .join('\n');
      return `📚 **${aiName} (Mode Offline)**\n\nAku belum menemukan catatan yang cocok dengan pertanyaanmu tentang "*${query}*".\n\n📋 **Catatan yang tersimpan di perangkatmu saat ini:**\n${list}\n\n💡 Kamu bisa bertanya tentang topik catatan di atas, atau menambahkan materi baru di menu **Catatan Belajar**! 📝✨`;
    }
    return `📚 **${aiName} (Mode Offline)**\n\nBelum ada catatan belajar yang tersimpan di perangkat ini.\n\n💡 Silakan tambahkan materi baru di menu **Catatan Belajar** terlebih dahulu. Setelah tersimpan, aku dapat membantumu mempelajarinya secara offline tanpa kuota! 📝✨`;
  }

  const primary = notes[0];
  const qLow = query.toLowerCase();
  const targetTokens = extractTargetTokens(query);
  const noteContent = primary.content || '';
  const noteTitle = primary.title || 'Catatan';
  const subject = primary.subject || 'Materi';

  // Format label konsep yang dicari (misal: "Besaran Vektor")
  const conceptName = targetTokens.length > 0
    ? targetTokens.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : noteTitle;

  // 2. DETEKSI INTENT PERTANYAAN SECARA AKURAT
  const isResult = /\b(hasil|produk|output|dihasilkan|reaksi)\b/i.test(qLow);
  const isExample = /\b(contoh|misal|seperti apa|apa saja|sebutkan|daftar|berikan contoh)\b/i.test(qLow);
  const isDefinition = /\b(apa itu|apakah yang dimaksud|apa yang dimaksud|definisi|pengertian|maksud dari|arti kata|apa arti|apa makna|jelaskan konsep|jelaskan apa|jelaskan tentang|jelaskan apa|apa pengertian|apa definisi|apa yang|apakah itu)\b/i.test(qLow)
    || /^jelaskan\b/i.test(qLow);  // "jelaskan X" selalu intent definisi/penjelasan
  const isDifference = /\b(beda|bedanya|perbedaan|perbandingan|dibanding|versus|vs|bandingkan)\b/i.test(qLow);
  const isFormula = /\b(rumus|formula|persamaan|perhitungan|cara hitung|hitunglah)\b/i.test(qLow);
  const isProcess = !isResult && /\b(bagaimana|cara|langkah|tahap|proses|alur|prosedur|mekanisme|tahapan)\b/i.test(qLow);
  const isCharacteristics = /\b(ciri|sifat|karakteristik|unsur|komponen|syarat|faktor|ciri-ciri)\b/i.test(qLow);
  const isSummary = /\b(rangkum|ringkas|kesimpulan|garis besar|intinya|pokok|resume)\b/i.test(qLow);
  const isComplete = /\b(lengkapi|lanjutkan|teruskan|sambungkan|tambahkan kalimat|isi yang kurang)\b/i.test(qLow);

  let titleBadge = '';
  let bodyContent = '';

  // === INTENT 0: HASIL / PRODUK / OUTPUT SPESIFIK ===
  if (isResult) {
    titleBadge = `🌱 **Hasil / Output (${noteTitle}):**`;
    const lines = noteContent.split('\n').map(l => l.trim()).filter(Boolean);
    const resultLines: string[] = [];
    let inResultSection = false;

    for (const l of lines) {
      const lLow = l.toLowerCase();
      if (/hasil|produk|output|menghasilkan/i.test(lLow)) {
        inResultSection = true;
        if (l.includes(':')) {
          const after = l.split(':')[1].trim();
          if (after.length > 2) resultLines.push(cleanBullet(after));
        }
        continue;
      }
      if (inResultSection) {
        if (/^[\-\*•\d]/.test(l) || l.split(/\s+/).length <= 10) {
          resultLines.push(cleanBullet(l));
        } else {
          inResultSection = false;
        }
      }
    }

    if (resultLines.length > 0) {
      bodyContent = `Berdasarkan catatan **${noteTitle}**, yang dihasilkan adalah:\n\n` +
        resultLines.map(r => `• **${r}**`).join('\n');
    } else {
      const passages = extractPassageByRelevance(noteContent, query, 3);
      bodyContent = `Berdasarkan catatan **${noteTitle}**:\n\n` +
        passages.map(p => `• ${endDot(p)}`).join('\n\n');
    }
  }

  // === INTENT 1: CONTOH SPESIFIK ===
  else if (isExample) {
    const examples = extractExamples(noteContent, targetTokens);
    titleBadge = `💡 **Contoh ${conceptName}:**`;

    if (examples.length > 0) {
      const itemsText = examples.map(ex => `• **${ex}**`).join('\n');
      bodyContent = `Berdasarkan catatan **${noteTitle}**, contoh-contoh ${conceptName.toLowerCase()} yang tercatat adalah:\n\n${itemsText}`;
    } else {
      const passages = extractPassageByRelevance(noteContent, query, 3);
      if (passages.length > 0) {
        bodyContent = `Berdasarkan catatan **${noteTitle}**, bagian yang memuat contoh tersebut adalah:\n\n` +
          passages.map(p => `• ${p}`).join('\n');
      } else {
        bodyContent = `Dalam catatan **${noteTitle}**, belum tercantum contoh spesifik untuk *${conceptName}*. Kamu bisa melengkapinya di menu Catatan Belajar ya!`;
      }
    }
  }

  // === INTENT 2: DEFINISI / PENGERTIAN SPESIFIK ===
  else if (isDefinition) {
    const defSentence = extractDefinition(noteContent, targetTokens);
    titleBadge = `📖 **Pengertian ${conceptName}:**`;

    if (defSentence) {
      bodyContent = `${endDot(defSentence)}\n\n*Catatan ini tercatat dalam mata pelajaran **${subject}**.*`;
    } else {
      bodyContent = `Belum ditemukan definisi pasti untuk *${conceptName}* di dalam catatan **${noteTitle}**.`;
    }
  }

  // === INTENT 3: PERBEDAAN / PERBANDINGAN ===
  else if (isDifference) {
    titleBadge = `⚖️ **Perbedaan / Perbandingan (${noteTitle}):**`;
    const diffLines = extractDifferences(noteContent);

    if (diffLines.length > 0) {
      bodyContent = `Berdasarkan catatan **${noteTitle}**:\n\n` +
        diffLines.map(d => `• ${endDot(d)}`).join('\n\n');
    } else {
      const passages = extractPassageByRelevance(noteContent, query, 2);
      bodyContent = `Berdasarkan catatan **${noteTitle}**:\n\n` +
        (passages.map(p => `• ${endDot(p)}`).join('\n\n') || 'Belum ada rincian perbandingan spesifik.');
    }
  }

  // === INTENT 4: RUMUS / FORMULA ===
  else if (isFormula) {
    const formulas = extractFormulas(noteContent, targetTokens);
    titleBadge = `📐 **Rumus / Persamaan (${noteTitle}):**`;

    if (formulas.length > 0) {
      bodyContent = `Berikut rumus yang tercatat dalam materi **${noteTitle}**:\n\n` +
        formulas.map(f => `• **${f}**`).join('\n');
    } else {
      bodyContent = `Tidak ditemukan rumus spesifik untuk *${conceptName}* dalam catatan ini.`;
    }
  }

  // === INTENT 5: CIRI / SIFAT / FAKTOR ===
  else if (isCharacteristics) {
    titleBadge = `🔍 **Karakteristik / Faktor (${noteTitle}):**`;
    const passages = extractPassageByRelevance(noteContent, query, 3);
    if (passages.length > 0) {
      bodyContent = `Berdasarkan catatan **${noteTitle}**:\n\n` +
        passages.map(p => `• ${endDot(p)}`).join('\n\n');
    } else {
      bodyContent = `Informasi karakteristik/faktor untuk *${conceptName}* belum tercatat lengkap di catatan ini.`;
    }
  }

  // === INTENT 6: TAHAPAN / LANGKAH / CARA ===
  else if (isProcess) {
    titleBadge = `⚙️ **Tahapan / Langkah (${noteTitle}):**`;
    const lines = noteContent.split('\n').map(l => cleanBullet(l)).filter(l => l.length > 5);
    const stepLines = lines.filter(l => /^(langkah|tahap|proses|\d+[.)])/i.test(l));
    const toShow = stepLines.length > 0 ? stepLines : lines.slice(0, 4);

    bodyContent = toShow.map((l, i) => `**${i + 1}.** ${endDot(l)}`).join('\n\n');
  }

  // === INTENT 7: RINGKASAN MATERI ===
  else if (isSummary) {
    titleBadge = `📌 **Ringkasan Poin Utama (${noteTitle}):**`;
    const lines = noteContent.split('\n').map(l => cleanBullet(l)).filter(l => l.length > 10).slice(0, 5);
    bodyContent = lines.map((l, i) => `• **Poin ${i + 1}:** ${endDot(l)}`).join('\n\n');
  }

  // === INTENT 8: MELENGKAPI CATATAN ===
  else if (isComplete) {
    titleBadge = `✍️ **Pengembangan & Kelengkapan Catatan:**`;
    const lines = noteContent.split('\n').map(l => cleanBullet(l)).filter(Boolean).slice(0, 5);
    bodyContent = lines.map(l => `• ${endDot(l)} *(Perlu diperdalam dengan referensi tambahan)*`).join('\n\n');
  }

  // === INTENT 9: DIRECT TARGETED QA (PERTANYAAN SPESIFIK LAINNYA) ===
  else {
    const passages = extractPassageByRelevance(noteContent, query, 3);
    titleBadge = `📖 **Penjelasan (${noteTitle}):**`;

    if (passages.length > 0) {
      bodyContent = `Berdasarkan materi yang tercatat:\n\n` +
        passages.map(p => `> ${endDot(p)}`).join('\n\n');
    } else {
      const firstLines = noteContent.split('\n').map(l => cleanBullet(l)).filter(l => l.length > 10).slice(0, 2);
      bodyContent = firstLines.map(l => `> ${endDot(l)}`).join('\n\n');
    }
  }

  // Kutipan sumber materi yang rapi
  const sources = notes.map(n => `*${n.title}*${n.subject ? ` — ${n.subject}` : ''}`).join(', ');
  return [
    `📚 **${aiName} (Smart Synthesizer)**`,
    '',
    titleBadge,
    '',
    bodyContent,
    '',
    '---',
    `📖 **Sumber:** ${sources}`
  ].join('\n');
}
