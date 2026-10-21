import { sendMessageToGemini } from './gemini';
import { ChatAttachment } from '../types';

// =============================================================================
// AI HAND-WRITTEN EXAM & WORKPAD GRADER
// =============================================================================
// Memeriksa coret-coretan tugas/PR/ujian matematika & sains dari foto kamera,
// mengevaluasi kebenaran langkah demi langkah, dan mendeteksi letak kesalahan baris.

export interface ExamGraderResult {
  estimatedScore: number; // 0 - 100
  isCorrect: boolean;
  firstErrorStep: string | null;
  stepAnalysis: string;
  correctSolution: string;
  feedbackText: string;
}

export async function gradeHandwrittenWork(
  imageAttachment: ChatAttachment,
  questionPrompt?: string
): Promise<ExamGraderResult> {
  const systemPrompt =
    `Kamu adalah Dosen/Guru Penguji Ahli yang sangat teliti dalam memeriksa lembar jawaban dan coret-coretan tulisan tangan siswa.\n` +
    `Tugasmu:\n` +
    `1. Baca tulisan tangan dan rumus yang ada pada foto lembar jawaban siswa.\n` +
    `2. Evaluasi pengerjaan langkah demi langkah (Step 1, Step 2, Step 3, dst).\n` +
    `3. Tentukan apakah ada kesalahan hitung, rumus salah, tanda kurung keliru, atau salah konsep.\n` +
    `4. Berikan estimasi skor (0 sampai 100).\n` +
    `5. Tunjukkan di baris/langkah ke berapa kesalahan pertama terjadi.\n` +
    `6. Berikan solusi pengerjaan yang benar dan runtut.\n\n` +
    `Format output WAJIB mengikuti struktur ini:\n` +
    `SKOR: [angka 0-100]\n` +
    `STATUS: [BENAR / ADA_KESALAHAN]\n` +
    `KESALAHAN_PERTAMA: [Sebutkan letak langkah salah, atau tulis "Tidak ada, pengerjaan sempurna"]\n` +
    `---ANALISIS_LANGKAH---\n` +
    `[Jelaskan evaluasi per langkah di sini]\n` +
    `---SOLUSI_BENAR---\n` +
    `[Tulis kunci jawaban dan langkah yang benar secara rapi]`;

  const userQuery = questionPrompt
    ? `Tolong periksa coret-coretan tugas saya di foto ini untuk soal: "${questionPrompt}". Evaluasi langkah demi langkah.`
    : `Tolong periksa coret-coretan pengerjaan pada foto ini, apakah ada kesalahan hitung atau rumus?`;

  const response = await sendMessageToGemini(
    [],
    userQuery,
    imageAttachment,
    systemPrompt,
    { temperature: 0.2 }
  );

  let estimatedScore = 80;
  let isCorrect = true;
  let firstErrorStep: string | null = null;
  let stepAnalysis = response;
  let correctSolution = '';

  const scoreMatch = response.match(/SKOR:\s*(\d{1,3})/i);
  if (scoreMatch) {
    estimatedScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));
  }

  const statusMatch = response.match(/STATUS:\s*(BENAR|ADA_KESALAHAN)/i);
  if (statusMatch) {
    isCorrect = statusMatch[1].toUpperCase() === 'BENAR';
  }

  const errMatch = response.match(/KESALAHAN_PERTAMA:\s*([^\n]+)/i);
  if (errMatch) {
    firstErrorStep = errMatch[1].trim();
    if (firstErrorStep.toLowerCase().includes('tidak ada')) {
      firstErrorStep = null;
    }
  }

  if (response.includes('---ANALISIS_LANGKAH---')) {
    const parts = response.split('---SOLUSI_BENAR---');
    const stepPart = parts[0].split('---ANALISIS_LANGKAH---')[1];
    if (stepPart) stepAnalysis = stepPart.trim();
    if (parts[1]) correctSolution = parts[1].trim();
  }

  return {
    estimatedScore,
    isCorrect,
    firstErrorStep,
    stepAnalysis,
    correctSolution,
    feedbackText: response,
  };
}
