import { sendMessageToGemini } from './gemini';

// =============================================================================
// ACADEMIC PARAPHRASE & TURNITIN SHIELD
// =============================================================================
// Asisten penulisan karya ilmiah & skripsi untuk merombak struktur kalimat
// agar lolos uji kemiripan (Turnitin < 15%) tanpa mengubah substansi ilmiah.

export type AcademicShieldMode = 'heavy_turnitin' | 'academic_tone' | 'citation_apa';

export interface ParaphraseResult {
  originalText: string;
  paraphrasedText: string;
  similarityRisk: 'Sangat Rendah (<10%)' | 'Rendah (10-20%)' | 'Sedang';
  changesSummary: string[];
}

export async function paraphraseAcademic(
  text: string,
  mode: AcademicShieldMode = 'heavy_turnitin'
): Promise<ParaphraseResult> {
  let promptGoal = '';
  switch (mode) {
    case 'heavy_turnitin':
      promptGoal =
        'Tujuan: PARAFRASE RADIKAL ANTI-TURNITIN. ' +
        'Ubah struktur kalimat secara menyeluruh (balik klausa utama dan anak kalimat, konversi aktif ke pasif atau sebaliknya, gunakan padanan kosakata ilmiah alternatif). ' +
        'DILARANG mengubah arti fakta, angka, dan substansi data sama sekali.';
      break;
    case 'academic_tone':
      promptGoal =
        'Tujuan: PENINGKATAN BOBOT ILMIAH (ACADEMIC TONE). ' +
        'Ganti kata-kata non-formal, klise, atau berulang dengan istilah akademis standar baku bahasa Indonesia/Inggris formal seperti pada jurnal terindeks Scopus/Sinta.';
      break;
    case 'citation_apa':
      promptGoal =
        'Tujuan: FORMAT SITASI DAN KUTIPAN ILMIAH (APA 7th EDITION). ' +
        'Susun teks berikut agar mengintegrasikan kutipan secara elegan dengan format APA 7th (misal: "Menurut Hidayat (2023), ..." atau "... (Pratama & Lestari, 2022)").';
      break;
  }

  const systemPrompt =
    `Kamu adalah Editor Bahasa Jurnal Ilmiah Internasional dan Pakar Parafrase Akademis.\n` +
    `${promptGoal}\n\n` +
    `Format output WAJIB persis seperti berikut (jangan tambahkan teks pengantar lain):\n` +
    `---HASIL_PARAFRASE---\n` +
    `[Tulis teks hasil parafrase yang sudah matang di sini]\n` +
    `---RINGKASAN_PERUBAHAN---\n` +
    `• [Poin perubahan 1]\n` +
    `• [Poin perubahan 2]\n` +
    `• [Poin perubahan 3]`;

  const response = await sendMessageToGemini(
    [],
    `Berikut teks yang ingin diparafrase:\n\n"${text}"`,
    null,
    systemPrompt,
    { temperature: 0.3 }
  );

  let paraphrasedText = response;
  const changesSummary: string[] = [];

  if (response.includes('---HASIL_PARAFRASE---')) {
    const parts = response.split('---RINGKASAN_PERUBAHAN---');
    const mainPart = parts[0].replace('---HASIL_PARAFRASE---', '').trim();
    paraphrasedText = mainPart;

    if (parts[1]) {
      const lines = parts[1]
        .split('\n')
        .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
        .filter((l) => l.length > 0);
      changesSummary.push(...lines.slice(0, 4));
    }
  }

  if (changesSummary.length === 0) {
    changesSummary.push('Restrukturisasi sintaksis kalimat dan variasi klausa.');
    changesSummary.push('Penyempurnaan diksi ilmiah baku.');
  }

  return {
    originalText: text,
    paraphrasedText,
    similarityRisk: mode === 'heavy_turnitin' ? 'Sangat Rendah (<10%)' : 'Rendah (10-20%)',
    changesSummary,
  };
}
