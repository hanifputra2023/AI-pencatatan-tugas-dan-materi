import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressOptions {
  maxWidth?: number;
  quality?: number; // 0.0 - 1.0
}

/**
 * Kompresi gambar di Web menggunakan HTML5 Canvas (100% native browser, tanpa dependensi)
 */
function compressImageWeb(
  uri: string,
  maxWidth: number,
  quality: number
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      return resolve(uri);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(uri);
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = () => {
      resolve(uri);
    };
    img.src = uri;
  });
}

/**
 * Mengompresi dan me-resize gambar secara ekstrem sebelum disimpan / di-upload
 * Contoh: Foto kamera 10MB (4000x3000px) -> Menjadi ~40KB - 80KB (800px)
 */
export async function compressImage(
  uri: string,
  options: CompressOptions = {}
): Promise<string> {
  const { maxWidth = 800, quality = 0.55 } = options;

  if (!uri) return uri;

  try {
    if (Platform.OS === 'web') {
      return await compressImageWeb(uri, maxWidth, quality);
    }

    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return manipResult.uri;
  } catch (error) {
    console.warn('Image compression fallback to original:', error);
    return uri;
  }
}
