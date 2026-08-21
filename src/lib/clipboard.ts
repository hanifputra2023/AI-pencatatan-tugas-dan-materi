import { Platform } from 'react-native';

/**
 * Universally copy text to clipboard across Web, iOS, Android, and all browsers
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try expo-clipboard if installed
  try {
    const ExpoClipboard = require('expo-clipboard');
    if (ExpoClipboard && typeof ExpoClipboard.setStringAsync === 'function') {
      await ExpoClipboard.setStringAsync(text);
      return true;
    }
    if (ExpoClipboard && typeof ExpoClipboard.setString === 'function') {
      ExpoClipboard.setString(text);
      return true;
    }
  } catch (e) {
    // expo-clipboard not installed or failed, continue with fallbacks
  }

  // 2. Web navigator.clipboard
  if (Platform.OS === 'web' || typeof window !== 'undefined') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.log('navigator.clipboard failed, attempting fallback textarea copy:', e);
    }

    // 3. Web document.execCommand('copy') fallback (works in iframe / non-https / older browsers)
    try {
      if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) return true;
      }
    } catch (err) {
      console.log('execCommand copy failed:', err);
    }
  }

  return false;
}
