import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ChatAttachment } from '../types';

/**
 * Supported text & code file extensions
 */
export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
  'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart',
  'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'env', 'ini', 'conf', 'config',
  'log', 'rtf', 'tex', 'svg', 'vtt', 'srt'
]);

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toLowerCase();
}

export function isTextFile(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (mimeType) {
    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('xml') ||
      mimeType.includes('javascript') ||
      mimeType.includes('typescript') ||
      mimeType.includes('csv')
    ) {
      return true;
    }
  }
  return false;
}

export function isPdfFile(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  return ext === 'pdf' || mimeType === 'application/pdf';
}

export function isDocxFile(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  return ext === 'docx' || ext === 'doc' || (mimeType ? mimeType.includes('word') || mimeType.includes('officedocument') : false);
}

/**
 * Read text content from a file URI (Web & Mobile Native)
 */
export async function readTextFileContent(uri: string): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      return await response.text();
    }
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    console.warn('Failed to read text file directly:', error);
    // Fallback if needed
    return '';
  }
}

/**
 * Convert any file URI to Base64
 */
export async function uriToBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    return uri.split(',')[1] || '';
  }
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Extract clean readable text from docx/office files or raw string contents
 */
export function extractTextFromDocxRaw(rawString: string): string {
  // If the raw content contains XML w:t elements (from DOCX archive)
  const xmlTextMatches = rawString.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  if (xmlTextMatches && xmlTextMatches.length > 0) {
    return xmlTextMatches
      .map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Otherwise filter non-printable characters for general text dumps
  const clean = rawString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Process an uploaded document asset and return a fully resolved ChatAttachment
 */
export async function processPickedFile(file: {
  uri: string;
  name?: string;
  size?: number;
  mimeType?: string;
}): Promise<ChatAttachment> {
  const fileName = file.name || 'Dokumen';
  const rawMime = file.mimeType || '';
  const ext = getFileExtension(fileName);

  // 1. Image Check
  if (rawMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    const base64 = await uriToBase64(file.uri);
    return {
      type: 'image',
      uri: file.uri,
      name: fileName,
      size: file.size,
      mimeType: rawMime || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      base64,
    };
  }

  // 2. Audio Check
  if (rawMime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'wma'].includes(ext)) {
    const base64 = await uriToBase64(file.uri);
    return {
      type: 'audio',
      uri: file.uri,
      name: fileName,
      size: file.size,
      mimeType: rawMime || `audio/${ext === 'm4a' ? 'mp4' : ext}`,
      base64,
    };
  }

  // 3. PDF Check
  if (isPdfFile(fileName, rawMime)) {
    const base64 = await uriToBase64(file.uri);
    return {
      type: 'document',
      uri: file.uri,
      name: fileName,
      size: file.size,
      mimeType: 'application/pdf',
      base64,
    };
  }

  // 4. Text & Code Files Check
  if (isTextFile(fileName, rawMime)) {
    const textContent = await readTextFileContent(file.uri);
    return {
      type: 'document',
      uri: file.uri,
      name: fileName,
      size: file.size,
      mimeType: rawMime || 'text/plain',
      textContent: textContent || undefined,
    };
  }

  // 5. DOCX / Office Check
  if (isDocxFile(fileName, rawMime)) {
    try {
      const rawText = await readTextFileContent(file.uri);
      const extractedText = extractTextFromDocxRaw(rawText);
      if (extractedText && extractedText.length > 20) {
        return {
          type: 'document',
          uri: file.uri,
          name: fileName,
          size: file.size,
          mimeType: rawMime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          textContent: extractedText,
        };
      }
    } catch (e) {
      console.warn('DOCX text extraction error, falling back to base64:', e);
    }
  }

  // 6. Generic File Fallback (Try reading text first, then base64)
  try {
    const rawContent = await readTextFileContent(file.uri);
    if (rawContent && rawContent.length > 0) {
      return {
        type: 'document',
        uri: file.uri,
        name: fileName,
        size: file.size,
        mimeType: rawMime || 'application/octet-stream',
        textContent: rawContent,
      };
    }
  } catch (e) {}

  const base64 = await uriToBase64(file.uri);
  return {
    type: 'document',
    uri: file.uri,
    name: fileName,
    size: file.size,
    mimeType: rawMime || 'application/octet-stream',
    base64,
  };
}
