import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { StudyNote, StudentTask, TaskSubtask } from '../types';
import { showAlert } from './alert';

/**
 * Robust, AST-like Markdown to HTML Converter for High-Quality Multi-Page PDF & Print Rendering
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  let inList: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableRows: string[] = [];

  const flushList = () => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<table class="doc-table">';
      tableRows.forEach((rowStr, rIdx) => {
        // Strip leading & trailing pipe
        const cleaned = rowStr.trim().replace(/^\|/, '').replace(/\|$/, '');
        const cells = cleaned.split('|').map(c => c.trim());
        
        // Skip separator row (e.g. |---|---|)
        if (cells.every(c => /^[-:]+$/.test(c))) {
          return;
        }

        if (rIdx === 0) {
          tableHtml += '<thead><tr>' + cells.map(c => `<th>${formatInline(c)}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td>${formatInline(c)}</td>`).join('') + '</tr>';
        }
      });
      tableHtml += '</tbody></table>';
      output.push(tableHtml);
      inTable = false;
      tableRows = [];
    }
  };

  const formatInline = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold & Italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/___(.*?)___/g, '<strong><em>$1</em></strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Strikethrough
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      // Inline Code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Highlight mark
      .replace(/==(.*?)==/g, '<mark>$1</mark>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Code Block handler
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        output.push(`<pre class="code-block" data-lang="${codeBlockLang}"><code>${codeBlockContent.join('\n')}</code></pre>`);
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockContent = [];
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.substring(3).trim() || 'text';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(
        line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      );
      continue;
    }

    // 2. Table detection (lines starting with | and containing |)
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      flushList();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 3. Headings
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^(#{1,6})/)?.[0].length || 1;
      const text = trimmed.replace(/^#{1,6}\s+/, '');
      output.push(`<h${level}>${formatInline(text)}</h${level}>`);
      continue;
    }

    // 4. Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      flushList();
      output.push('<hr class="doc-divider" />');
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith('>')) {
      flushList();
      const quoteText = trimmed.replace(/^>\s?/, '');
      output.push(`<blockquote>${formatInline(quoteText)}</blockquote>`);
      continue;
    }

    // 6. Unordered List
    if (/^[-*+]\s+/.test(trimmed)) {
      if (inList !== 'ul') {
        flushList();
        inList = 'ul';
        output.push('<ul>');
      }
      const itemText = trimmed.replace(/^[-*+]\s+/, '');
      output.push(`<li>${formatInline(itemText)}</li>`);
      continue;
    }

    // 7. Ordered List
    if (/^\d+\.\s+/.test(trimmed)) {
      if (inList !== 'ol') {
        flushList();
        inList = 'ol';
        output.push('<ol>');
      }
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      output.push(`<li>${formatInline(itemText)}</li>`);
      continue;
    }

    // Blank line
    if (!trimmed) {
      flushList();
      continue;
    }

    // 8. Regular Paragraph
    flushList();
    output.push(`<p>${formatInline(trimmed)}</p>`);
  }

  flushList();
  flushTable();

  return output.join('\n');
}

/**
 * Premium, High-Resolution Print Stylesheet Optimized for Multi-Page Documents
 */
const BASE_CSS = `
  @page {
    size: A4 portrait;
    margin: 16mm 14mm 18mm 14mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1E293B;
    background-color: #FFFFFF;
    line-height: 1.65;
    font-size: 13px;
    padding: 0;
    margin: 0;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  
  /* Header Document */
  .header-card {
    border-bottom: 2px solid #2563EB;
    padding-bottom: 14px;
    margin-bottom: 20px;
    page-break-after: avoid;
    break-after: avoid;
  }
  .app-branding {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .app-name {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #2563EB;
  }
  .doc-date {
    font-size: 11px;
    color: #64748B;
    font-weight: 500;
  }
  .doc-title {
    font-size: 22px;
    font-weight: 800;
    color: #0F172A;
    margin: 6px 0 10px 0;
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
    font-weight: 700;
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
    background-color: #F8FAFC;
    color: #475569;
    border: 1px solid #E2E8F0;
  }
  
  /* Typography & Multi-Page Rules */
  h1, h2, h3, h4, h5, h6 {
    color: #0F172A;
    margin-top: 22px;
    margin-bottom: 8px;
    font-weight: 800;
    page-break-after: avoid;
    break-after: avoid;
    line-height: 1.35;
  }
  h1 { font-size: 18px; border-bottom: 1.5px solid #E2E8F0; padding-bottom: 6px; }
  h2 { font-size: 15.5px; border-bottom: 1px solid #F1F5F9; padding-bottom: 4px; }
  h3 { font-size: 14px; }
  h4 { font-size: 13px; }
  p {
    margin: 8px 0;
    orphans: 3;
    widows: 3;
    line-height: 1.65;
  }
  ul, ol {
    margin: 8px 0;
    padding-left: 22px;
    orphans: 3;
    widows: 3;
  }
  li {
    margin-bottom: 4px;
    line-height: 1.6;
  }
  blockquote {
    border-left: 3.5px solid #3B82F6;
    padding: 10px 14px;
    margin: 12px 0;
    color: #334155;
    background-color: #F8FAFC;
    border-radius: 0 8px 8px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .code-block {
    background-color: #0F172A;
    color: #F8FAFC;
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11.5px;
    line-height: 1.5;
    margin: 12px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  code {
    background-color: #F1F5F9;
    color: #0F172A;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    border: 1px solid #E2E8F0;
  }
  .doc-divider {
    border: none;
    border-top: 1px solid #E2E8F0;
    margin: 20px 0;
  }
  mark {
    background-color: #FEF08A;
    padding: 2px 4px;
    border-radius: 3px;
  }

  /* Tables */
  table.doc-table, table.table-schedule {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    page-break-inside: auto;
    break-inside: auto;
    font-size: 12px;
  }
  table.doc-table th, table.doc-table td,
  table.table-schedule th, table.table-schedule td {
    border: 1px solid #CBD5E1;
    padding: 8px 10px;
    text-align: left;
  }
  table.doc-table thead, table.table-schedule thead {
    display: table-header-group;
    background-color: #F1F5F9;
    font-weight: 700;
    color: #0F172A;
  }
  table.doc-table tr, table.table-schedule tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table.doc-table tbody tr:nth-child(even), table.table-schedule tbody tr:nth-child(even) {
    background-color: #F8FAFC;
  }

  /* Section Cards & Box Items */
  .section-card {
    background-color: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-top: 16px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .section-title {
    font-size: 13px;
    font-weight: 800;
    color: #1E293B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .subtask-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px dashed #E2E8F0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .subtask-item:last-child {
    border-bottom: none;
  }
  .checkbox-box {
    width: 15px;
    height: 15px;
    border: 1.5px solid #64748B;
    border-radius: 4px;
    margin-top: 2px;
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

  /* Quiz Box */
  .quiz-box {
    background-color: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .quiz-q {
    font-weight: 800;
    color: #0F172A;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .quiz-option {
    padding: 3px 0 3px 14px;
    font-size: 12.5px;
    color: #334155;
  }
  .quiz-answer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #CBD5E1;
    font-size: 12px;
    font-weight: 700;
    color: #059669;
  }

  /* Multi-Page Separation */
  .page-break {
    page-break-before: always;
    break-before: page;
  }

  /* Footer */
  .footer-note {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #E2E8F0;
    font-size: 10.5px;
    color: #94A3B8;
    display: flex;
    justify-content: space-between;
    page-break-inside: avoid;
    break-inside: avoid;
  }
`;

/**
 * Handle print or share action gracefully across Native & Web
 */
async function processHtmlDocument(html: string, documentName: string): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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

    // Android / iOS native export & share
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
      <div class="section-card">
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
            <span class="badge badge-status">Penulis: ${username}</span>
          </div>
        </div>

        <div class="note-content">
          ${contentHtml}
        </div>

        ${quizHtml}

        <div class="footer-note">
          <span>Dicetak otomatis dari Aplikasi StudyBot AI</span>
          <span>Dokumen Materi Kuliah</span>
        </div>
      </body>
    </html>
  `;

  await processHtmlDocument(html, `Catatan_${note.title.replace(/[^a-zA-Z0-9]/g, '_')}`);
}

/**
 * Export Multiple Study Notes into a Comprehensive PDF Booklet / Modul Belajar
 */
export async function exportMultipleNotesToPdf(
  notes: StudyNote[],
  subjectFilter = 'Semua Mata Kuliah',
  username = 'Mahasiswa'
): Promise<void> {
  if (!notes || notes.length === 0) {
    showAlert('Perhatian', 'Tidak ada catatan materi untuk diekspor.');
    return;
  }

  const formattedDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const totalQuizzes = notes.reduce((acc, n) => acc + (n.quiz_data?.length || 0), 0);

  // 1. Table of contents rows
  const tocRows = notes.map((n, idx) => `
    <tr>
      <td style="text-align: center; width: 35px;"><strong>${idx + 1}</strong></td>
      <td><strong>${n.title}</strong></td>
      <td><span class="badge badge-subject">${n.subject || 'Umum'}</span></td>
      <td style="text-align: center;">${(n.content || '').split(/\s+/).filter(Boolean).length} kata</td>
      <td style="text-align: center;">${n.quiz_data?.length || 0} Soal</td>
    </tr>
  `).join('');

  // 2. Note chapters with clean page breaks
  const noteChaptersHtml = notes.map((note, idx) => {
    const noteDate = new Date(note.created_at || new Date()).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const contentHtml = markdownToHtml(note.content || 'Belum ada isi materi.');

    let quizHtml = '';
    if (note.quiz_data && note.quiz_data.length > 0) {
      quizHtml = `
        <div class="section-card">
          <div class="section-title">📝 Kuis Bab ${idx + 1} (${note.quiz_data.length} Soal)</div>
          ${note.quiz_data.map((q, qIdx) => `
            <div class="quiz-box">
              <div class="quiz-q">${qIdx + 1}. ${q.question}</div>
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

    return `
      <div class="page-break">
        <div class="header-card">
          <div class="app-branding">
            <span class="app-name">📚 Bab ${idx + 1} • ${note.subject || 'Materi Kuliah'}</span>
            <span class="doc-date">${noteDate}</span>
          </div>
          <div class="doc-title">${note.title}</div>
          <div class="badge-row">
            <span class="badge badge-subject">${note.subject || 'Umum'}</span>
            <span class="badge badge-status">Bab ${idx + 1} dari ${notes.length}</span>
          </div>
        </div>

        <div class="note-content">
          ${contentHtml}
        </div>

        ${quizHtml}

        <div class="footer-note">
          <span>StudyBot AI • Rekap Modul Belajar</span>
          <span>Bab ${idx + 1} / ${notes.length}</span>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Rekap Modul Materi Kuliah - ${subjectFilter}</title>
        <style>${BASE_CSS}</style>
      </head>
      <body>
        <!-- COVER / EXECUTIVE SUMMARY PAGE -->
        <div class="header-card" style="padding-bottom: 24px;">
          <div class="app-branding">
            <span class="app-name">📚 StudyBot AI • Buku Kumpulan Materi Kuliah</span>
            <span class="doc-date">${formattedDate}</span>
          </div>
          <div class="doc-title" style="font-size: 26px;">Rekapitulasi Catatan & Modul Belajar</div>
          <div class="badge-row" style="margin-top: 10px;">
            <span class="badge badge-subject">Kategori: ${subjectFilter}</span>
            <span class="badge badge-status">Penyusun: ${username}</span>
            <span class="badge badge-status">Total: ${notes.length} Materi Bab</span>
            <span class="badge badge-priority-low">Total Kuis: ${totalQuizzes} Soal</span>
          </div>
        </div>

        <h2>📖 Daftar Isi & Rangkuman Bab</h2>
        <table class="doc-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Judul Materi Bab</th>
              <th>Mata Kuliah</th>
              <th>Panjang</th>
              <th>Latihan Kuis</th>
            </tr>
          </thead>
          <tbody>
            ${tocRows}
          </tbody>
        </table>

        <div class="footer-note">
          <span>Dicetak otomatis dari Aplikasi StudyBot AI</span>
          <span>Halaman Ringkasan & Daftar Isi</span>
        </div>

        <!-- NOTE CHAPTERS -->
        ${noteChaptersHtml}
      </body>
    </html>
  `;

  await processHtmlDocument(html, `Rekap_Materi_${subjectFilter.replace(/[^a-zA-Z0-9]/g, '_')}`);
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
    : '<p style="color: #94A3B8; font-style: italic;">Lembar kerja belum diisi.</p>';

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
            <div style="flex: 1; ${s.is_completed ? 'text-decoration: line-through; color: #94A3B8;' : ''}">
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
        <td style="color: ${prioColor}; font-weight: 700;">${prioLabel}</td>
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
