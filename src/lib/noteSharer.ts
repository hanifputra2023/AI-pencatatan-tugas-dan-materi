import { Share, Platform } from 'react-native';
import { StudyNote } from '../types';
import { copyToClipboard } from './clipboard';
import { exportStudyNoteToPdf } from './pdfExporter';
import { showAlert } from './alert';

/**
 * Format string catatan belajar agar rapi dan enak dibaca saat dikirim via WhatsApp / Medsos
 */
export function formatNoteForSharing(note: StudyNote, username?: string): string {
  const title = note.title || 'Catatan Kuliah';
  const subject = note.subject || 'Kuliah Umum';
  const dateStr = note.created_at
    ? new Date(note.created_at).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  let body = '';

  if (note.summary && note.summary.trim()) {
    body += `📌 *RINGKASAN CEPAT:*\n${note.summary.trim()}\n\n---\n\n`;
  }

  // Bersihkan markdown simbol berlebihan untuk sharing teks biasa
  const cleanContent = (note.content || '')
    .replace(/^#+\s+/gm, '') // Hapus heading markdown
    .trim();

  body += `📖 *ISI MATERI:*\n${cleanContent}`;

  if (note.quiz_data && note.quiz_data.length > 0) {
    body += `\n\n---\n📝 *LATIHAN KUIS (${note.quiz_data.length} SOAL):*`;
    note.quiz_data.slice(0, 3).forEach((q, idx) => {
      body += `\n${idx + 1}. ${q.question}`;
      q.options.forEach((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);
        body += `\n   ${letter}. ${opt}`;
      });
    });
    if (note.quiz_data.length > 3) {
      body += `\n...dan ${note.quiz_data.length - 3} soal kuis lainnya.`;
    }
  }

  const sender = username ? ` dari ${username}` : '';
  const footer = `\n\n💡 _Dibagikan${sender} via StudyBot AI (Aplikasi Pintar Mahasiswa)_`;

  return `📚 *${title.toUpperCase()}*\n🏷️ Mata Kuliah: *${subject}*${dateStr ? `\n🗓️ Tanggal: ${dateStr}` : ''}\n\n${body}${footer}`;
}

/**
 * Buka dialog native share (WhatsApp, Telegram, Email, dll)
 */
export async function shareNoteViaSystem(note: StudyNote, username?: string): Promise<boolean> {
  try {
    const message = formatNoteForSharing(note, username);
    const title = note.title || 'Catatan Kuliah';

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title,
          text: message,
        });
        return true;
      } else {
        // Fallback jika browser desktop tidak mendukung Web Share API
        const copied = await copyToClipboard(message);
        if (copied) {
          showAlert('Tersalin ke Clipboard 📋', 'Teks materi telah disalin! Kamu bisa langsung paste (Ctrl+V) ke WhatsApp Web atau temanmu.');
          return true;
        }
        return false;
      }
    }

    const result = await Share.share(
      {
        message,
        title,
      },
      {
        dialogTitle: `Bagikan Catatan: ${title}`,
      }
    );

    return result.action === Share.sharedAction;
  } catch (error: any) {
    if (error?.message && !error.message.includes('dismissed')) {
      showAlert('Gagal Berbagi', error.message || 'Terjadi kesalahan saat membagikan catatan.');
    }
    return false;
  }
}

/**
 * Salin catatan ke clipboard
 */
export async function copyFormattedNoteToClipboard(note: StudyNote, username?: string): Promise<boolean> {
  const text = formatNoteForSharing(note, username);
  const ok = await copyToClipboard(text);
  if (ok) {
    showAlert('Tersalin 📋', 'Teks materi lengkap berhasil disalin ke clipboard.');
    return true;
  } else {
    showAlert('Info', 'Gagal menyalin teks materi.');
    return false;
  }
}

/**
 * Ekspor ke PDF dan langsung buka dialog share file
 */
export async function exportAndShareNotePdf(note: StudyNote, username?: string): Promise<void> {
  await exportStudyNoteToPdf(note, username || 'Mahasiswa');
}
