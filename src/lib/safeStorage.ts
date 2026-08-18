import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, ChatSession } from '../types';

/**
 * Clean and lightweight sanitizer for chat messages before saving to local browser storage.
 * Strips heavy base64 data strings and caps count to the most recent 25 messages.
 */
function sanitizeMessagesForStorage(messages: ChatMessage[]): any[] {
  const recent = messages.slice(-25);
  return recent.map(msg => ({
    id: msg.id,
    session_id: msg.session_id,
    user_id: msg.user_id,
    role: msg.role,
    content: typeof msg.content === 'string' && msg.content.length > 4000 ? msg.content.substring(0, 4000) + '...' : msg.content,
    created_at: msg.created_at,
    attachment: msg.attachment ? {
      type: msg.attachment.type,
      name: msg.attachment.name,
      size: msg.attachment.size,
      mimeType: msg.attachment.mimeType,
      // Strip massive base64 file data from local storage
      uri: msg.attachment.uri && msg.attachment.uri.startsWith('data:') ? '' : msg.attachment.uri,
    } : null,
  }));
}

/**
 * Free up browser localStorage by pruning old cached chat sessions if quota is tight
 */
async function pruneOldChatCache() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const chatMsgKeys = allKeys.filter(k => k.startsWith('@chat_msgs_'));
    // If more than 4 chat message caches exist, delete older ones
    if (chatMsgKeys.length > 4) {
      const keysToRemove = chatMsgKeys.slice(0, chatMsgKeys.length - 2);
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (e) {
    // Ignore prune errors
  }
}

/**
 * Safe wrapper to save chat messages without exceeding browser quota
 */
export async function safeSaveChatMessages(userId: string, sessionId: string, messages: ChatMessage[]) {
  if (!userId || !sessionId || !messages) return;
  const key = `@chat_msgs_${userId}_${sessionId}`;
  const sanitized = sanitizeMessagesForStorage(messages);
  const jsonString = JSON.stringify(sanitized);

  try {
    await AsyncStorage.setItem(key, jsonString);
  } catch (err: any) {
    // Quota exceeded: prune old keys and retry once
    try {
      await pruneOldChatCache();
      const ultraTrimmed = JSON.stringify(sanitized.slice(-10));
      await AsyncStorage.setItem(key, ultraTrimmed);
    } catch (finalErr) {
      console.warn('Storage quota reached, skipped local chat cache:', finalErr);
    }
  }
}

/**
 * Safe wrapper to save session list
 */
export async function safeSaveSessions(userId: string, sessions: ChatSession[]) {
  if (!userId || !sessions) return;
  const key = `@chat_sessions_${userId}`;
  try {
    const trimmed = sessions.slice(0, 25);
    await AsyncStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    try {
      await pruneOldChatCache();
      await AsyncStorage.setItem(key, JSON.stringify(sessions.slice(0, 10)));
    } catch (e) {
      console.warn('Storage quota reached, skipped session cache');
    }
  }
}

/**
 * Safe cache remover
 */
export async function safeRemoveChatCache(userId: string, sessionId: string) {
  try {
    await AsyncStorage.removeItem(`@chat_msgs_${userId}_${sessionId}`);
  } catch (e) {}
}
