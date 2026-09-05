import { Share, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { StudyNote } from '../types';
import { copyToClipboard } from './clipboard';
import { exportStudyNoteToPdf } from './pdfExporter';
import { showAlert } from './alert';

/**
 * Sanitasi judul agar menjadi nama file yang valid dan aman
 */
export function sanitizeFilename(name: string): string {
  const cleaned = (name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '') // Hapus karakter ilegal di nama file Windows/Unix
    .replace(/\s+/g, '_') // Ganti spasi dengan underscore
    .substring(0, 60); // Batasi panjang nama file

  return cleaned || 'Catatan_Kuliah';
}

/**
 * Format payload JSON catatan untuk dibagikan antar pengguna
 */
export function createNoteJsonPayload(note: StudyNote, username?: string) {
  return {
    app: 'StudyBot AI',
    type: 'study_note_share',
    version: '1.0',
    exported_at: new Date().toISOString(),
    exported_by: username || 'Mahasiswa',
    note: {
      title: note.title || 'Catatan Kuliah',
      subject: note.subject || 'Kuliah Umum',
      content: note.content || '',
      summary: note.summary || null,
      quiz_data: note.quiz_data || [],
      flashcards: note.flashcards || [],
      color: note.color || '#3B82F6',
    },
  };
}

/**
 * Bagikan catatan kuliah sebagai file JSON dokumen dengan nama sesuai judul catatan
 * (Dikirim via WhatsApp/Telegram sebagai file dokumen .json utuh)
 */
export async function shareNoteAsJsonFile(note: StudyNote, username?: string): Promise<boolean> {
  try {
    const rawFileName = sanitizeFilename(note.title);
    const fileName = `${rawFileName}.json`;
    const payload = createNoteJsonPayload(note, username);
    const jsonString = JSON.stringify(payload, null, 2);

    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showAlert('Berhasil Mengunduh File JSON 📁', `File "${fileName}" telah diunduh. Kamu bisa kirim file ini ke temanmu.`);
        return true;
      }
      return false;
    }

    // Android / iOS native: Simpan ke cache directory lalu bagikan via dialog sistem
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: `Bagikan File Catatan: ${fileName}`,
        UTI: 'public.json',
      });
      return true;
    } else {
      showAlert('Info', 'Fitur berbagi file tidak didukung pada perangkat ini.');
      return false;
    }
  } catch (error: any) {
    console.error('Error sharing JSON note file:', error);
    showAlert('Gagal Membagikan File JSON', error.message || 'Terjadi kesalahan saat memproses file catatan.');
    return false;
  }
}

/**
 * Format string catatan belajar untuk teks WhatsApp ringkas
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

  const cleanContent = (note.content || '')
    .replace(/^#+\s+/gm, '')
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
  const footer = `\n\n💡 _Dibagikan${sender} via StudyBot AI_`;

  return `📚 *${title.toUpperCase()}*\n🏷️ Mata Kuliah: *${subject}*${dateStr ? `\n🗓️ Tanggal: ${dateStr}` : ''}\n\n${body}${footer}`;
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

/**
 * Import catatan dari file JSON yang dikirimkan oleh teman
 */
export async function pickAndImportNoteFromJson(): Promise<{ success: boolean; note?: Partial<StudyNote>; message?: string }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/json', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: 'Pemilihan file dibatalkan.' };
    }

    const asset = result.assets[0];
    let fileContent = '';

    if (Platform.OS === 'web') {
      const response = await fetch(asset.uri);
      fileContent = await response.text();
    } else {
      fileContent = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    const parsed = JSON.parse(fileContent);

    // Cek struktur payload
    const noteData = parsed.note || parsed;

    if (!noteData.title && !noteData.content) {
      return {
        success: false,
        message: 'Format file JSON tidak valid. Pastikan file berasal dari aplikasi StudyBot AI.',
      };
    }

    const importedNote: Partial<StudyNote> = {
      title: noteData.title || asset.name.replace(/\.json$/i, '') || 'Catatan Impor',
      subject: noteData.subject || 'Umum',
      content: noteData.content || '',
      summary: noteData.summary || null,
      quiz_data: Array.isArray(noteData.quiz_data) ? noteData.quiz_data : [],
      flashcards: Array.isArray(noteData.flashcards) ? noteData.flashcards : [],
    };

    return {
      success: true,
      note: importedNote,
      message: `Catatan "${importedNote.title}" berhasil diimpor!`,
    };
  } catch (err: any) {
    console.error('Error importing JSON note:', err);
    return {
      success: false,
      message: err.message || 'Gagal membaca isi file JSON.',
    };
  }
}
