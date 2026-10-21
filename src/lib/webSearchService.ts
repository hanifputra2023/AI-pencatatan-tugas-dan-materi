import { Platform } from 'react-native';

// =============================================================================
// REAL-TIME LIVE WEB SEARCH SERVICE
// =============================================================================
// Mengambil data berita, fakta, dan peristiwa terkini secara langsung dari internet
// (Google News RSS Feed & Local Proxy) secara real-time tanpa batas kuota API Gemini.

export interface WebSearchResultItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export interface WebSearchPayload {
  contextText: string;
  sources: WebSearchResultItem[];
}

/**
 * Membersihkan kata-kata tanya/pengantar agar query pencarian web lebih efektif.
 */
function extractSearchKeywords(rawText: string): string {
  return rawText
    .replace(/(tolong|coba|bantu|carikan|cari|apa|siapa|bagaimana|kapan|dimana|info|informasi|berita|tentang|soal|terbaru|hari ini|update|dong|ya|nih|kan)\s+/gi, ' ')
    .replace(/[?!.,;:()]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function formatWebSearchPayload(items: WebSearchResultItem[]): WebSearchPayload {
  const todayDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const contextLines = items.map((it, idx) =>
    `${idx + 1}. "${it.title}"\n   Tanggal Publikasi: ${it.pubDate}\n   Penerbit: ${it.source || 'Media Berita'}\n   Link Rujukan: ${it.link}`
  );

  const contextText =
    `[DATA RISET WEB REAL-TIME LANGSUNG DARI INTERNET (HARI INI: ${todayDate})]:\n` +
    `Gunakan data berita dan fakta nyata terkini berikut sebagai rujukan utama untuk menjawab pertanyaan pengguna secara akurat sesuai fakta hari ini:\n\n` +
    contextLines.join('\n\n');

  return { contextText, sources: items };
}

/**
 * Melakukan riset pencarian web live dari internet secara real-time.
 */
export async function searchLiveWeb(userQuery: string): Promise<WebSearchPayload | null> {
  const cleanedQuery = extractSearchKeywords(userQuery) || userQuery.trim();
  const encoded = encodeURIComponent(cleanedQuery);

  // 1. Jika di Web, coba via local search proxy (http://127.0.0.1:3005/search) untuk bypass CORS
  if (Platform.OS === 'web') {
    try {
      const proxyController = new AbortController();
      const proxyTimeout = setTimeout(() => proxyController.abort(), 4000);
      const proxyRes = await fetch(`http://127.0.0.1:3005/search?q=${encoded}`, {
        signal: proxyController.signal,
      });
      clearTimeout(proxyTimeout);

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.success && Array.isArray(proxyData.items) && proxyData.items.length > 0) {
          return formatWebSearchPayload(proxyData.items);
        }
      }
    } catch {
      // Local proxy tidak aktif atau offline, lanjutkan ke direct fetch
    }
  }

  // 2. Fetch langsung (Sempurna di React Native Android/iOS, atau di web jika diizinkan)
  try {
    const searchUrl = `https://news.google.com/rss/search?q=${encoded}&hl=id&gl=ID&ceid=ID:id`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const xml = await res.text();
      const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
      const items: WebSearchResultItem[] = [];
      for (const m of itemMatches) {
        const itemXml = m[1];
        const title = (itemXml.match(/<title>(.*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
        const link = (itemXml.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const pubDate = (itemXml.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        const source = (itemXml.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
        if (title) {
          items.push({ title, link, pubDate, source });
        }
      }
      if (items.length > 0) {
        return formatWebSearchPayload(items);
      }
    }
  } catch (err) {
    console.warn('[WebSearchService] Direct RSS fetch error:', err);
  }

  // 3. Fallback: Kalender dan Tanggal Nyata (Real-time Anchor)
  const todayDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return {
    contextText: `[INFORMASI TANGGAL & KALENDER HARI INI]:\n` +
      `Hari ini adalah ${todayDate}. Ingat bahwa saat ini tahun 2026. ` +
      `Jawablah dengan relevan dan jangan berasumsi bahwa saat ini masih tahun 2024 atau sebelum tahun 2026.`,
    sources: [],
  };
}
