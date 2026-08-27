import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { NoteAttachment } from '../types';
import { compressImage } from './imageCompressor';
import { processPickedFile } from './fileReader';
import { showAlert } from './alert';

function generateAttachmentId(): string {
  return 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * Pick multiple photos from the media library at once
 */
export async function pickMultipleImages(): Promise<NoteAttachment[]> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return [];
    }

    const attachments: NoteAttachment[] = [];

    for (const asset of res.assets) {
      try {
        const compressedUri = await compressImage(asset.uri, { maxWidth: 1000, quality: 0.6 });
        attachments.push({
          id: generateAttachmentId(),
          name: asset.fileName || 'Foto_' + Date.now() + '.jpg',
          type: 'image',
          uri: compressedUri,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      } catch (err) {
        // Fallback without compression
        attachments.push({
          id: generateAttachmentId(),
          name: asset.fileName || 'Foto_' + Date.now() + '.jpg',
          type: 'image',
          uri: asset.uri,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    }

    return attachments;
  } catch (e: any) {
    showAlert('Gagal Memilih Foto', e?.message || 'Terjadi kesalahan saat membuka galeri foto.');
    return [];
  }
}

/**
 * Take a photo with camera
 */
export async function takePhotoCamera(): Promise<NoteAttachment | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Izin Ditolak', 'Izin kamera diperlukan untuk mengambil foto.');
      return null;
    }

    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return null;
    }

    const asset = res.assets[0];
    const compressedUri = await compressImage(asset.uri, { maxWidth: 1000, quality: 0.6 });

    return {
      id: generateAttachmentId(),
      name: 'Kamera_' + Date.now() + '.jpg',
      type: 'image',
      uri: compressedUri,
      size: asset.fileSize,
      mimeType: 'image/jpeg',
    };
  } catch (e: any) {
    showAlert('Gagal Mengambil Foto', e?.message || 'Terjadi kesalahan saat membuka kamera.');
    return null;
  }
}

/**
 * Pick multiple document files (PDF, Word, TXT, Excel, Code, etc.) at once
 */
export async function pickMultipleDocuments(): Promise<NoteAttachment[]> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return [];
    }

    const attachments: NoteAttachment[] = [];

    for (const file of res.assets) {
      try {
        const processed = await processPickedFile(file);
        attachments.push({
          id: generateAttachmentId(),
          name: file.name || 'Dokumen',
          type: processed.type === 'image' ? 'image' : 'document',
          uri: file.uri,
          size: file.size,
          mimeType: processed.mimeType,
          textContent: processed.textContent,
        });
      } catch (err) {
        attachments.push({
          id: generateAttachmentId(),
          name: file.name || 'Dokumen',
          type: 'document',
          uri: file.uri,
          size: file.size,
          mimeType: file.mimeType,
        });
      }
    }

    return attachments;
  } catch (e: any) {
    showAlert('Gagal Memilih Dokumen', e?.message || 'Terjadi kesalahan saat memilih dokumen.');
    return [];
  }
}

/**
 * Format file size into readable KB / MB
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'File';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
