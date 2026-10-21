import { FlashcardItem, StudyNote } from '../types';

// =============================================================================
// SPACED REPETITION ENGINE (SuperMemo SM-2 Algorithm)
// =============================================================================
// Algoritma kurva lupa Ebbinghaus yang menjadwalkan review flashcard & catatan
// tepat sebelum pengguna melupakannya.

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

/**
 * Menghitung interval hari dan kemudahan (Ease Factor) baru berdasarkan penilaian pengguna.
 * @param card Kartu flashcard saat ini
 * @param grade Penilaian: 'again' (lupa sama sekali), 'hard' (ingat dengan susah payah), 'good' (ingat wajar), 'easy' (sangat mudah)
 */
export function calculateNextReview(card: FlashcardItem, grade: ReviewGrade): FlashcardItem {
  // Nilai quality SM-2 (0 sampai 5):
  // again = 1, hard = 3, good = 4, easy = 5
  let quality = 4;
  switch (grade) {
    case 'again':
      quality = 1;
      break;
    case 'hard':
      quality = 3;
      break;
    case 'good':
      quality = 4;
      break;
    case 'easy':
      quality = 5;
      break;
  }

  let repetition = card.repetition || 0;
  let interval = card.interval || 0;
  let easeFactor = card.easeFactor || 2.5;

  if (quality < 3) {
    // Pengguna lupa, ulang dari awal
    repetition = 0;
    interval = 1;
  } else {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 3; // review ulang 3 hari
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition += 1;
  }

  // Hitung ulang Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // Hitung tanggal jatuh tempo (due date) berikutnya
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + interval);

  return {
    ...card,
    repetition,
    interval,
    easeFactor: parseFloat(easeFactor.toFixed(2)),
    dueDate: nextDueDate.toISOString(),
    mastered: repetition >= 4,
    difficulty: easeFactor < 1.8 ? 'hard' : easeFactor > 2.4 ? 'easy' : 'medium',
  };
}

/**
 * Mengambil daftar kartu yang sudah jatuh tempo untuk di-review hari ini dari seluruh catatan belajar.
 */
export function getDueFlashcards(notes: StudyNote[]): Array<{
  noteId: string;
  noteTitle: string;
  card: FlashcardItem;
}> {
  const now = new Date();
  const dueItems: Array<{ noteId: string; noteTitle: string; card: FlashcardItem }> = [];

  for (const note of notes) {
    if (!note.flashcards || !Array.isArray(note.flashcards)) continue;

    for (const card of note.flashcards) {
      // Jika belum pernah di-review sama sekali ATAU sudah lewat tanggal jatuh tempo
      if (!card.dueDate) {
        dueItems.push({ noteId: note.id, noteTitle: note.title, card });
      } else {
        const due = new Date(card.dueDate);
        if (due <= now) {
          dueItems.push({ noteId: note.id, noteTitle: note.title, card });
        }
      }
    }
  }

  return dueItems;
}

/**
 * Format teks ramah untuk tombol review berikutnya (misal: "1 hari", "3 hari", "7 hari")
 */
export function getReviewIntervalPreview(card: FlashcardItem, grade: ReviewGrade): string {
  const simulated = calculateNextReview(card, grade);
  if (!simulated.interval || simulated.interval <= 1) return '1 hari lagi';
  return `${simulated.interval} hari lagi`;
}
