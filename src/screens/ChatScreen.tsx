import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Image, Modal
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
import { confirmAction, showAlert } from '../lib/alert';
import { safeSaveChatMessages, safeSaveSessions, safeRemoveChatCache } from '../lib/safeStorage';

import { RootStackParamList } from '../navigation/AppNavigator';
import { useResponsive } from '../hooks/useResponsive';
import MarkdownRenderer from '../components/MarkdownRenderer';

const SUGGESTIONS = [
  'Hari ini lumayan melelahkan...',
  'Ada hal yang bikin overthinking tadi',
  'Mau cerita kejadian menarik hari ini',
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
  const { aiPersona, aiBotName } = useMoods();
  const { theme, isLightMode } = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  // Multi-Session & Message States
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('Obrolan Baru');
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

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

      // 2. Read from Supabase DB
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!error && data && data.length > 0) {
        sessionList = data as ChatSession[];
        setSessions(sessionList);
        await safeSaveSessions(user.id, sessionList);
      }

      // 3. Set active session if not set yet
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
      console.log('Error fetching sessions:', e);
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
      // 1. Load from local cache immediately for instant response
      const cachedMsgs = await AsyncStorage.getItem(`@chat_msgs_${user.id}_${sessionId}`);
      if (cachedMsgs) {
        try {
          setMessages(JSON.parse(cachedMsgs));
          scrollToBottom(150);
        } catch (e) {}
      }

      // 2. Fetch from Supabase
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!error && data) {
        setMessages(data as ChatMessage[]);
        await safeSaveChatMessages(user.id, sessionId, data as ChatMessage[]);
        scrollToBottom(250);
      }
    } catch (e) {
      console.log('Error fetching messages:', e);
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

  // Realtime Supabase Sync
  useEffect(() => {
    if (!user || !currentSessionId) return;

    const channel = supabase
      .channel('chat_realtime_' + user.id + '_' + currentSessionId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` },
        payload => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.session_id === currentSessionId || !newMsg.session_id) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id || (m.content === newMsg.content && m.role === newMsg.role && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 3000))) {
                return prev;
              }
              return [...prev, newMsg];
            });
            scrollToBottom(150);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `user_id=eq.${user.id}` },
        () => {
          fetchHistory(currentSessionId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentSessionId, fetchHistory, scrollToBottom]);

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
      try {
        await supabase.from('chat_sessions').insert({
          id: newSessionId,
          user_id: user.id,
          title: newTitle,
        });
      } catch (e) {}
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
          try {
            await supabase.from('chat_messages').delete().eq('session_id', sessionId);
            await supabase.from('chat_sessions').delete().eq('id', sessionId);
          } catch (e) {}
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
        base64: true,
      });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        setAttachment({
          type: 'image',
          uri: asset.uri,
          name: asset.fileName || 'Foto.jpg',
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
          base64: asset.base64 || undefined,
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
        base64: true,
      });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        setAttachment({
          type: 'image',
          uri: asset.uri,
          name: 'Kamera_' + Date.now() + '.jpg',
          size: asset.fileSize,
          mimeType: 'image/jpeg',
          base64: asset.base64 || undefined,
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
        setAttachment({
          type: 'audio',
          uri: file.uri,
          name: file.name || 'Audio.mp3',
          size: file.size,
          mimeType: file.mimeType || 'audio/mpeg',
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
        setAttachment({
          type: file.mimeType?.startsWith('image/') ? 'image' : file.mimeType?.startsWith('audio/') ? 'audio' : 'document',
          uri: file.uri,
          name: file.name || 'Dokumen',
          size: file.size,
          mimeType: file.mimeType,
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
        } catch (e) {}
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
            if (!targetId.startsWith('usr_')) {
              await supabase.from('chat_messages').update({ content: text }).eq('id', targetId);
            }
            if (!nextMsg.id.startsWith('ai_')) {
              await supabase.from('chat_messages').update({ content: newAiReply }).eq('id', nextMsg.id);
            }
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

      const aiReply = await sendMessageToGemini(history, text, currentAttachment, aiPersona);

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

      // Save to local cache
      if (user) {
        await safeSaveChatMessages(user.id, activeSessionId, newFullList);

        // Save to remote Supabase database
        await supabase.from('chat_messages').insert([
          {
            user_id: user.id,
            session_id: activeSessionId,
            role: 'user',
            content: text,
          },
          {
            user_id: user.id,
            session_id: activeSessionId,
            role: 'assistant',
            content: aiReply,
          },
        ]);
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
          if (!msgId.startsWith('usr_') && !msgId.startsWith('ai_')) {
            await supabase.from('chat_messages').delete().eq('id', msgId);
          }
        }
      },
      'Hapus'
    );
  };

  const clearCurrentSessionChat = () => {
    confirmAction(
      'Bersihkan Obrolan Ini?',
      'Semua pesan di sesi ini akan dikosongkan.',
      async () => {
        setMessages([]);
        if (user) {
          await safeRemoveChatCache(user.id, currentSessionId);
          await supabase.from('chat_messages').delete().eq('session_id', currentSessionId);
        }
      },
      'Bersihkan'
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isAi = item.role === 'assistant';

    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        
        {isAi && (
          <View style={[styles.aiAvatar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <Text style={[styles.aiAvatarLetter, { color: theme.accentLight }]}>{(aiBotName || 'Ara')[0].toUpperCase()}</Text>
          </View>
        )}

        <View style={{ maxWidth: '82%' }}>
          
          {/* Attachment Preview */}
          {item.attachment && (
            <View style={[styles.attachmentCard, { borderColor: theme.border }]}>
              {item.attachment.type === 'image' && (
                <Image source={{ uri: item.attachment.uri }} style={styles.attachmentImg} resizeMode="cover" />
              )}
              {item.attachment.type === 'audio' && (
                <View style={[styles.fileRow, { backgroundColor: theme.cardInner }]}>
                  <Ionicons name="musical-notes" size={16} color={theme.accentLight} />
                  <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>{item.attachment.name}</Text>
                </View>
              )}
              {item.attachment.type === 'document' && (
                <View style={[styles.fileRow, { backgroundColor: theme.cardInner }]}>
                  <Ionicons name="document-text" size={16} color={theme.accentLight} />
                  <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>{item.attachment.name}</Text>
                </View>
              )}
            </View>
          )}

          {/* Bubble Container */}
          <View style={[styles.bubble, isUser ? [styles.bubbleUser, { backgroundColor: theme.primary }] : [styles.bubbleAssistant, { backgroundColor: theme.card, borderColor: theme.border }]]}>
            {isUser ? (
              <Text style={styles.msgTextUser} selectable>
                {item.content}
              </Text>
            ) : (
              <MarkdownRenderer
                content={item.content}
                fontSize={13}
                textColor={theme.text}
              />
            )}
          </View>

          {/* Timestamp & Actions */}
          <View style={[styles.metaRow, isUser && { justifyContent: 'flex-end' }]}>
            <Text style={[styles.timeText, { color: theme.muted }]}>
              {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {isUser && (
              <TouchableOpacity onPress={() => handleStartEdit(item)} style={styles.editMsgBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="pencil-outline" size={12} color={theme.subtext} />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => deleteSingleMessage(item.id)} style={styles.deleteMsgBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={12} color={theme.subtext} />
            </TouchableOpacity>
          </View>

        </View>

      </View>
    );
  };

  if (initializing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={theme.accentLight} />
          <Text style={[styles.loadingText, { color: theme.subtext }]}>Memuat ruang obrolan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.innerContainer, isWide && styles.innerContainerWide]}>
      
      {/* ========================================================================= */}
      {/* HEADER WITH MULTI-SESSION THREAD CONTROLS */}
      {/* ========================================================================= */}
      <View style={[styles.header, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
        
        <View style={styles.headerLeft}>
          {/* Sesi History Button */}
          <TouchableOpacity
            style={[styles.sessionHistoryBtn, { backgroundColor: theme.accentBg, borderColor: theme.border }]}
            onPress={() => {
              fetchSessions();
              setShowSessionDrawer(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={theme.accentLight} />
          </TouchableOpacity>

          <View style={[styles.avatarCircle, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <Text style={[styles.avatarLetter, { color: theme.accentLight }]}>{(aiBotName || 'Ara')[0].toUpperCase()}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>{aiBotName || 'Ara'}</Text>
              <View style={styles.statusDot} />
            </View>
            <Text style={[styles.headerSubtitle, { color: theme.subtext }]} numberOfLines={1}>
              {currentSessionTitle || 'Teman Curhat AI'}
            </Text>
          </View>
        </View>

        {/* Right Action Icons: New Chat, Export to Journal, Refresh */}
        <View style={styles.headerRightActions}>
          
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={handleStartNewChat}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={18} color={theme.accentLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={handleExportToJournal}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="book-outline" size={15} color="#FBBF24" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            onPress={() => fetchHistory(currentSessionId)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh-outline" size={16} color={refreshing ? theme.accentLight : theme.subtext} />
          </TouchableOpacity>

          {messages.length > 0 && (
            <TouchableOpacity
              onPress={clearCurrentSessionChat}
              style={[styles.headerActionBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
            </TouchableOpacity>
          )}

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
            <View style={[styles.emptyIconBox, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
              <Ionicons name="sparkles" size={26} color={theme.accentLight} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Ruang Cerita Bersama {aiBotName || 'Ara'}</Text>
            <Text style={[styles.emptyDesc, { color: theme.subtext }]}>
              Tulis apapun yang ada di pikiranmu atau diskusikan tugas kuliah. Percakapan tersimpan aman di sesi ini.
            </Text>

            <View style={styles.promptList}>
              {SUGGESTIONS.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.promptChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => handleSend(item)}
                  disabled={loading}
                >
                  <Text style={[styles.promptText, { color: theme.subtext }]}>{item}</Text>
                  <Ionicons name="arrow-forward" size={13} color={theme.accentLight} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => scrollToBottom(100)}
            onLayout={() => scrollToBottom(100)}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Minimalist Typing indicator */}
        {loading && (
          <View style={styles.typingContainer}>
            <View style={styles.typingDot} />
            <Text style={styles.typingText}>{aiBotName || 'Ara'} sedang berpikir...</Text>
          </View>
        )}

        {/* Graceful Inline Error Toast */}
        {errorToast && (
          <View style={styles.errorToastWrap}>
            <Ionicons name="alert-circle-outline" size={15} color="#F87171" />
            <Text style={styles.errorToastText}>{errorToast}</Text>
            <TouchableOpacity onPress={() => setErrorToast(null)} style={{ padding: 2 }}>
              <Ionicons name="close" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Editing Banner Mode */}
        {editingMsg && (
          <View style={styles.editingBanner}>
            <Ionicons name="pencil" size={13} color="#60A5FA" />
            <Text style={styles.editingText}>Mengedit pesan sebelumnya</Text>
            <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelEditBtn}>
              <Ionicons name="close-circle" size={15} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Active Attachment Pill */}
        {attachment && (
          <View style={styles.attachmentBar}>
            <View style={styles.attachmentPill}>
              <Ionicons
                name={attachment.type === 'image' ? 'image' : attachment.type === 'audio' ? 'musical-note' : 'document'}
                size={13}
                color="#60A5FA"
              />
              <Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text>
              <TouchableOpacity onPress={() => setAttachment(null)} style={{ padding: 2 }}>
                <Ionicons name="close-circle" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Attachment Options Menu */}
        {showAttachMenu && (
          <View style={[styles.attachMenu, { backgroundColor: theme.cardInner, borderTopColor: theme.border }]}>
            <TouchableOpacity style={styles.attachOption} onPress={pickImage}>
              <View style={[styles.attachIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                <Ionicons name="images" size={17} color={theme.accentLight} />
              </View>
              <Text style={[styles.attachLabel, { color: theme.subtext }]}>Galeri</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
              <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B', borderColor: theme.border }]}>
                <Ionicons name="camera" size={17} color={isLightMode ? '#16A34A' : '#34D399'} />
              </View>
              <Text style={[styles.attachLabel, { color: theme.subtext }]}>Kamera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachOption} onPress={pickAudio}>
              <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#FCE7F3' : '#4C1D40', borderColor: theme.border }]}>
                <Ionicons name="mic" size={17} color={isLightMode ? '#EC4899' : '#F472B6'} />
              </View>
              <Text style={[styles.attachLabel, { color: theme.subtext }]}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
              <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#FEF3C7' : '#78350F', borderColor: theme.border }]}>
                <Ionicons name="document-text" size={17} color={isLightMode ? '#D97706' : '#FBBF24'} />
              </View>
              <Text style={[styles.attachLabel, { color: theme.subtext }]}>Dokumen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ======================================================================= */}
        {/* SYMMETRICAL COMPACT INPUT BAR (EQUAL HEIGHT TO SUBMIT BUTTON) */}
        {/* ======================================================================= */}
        <View style={[styles.inputContainer, { backgroundColor: theme.cardInner, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.plusBtn, { backgroundColor: theme.card, borderColor: theme.border }, showAttachMenu && { backgroundColor: theme.accentBg, borderColor: theme.accent }]}
            onPress={() => setShowAttachMenu(!showAttachMenu)}
            disabled={loading}
          >
            <Ionicons name={showAttachMenu ? "close" : "add"} size={18} color={showAttachMenu ? theme.accentLight : theme.subtext} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            placeholder={editingMsg ? "Edit pesanmu..." : `Ceritakan apapun ke ${aiBotName || 'Ara'}...`}
            placeholderTextColor={theme.muted}
            value={inputText}
            onChangeText={setInputText}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
            maxLength={1000}
            editable={!loading}
            // @ts-ignore
            onKeyDown={handleKeyDown}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() && !attachment) || loading
                ? [styles.sendBtnDisabled, { backgroundColor: theme.cardInner, borderWidth: 1, borderColor: theme.border }]
                : styles.sendBtnActive,
            ]}
            onPress={() => handleSend()}
            disabled={(!inputText.trim() && !attachment) || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={16} color={(!inputText.trim() && !attachment) ? theme.muted : '#FFFFFF'} />
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
      </View>

      {/* ========================================================================= */}
      {/* SESSION DRAWER MODAL (RIWAYAT SESI OBROLAN / MULTI-THREAD CHAT) */}
      {/* ========================================================================= */}
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

          <View style={[styles.sessionDrawerCard, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
            <View style={[styles.drawerHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="chatbubbles" size={18} color={theme.accentLight} />
                <Text style={[styles.drawerTitle, { color: theme.text }]}>Riwayat Sesi Curhat</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSessionDrawer(false)} style={styles.closeDrawerBtn}>
                <Ionicons name="close" size={18} color={theme.subtext} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.drawerNewChatBtn, { backgroundColor: theme.primary }]} onPress={handleStartNewChat}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.drawerNewChatText}>Mulai Percakapan Baru</Text>
            </TouchableOpacity>

            <ScrollView style={styles.drawerSessionList} showsVerticalScrollIndicator={false}>
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
                      >
                        <Text style={[styles.sessionItemTitle, { color: theme.subtext }, isActive && [styles.sessionItemTitleActive, { color: theme.text }]]} numberOfLines={1}>
                          {s.title || 'Obrolan'}
                        </Text>
                        <Text style={[styles.sessionItemTime, { color: theme.muted }]}>
                          {new Date(s.updated_at || s.created_at || new Date()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.sessionDeleteBtn}
                        onPress={() => handleDeleteSession(s.id, s.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Attachment Selection Menu Modal */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <TouchableOpacity
          style={styles.attachModalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={[styles.attachMenuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.attachMenuTitle, { color: theme.text }]}>Kirim Lampiran</Text>

            <TouchableOpacity style={[styles.attachOptionRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={pickImage}>
              <View style={[styles.attachIconWrap, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                <Ionicons name="image-outline" size={18} color={theme.accentLight} />
              </View>
              <View>
                <Text style={[styles.attachOptionLabel, { color: theme.text }]}>Foto / Gambar Soal</Text>
                <Text style={[styles.attachOptionSub, { color: theme.subtext }]}>JPG, PNG untuk dianalisis AI</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.attachOptionRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={pickAudio}>
              <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#FEF3C7' : '#3B1A16', borderColor: theme.border }]}>
                <Ionicons name="mic-outline" size={18} color={isLightMode ? '#D97706' : '#FB923C'} />
              </View>
              <View>
                <Text style={[styles.attachOptionLabel, { color: theme.text }]}>Audio / Voice Note</Text>
                <Text style={[styles.attachOptionSub, { color: theme.subtext }]}>MP3, WAV, M4A</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.attachOptionRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]} onPress={pickDocument}>
              <View style={[styles.attachIconWrap, { backgroundColor: isLightMode ? '#DCFCE7' : '#143825', borderColor: theme.border }]}>
                <Ionicons name="document-text-outline" size={18} color={isLightMode ? '#16A34A' : '#4ADE80'} />
              </View>
              <View>
                <Text style={[styles.attachOptionLabel, { color: theme.text }]}>Dokumen Materi / PDF</Text>
                <Text style={[styles.attachOptionSub, { color: theme.subtext }]}>PDF, TXT, DOCX</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1117',
  },
  innerContainer: {
    flex: 1,
    width: '100%',
  },
  innerContainerWide: {
    maxWidth: 1040,
    alignSelf: 'center',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 12,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#11141C',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sessionHistoryBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#253856',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  avatarLetter: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  headerSubtitle: {
    color: '#6B7280',
    fontSize: 10.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },

  /* Content */
  keyboardContainer: {
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  emptyIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#253856',
  },
  emptyTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 320,
  },
  promptList: {
    width: '100%',
    maxWidth: 400,
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  promptText: {
    color: '#9CA3AF',
    fontSize: 11.5,
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  msgRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#202634',
  },
  aiAvatarLetter: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleUser: {
    backgroundColor: '#2563EB',
    borderTopRightRadius: 2,
  },
  bubbleAssistant: {
    backgroundColor: '#141822',
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#202634',
  },
  msgText: {
    fontSize: 12.5,
    lineHeight: 19,
  },
  msgTextUser: {
    color: '#FFFFFF',
  },
  msgTextAssistant: {
    color: '#E5E7EB',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  timeText: {
    color: '#4B5565',
    fontSize: 9.5,
  },
  editMsgBtn: {
    padding: 2,
  },
  deleteMsgBtn: {
    padding: 2,
  },
  attachmentCard: {
    marginBottom: 4,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#202634',
  },
  attachmentImg: {
    width: 180,
    height: 120,
    borderRadius: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141822',
    padding: 8,
  },
  fileName: {
    color: '#E5E7EB',
    fontSize: 11,
    flex: 1,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#60A5FA',
  },
  typingText: {
    color: '#6B7280',
    fontSize: 11,
  },
  errorToastWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#201214',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A1D24',
    marginBottom: 6,
  },
  errorToastText: {
    color: '#F87171',
    fontSize: 11,
    flex: 1,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16233B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#253856',
    marginBottom: 6,
  },
  editingText: {
    color: '#60A5FA',
    fontSize: 11,
    flex: 1,
  },
  cancelEditBtn: {
    padding: 2,
  },
  attachmentBar: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  attachmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141822',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#202634',
  },
  attachmentName: {
    color: '#E5E7EB',
    fontSize: 11,
    maxWidth: 200,
  },
  attachMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#11141C',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E2430',
  },
  attachOption: {
    alignItems: 'center',
    gap: 4,
  },
  attachIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  attachLabel: {
    color: '#9CA3AF',
    fontSize: 10,
  },

  /* Symmetrical Input Bar */
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#11141C',
    borderTopWidth: 1,
    borderTopColor: '#1E2430',
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  plusBtnActive: {
    backgroundColor: '#16233B',
    borderColor: '#253856',
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#F3F4F6',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#202634',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#2563EB',
  },
  sendBtnDisabled: {
    backgroundColor: '#1E2430',
  },

  /* Session Drawer Modal */
  sessionModalOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sessionBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sessionDrawerCard: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: '#11141C',
    borderRightWidth: 1,
    borderRightColor: '#1E2430',
    paddingVertical: 16,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    elevation: 25,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
  },
  drawerTitle: {
    color: '#F3F4F6',
    fontSize: 13.5,
    fontWeight: '700',
  },
  closeDrawerBtn: {
    padding: 4,
  },
  drawerNewChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    marginVertical: 10,
  },
  drawerNewChatText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  drawerSessionList: {
    flex: 1,
  },
  emptySessionText: {
    color: '#6B7280',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 20,
  },
  sessionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141822',
    borderRadius: 8,
    padding: 9,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#202634',
  },
  sessionItemRowActive: {
    backgroundColor: '#16233B',
    borderColor: '#253856',
  },
  sessionItemTitle: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '500',
  },
  sessionItemTitleActive: {
    color: '#F3F4F6',
    fontWeight: '600',
  },
  sessionItemTime: {
    color: '#4B5565',
    fontSize: 9,
    marginTop: 2,
  },
  sessionDeleteBtn: {
    padding: 4,
  },
  attachModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  attachMenuCard: {
    backgroundColor: '#11141C',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#1E2430',
    padding: 20,
    gap: 12,
  },
  attachMenuTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  attachOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141822',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
  },
  attachOptionLabel: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
  },
  attachOptionSub: {
    color: '#6B7280',
    fontSize: 11,
  },
});
