import { sendMessageToGemini, GeminiMessage } from './gemini';

// =============================================================================
// MULTI-AGENT DEBATE PANEL (Dewan Pakar AI)
// =============================================================================
// Mode debat 3-pakar untuk membedah topik rumit, esai, atau dilema dari berbagai
// sudut pandang: Akademisi Kritis vs Praktisi Lapangan vs Moderator Sintesis.

export interface DebateTurnResult {
  persona: 'academic' | 'practitioner' | 'moderator';
  speakerName: string;
  badge: string;
  color: string;
  avatarEmoji: string;
  content: string;
}

/**
 * Menjalankan sesi debat multi-agent 3 ronde secara berurutan.
 * Callback onTurn dipanggil setiap kali satu pakar selesai berargumen.
 */
export async function runMultiAgentDebate(
  topic: string,
  onTurn?: (turn: DebateTurnResult) => void
): Promise<DebateTurnResult[]> {
  const turns: DebateTurnResult[] = [];

  // ---------------------------------------------------------------------------
  // RONDE 1: Prof. Aris (Akademisi Teoretis & Kritis)
  // ---------------------------------------------------------------------------
  const academicPrompt =
    `Kamu adalah Prof. Aris, pakar akademisi senior dan peneliti kritis. ` +
    `Pengguna ingin membedah topik: "${topic}". ` +
    `Tugasmu adalah memberikan analisis kritis, tinjauan teoretis, celah/risiko potensial, dan argumen ilmiah yang kuat. ` +
    `Gunakan gaya bicara akademis, berbasis logika ketat, padat (2-3 paragraf), tanpa bertele-tele. Sapa dirimu sebagai Prof. Aris.`;

  const academicReply = await sendMessageToGemini(
    [],
    `Silakan berikan analisis teoretis dan kritis Anda mengenai topik: "${topic}".`,
    null,
    academicPrompt,
    { temperature: 0.6 }
  );

  const turn1: DebateTurnResult = {
    persona: 'academic',
    speakerName: 'Prof. Aris',
    badge: 'Akademisi Kritis',
    color: '#8B5CF6',
    avatarEmoji: '🧐',
    content: academicReply,
  };
  turns.push(turn1);
  onTurn?.(turn1);

  // ---------------------------------------------------------------------------
  // RONDE 2: Rian (Praktisi Industri & Lapangan)
  // ---------------------------------------------------------------------------
  const practitionerPrompt =
    `Kamu adalah Rian, seorang praktisi industri senior dan inovator teknologi di lapangan. ` +
    `Topik yang dibahas adalah: "${topic}". ` +
    `Sebelumnya, Prof. Aris berpendapat:\n"${academicReply.substring(0, 800)}"\n\n` +
    `Tugasmu adalah merespons pandangan Prof. Aris dari kacamata realita dunia nyata, kebutuhan pasar, implementasi konkret, dan peluang praktis. ` +
    `Gunakan gaya bicara percaya diri, solutif, pragmatis, dan realistis (2-3 paragraf). Sapa dirimu sebagai Rian.`;

  const practitionerReply = await sendMessageToGemini(
    [],
    `Bagaimana tanggapan praktis Anda terhadap argumen Prof. Aris di atas terkait topik "${topic}"?`,
    null,
    practitionerPrompt,
    { temperature: 0.8 }
  );

  const turn2: DebateTurnResult = {
    persona: 'practitioner',
    speakerName: 'Rian (Praktisi)',
    badge: 'Praktisi Industri',
    color: '#F59E0B',
    avatarEmoji: '💼',
    content: practitionerReply,
  };
  turns.push(turn2);
  onTurn?.(turn2);

  // ---------------------------------------------------------------------------
  // RONDE 3: Dr. Maya (Moderator & Synthesizer)
  // ---------------------------------------------------------------------------
  const moderatorPrompt =
    `Kamu adalah Dr. Maya, moderator dewan pakar dan perumus sintesis independen. ` +
    `Kamu mendengarkan debat antara Prof. Aris (Akademisi):\n"${academicReply.substring(0, 600)}"\n\n` +
    `dan Rian (Praktisi):\n"${practitionerReply.substring(0, 600)}"\n\n` +
    `Topik: "${topic}".\n` +
    `Tugasmu:\n` +
    `1. Tarik benang merah dan kesimpulan seimbang dari kedua sudut pandang.\n` +
    `2. Buatkan rekomendasi draf kerangka esai / poin aksi (Actionable Takeaway) yang bisa langsung digunakan oleh pengguna.\n` +
    `Gunakan gaya bicara bijak, terstruktur rapi dengan poin-poin jelas.`;

  const moderatorReply = await sendMessageToGemini(
    [],
    `Mohon simpulkan perdebatan ini dan susun kerangka sintesis komprehensif untuk pengguna.`,
    null,
    moderatorPrompt,
    { temperature: 0.5 }
  );

  const turn3: DebateTurnResult = {
    persona: 'moderator',
    speakerName: 'Dr. Maya (Moderator)',
    badge: 'Sintesis & Kerangka',
    color: '#10B981',
    avatarEmoji: '⚖️',
    content: moderatorReply,
  };
  turns.push(turn3);
  onTurn?.(turn3);

  return turns;
}
