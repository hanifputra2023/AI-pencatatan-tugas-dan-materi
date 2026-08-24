import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Image, Modal, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, GeminiMessage } from '../lib/gemini';
import { ChatMessage, ChatAttachment, ChatSession } from '../types';
import * as FileSystem from 'expo-file-system';
import { confirmAction, showAlert } from '../lib/alert';
import { safeSaveChatMessages, safeSaveSessions, safeRemoveChatCache } from '../lib/safeStorage';
import { copyToClipboard } from '../lib/clipboard';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { compressImage } from '../lib/imageCompressor';
import { isDeviceOnline } from '../lib/offlineSync';

async function uriToBase64(uri: string): Promise<string> {
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

const SUGGESTIONS = [
  'Hari ini lumayan melelahkan...',
  'Ada hal yang bikin overthinking tadi',
  'Bantu buat rencana belajar minggu ini',
  'Butuh sudut pandang lain soal masalah ini',
];

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { aiPersona, aiBotName, activePersona, customAiName, customAiAvatar } = useMoods();
  const effectiveBotName = customAiName || aiBotName || activePersona.botName || 'Ara';
  const { theme, isLightMode } = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  // Multi-Session & Message States
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('Obrolan Baru');
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Lazy Load Older Messages on Scroll Up
  const CHAT_PAGE_SIZE = 25;
  const [visibleMsgCount, setVisibleMsgCount] = useState(CHAT_PAGE_SIZE);

  const displayedMessages = useMemo(() => {
    if (messages.length <= visibleMsgCount) return messages;
    return messages.slice(messages.length - visibleMsgCount);
  }, [messages, visibleMsgCount]);

  const hasMoreOldMessages = messages.length > visibleMsgCount;

  const handleLoadMoreOldMessages = () => {
    setVisibleMsgCount(prev => Math.min(messages.length, prev + CHAT_PAGE_SIZE));
  };

  // Attachment state
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const scrollToBottom = useCallback((delay = 100) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  // -------------------------------------------------------------
  // Load Sessions List & Initialize Active Session
  // -------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    if (!user) {
      setInitializing(false);
      return;
    }
    setLoadingSessions(true);
    try {
      // 1. Read from local cache
      const localCached = await AsyncStorage.getItem('@chat_sessions_' + user.id);
      let sessionList: ChatSession[] = [];
      if (localCached) {
        sessionList = JSON.parse(localCached);
        setSessions(sessionList);
      }

      // Set active session if not set yet
      if (!currentSessionId) {
        if (sessionList.length > 0) {
          setCurrentSessionId(sessionList[0].id);
          setCurrentSessionTitle(sessionList[0].title || 'Sesi Obrolan');
        } else {
          const freshId = generateUUID();
          setCurrentSessionId(freshId);
          setCurrentSessionTitle('Obrolan Baru');
        }
      }
    } catch (e) {
      console.log('Error fetching local sessions:', e);
    } finally {
      setLoadingSessions(false);
    }
  }, [user, currentSessionId]);

  // -------------------------------------------------------------
  // Load Messages for Specific Session
  // -------------------------------------------------------------
  const fetchHistory = useCallback(async (sessionId: string) => {
    if (!user || !sessionId) {
      setInitializing(false);
      return;
    }
    setRefreshing(true);
    try {
      // Load from local cache
      const cachedMsgs = await AsyncStorage.getItem(`@chat_msgs_${user.id}_${sessionId}`);
      if (cachedMsgs) {
        try {
          setMessages(JSON.parse(cachedMsgs));
          scrollToBottom(150);
        } catch (e) { }
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.log('Error fetching local chat messages:', e);
    } finally {
      setInitializing(false);
      setRefreshing(false);
    }
  }, [user, scrollToBottom]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (currentSessionId) {
      fetchHistory(currentSessionId);
    }
  }, [currentSessionId, fetchHistory]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(100);
    }
  }, [messages.length, scrollToBottom]);

  // -------------------------------------------------------------
  // Multi-Session Controls: New Chat, Switch Session, Delete Session
  // -------------------------------------------------------------
  const handleStartNewChat = async () => {
    const newSessionId = generateUUID();
    const newTitle = 'Obrolan Baru';

    const newSessionItem: ChatSession = {
      id: newSessionId,
      user_id: user?.id || 'anonymous',
      title: newTitle,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSessions(prev => [newSessionItem, ...prev.filter(s => s.id !== newSessionId)]);
    setCurrentSessionId(newSessionId);
    setCurrentSessionTitle(newTitle);
    setMessages([]);
    setShowSessionDrawer(false);
    setInputText('');
    setAttachment(null);

    if (user) {
      const updatedList = [newSessionItem, ...sessions.filter(s => s.id !== newSessionId)];
      await safeSaveSessions(user.id, updatedList);
    }
  };

  const handleSelectSession = (s: ChatSession) => {
    setCurrentSessionId(s.id);
    setCurrentSessionTitle(s.title || 'Sesi Obrolan');
    setShowSessionDrawer(false);
    fetchHistory(s.id);
  };

  const handleDeleteSession = (sessionId: string, sessionTitle: string) => {
    confirmAction(
      'Hapus Sesi Percakapan?',
      `Seluruh riwayat pesan di sesi "${sessionTitle}" akan dihapus permanen.`,
      async () => {
        const updated = sessions.filter(s => s.id !== sessionId);
        setSessions(updated);

        if (user) {
          await safeSaveSessions(user.id, updated);
          await safeRemoveChatCache(user.id, sessionId);
        }

        if (currentSessionId === sessionId) {
          if (updated.length > 0) {
            handleSelectSession(updated[0]);
          } else {
            handleStartNewChat();
          }
        }
      },
      'Hapus'
    );
  };

  // -------------------------------------------------------------
  // Export Chat to Journal
  // -------------------------------------------------------------
  const handleExportToJournal = () => {
    setShowOptionsMenu(false);
    if (messages.length === 0) {
      showAlert('Belum Ada Percakapan', 'Mulai cerita dulu dengan AI sebelum mengekspor ke jurnal.');
      return;
    }

    const chatSummary = messages
      .map(m => `**${m.role === 'user' ? 'Aku' : (aiBotName || 'Ara')}**: ${m.content}`)
      .join('\n\n');

    navigation.navigate('JournalEntry', {
      initialTitle: `Refleksi: ${currentSessionTitle}`,
      initialContent: `Berikut rangkuman curhat dan wawasan hari ini:\n\n${chatSummary}`,
      initialMood: 'neutral',
    });
  };

  // -------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------
  const pickImage = async () => {
    setShowAttachMenu(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        const compressedUri = await compressImage(asset.uri, { maxWidth: 800, quality: 0.55 });
        const base64Data = await uriToBase64(compressedUri);
        setAttachment({
          type: 'image',
          uri: compressedUri,
          name: asset.fileName || 'Foto.jpg',
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
          base64: base64Data,
        });
      }
    } catch (e: any) {
      showAlert('Gagal Memilih Foto', e.message || 'Terjadi kesalahan saat memilih gambar.');
    }
  };

  const takePhoto = async () => {
    setShowAttachMenu(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Izin Ditolak', 'Izin kamera diperlukan untuk mengambil foto.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        const compressedUri = await compressImage(asset.uri, { maxWidth: 800, quality: 0.55 });
        const base64Data = await uriToBase64(compressedUri);
        setAttachment({
          type: 'image',
          uri: compressedUri,
          name: 'Kamera_' + Date.now() + '.jpg',
          size: asset.fileSize,
          mimeType: 'image/jpeg',
          base64: base64Data,
        });
      }
    } catch (e: any) {
      showAlert('Gagal Mengambil Foto', e.message || 'Terjadi kesalahan saat membuka kamera.');
    }
  };

  const pickAudio = async () => {
    setShowAttachMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        const base64Data = await uriToBase64(file.uri);
        setAttachment({
          type: 'audio',
          uri: file.uri,
          name: file.name || 'Audio.mp3',
          size: file.size,
          mimeType: file.mimeType || 'audio/mpeg',
          base64: base64Data,
        });
      }
    } catch (e: any) {
      showAlert('Gagal Memilih Audio', e.message || 'Terjadi kesalahan saat memilih audio.');
    }
  };

  const pickDocument = async () => {
    setShowAttachMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        const mime = file.mimeType || '';
        let attachType: ChatAttachment['type'] = 'document';
        if (mime.startsWith('image/')) attachType = 'image';
        else if (mime.startsWith('audio/')) attachType = 'audio';
        else if (mime === 'application/pdf') attachType = 'document';

        const needsBase64 = attachType === 'image' || attachType === 'audio' || mime === 'application/pdf';
        const base64Data = needsBase64 ? await uriToBase64(file.uri) : undefined;

        setAttachment({
          type: attachType,
          uri: file.uri,
          name: file.name || 'Dokumen',
          size: file.size,
          mimeType: mime,
          base64: base64Data,
        });
      }
    } catch (e: any) {
      showAlert('Gagal Memilih File', e.message || 'Terjadi kesalahan saat memilih file.');
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMsg(msg);
    setInputText(msg.content);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingMsg(null);
    setInputText('');
  };

  // -------------------------------------------------------------
  // Send Message Logic (With Auto-Naming & Session Persistence)
  // -------------------------------------------------------------
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if ((!text && !attachment) || loading) return;

    const online = await isDeviceOnline();
    if (!online) {
      setErrorToast('Mode Offline ☁️: Bot AI memerlukan koneksi internet untuk menjawab pesan.');
      return;
    }

    setErrorToast(null);
    const currentAttachment = attachment;
    setInputText('');
    setAttachment(null);

    const activeSessionId = currentSessionId || generateUUID();
    if (!currentSessionId) {
      setCurrentSessionId(activeSessionId);
    }

    // Auto-Name the session from first user message
    let activeTitle = currentSessionTitle;
    if (messages.length === 0 && (activeTitle === 'Obrolan Baru' || !activeTitle)) {
      const words = text.split(' ').slice(0, 5).join(' ');
      activeTitle = words ? (words.length > 28 ? words.substring(0, 28) + '...' : words) : 'Curhat Hari Ini';
      setCurrentSessionTitle(activeTitle);

      const updatedSessions = sessions.map(s => (s.id === activeSessionId ? { ...s, title: activeTitle } : s));
      if (!updatedSessions.some(s => s.id === activeSessionId)) {
        updatedSessions.unshift({
          id: activeSessionId,
          user_id: user?.id || 'anonymous',
          title: activeTitle,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      setSessions(updatedSessions);

      if (user) {
        await safeSaveSessions(user.id, updatedSessions);
        try {
          await supabase.from('chat_sessions').upsert({
            id: activeSessionId,
            user_id: user.id,
            title: activeTitle,
            updated_at: new Date().toISOString(),
          });
        } catch (e) { }
      }
    }

    // EDIT MODE
    if (editingMsg) {
      const targetId = editingMsg.id;
      setEditingMsg(null);
      setLoading(true);

      const targetIndex = messages.findIndex(m => m.id === targetId);
      const updatedMessages = [...messages];
      if (targetIndex !== -1) {
        updatedMessages[targetIndex] = { ...updatedMessages[targetIndex], content: text };
        setMessages(updatedMessages);
      }

      try {
        const priorMessages = targetIndex !== -1 ? messages.slice(0, targetIndex) : [];
        const history: GeminiMessage[] = priorMessages.slice(-10).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));

        const newAiReply = await sendMessageToGemini(history, text, currentAttachment, aiPersona);

        const nextMsgIndex = targetIndex !== -1 ? targetIndex + 1 : -1;
        const nextMsg = nextMsgIndex < updatedMessages.length ? updatedMessages[nextMsgIndex] : null;

        if (nextMsg && nextMsg.role === 'assistant') {
          updatedMessages[nextMsgIndex] = { ...nextMsg, content: newAiReply };
          setMessages([...updatedMessages]);

          if (user) {
            await safeSaveChatMessages(user.id, activeSessionId, updatedMessages);
          }
        }
      } catch (err: any) {
        console.error('Edit error:', err);
        setErrorToast(err.message || 'Gagal memperbarui respons AI.');
      } finally {
        setLoading(false);
        scrollToBottom(150);
      }
      return;
    }

    // NORMAL SEND MODE
    const tempUserMsg: ChatMessage = {
      id: 'usr_' + Date.now(),
      user_id: user?.id || 'anonymous',
      session_id: activeSessionId,
      role: 'user',
      content: text,
      attachment: currentAttachment,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setLoading(true);
    scrollToBottom(50);

    try {
      const history: GeminiMessage[] = messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const customAiPrompt = `Nama kamu adalah "${effectiveBotName}". Sapa dirimu dengan nama ini jika pengguna menanyakan siapa namamu atau saat memperkenalkan diri.\n\n${aiPersona}`;
      const aiReply = await sendMessageToGemini(history, text, currentAttachment, customAiPrompt);

      const tempAiMsg: ChatMessage = {
        id: 'ai_' + Date.now(),
        session_id: activeSessionId,
        user_id: user?.id || 'anonymous',
        role: 'assistant',
        content: aiReply,
        created_at: new Date().toISOString(),
      };

      const newFullList = [...messages, tempUserMsg, tempAiMsg];
      setMessages(newFullList);
      scrollToBottom(100);

      // Save to local cache only
      if (user) {
        await safeSaveChatMessages(user.id, activeSessionId, newFullList);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorToast(err.message || 'Server AI sedang sibuk. Coba kirim ulang ya.');
    } finally {
      setLoading(false);
      scrollToBottom(150);
    }
  };

  const handleKeyDown = (e: any) => {
    if (Platform.OS === 'web') {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const deleteSingleMessage = (msgId: string) => {
    confirmAction(
      'Hapus Pesan?',
      'Pesan ini akan dihapus dari riwayat sesi ini.',
      async () => {
        const updated = messages.filter(m => m.id !== msgId);
        setMessages(updated);
        if (user) {
          await safeSaveChatMessages(user.id, currentSessionId, updated);
        }
      },
      'Hapus'
    );
  };

  const clearCurrentSessionChat = () => {
    setShowOptionsMenu(false);
    setTimeout(() => {
      confirmAction(
        'Bersihkan Obrolan Ini?',
        'Semua pesan di sesi ini akan dikosongkan.',
        async () => {
          setMessages([]);
          if (user) {
            await safeRemoveChatCache(user.id, currentSessionId);
          }
        },
        'Bersihkan'
      );
    }, 120);
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    if (!msg.content) return;
    const ok = await copyToClipboard(msg.content);
    if (ok) {
      setCopiedMsgId(msg.id);
      setTimeout(() => {
        setCopiedMsgId(prev => (prev === msg.id ? null : prev));
      }, 2000);
    }
  };

  // -------------------------------------------------------------
  // Render Individual Message Card
  // -------------------------------------------------------------
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isAi = item.role === 'assistant';
    const isCopied = copiedMsgId === item.id;

    return (
      <View style={[styles.msgWrapper, isUser ? styles.msgWrapperUser : styles.msgWrapperAi]}>
        <View style={[
          styles.msgCard,
          isUser
            ? [styles.msgCardUser, { backgroundColor: theme.primary }]
            : [styles.msgCardAi, { backgroundColor: theme.card, borderColor: theme.border }]
        ]}>

          {/* Attachment Preview */}
          {item.attachment && (
            <View style={[styles.attachmentCard, { borderColor: isUser ? 'rgba(255,255,255,0.2)' : theme.border }]}>
              {item.attachment.type === 'image' && (
                <Image source={{ uri: item.attachment.uri }} style={styles.attachmentImg} resizeMode="cover" />
              )}
              {item.attachment.type === 'audio' && (
                <View style={[styles.fileRow, { backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : theme.cardInner }]}>
                  <Ionicons name="musical-notes" size={16} color={isUser ? '#FFFFFF' : theme.accentLight} />
                  <Text style={[styles.fileName, { color: isUser ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                    {item.attachment.name}
                  </Text>
                </View>
              )}
              {item.attachment.type === 'document' && (
                <View style={[styles.fileRow, { backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : theme.cardInner }]}>
                  <Ionicons name="document-text" size={16} color={isUser ? '#FFFFFF' : theme.accentLight} />
                  <Text style={[styles.fileName, { color: isUser ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                    {item.attachment.name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Message Content */}
          <View style={styles.msgBodyWrap}>
            {isAi && (
              <View style={styles.msgAiBubbleHeader}>
                <View style={[styles.msgAiAvatarWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  {customAiAvatar ? (
                    <Image source={{ uri: customAiAvatar }} style={styles.msgAiAvatarImg} />
                  ) : (
                    <Ionicons name="sparkles" size={10} color={theme.accentLight} />
                  )}
                </View>
                <Text style={[styles.msgAiBubbleName, { color: theme.accentLight }]}>
                  {effectiveBotName}
                </Text>
              </View>
            )}

            {isUser ? (
              <Text style={styles.msgTextUser} selectable>
                {item.content}
              </Text>
            ) : (
              <MarkdownRenderer
                content={item.content}
                fontSize={13.5}
                textColor={theme.text}
              />
            )}
          </View>

          {/* Sleek Minimal Message Footer (Timestamp & Action Icons) */}
          <View style={styles.msgFooterRow}>
            <Text style={[styles.timeText, { color: isUser ? 'rgba(255,255,255,0.7)' : theme.muted }]}>
              {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </Text>

            <View style={styles.msgActionsGroup}>
              {/* Copy Action */}
              <TouchableOpacity
                onPress={() => handleCopyMessage(item)}
                style={styles.actionIconBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Salin Pesan"
              >
                {isCopied ? (
                  <Ionicons name="checkmark" size={13} color={isUser ? '#FFFFFF' : theme.accentLight} />
                ) : (
                  <Ionicons name="copy-outline" size={13} color={isUser ? 'rgba(255,255,255,0.7)' : theme.subtext} />
                )}
              </TouchableOpacity>

              {/* Edit Action (User Only) */}
              {isUser && (
                <TouchableOpacity
                  onPress={() => handleStartEdit(item)}
                  style={styles.actionIconBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="Edit Pesan"
                >
                  <Ionicons name="pencil-outline" size={13} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              )}

              {/* Delete Action */}
              <TouchableOpacity
                onPress={() => deleteSingleMessage(item.id)}
                style={styles.actionIconBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Hapus Pesan"
              >
                <Ionicons name="trash-outline" size={13} color={isUser ? 'rgba(255,255,255,0.7)' : theme.muted} />
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    );
  };

  // -------------------------------------------------------------
  // Sidebar Content (Used for Desktop Panel & Mobile Drawer)
  // -------------------------------------------------------------
  const renderSessionSidebarContent = () => (
    <View style={[styles.sessionSidebarInner, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
      <View style={[styles.sidebarHeader, { borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="chatbubbles-outline" size={17} color={theme.accentLight} />
          <Text style={[styles.sidebarTitle, { color: theme.text }]}>Topik Obrolan</Text>
        </View>

        <TouchableOpacity
          style={[styles.sidebarNewBtn, { backgroundColor: theme.primary }]}
          onPress={handleStartNewChat}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={15} color="#FFFFFF" />
          <Text style={styles.sidebarNewBtnText}>Baru</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.sidebarScroll} showsVerticalScrollIndicator={false}>
        {loadingSessions ? (
          <ActivityIndicator size="small" color={theme.accentLight} style={{ marginVertical: 20 }} />
        ) : sessions.length === 0 ? (
          <Text style={[styles.emptySessionText, { color: theme.subtext }]}>Belum ada riwayat sesi.</Text>
        ) : (
          sessions.map(s => {
            const isActive = s.id === currentSessionId;
            return (
              <View
                key={s.id}
                style={[
                  styles.sessionItemRow,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  isActive && [styles.sessionItemRowActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => handleSelectSession(s)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.sessionItemTitle, { color: theme.subtext }, isActive && [styles.sessionItemTitleActive, { color: theme.text }]]}
                    numberOfLines={1}
                  >
                    {s.title || 'Obrolan'}
                  </Text>
                  <Text style={[styles.sessionItemTime, { color: theme.muted }]}>
                    {new Date(s.updated_at || s.created_at || new Date()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sessionDeleteBtn}
                  onPress={() => handleDeleteSession(s.id, s.title)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={13} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  if (initializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={theme.accentLight} />
          <Text style={[styles.loadingText, { color: theme.subtext }]}>Mempersiapkan ruang obrolan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.mainLayout, isWide && [styles.mainLayoutWide, { backgroundColor: theme.card, borderColor: theme.border }]]}>

        {/* ========================================================================= */}
        {/* DESKTOP PERMANENT SESSION SIDEBAR PANEL */}
        {/* ========================================================================= */}
        {isWide && (
          <View style={[styles.desktopSidebarWrapper, { borderRightColor: theme.border }]}>
            {renderSessionSidebarContent()}
          </View>
        )}

        {/* ========================================================================= */}
        {/* MAIN CHAT CONVERSATION CANVAS */}
        {/* ========================================================================= */}
        <View style={[styles.chatCanvas, isWide && { backgroundColor: isLightMode ? '#F8FAFC' : '#0B0F17' }]}>

          {/* ULTRA-CLEAN MODERN HEADER */}
          <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              {/* Mobile Only: Session Drawer Button */}
              {!isWide && (
                <TouchableOpacity
                  style={[styles.mobileDrawerBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={() => {
                    fetchSessions();
                    setShowSessionDrawer(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chatbubbles-outline" size={16} color={theme.accentLight} />
                </TouchableOpacity>
              )}

              {/* AI Avatar In Header */}
              <TouchableOpacity
                style={[styles.headerAiAvatarWrap, { borderColor: theme.accentLight, backgroundColor: theme.cardInner }]}
                onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
                activeOpacity={0.8}
              >
                {customAiAvatar ? (
                  <Image source={{ uri: customAiAvatar }} style={styles.headerAiAvatarImg} />
                ) : (
                  <Ionicons name="sparkles" size={15} color={theme.accentLight} />
                )}
              </TouchableOpacity>

              <View style={styles.headerInfoBlock}>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.headerTitle, { color: theme.text }]}>
                    {effectiveBotName}
                  </Text>
                  <View style={styles.statusDot} />
                  {activePersona?.name && (
                    <View style={[styles.personaBadge, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                      <Text style={[styles.personaBadgeText, { color: theme.accentLight }]}>
                        {activePersona.name.split(' (')[0]}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]} numberOfLines={1}>
                  {currentSessionTitle || 'Teman Belajar & Curhat AI'}
                </Text>
              </View>
            </View>

            {/* Header Right Actions: Quick New Chat & Options Dropdown Menu */}
            <View style={styles.headerRightActions}>
              {!isWide && (
                <TouchableOpacity
                  style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                  onPress={handleStartNewChat}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Chat Baru"
                >
                  <Ionicons name="add" size={18} color={theme.accentLight} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                onPress={() => setShowOptionsMenu(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Opsi Obrolan"
              >
                <Ionicons name="ellipsis-vertical" size={16} color={theme.subtext} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ========================================================================= */}
          {/* MESSAGES VIEW */}
          {/* ========================================================================= */}
          <KeyboardAvoidingView
            style={styles.keyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          >
            {messages.length === 0 ? (
              <ScrollView contentContainerStyle={styles.emptyContainer} showsVerticalScrollIndicator={false}>
                <View style={[styles.emptyCard, { backgroundColor: isLightMode ? '#FFFFFF' : theme.card, borderColor: theme.border }]}>
                  <View style={[styles.emptyIconBox, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                    <Ionicons name="sparkles" size={24} color={theme.accentLight} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>Ruang Cerita Bersama {aiBotName || 'Ara'}</Text>
                  <Text style={[styles.emptyDesc, { color: theme.subtext }]}>
                    Tulis apapun yang ada di pikiranmu, diskusikan tugas kuliah, atau curhat santai.
                  </Text>

                  <View style={styles.promptList}>
                    {SUGGESTIONS.map((item, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.promptChip, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                        onPress={() => handleSend(item)}
                        disabled={loading}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.promptText, { color: theme.subtext }]}>{item}</Text>
                        <Ionicons name="arrow-forward" size={12} color={theme.accentLight} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
            ) : (
              <FlatList
                ref={flatListRef}
                data={displayedMessages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => scrollToBottom(100)}
                onLayout={() => scrollToBottom(100)}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  hasMoreOldMessages ? (
                    <TouchableOpacity
                      style={[styles.loadMoreChatBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={handleLoadMoreOldMessages}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={13} color={theme.accentLight} />
                      <Text style={[styles.loadMoreChatText, { color: theme.accentLight }]}>
                        Muat pesan sebelumnya ({messages.length - visibleMsgCount} pesan lagi)
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            )}

            {/* Minimalist Typing Indicator */}
            {loading && (
              <View style={styles.typingContainer}>
                <View style={[styles.typingDot, { backgroundColor: theme.accentLight }]} />
                <Text style={[styles.typingText, { color: theme.subtext }]}>{aiBotName || 'Ara'} sedang mengetik...</Text>
              </View>
            )}

            {/* Inline Error Toast */}
            {errorToast && (
              <View style={[
                styles.errorToastWrap,
                {
                  backgroundColor: isLightMode ? '#FEF2F2' : '#2D1418',
                  borderColor: isLightMode ? '#FECACA' : '#571F26',
                }
              ]}>
                <Ionicons name="alert-circle-outline" size={15} color={isLightMode ? '#DC2626' : '#F87171'} />
                <Text style={[styles.errorToastText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>{errorToast}</Text>
                <TouchableOpacity onPress={() => setErrorToast(null)} style={{ padding: 2 }}>
                  <Ionicons name="close" size={14} color={isLightMode ? '#DC2626' : '#9CA3AF'} />
                </TouchableOpacity>
              </View>
            )}

            {/* Editing Banner */}
            {editingMsg && (
              <View style={[
                styles.editingBanner,
                {
                  backgroundColor: isLightMode ? '#EFF6FF' : '#101C2E',
                  borderColor: isLightMode ? '#BFDBFE' : '#1E355B',
                }
              ]}>
                <Ionicons name="pencil" size={13} color={isLightMode ? '#1D4ED8' : '#60A5FA'} />
                <Text style={[styles.editingText, { color: isLightMode ? '#1D4ED8' : '#93C5FD' }]}>Mengedit pesan sebelumnya</Text>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelEditBtn}>
                  <Ionicons name="close-circle" size={15} color={isLightMode ? '#1D4ED8' : '#9CA3AF'} />
                </TouchableOpacity>
              </View>
            )}

            {/* Active Attachment Pill */}
            {attachment && (
              <View style={styles.attachmentBar}>
                <View style={[styles.attachmentPill, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <Ionicons
                    name={attachment.type === 'image' ? 'image' : attachment.type === 'audio' ? 'musical-note' : 'document'}
                    size={13}
                    color={theme.accentLight}
                  />
                  <Text style={[styles.attachmentName, { color: theme.text }]} numberOfLines={1}>{attachment.name}</Text>
                  <TouchableOpacity onPress={() => setAttachment(null)} style={{ padding: 2 }}>
                    <Ionicons name="close-circle" size={14} color={theme.subtext} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Attachment Options Menu Popup */}
            {showAttachMenu && (
              <View style={[styles.attachMenu, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TouchableOpacity style={styles.attachOption} onPress={pickImage}>
                  <View style={[styles.attachIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                    <Ionicons name="images" size={16} color={theme.accentLight} />
                  </View>
                  <Text style={[styles.attachLabel, { color: theme.subtext }]}>Galeri</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
                  <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B', borderColor: theme.border }]}>
                    <Ionicons name="camera" size={16} color={isLightMode ? '#16A34A' : '#34D399'} />
                  </View>
                  <Text style={[styles.attachLabel, { color: theme.subtext }]}>Kamera</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachOption} onPress={pickAudio}>
                  <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#FCE7F3' : '#4C1D40', borderColor: theme.border }]}>
                    <Ionicons name="mic" size={16} color={isLightMode ? '#EC4899' : '#F472B6'} />
                  </View>
                  <Text style={[styles.attachLabel, { color: theme.subtext }]}>Audio</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
                  <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#FEF3C7' : '#78350F', borderColor: theme.border }]}>
                    <Ionicons name="document-text" size={16} color={isLightMode ? '#D97706' : '#FBBF24'} />
                  </View>
                  <Text style={[styles.attachLabel, { color: theme.subtext }]}>Dokumen</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ======================================================================= */}
            {/* FLOATING CAPSULE INPUT BAR */}
            {/* ======================================================================= */}
            <View style={styles.floatingInputWrapper}>
              <View style={[styles.capsuleInputCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                
                {/* Plus Attachment Button */}
                <TouchableOpacity
                  style={[
                    styles.capsuleAttachBtn,
                    { backgroundColor: showAttachMenu ? theme.accentBg : theme.cardInner, borderColor: theme.border }
                  ]}
                  onPress={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showAttachMenu ? "close" : "add"} size={17} color={showAttachMenu ? theme.accentLight : theme.subtext} />
                </TouchableOpacity>

                {/* Text Input */}
                <TextInput
                  ref={inputRef}
                  style={[styles.capsuleInput, { color: theme.text }]}
                  placeholder={editingMsg ? "Edit pesanmu..." : `Tanya atau curhat ke ${aiBotName || 'Ara'}...`}
                  placeholderTextColor={theme.muted}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={1000}
                  editable={!loading}
                  // @ts-ignore
                  onKeyDown={handleKeyDown}
                />

                {/* Send Button */}
                <TouchableOpacity
                  style={[
                    styles.capsuleSendBtn,
                    (!inputText.trim() && !attachment) || loading
                      ? [styles.capsuleSendBtnDisabled, { backgroundColor: theme.cardInner, borderColor: theme.border }]
                      : [styles.capsuleSendBtnActive, { backgroundColor: theme.primary }],
                  ]}
                  onPress={() => handleSend()}
                  disabled={(!inputText.trim() && !attachment) || loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={16}
                      color={(!inputText.trim() && !attachment) ? theme.muted : '#FFFFFF'}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>

          </KeyboardAvoidingView>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* OPTIONS MENU MODAL */}
      {/* ========================================================================= */}
      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.modalOverlayCenter}>
            <TouchableWithoutFeedback>
              <View style={[styles.optionsMenuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[styles.optionsMenuHeader, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.optionsMenuTitle, { color: theme.text }]}>Menu Obrolan</Text>
                  <TouchableOpacity onPress={() => setShowOptionsMenu(false)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={18} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                {/* Option: Export to Journal */}
                <TouchableOpacity
                  style={[styles.optionRow, { borderBottomColor: theme.cardInner }]}
                  onPress={handleExportToJournal}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: isLightMode ? '#FEF3C7' : '#2D2008' }]}>
                    <Ionicons name="book-outline" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>Simpan ke Jurnal</Text>
                    <Text style={[styles.optionSub, { color: theme.subtext }]}>Ekspor ringkasan percakapan ke catatan refleksi</Text>
                  </View>
                </TouchableOpacity>

                {/* Option: Refresh Messages */}
                <TouchableOpacity
                  style={[styles.optionRow, { borderBottomColor: theme.cardInner }]}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    fetchHistory(currentSessionId);
                  }}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: theme.accentBg }]}>
                    <Ionicons name="refresh-outline" size={16} color={theme.accentLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>Muat Ulang Pesan</Text>
                    <Text style={[styles.optionSub, { color: theme.subtext }]}>Sinkronkan kembali riwayat obrolan</Text>
                  </View>
                </TouchableOpacity>

                {/* Option: Clear Session Chat */}
                {messages.length > 0 && (
                  <TouchableOpacity
                    style={styles.optionRow}
                    onPress={clearCurrentSessionChat}
                  >
                    <View style={[styles.optionIconBox, { backgroundColor: isLightMode ? '#FEE2E2' : '#3B1418' }]}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, { color: '#EF4444' }]}>Bersihkan Obrolan Ini</Text>
                      <Text style={[styles.optionSub, { color: theme.subtext }]}>Hapus semua pesan dalam sesi ini</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ========================================================================= */}
      {/* MOBILE SESSION DRAWER MODAL */}
      {/* ========================================================================= */}
      {!isWide && (
        <Modal
          visible={showSessionDrawer}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSessionDrawer(false)}
        >
          <View style={styles.sessionModalOverlay}>
            <TouchableOpacity
              style={styles.sessionBackdrop}
              activeOpacity={1}
              onPress={() => setShowSessionDrawer(false)}
            />
            <View style={styles.mobileDrawerWrapper}>
              {renderSessionSidebarContent()}
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
  },
  mainLayoutWide: {
    maxWidth: 1140,
    width: '100%',
    alignSelf: 'center',
    marginVertical: 14,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 6,
  },
  desktopSidebarWrapper: {
    width: 280,
    height: '100%',
    borderRightWidth: 1,
  },
  chatCanvas: {
    flex: 1,
    height: '100%',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  mobileDrawerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerInfoBlock: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  personaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  personaBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  headerAiAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
    overflow: 'hidden',
  },
  headerAiAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  msgAiBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  msgAiAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  msgAiAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  msgAiBubbleName: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Content */
  keyboardContainer: {
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 520,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 380,
  },
  promptList: {
    width: '100%',
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  promptText: {
    fontSize: 12.5,
    flex: 1,
  },

  /* Messages */
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
  },
  loadMoreChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'center',
    marginBottom: 10,
  },
  loadMoreChatText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  msgWrapper: {
    flexDirection: 'row',
    width: '100%',
  },
  msgWrapperUser: {
    justifyContent: 'flex-end',
  },
  msgWrapperAi: {
    justifyContent: 'flex-start',
  },
  msgCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  msgCardUser: {
    maxWidth: '86%',
    borderBottomRightRadius: 4,
    borderColor: 'transparent',
  },
  msgCardAi: {
    maxWidth: '92%',
    borderBottomLeftRadius: 4,
  },
  msgBodyWrap: {
    marginBottom: 4,
  },
  msgTextUser: {
    color: '#FFFFFF',
    fontSize: 13.5,
    lineHeight: 20,
  },
  msgFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  timeText: {
    fontSize: 10.5,
  },
  msgActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    padding: 3,
    borderRadius: 4,
  },

  /* Attachment */
  attachmentCard: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  attachmentImg: {
    width: 220,
    height: 140,
    borderRadius: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  fileName: {
    fontSize: 12,
    flex: 1,
  },
  attachmentBar: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  attachmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  attachmentName: {
    fontSize: 11.5,
    maxWidth: 200,
  },

  /* Attachment Popup Menu */
  attachMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  attachOption: {
    alignItems: 'center',
    gap: 4,
  },
  attachIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  attachLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  /* Floating Capsule Input Bar */
  floatingInputWrapper: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 10 : 14,
    paddingTop: 6,
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
  },
  capsuleInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  capsuleAttachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  capsuleInput: {
    flex: 1,
    fontSize: 13.5,
    maxHeight: 100,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  capsuleSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  capsuleSendBtnActive: {
    borderColor: 'transparent',
  },
  capsuleSendBtnDisabled: {
    borderWidth: 1,
  },

  /* Typing & Banners */
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  typingText: {
    fontSize: 11.5,
    fontStyle: 'italic',
  },
  errorToastWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  errorToastText: {
    fontSize: 11.5,
    flex: 1,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  editingText: {
    fontSize: 11.5,
    flex: 1,
  },
  cancelEditBtn: {
    padding: 2,
  },

  /* Sidebar Component Styles */
  sessionSidebarInner: {
    flex: 1,
    borderRightWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  sidebarTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  sidebarNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sidebarNewBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  sidebarScroll: {
    flex: 1,
  },
  emptySessionText: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 24,
  },
  sessionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    padding: 9,
    marginBottom: 6,
    borderWidth: 1,
  },
  sessionItemRowActive: {
    borderWidth: 1,
  },
  sessionItemTitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  sessionItemTitleActive: {
    fontWeight: '700',
  },
  sessionItemTime: {
    fontSize: 10.5,
    marginTop: 2,
  },
  sessionDeleteBtn: {
    padding: 4,
  },

  /* Mobile Drawer Overlay */
  sessionModalOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sessionBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  mobileDrawerWrapper: {
    width: '80%',
    maxWidth: 300,
    height: '100%',
  },

  /* Options Menu Modal */
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  optionsMenuCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  optionsMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  optionsMenuTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  optionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 11,
    marginTop: 1,
  },
});

