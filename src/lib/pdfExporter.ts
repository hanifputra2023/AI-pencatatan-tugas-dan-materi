import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { StudyNote, StudentTask, TaskSubtask } from '../types';
import { showAlert } from './alert';

/**
 * Basic markdown to HTML converter for crisp document styling
 */
function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md
    // Escape HTML special characters
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold & Italic
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Blockquote
    .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
    // Code blocks
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    // Unordered lists
    .replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ordered">$1</li>')
    // Line breaks
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br/>');

  return `<p>${html}</p>`;
}

const BASE_CSS = `
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
  * {
    box-sizing: border-box;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1F2937;
    background-color: #FFFFFF;
    line-height: 1.6;
    font-size: 13.5px;
    padding: 0;
    margin: 0;
  }
  .header-card {
    border-bottom: 2px solid #3B82F6;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .app-branding {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .app-name {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #2563EB;
  }
  .doc-date {
    font-size: 11px;
    color: #6B7280;
  }
  .doc-title {
    font-size: 22px;
    font-weight: 800;
    color: #111827;
    margin: 4px 0 8px 0;
    line-height: 1.3;
  }
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge-subject {
    background-color: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #BFDBFE;
  }
  .badge-priority-high {
    background-color: #FEF2F2;
    color: #DC2626;
    border: 1px solid #FECACA;
  }
  .badge-priority-medium {
    background-color: #FFFBEB;
    color: #D97706;
    border: 1px solid #FDE68A;
  }
  .badge-priority-low {
    background-color: #F0FDF4;
    color: #16A34A;
    border: 1px solid #DCFCE7;
  }
  .badge-status {
    background-color: #F3F4F6;
    color: #4B5563;
    border: 1px solid #E5E7EB;
  }
  h1, h2, h3 {
    color: #111827;
    margin-top: 20px;
    margin-bottom: 8px;
    font-weight: 700;
  }
  h1 { font-size: 18px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
  h2 { font-size: 15px; }
  h3 { font-size: 14px; }
  p { margin: 8px 0; }
  ul, ol {
    margin: 8px 0;
    padding-left: 20px;
  }
  li { margin-bottom: 4px; }
  blockquote {
    border-left: 3px solid #3B82F6;
    padding-left: 12px;
    margin: 12px 0;
    color: #4B5563;
    font-style: italic;
    background-color: #F8FAFC;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
  }
  pre {
    background-color: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 6px;
    padding: 10px;
    overflow-x: auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
  }
  code {
    background-color: #F3F4F6;
    padding: 2px 4px;
    border-radius: 4px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
  }
  .section-card {
    background-color: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    padding: 14px 16px;
    margin-top: 18px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .subtask-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px dashed #E5E7EB;
  }
  .subtask-item:last-child {
    border-bottom: none;
  }
  .checkbox-box {
    width: 14px;
    height: 14px;
    border: 1.5px solid #6B7280;
    border-radius: 3px;
    margin-top: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
  }
  .checkbox-checked {
    background-color: #10B981;
    border-color: #10B981;
    color: #FFFFFF;
  }
  .quiz-box {
    background-color: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .quiz-q {
    font-weight: 700;
    color: #1E293B;
    margin-bottom: 6px;
  }
  .quiz-option {
    padding: 3px 0 3px 18px;
    font-size: 12.5px;
    color: #475569;
  }
  .quiz-answer {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed #CBD5E1;
    font-size: 12px;
    font-weight: 600;
    color: #059669;
  }
  .footer-note {
    margin-top: 30px;
    padding-top: 12px;
    border-top: 1px solid #E5E7EB;
    font-size: 10.5px;
    color: #9CA3AF;
    display: flex;
    justify-content: space-between;
  }
  .table-schedule {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
  }
  .table-schedule th, .table-schedule td {
    border: 1px solid #E5E7EB;
    padding: 8px 10px;
    text-align: left;
    font-size: 12px;
  }
  .table-schedule th {
    background-color: #F8FAFC;
    font-weight: 700;
    color: #374151;
  }
`;

/**
 * Handle print or share action gracefully across Native & Web
 */
async function processHtmlDocument(html: string, documentName: string): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Create an isolated hidden iframe for printing ONLY the document content without UI buttons/tabs
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        // Allow document to render styles before invoking print dialog
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error('Iframe print error:', err);
          } finally {
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch (e) {}
            }, 1500);
          }
        }, 300);
      }
      return;
    }

    // On Android / iOS, create isolated PDF file and trigger Native Share Dialog
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Cetak / Bagikan ${documentName}`,
      });
    } else {
      await Print.printAsync({ html });
    }
  } catch (e: any) {
    console.error('Error generating PDF:', e);
    showAlert('Gagal Mengekspor PDF', e?.message || 'Terjadi kesalahan saat memproses dokumen PDF.');
  }
}

/**
 * Export a Single Study Note to PDF
 */
export async function exportStudyNoteToPdf(note: StudyNote, username = 'Mahasiswa'): Promise<void> {
  const formattedDate = new Date(note.created_at || new Date()).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const contentHtml = markdownToHtml(note.content || 'Belum ada isi catatan.');

  let quizHtml = '';
  if (note.quiz_data && note.quiz_data.length > 0) {
    quizHtml = `
      <div class="section-card" style="page-break-before: auto;">
        <div class="section-title">📝 Kuis & Latihan Pemahaman (${note.quiz_data.length} Soal)</div>
        ${note.quiz_data.map((q, idx) => `
          <div class="quiz-box">
            <div class="quiz-q">${idx + 1}. ${q.question}</div>
            ${q.options.map((opt, oIdx) => {
              const letter = String.fromCharCode(65 + oIdx);
              return `<div class="quiz-option"><strong>${letter}.</strong> ${opt}</div>`;
            }).join('')}
            <div class="quiz-answer">
              ✓ Kunci Jawaban: <strong>${String.fromCharCode(65 + (q.correctIndex || 0))}. ${q.options[q.correctIndex || 0] || ''}</strong>
              ${q.explanation ? `<br/><span style="color: #64748B; font-weight: normal;">Penjelasan: ${q.explanation}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${note.title}</title>
        <style>${BASE_CSS}</style>
      </head>
      <body>
        <div class="header-card">
          <div class="app-branding">
            <span class="app-name">📚 StudyBot AI • Catatan Materi Kuliah</span>
            <span class="doc-date">${formattedDate}</span>
          </div>
          <div class="doc-title">${note.title}</div>
          <div class="badge-row">
            <span class="badge badge-subject">Mata Kuliah: ${note.subject || 'Umum'}</span>
            <span class="badge badge-status">Oleh: ${username}</span>
          </div>
        </div>

        <div class="note-content">
          ${contentHtml}
        </div>

        ${quizHtml}

        <div class="footer-note">
          <span>Dicetak otomatis dari Aplikasi StudyBot AI</span>
          <span>Halaman 1</span>
        </div>
      </body>
    </html>
  `;

  await processHtmlDocument(html, `Catatan_${note.title.replace(/[^a-zA-Z0-9]/g, '_')}`);
}

/**
 * Export a Single Task with Workpad & Subtasks to PDF
 */
export async function exportTaskToPdf(
  task: StudentTask,
  subtasks: TaskSubtask[] = [],
  workpadText?: string,
  username = 'Mahasiswa'
): Promise<void> {
  const formattedCreated = new Date(task.created_at || new Date()).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedDueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Tidak ada tenggat waktu';

  const priorityClass =
    task.priority === 'high'
      ? 'badge-priority-high'
      : task.priority === 'medium'
      ? 'badge-priority-medium'
      : 'badge-priority-low';

  const priorityLabel =
    task.priority === 'high' ? 'Mendesak' : task.priority === 'medium' ? 'Sedang' : 'Santai';

  const workpadBody = workpadText || task.notes || '';
  const workpadHtml = workpadBody
    ? markdownToHtml(workpadBody)
    : '<p style="color: #9CA3AF; font-style: italic;">Lembar kerja belum diisi.</p>';

  let subtasksHtml = '';
  if (subtasks.length > 0) {
    subtasksHtml = `
      <div class="section-card">
        <div class="section-title">📌 Rincian Langkah Pengerjaan (${subtasks.filter(s => s.is_completed).length}/${subtasks.length} Selesai)</div>
        ${subtasks.map((s, idx) => `
          <div class="subtask-item">
            <div class="checkbox-box ${s.is_completed ? 'checkbox-checked' : ''}">
              ${s.is_completed ? '✓' : ''}
            </div>
            <div style="flex: 1; ${s.is_completed ? 'text-decoration: line-through; color: #9CA3AF;' : ''}">
              <strong>Langkah ${idx + 1}:</strong> ${s.title}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Tugas - ${task.title}</title>
        <style>${BASE_CSS}</style>
      </head>
      <body>
        <div class="header-card">
          <div class="app-branding">
            <span class="app-name">✍️ StudyBot AI • Lembar Kerja & Tugas Kuliah</span>
            <span class="doc-date">Dibuat: ${formattedCreated}</span>
          </div>
          <div class="doc-title">${task.title}</div>
          <div class="badge-row">
            <span class="badge badge-subject">Mata Kuliah: ${task.subject}</span>
            <span class="badge ${priorityClass}">Prioritas: ${priorityLabel}</span>
            <span class="badge badge-status">Deadline: ${formattedDueDate}</span>
            <span class="badge badge-status">Status: ${task.is_completed ? '✓ Selesai' : '⏳ Belum Selesai'}</span>
          </div>
        </div>

        ${subtasksHtml}

        <div class="section-card">
          <div class="section-title">📝 Lembar Kerja Jawaban / Catatan Pengerjaan</div>
          ${workpadHtml}
        </div>

        <div class="footer-note">
          <span>Dicetak otomatis dari Aplikasi StudyBot AI • Mahasiswa: ${username}</span>
          <span>Dokumen Pengerjaan Tugas</span>
        </div>
      </body>
    </html>
  `;

  await processHtmlDocument(html, `Tugas_${task.title.replace(/[^a-zA-Z0-9]/g, '_')}`);
}

/**
 * Export All Tasks Summary to PDF (Schedule & Checklist Sheet)
 */
export async function exportAllTasksSummaryToPdf(tasks: StudentTask[], username = 'Mahasiswa'): Promise<void> {
  const formattedDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const completedCount = tasks.filter(t => t.is_completed).length;

  const rowsHtml = tasks.map((t, idx) => {
    const dueStr = t.due_date
      ? new Date(t.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '-';

    const prioLabel = t.priority === 'high' ? 'Mendesak' : t.priority === 'medium' ? 'Sedang' : 'Santai';
    const prioColor = t.priority === 'high' ? '#DC2626' : t.priority === 'medium' ? '#D97706' : '#16A34A';

    return `
      <tr>
        <td style="text-align: center; width: 30px;">${idx + 1}</td>
        <td style="text-align: center; width: 40px;">
          <div class="checkbox-box ${t.is_completed ? 'checkbox-checked' : ''}" style="margin: auto;">
            ${t.is_completed ? '✓' : ''}
          </div>
        </td>
        <td><strong>${t.title}</strong></td>
        <td>${t.subject}</td>
        <td style="color: ${prioColor}; font-weight: 600;">${prioLabel}</td>
        <td>${dueStr}</td>
        <td>${t.is_completed ? '<span style="color: #10B981; font-weight: bold;">Selesai</span>' : '<span style="color: #D97706;">Pending</span>'}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Daftar Tugas Kuliah</title>
        <style>${BASE_CSS}</style>
      </head>
      <body>
        <div class="header-card">
          <div class="app-branding">
            <span class="app-name">📋 StudyBot AI • Lembar Jadwal & Checklist Tugas Kuliah</span>
            <span class="doc-date">${formattedDate}</span>
          </div>
          <div class="doc-title">Rekapitulasi Tugas & Target Belajar</div>
          <div class="badge-row">
            <span class="badge badge-subject">Mahasiswa: ${username}</span>
            <span class="badge badge-status">Total: ${tasks.length} Tugas (${completedCount} Selesai)</span>
          </div>
        </div>

        <table class="table-schedule">
          <thead>
            <tr>
              <th>No</th>
              <th>Status</th>
              <th>Nama Tugas</th>
              <th>Mata Kuliah</th>
              <th>Prioritas</th>
              <th>Deadline</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer-note">
          <span>Dicetak otomatis dari Aplikasi StudyBot AI</span>
          <span>Daftar Checklist Akademik</span>
        </div>
      </body>
    </html>
  `;

  await processHtmlDocument(html, `Jadwal_Tugas_Kuliah_${new Date().toISOString().split('T')[0]}`);
}
