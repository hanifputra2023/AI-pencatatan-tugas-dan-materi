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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { sendMessageToGemini, GeminiMessage } from '../lib/gemini';
import { extractAgentAction, stripAgentActionBlock, executeAgentAction } from '../lib/agentActions';
import { ChatMessage, ChatAttachment, ChatSession } from '../types';
import * as FileSystem from 'expo-file-system';
import { confirmAction, showAlert } from '../lib/alert';
import {
  safeSaveChatMessages,
  safeSaveSessions,
  safeRemoveChatCache,
  safeSaveActiveSessionId,
  safeGetActiveSessionId,
} from '../lib/safeStorage';
import { copyToClipboard } from '../lib/clipboard';
import { processPickedFile, uriToBase64 } from '../lib/fileReader';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { compressImage } from '../lib/imageCompressor';
import { isDeviceOnline } from '../lib/offlineSync';
import {
  FloatingBadge,
  FadeSlideIn,
  PulseDot,
} from '../components/DuolingoAnimations';
import GeminiLiveVoiceModal from '../components/GeminiLiveVoiceModal';

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
  const route = useRoute<any>();
  const lastHandledTimestampRef = useRef<number | null>(null);

  const { user } = useAuth();
  const effectiveUserId = user?.id || 'guest_user';
  const { aiPersona, aiBotName, activePersona, customAiName, customAiAvatar, appSettings } = useMoods();
  const effectiveBotName = customAiName || aiBotName || activePersona.botName || 'Ara';
  const chatMaxTokens = parseInt(appSettings['ai_max_tokens'], 10) > 0
    ? parseInt(appSettings['ai_max_tokens'], 10)
    : undefined;
  const { theme, isLightMode } = useTheme();
  const { width, isDesktop, isTablet, isMobile, isSmallPhone } = useResponsive();
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showLiveVoiceModal, setShowLiveVoiceModal] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [deepThinkEnabled, setDeepThinkEnabled] = useState(false);
  const [factualEnabled, setFactualEnabled] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);

  // Sampling parameters from Admin settings (ai_temp / ai_top_p)
  const chatTemperature = parseFloat(appSettings['ai_temp']) > 0
    ? parseFloat(appSettings['ai_temp'])
    : 0.7;
  const chatTopP = parseFloat(appSettings['ai_top_p']) > 0
    ? parseFloat(appSettings['ai_top_p'])
    : 0.95;

  // Sampling parameters specifically for "Akurat" (factual) mode, set in Admin
  const factualTemperature = parseFloat(appSettings['factual_temp']) > 0
    ? parseFloat(appSettings['factual_temp'])
    : 0.1;
  const factualTopP = parseFloat(appSettings['factual_top_p']) > 0
    ? parseFloat(appSettings['factual_top_p'])
    : 0.2;

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
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isPinnedToBottomRef = useRef(true);
  const lastStreamScrollRef = useRef(0);
  const lastStreamPaintRef = useRef(0);

  const scrollToBottom = useCallback((delay = 100, animated = true, force = false) => {
    setTimeout(() => {
      // Never fight the user: only auto-scroll when the user is already near the bottom,
      // unless the user explicitly tapped the scroll-to-bottom button (force = true)
      if (!force && !isPinnedToBottomRef.current) return;
      if (force) isPinnedToBottomRef.current = true;
      flatListRef.current?.scrollToEnd({ animated });
    }, delay);
  }, []);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 300; // forgiving threshold so auto-scroll isn't lost when the AI bubble grows between frames
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isPinnedToBottomRef.current = isCloseToBottom;
    setShowScrollBottomBtn(!isCloseToBottom && contentOffset.y > 250);
  };

  // -------------------------------------------------------------
  // Load Sessions List & Initialize Active Session (Persistent on Refresh)
  // -------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // 1. Read from local cache
      const localCached = await AsyncStorage.getItem('@chat_sessions_' + effectiveUserId);
      let sessionList: ChatSession[] = [];
      if (localCached) {
        sessionList = JSON.parse(localCached);
        setSessions(sessionList);
      }

      // 2. Retrieve last remembered active session ID
      const rememberedSessionId = await safeGetActiveSessionId(effectiveUserId);

      if (rememberedSessionId && sessionList.some(s => s.id === rememberedSessionId)) {
        const active = sessionList.find(s => s.id === rememberedSessionId);
        setCurrentSessionId(rememberedSessionId);
        setCurrentSessionTitle(active?.title || 'Sesi Obrolan');
      } else if (sessionList.length > 0) {
        setCurrentSessionId(sessionList[0].id);
        setCurrentSessionTitle(sessionList[0].title || 'Sesi Obrolan');
        await safeSaveActiveSessionId(effectiveUserId, sessionList[0].id);
      } else {
        const freshId = generateUUID();
        setCurrentSessionId(freshId);
        setCurrentSessionTitle('Obrolan Baru');
        await safeSaveActiveSessionId(effectiveUserId, freshId);
      }
    } catch (e) {
      console.log('Error fetching local sessions:', e);
    } finally {
      setLoadingSessions(false);
      setInitializing(false);
    }
  }, [effectiveUserId]);

  // -------------------------------------------------------------
  // Load Messages for Specific Session
  // -------------------------------------------------------------
  const fetchHistory = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setInitializing(false);
      return;
    }
    setRefreshing(true);
    try {
      // Load from local cache
      const cachedMsgs = await AsyncStorage.getItem(`@chat_msgs_${effectiveUserId}_${sessionId}`);
      if (cachedMsgs) {
        try {
          const parsed = JSON.parse(cachedMsgs);
          setMessages(parsed);
          if (parsed.length > 0) {
            scrollToBottom(200);
          }
        } catch (e) { }
      } else {
        setMessages([]);
      }
      await safeSaveActiveSessionId(effectiveUserId, sessionId);
    } catch (e) {
      console.log('Error fetching local chat messages:', e);
    } finally {
      setInitializing(false);
      setRefreshing(false);
    }
  }, [effectiveUserId, scrollToBottom]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (currentSessionId) {
      fetchHistory(currentSessionId);
    }
  }, [currentSessionId, fetchHistory]);

  // -------------------------------------------------------------
  // Multi-Session Controls: New Chat, Switch Session, Delete Session
  // -------------------------------------------------------------
  const handleStartNewChat = async () => {
    const newSessionId = generateUUID();
    const newTitle = 'Obrolan Baru';

    const newSessionItem: ChatSession = {
      id: newSessionId,
      user_id: effectiveUserId,
      title: newTitle,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedList = [newSessionItem, ...sessions.filter(s => s.id !== newSessionId)];
    setSessions(updatedList);
    setCurrentSessionId(newSessionId);
    setCurrentSessionTitle(newTitle);
    setMessages([]);
    setShowSessionDrawer(false);
    setInputText('');
    setAttachment(null);

    await safeSaveSessions(effectiveUserId, updatedList);
    await safeSaveActiveSessionId(effectiveUserId, newSessionId);
  };

  const handleSelectSession = (s: ChatSession) => {
    setCurrentSessionId(s.id);
    setCurrentSessionTitle(s.title || 'Sesi Obrolan');
    setShowSessionDrawer(false);
    safeSaveActiveSessionId(effectiveUserId, s.id);
    fetchHistory(s.id);
  };

  const handleDeleteSession = (sessionId: string, sessionTitle: string) => {
    confirmAction(
      'Hapus Sesi Percakapan?',
      `Seluruh riwayat pesan di sesi "${sessionTitle}" akan dihapus permanen.`,
      async () => {
        const updated = sessions.filter(s => s.id !== sessionId);
        setSessions(updated);
        await safeSaveSessions(effectiveUserId, updated);
        await safeRemoveChatCache(effectiveUserId, sessionId);

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
        const processedAttachment = await processPickedFile(file);
        setAttachment(processedAttachment);
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

    // Auto-close the "+" attachment menu when a message is sent
    setShowAttachMenu(false);

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

      await safeSaveSessions(effectiveUserId, updatedSessions);
      await safeSaveActiveSessionId(effectiveUserId, activeSessionId);

      if (user) {
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
      let replyId: string | null = null;
      let insertedPlaceholder = false;
      if (targetIndex !== -1) {
        updatedMessages[targetIndex] = { ...updatedMessages[targetIndex], content: text };
        const nextMsgIndex = targetIndex + 1;
        if (nextMsgIndex < updatedMessages.length && updatedMessages[nextMsgIndex].role === 'assistant') {
          replyId = updatedMessages[nextMsgIndex].id;
        } else {
          replyId = 'ai_edit_' + Date.now();
          insertedPlaceholder = true;
          updatedMessages.splice(targetIndex + 1, 0, {
            id: replyId,
            session_id: activeSessionId,
            user_id: effectiveUserId,
            role: 'assistant',
            content: '',
            mode: factualEnabled ? 'factual' as const : (deepThinkEnabled ? 'deep' as const : 'standard' as const),
            created_at: new Date().toISOString(),
          });
        }
      }
      setMessages(updatedMessages);
      if (replyId) setStreamingMsgId(replyId);

      try {
        const priorMessages = targetIndex !== -1 ? messages.slice(0, targetIndex) : [];
        const history: GeminiMessage[] = priorMessages.slice(-16).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));

        const newAiReply = await sendMessageToGemini(history, text, currentAttachment, aiPersona, {
          maxTokens: chatMaxTokens,
          deepThink: deepThinkEnabled,
          factual: factualEnabled,
          temperature: factualEnabled ? factualTemperature : chatTemperature,
          topP: factualEnabled ? factualTopP : chatTopP,
          onToken: (partial) => {
            setIsStreaming(true);
            if (replyId) {
              // Throttle heavy Markdown re-renders so long Deep Thinking streams
              // don't lag: only refresh the bubble ~10x/sec, final text is applied
              // separately below.
              const now = Date.now();
              if (now - lastStreamPaintRef.current >= 100) {
                lastStreamPaintRef.current = now;
                setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, content: partial } : m)));
              }
            }
            const now2 = Date.now();
            if (now2 - lastStreamScrollRef.current >= 200) {
              lastStreamScrollRef.current = now2;
              scrollToBottom(0, false);
            }
          },
        });

        const finalList = replyId
          ? updatedMessages.map(m => (m.id === replyId ? { ...m, content: newAiReply } : m))
          : updatedMessages;
        setMessages(finalList);
        if (replyId) {
          await safeSaveChatMessages(effectiveUserId, activeSessionId, finalList);
        }
      } catch (err: any) {
        console.error('Edit error:', err);
        setErrorToast(err.message || 'Gagal memperbarui respons AI.');
        if (insertedPlaceholder && replyId) {
          setMessages(prev => prev.filter(m => m.id !== replyId));
        }
      } finally {
        setLoading(false);
        setIsStreaming(false);
        setStreamingMsgId(null);
        scrollToBottom(150);
      }
      return;
    }

    // NORMAL SEND MODE
    const tempUserMsg: ChatMessage = {
      id: 'usr_' + Date.now(),
      user_id: effectiveUserId,
      session_id: activeSessionId,
      role: 'user',
      content: text,
      attachment: currentAttachment,
      created_at: new Date().toISOString(),
    };

    const tempAiId = 'ai_' + Date.now();
    const activeMode: 'standard' | 'deep' | 'factual' | 'agent' = factualEnabled ? 'factual' : agentEnabled ? 'agent' : deepThinkEnabled ? 'deep' : 'standard';
    const streamingAiMsg: ChatMessage = {
      id: tempAiId,
      session_id: activeSessionId,
      user_id: effectiveUserId,
      role: 'assistant',
      content: '',
      mode: activeMode,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg, streamingAiMsg]);
    setLoading(true);
    setStreamingMsgId(tempAiId);
    scrollToBottom(50);

    try {
      const history: GeminiMessage[] = messages.slice(-16).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const customAiPrompt = `Nama kamu adalah "${effectiveBotName}". Sapa dirimu dengan nama ini jika pengguna menanyakan siapa namamu atau saat memperkenalkan diri.\n\n${aiPersona}`;
      const aiReply = await sendMessageToGemini(history, text, currentAttachment, customAiPrompt, {
        maxTokens: chatMaxTokens,
        deepThink: deepThinkEnabled,
        factual: factualEnabled,
        agent: agentEnabled,
        temperature: factualEnabled ? factualTemperature : chatTemperature,
        topP: factualEnabled ? factualTopP : chatTopP,
        onToken: (partial) => {
          setIsStreaming(true);
          // Throttle heavy Markdown re-renders so long streaming doesn't lag
          const now = Date.now();
          if (now - lastStreamPaintRef.current >= 100) {
            lastStreamPaintRef.current = now;
            const shown = agentEnabled ? stripAgentActionBlock(partial) : partial;
            setMessages(prev => prev.map(m => (m.id === tempAiId ? { ...m, content: shown } : m)));
          }
          // Throttle: instant, non-animated scroll at most once every 200ms to avoid
          // chaining scroll animations that cause up/down flickering
          const now2 = Date.now();
          if (now2 - lastStreamScrollRef.current >= 200) {
            lastStreamScrollRef.current = now2;
            scrollToBottom(0, false);
          }
        },
      });

      // Agent mode: execute any action the AI requested and hide the JSON block
      const action = agentEnabled ? extractAgentAction(aiReply) : null;
      const displayReply = agentEnabled ? stripAgentActionBlock(aiReply) : aiReply;

      let agentConfirmation: string | null = null;
      if (action) {
        const res = await executeAgentAction(effectiveUserId, action);
        agentConfirmation = res.ok
          ? `⚙️ Agent berhasil: ${res.message}`
          : `⚙️ Agent gagal: ${res.message}`;
      }

      const tempAiMsg: ChatMessage = {
        id: tempAiId,
        session_id: activeSessionId,
        user_id: effectiveUserId,
        role: 'assistant',
        content: displayReply,
        mode: factualEnabled ? 'factual' : (agentEnabled ? 'agent' : (deepThinkEnabled ? 'deep' : 'standard')),
        created_at: new Date().toISOString(),
      };

      const agentMsg: ChatMessage | null = agentConfirmation
        ? {
            id: 'sys_agent_' + Date.now(),
            session_id: activeSessionId,
            user_id: effectiveUserId,
            role: 'assistant',
            content: agentConfirmation,
            created_at: new Date(Date.now() + 50).toISOString(),
          }
        : null;

      const newFullList = agentConfirmation
        ? [...messages, tempUserMsg, tempAiMsg, agentMsg!]
        : [...messages, tempUserMsg, tempAiMsg];
      setMessages(newFullList);
      scrollToBottom(100);

      // Save to local cache persistently
      await safeSaveChatMessages(effectiveUserId, activeSessionId, newFullList);
      await safeSaveActiveSessionId(effectiveUserId, activeSessionId);
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorToast(err.message || 'Server AI sedang sibuk. Coba kirim ulang ya.');
      setMessages(prev => prev.filter(m => m.id !== tempAiId));
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setStreamingMsgId(null);
      scrollToBottom(150);
    }
  };

  const handleLiveVoiceMessagePair = async (userText: string, aiText: string) => {
    const activeSessionId = currentSessionId || generateUUID();
    if (!currentSessionId) {
      setCurrentSessionId(activeSessionId);
    }
    const userMsg: ChatMessage = {
      id: generateUUID(),
      session_id: activeSessionId,
      user_id: effectiveUserId,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    const aiMsg: ChatMessage = {
      id: generateUUID(),
      session_id: activeSessionId,
      user_id: effectiveUserId,
      role: 'assistant',
      content: aiText,
      mode: factualEnabled ? 'factual' : (deepThinkEnabled ? 'deep' : 'standard'),
      created_at: new Date(Date.now() + 50).toISOString(),
    };
    const updated = [...messages, userMsg, aiMsg];
    setMessages(updated);
    await safeSaveChatMessages(effectiveUserId, activeSessionId, updated);
    await safeSaveActiveSessionId(effectiveUserId, activeSessionId);
    if (user) {
      try {
        await supabase.from('chat_messages').insert([
          {
            id: userMsg.id,
            session_id: activeSessionId,
            user_id: user.id,
            role: 'user',
            content: userMsg.content,
            created_at: userMsg.created_at,
          },
          {
            id: aiMsg.id,
            session_id: activeSessionId,
            user_id: user.id,
            role: 'assistant',
            content: aiMsg.content,
            created_at: aiMsg.created_at,
          },
        ]);
      } catch (e) {}
    }
    scrollToBottom(100);
  };

  // Automatically process incoming initialMessage from Study / Task navigation
  useEffect(() => {
    const initialMsg = route.params?.initialMessage;
    const timestamp = route.params?.timestamp || 0;
    const autoSend = route.params?.autoSend !== false;

    if (initialMsg && !initializing && lastHandledTimestampRef.current !== timestamp) {
      lastHandledTimestampRef.current = timestamp;
      if (autoSend) {
        setTimeout(() => {
          handleSend(initialMsg);
        }, 400);
      } else {
        setInputText(initialMsg);
      }
    }
  }, [route.params, initializing]);

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
        await safeSaveChatMessages(effectiveUserId, currentSessionId, updated);
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
          await safeRemoveChatCache(effectiveUserId, currentSessionId);
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
                {item.mode && item.mode !== 'standard' && streamingMsgId !== item.id && (
                  <View style={[
                    styles.modeBadge,
                    { borderColor: item.mode === 'factual'
                        ? (isLightMode ? '#F59E0B' : '#FBBF24')
                        : item.mode === 'agent'
                          ? (isLightMode ? '#14B8A6' : '#5EEAD4')
                          : (isLightMode ? '#8B5CF6' : '#A78BFA') }
                  ]}>
                    <Ionicons
                      name={item.mode === 'factual' ? 'shield-checkmark-outline' : item.mode === 'agent' ? 'rocket-outline' : 'bulb-outline'}
                      size={9}
                      color={item.mode === 'factual'
                        ? (isLightMode ? '#B45309' : '#FBBF24')
                        : item.mode === 'agent'
                          ? (isLightMode ? '#0F766E' : '#5EEAD4')
                          : (isLightMode ? '#6D28D9' : '#A78BFA')}
                    />
                    <Text style={[
                      styles.modeBadgeText,
                      { color: item.mode === 'factual'
                          ? (isLightMode ? '#B45309' : '#FBBF24')
                          : item.mode === 'agent'
                            ? (isLightMode ? '#0F766E' : '#5EEAD4')
                            : (isLightMode ? '#6D28D9' : '#A78BFA') }
                    ]}>
                      {item.mode === 'factual' ? 'Akurat' : item.mode === 'agent' ? 'Agent' : 'Deep'}
                    </Text>
                  </View>
                )}
                {streamingMsgId === item.id && deepThinkEnabled && (
                  <View style={[styles.streamingBadge, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                    <PulseDot color={theme.accentLight} size={6} />
                    <Text style={[styles.streamingBadgeText, { color: theme.accentLight }]}>
                      Deep Thinking...
                    </Text>
                  </View>
                )}
              </View>
            )}

            {isUser ? (
              <Text style={styles.msgTextUser} selectable>
                {item.content}
              </Text>
            ) : (
              <View>
                <MarkdownRenderer
                  content={item.content}
                  fontSize={13.5}
                  textColor={theme.text}
                />
                {streamingMsgId === item.id && !deepThinkEnabled && (
                  <View style={[styles.streamingStatusWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                    <PulseDot color={theme.accentLight} size={7} />
                    <Text style={[styles.streamingStatusText, { color: theme.accentLight }]}>
                      {`${aiBotName || 'Ara'} sedang mengetik...`}
                    </Text>
                  </View>
                )}
              </View>
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
          <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border, ...(isSmallPhone ? { paddingHorizontal: 10, paddingVertical: 8 } : {})}]}>
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
                style={[styles.headerAiAvatarWrap, { borderColor: theme.accentLight, backgroundColor: theme.cardInner, ...(isSmallPhone ? { width: 28, height: 28, borderRadius: 14, marginRight: 0 } : {})}]}
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
                  <PulseDot color="#10B981" size={7} />
                  {activePersona?.name && !isSmallPhone && (
                    <View style={[styles.personaBadge, { backgroundColor: theme.accentBg, borderColor: theme.border, ...(isMobile ? { maxWidth: 80 } : {})}]}>
                      <Text style={[styles.personaBadgeText, { color: theme.accentLight }]} numberOfLines={1} ellipsizeMode="tail">
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
              {/* Gemini Live Voice Call Button */}
              <TouchableOpacity
                style={[
                  styles.headerActionBtn,
                  {
                    width: 'auto',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isLightMode ? '#EFF6FF' : 'rgba(56, 189, 248, 0.15)',
                    borderColor: isLightMode ? '#93C5FD' : '#38BDF8',
                    borderWidth: 1.2,
                    paddingHorizontal: 9,
                    gap: 4,
                  },
                ]}
                onPress={() => setShowLiveVoiceModal(true)}
                activeOpacity={0.7}
                accessibilityLabel="Panggilan Gemini Live"
              >
                <Ionicons name="sparkles" size={14} color={isLightMode ? '#2563EB' : '#38BDF8'} />
                <Text style={{ color: isLightMode ? '#2563EB' : '#38BDF8', fontSize: 11, fontWeight: '800' }}>Live</Text>
              </TouchableOpacity>

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
              <ScrollView
                style={isWide ? styles.emptyScrollWide : undefined}
                contentContainerStyle={styles.emptyContainer}
                showsVerticalScrollIndicator={false}
              >
                <FadeSlideIn delay={50} style={styles.emptyCardWrapper}>
                  <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <FloatingBadge distance={5} duration={2200}>
                      <View style={[styles.emptyIconBox, { backgroundColor: theme.accentBg, borderColor: theme.border, overflow: 'hidden' }]}>
                        {customAiAvatar ? (
                          <Image source={{ uri: customAiAvatar }} style={styles.emptyAvatarImg} resizeMode="cover" />
                        ) : (
                          <Ionicons name="sparkles" size={24} color={theme.accentLight} />
                        )}
                      </View>
                    </FloatingBadge>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Ruang Cerita Bersama {effectiveBotName || 'Ara'}</Text>
                    <Text style={[styles.emptyDesc, { color: theme.subtext }]}>
                      Tulis apapun yang ada di pikiranmu, diskusikan tugas kuliah, atau curhat santai.
                    </Text>

                    <View style={styles.promptList}>
                      {SUGGESTIONS.map((item, idx) => (
                        <FadeSlideIn key={idx} delay={120 + idx * 70}>
                          <TouchableOpacity
                            style={[styles.promptChip, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                            onPress={() => handleSend(item)}
                            disabled={loading}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.promptText, { color: theme.subtext }]}>{item}</Text>
                            <Ionicons name="arrow-forward" size={12} color={theme.accentLight} />
                          </TouchableOpacity>
                        </FadeSlideIn>
                      ))}
                    </View>
                  </View>
                </FadeSlideIn>
              </ScrollView>
            ) : (
              <>
                <FlatList
                  ref={flatListRef}
                  data={displayedMessages}
                  renderItem={renderMessage}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.messageList}
                  onScroll={handleScroll}
                  scrollEventThrottle={80}
                  showsVerticalScrollIndicator={true}
                  initialNumToRender={12}
                  maxToRenderPerBatch={8}
                  windowSize={7}
                  removeClippedSubviews={Platform.OS !== 'web'}
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

                {/* Floating Scroll to Bottom Button */}
                {showScrollBottomBtn && (
                  <TouchableOpacity
                    style={[styles.floatingScrollBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => {
                      setShowScrollBottomBtn(false);
                      scrollToBottom(0, true, true);
                    }}
                    activeOpacity={0.8}
                    accessibilityLabel="Gulir ke Bawah"
                  >
                    <Ionicons name="chevron-down" size={18} color={theme.accentLight} />
                  </TouchableOpacity>
                )}
              </>
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

            {/* Attachment Options Menu Popup (single scrollable row, items resize to fit) */}
            {showAttachMenu && (() => {
              const menuItems = [
                { key: 'galeri', label: 'Galeri', icon: 'images' as const, onPress: pickImage, active: false, bg: theme.accentBg, border: theme.border, color: theme.accentLight },
                { key: 'kamera', label: 'Kamera', icon: 'camera' as const, onPress: takePhoto, active: false, bg: theme.accentBg, border: theme.border, color: theme.accentLight },
                { key: 'audio', label: 'Audio', icon: 'mic' as const, onPress: pickAudio, active: false, bg: theme.accentBg, border: theme.border, color: theme.accentLight },
                { key: 'dokumen', label: 'Dokumen', icon: 'document-text' as const, onPress: pickDocument, active: false, bg: theme.accentBg, border: theme.border, color: theme.accentLight },
                {
                  key: 'deep',
                  label: 'Deep',
                  icon: 'bulb-outline' as const,
                  onPress: () => setDeepThinkEnabled(p => !p),
                  active: deepThinkEnabled,
                  bg: deepThinkEnabled ? (isLightMode ? '#EDE9FE' : '#241B38') : theme.accentBg,
                  border: deepThinkEnabled ? (isLightMode ? '#8B5CF6' : '#A78BFA') : theme.border,
                  color: deepThinkEnabled ? (isLightMode ? '#6D28D9' : '#A78BFA') : theme.accentLight,
                },
                {
                  key: 'akurat',
                  label: 'Akurat',
                  icon: 'shield-checkmark-outline' as const,
                  onPress: () => setFactualEnabled(p => !p),
                  active: factualEnabled,
                  bg: factualEnabled ? (isLightMode ? '#FEF3C7' : '#3A2A0A') : theme.accentBg,
                  border: factualEnabled ? (isLightMode ? '#F59E0B' : '#FBBF24') : theme.border,
                  color: factualEnabled ? (isLightMode ? '#D97706' : '#FBBF24') : theme.accentLight,
                },
                {
                  key: 'agent',
                  label: 'Agent',
                  icon: 'rocket-outline' as const,
                  onPress: () => setAgentEnabled(p => !p),
                  active: agentEnabled,
                  bg: agentEnabled ? (isLightMode ? '#CCFBF1' : '#0F2A26') : theme.accentBg,
                  border: agentEnabled ? (isLightMode ? '#14B8A6' : '#5EEAD4') : theme.border,
                  color: agentEnabled ? (isLightMode ? '#0F766E' : '#5EEAD4') : theme.accentLight,
                },
              ];

              // Evenly distribute buttons across the row when they fit on screen; when
              // they overflow, keep them at the min width so the row scrolls sideways
              // instead of piling up into multiple rows (matches the "slide" design).
              const MAX_ROW_W = 900;
              const available = Math.max(Math.min(width, MAX_ROW_W) - 28, 200);
              const MIN_ITEM = 64;
              const itemWidth = Math.round(Math.max(available / menuItems.length, MIN_ITEM));

              return (
                <View style={[styles.attachMenu, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.attachMenuScroll}
                  >
                    {menuItems.map(it => (
                      <TouchableOpacity
                        key={it.key}
                        style={[styles.attachOption, { width: itemWidth }]}
                        onPress={it.onPress}
                        disabled={loading}
                        activeOpacity={0.7}
                        accessibilityLabel={it.label}
                        accessibilityState={{ selected: it.active }}
                      >
                        <View style={[styles.attachIconWrap, { backgroundColor: it.bg, borderColor: it.border }]}>
                          <Ionicons name={it.icon} size={16} color={it.color} />
                        </View>
                        <View style={styles.attachLabelRow}>
                          <Text style={[styles.attachLabel, { color: it.active ? it.color : theme.subtext }]}>{it.label}</Text>
                          {it.active && <Ionicons name="checkmark-circle" size={12} color={it.color} />}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              );
            })()}

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
                  onChangeText={(v) => {
                    if (showAttachMenu) setShowAttachMenu(false);
                    setInputText(v);
                  }}
                  multiline
                  maxLength={8000}
                  editable={!loading}
                  // @ts-ignore
                  onKeyDown={handleKeyDown}
                />

                {/* Voice / Send Button */}
                {!inputText.trim() && !attachment ? (
                  <TouchableOpacity
                    style={[
                      styles.capsuleSendBtn,
                      { backgroundColor: theme.cardInner, borderColor: theme.border },
                    ]}
                    onPress={() => setShowLiveVoiceModal(true)}
                    activeOpacity={0.7}
                    accessibilityLabel="Panggilan Suara Gemini Live"
                  >
                    <Ionicons name="mic" size={16} color={theme.accentLight} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.capsuleSendBtn,
                      loading
                        ? [styles.capsuleSendBtnDisabled, { backgroundColor: theme.cardInner, borderColor: theme.border }]
                        : [styles.capsuleSendBtnActive, { backgroundColor: theme.primary }],
                    ]}
                    onPress={() => handleSend()}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name="arrow-up"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </TouchableOpacity>
                )}
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

                {/* Option: Gemini Live Voice */}
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setShowLiveVoiceModal(true);
                  }}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: isLightMode ? '#EFF6FF' : '#1E293B' }]}>
                    <Ionicons name="sparkles" size={16} color={isLightMode ? '#2563EB' : '#38BDF8'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>Panggilan Suara Gemini Live</Text>
                    <Text style={[styles.optionSub, { color: theme.subtext }]}>Ngobrol langsung lewat audio suara AI</Text>
                  </View>
                </TouchableOpacity>

                {/* Option: Reload Chat */}
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

      {/* ========================================================================= */}
      {/* GEMINI LIVE VOICE MODAL */}
      {/* ========================================================================= */}
      <GeminiLiveVoiceModal
        visible={showLiveVoiceModal}
        onClose={() => setShowLiveVoiceModal(false)}
        botName={effectiveBotName}
        personaPrompt={activePersona?.prompt}
        existingMessages={messages}
        onNewMessagePair={handleLiveVoiceMessagePair}
      />

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
    minWidth: 0,
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
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
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
  streamingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  streamingBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  streamingStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  streamingStatusText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9,
    borderWidth: 1,
  },
  modeBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  streamingCursorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
  emptyScrollWide: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 860,
  },
  emptyCardWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 560,
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
  emptyAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
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
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
  },
  promptText: {
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
    marginRight: 10,
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
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  attachMenuScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  attachOption: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
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
  attachLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
  floatingScrollBtn: {
    position: 'absolute',
    right: 20,
    bottom: 82,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
});

