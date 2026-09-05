import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  TouchableWithoutFeedback, Animated, Platform, ActivityIndicator, ScrollView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { FlashcardItem } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';

interface Flashcard3DModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  flashcards: FlashcardItem[];
  onSaveFlashcards?: (cards: FlashcardItem[]) => void;
}

interface AiEvaluationResult {
  status: 'correct' | 'partial' | 'incorrect';
  score: number; // 0 to 100
  feedback: string;
  keyPointsCovered: string[];
  missingPoints: string[];
}

export default function Flashcard3DModal({
  visible,
  onClose,
  title,
  flashcards: initialCards,
  onSaveFlashcards,
}: Flashcard3DModalProps) {
  const { theme, isLightMode } = useTheme();
  const [cards, setCards] = useState<FlashcardItem[]>(initialCards || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [studyMode, setStudyMode] = useState<'flip' | 'recall'>('flip');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Active Recall state
  const [userAnswerText, setUserAnswerText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [evaluatingAnswer, setEvaluatingAnswer] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<AiEvaluationResult | null>(null);

  // Speech Recognition & Scroll references
  const recognitionRef = useRef<any>(null);
  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const autoAdvanceTimerRef = useRef<any>(null);

  // 3D Flip Animation Value
  const animatedValue = useRef(new Animated.Value(0)).current;

  // Pulse animation for recording mic
  const micPulse = useRef(new Animated.Value(1)).current;

  // Sync state ONLY when modal opens (prevent wipeout on answer save)
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      if (initialCards && initialCards.length > 0) {
        setCards(initialCards);
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowHint(false);
        setUserAnswerText('');
        setEvaluationResult(null);
        if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
        animatedValue.setValue(0);
      }
    }
    prevVisibleRef.current = visible;
  }, [visible, initialCards]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  // Voice recording pulse animation
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isRecordingVoice) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.25, duration: 400, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      micPulse.setValue(1);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isRecordingVoice]);

  const currentCard = cards[currentIndex] || null;

  // 3D Flip interpolations with proper clamping
  const frontInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
    extrapolate: 'clamp',
  });

  const backInterpolate = animatedValue.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
    extrapolate: 'clamp',
  });

  const frontOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const backOpacity = animatedValue.interpolate({
    inputRange: [89, 90],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const flipCard = () => {
    if (isFlipped) {
      Animated.spring(animatedValue, {
        toValue: 0,
        friction: 8,
        tension: 12,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      setIsFlipped(false);
    } else {
      Animated.spring(animatedValue, {
        toValue: 180,
        friction: 8,
        tension: 12,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      setIsFlipped(true);
    }
  };

  const handleNext = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (currentIndex < cards.length - 1) {
      if (isFlipped) {
        animatedValue.setValue(0);
        setIsFlipped(false);
      }
      setShowHint(false);
      setUserAnswerText('');
      setEvaluationResult(null);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (currentIndex > 0) {
      if (isFlipped) {
        animatedValue.setValue(0);
        setIsFlipped(false);
      }
      setShowHint(false);
      setUserAnswerText('');
      setEvaluationResult(null);
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleShuffle = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    if (isFlipped) {
      animatedValue.setValue(0);
      setIsFlipped(false);
    }
    setShowHint(false);
    setUserAnswerText('');
    setEvaluationResult(null);
  };

  // Grade SRS Mastery for the current card
  const handleGrade = (difficulty: 'hard' | 'medium' | 'easy') => {
    const updatedCards = [...cards];
    updatedCards[currentIndex] = {
      ...updatedCards[currentIndex],
      difficulty,
      mastered: difficulty === 'easy',
    };
    setCards(updatedCards);
    onSaveFlashcards?.(updatedCards);

    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        handleNext();
      }, 200);
    }
  };

  // Stop all audio & voice recognitions
  const stopAllVoice = async () => {
    setIsRecordingVoice(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (nativeRecordingRef.current) {
      try {
        await nativeRecordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      nativeRecordingRef.current = null;
    }
  };

  // Voice Input Speech Recognition Handler (Web & Native)
  const toggleVoiceRecording = async () => {
    setVoiceErrorMessage(null);

    // If currently recording, stop it
    if (isRecordingVoice) {
      if (Platform.OS === 'web') {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }
        setIsRecordingVoice(false);
      } else {
        // Native: stop recording and process audio with Gemini
        await stopNativeRecordingAndTranscribe();
      }
      return;
    }

    // 1. WEB PLATFORM: Request mic permission & start Web Speech Recognition
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;

      // First, request microphone permission via getUserMedia
      if (navigator?.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Immediately release tracks
          stream.getTracks().forEach((track) => track.stop());
        } catch (err: any) {
          console.warn('Web Mic permission error:', err);
          const msg = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Izin mikrofon diblokir. Klik ikon gembok 🔒 di bilah alamat browser lalu ubah izin Mikrofon menjadi "Izinkan".'
            : 'Gagal mengakses mikrofon: ' + (err.message || 'Izin ditolak');
          setVoiceErrorMessage(msg);
          if (Platform.OS === 'web' && typeof alert !== 'undefined') {
            alert(msg);
          }
          return;
        }
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        const unsupportedMsg = 'Peramban ini belum mendukung Web Speech Recognition. Gunakan Google Chrome atau Edge, atau ketik langsung jawabanmu.';
        setVoiceErrorMessage(unsupportedMsg);
        alert(unsupportedMsg);
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'id-ID'; // Bahasa Indonesia
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
          setIsRecordingVoice(true);
          setVoiceErrorMessage(null);
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript;
            } else {
              interim += transcript;
            }
          }

          const currentChunk = (final || interim).trim();
          if (currentChunk) {
            setUserAnswerText((prev) => {
              const base = prev ? prev.trim() : '';
              if (!base) return currentChunk;
              if (base.endsWith(currentChunk) || currentChunk.startsWith(base)) return currentChunk;
              return `${base} ${currentChunk}`;
            });
          }
        };

        recognition.onerror = (err: any) => {
          console.log('Speech recognition error:', err);
          if (err.error === 'not-allowed') {
            setVoiceErrorMessage('Izin mikrofon belum aktif. Izinkan akses mikrofon di browser.');
          }
          setIsRecordingVoice(false);
        };

        recognition.onend = () => {
          setIsRecordingVoice(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecordingVoice(true);
      } catch (e: any) {
        console.log('Error starting speech recognition:', e);
        setVoiceErrorMessage('Gagal memulai pengenalan suara: ' + (e.message || ''));
        setIsRecordingVoice(false);
      }
      return;
    }

    // 2. NATIVE PLATFORMS (Android & iOS): Request permission & start Audio.Recording
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        const msg = 'Izin mikrofon belum diberikan. Buka Pengaturan HP > Aplikasi > Izin untuk mengaktifkan mikrofon.';
        setVoiceErrorMessage(msg);
        Alert.alert('Izin Mikrofon Diperlukan', msg);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      nativeRecordingRef.current = recording;
      setIsRecordingVoice(true);
      setVoiceErrorMessage(null);
    } catch (e: any) {
      console.warn('Native recording error:', e);
      setVoiceErrorMessage('Gagal merekam suara: ' + (e.message || ''));
      setIsRecordingVoice(false);
    }
  };

  const stopNativeRecordingAndTranscribe = async () => {
    if (!nativeRecordingRef.current) {
      setIsRecordingVoice(false);
      return;
    }

    setIsRecordingVoice(false);
    setIsProcessingVoice(true);
    setVoiceErrorMessage(null);

    try {
      const recording = nativeRecordingRef.current;
      nativeRecordingRef.current = null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (uri) {
        const base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const audioAttachment = {
          id: Date.now().toString(),
          name: 'flashcard_answer.m4a',
          type: 'audio' as const,
          uri,
          mimeType: 'audio/m4a',
          base64: base64Data,
        };

        const transcribePrompt =
          'Transkripsikan audio rekaman ini secara akurat ke dalam teks bahasa Indonesia. ' +
          'HANYA keluarkan teks hasil ucapan pembicara tanpa tanda kutip, tanpa kata pengantar, dan tanpa komentar apapun.';

        const transcription = await sendMessageToGemini([], transcribePrompt, audioAttachment);
        const cleanTrans = (transcription || '').replace(/^["']|["']$/g, '').trim();

        if (cleanTrans) {
          setUserAnswerText((prev) => (prev ? `${prev.trim()} ${cleanTrans}` : cleanTrans));
        }
      }
    } catch (err: any) {
      console.warn('Voice transcription error:', err);
      setVoiceErrorMessage('Gagal mentranskripsikan suara: ' + (err.message || ''));
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // AI Active Recall Evaluation
  const handleEvaluateAnswer = async () => {
    if (!currentCard || !userAnswerText.trim()) return;

    if (isRecordingVoice && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecordingVoice(false);
    }

    setEvaluatingAnswer(true);
    setEvaluationResult(null);

    try {
      const evalPrompt = `Kamu adalah dosen penguji akademik profesional. 
Tolong evaluasi jawaban mahasiswa berikut untuk kartu pertanyaan konsep ini.

Pertanyaan / Konsep: "${currentCard.front}"
Kunci Jawaban Resmi / Penjelasan Acuan: "${currentCard.back}"
Jawaban Mahasiswa: "${userAnswerText.trim()}"

Evaluasi ketepatan pemahaman konsep mahasiswa. Berikan penilaian yang adil, toleran terhadap sinonim atau bahasa lisan sehari-hari, namun pastikan poin inti tersampaikan.

Format output HARUS HANYA berupa JSON valid murni tanpa pembungkus markdown:
{
  "status": "correct",
  "score": 90,
  "feedback": "Penjelasan singkat, konstruktif, dan menyemangati tentang jawaban mahasiswa",
  "keyPointsCovered": ["Poin konsep yang sudah benar dijawab"],
  "missingPoints": ["Poin yang masih terlewat (jika ada)"]
}`;

      const aiReply = await sendMessageToGemini([], evalPrompt, null, undefined, { isJsonMode: true });
      let result: AiEvaluationResult | null = null;

      try {
        const parsed: any = extractJsonFromText(aiReply);
        if (parsed && (parsed.status || typeof parsed.score === 'number')) {
          result = {
            status: parsed.status === 'correct' ? 'correct' : parsed.status === 'partial' ? 'partial' : 'incorrect',
            score: typeof parsed.score === 'number' ? parsed.score : (parsed.status === 'correct' ? 90 : parsed.status === 'partial' ? 65 : 40),
            feedback: parsed.feedback || 'Jawaban telah dianalisis oleh AI.',
            keyPointsCovered: Array.isArray(parsed.keyPointsCovered) ? parsed.keyPointsCovered : [],
            missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints : [],
          };
        }
      } catch (parseErr) {
        const lowerReply = (aiReply || '').toLowerCase();
        const isGood = lowerReply.includes('correct') || lowerReply.includes('benar') || lowerReply.includes('tepat');
        const isPart = lowerReply.includes('partial') || lowerReply.includes('hampir') || lowerReply.includes('cukup');
        result = {
          status: isGood ? 'correct' : isPart ? 'partial' : 'incorrect',
          score: isGood ? 85 : isPart ? 60 : 35,
          feedback: aiReply.replace(/```json|```|\{|\}/g, '').trim() || 'Jawaban telah dievaluasi.',
          keyPointsCovered: [],
          missingPoints: [],
        };
      }

      if (result) {
        setEvaluationResult(result);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);

        if (result.status === 'correct' || result.score >= 75) {
          const updatedCards = [...cards];
          updatedCards[currentIndex] = {
            ...updatedCards[currentIndex],
            difficulty: 'easy',
            mastered: true,
          };
          setCards(updatedCards);
          onSaveFlashcards?.(updatedCards);
        } else if (result.status === 'partial') {
          const updatedCards = [...cards];
          updatedCards[currentIndex] = {
            ...updatedCards[currentIndex],
            difficulty: 'medium',
            mastered: false,
          };
          setCards(updatedCards);
          onSaveFlashcards?.(updatedCards);
        }
      }
    } catch (e: any) {
      setEvaluationResult({
        status: 'incorrect',
        score: 0,
        feedback: e.message || 'Gagal terhubung ke AI. Pastikan perangkat memiliki koneksi internet aktif.',
        keyPointsCovered: [],
        missingPoints: [],
      });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
    } finally {
      setEvaluatingAnswer(false);
    }
  };

  const masteredCount = cards.filter(c => c.mastered || c.difficulty === 'easy').length;
  const progressPercent = cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: isLightMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(2, 6, 23, 0.82)' }]}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              
              {/* Header Bar */}
              <View style={styles.headerRow}>
                <View style={styles.headerTitleGroup}>
                  <View style={[styles.headerIconWrap, { backgroundColor: theme.accentBg }]}>
                    <Ionicons name="card-outline" size={16} color={theme.accentLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                      Flashcard Belajar
                    </Text>
                    <Text style={[styles.headerSub, { color: theme.subtext }]} numberOfLines={1}>
                      {title}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerRightActions}>
                  <TouchableOpacity
                    style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={handleShuffle}
                  >
                    <Ionicons name="shuffle-outline" size={15} color={theme.subtext} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.headerIconBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={onClose}
                  >
                    <Ionicons name="close" size={15} color={theme.subtext} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Mode Switcher: Flip Card vs Active Recall AI */}
              <View style={[styles.modeToggleWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <TouchableOpacity
                  style={[
                    styles.modeToggleBtn,
                    studyMode === 'flip' && [styles.modeToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                  ]}
                  onPress={() => {
                    setStudyMode('flip');
                    setEvaluationResult(null);
                  }}
                >
                  <Ionicons name="repeat-outline" size={13} color={studyMode === 'flip' ? theme.accentLight : theme.subtext} />
                  <Text style={[styles.modeToggleText, { color: theme.subtext }, studyMode === 'flip' && [styles.modeToggleTextActive, { color: theme.accentLight }]]}>
                    Mode Balik Kartu
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeToggleBtn,
                    studyMode === 'recall' && [styles.modeToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                  ]}
                  onPress={() => {
                    setStudyMode('recall');
                    if (isFlipped) {
                      animatedValue.setValue(0);
                      setIsFlipped(false);
                    }
                  }}
                >
                  <Ionicons name="mic-outline" size={13} color={studyMode === 'recall' ? theme.accentLight : theme.subtext} />
                  <Text style={[styles.modeToggleText, { color: theme.subtext }, studyMode === 'recall' && [styles.modeToggleTextActive, { color: theme.accentLight }]]}>
                    Uji Suara & Teks (AI)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mastery Progress Bar */}
              <View style={[styles.progressBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <View style={styles.progressTopRow}>
                  <Text style={[styles.progressLabel, { color: theme.subtext }]}>
                    Progres Penguasaan ({masteredCount}/{cards.length} Kartu)
                  </Text>
                  <Text style={[styles.progressPercentText, { color: theme.accentLight }]}>
                    {progressPercent}%
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progressPercent}%` }]} />
                </View>
              </View>

              {/* ========================================================================= */}
              {/* MODE 1: 3D FLIP CARD */}
              {/* ========================================================================= */}
              {studyMode === 'flip' ? (
                currentCard ? (
                  <View style={styles.cardContainer}>
                    {/* Layer 2 Tumpukan Kartu Belakang (Deck Depth - Lapisan Terbawah) */}
                    {cards.length > currentIndex + 2 && (
                      <View
                        style={[
                          styles.cardDeckLayer,
                          {
                            top: 10,
                            bottom: -10,
                            left: 14,
                            right: 14,
                            backgroundColor: isLightMode ? '#E2E8F0' : theme.card,
                            borderColor: theme.border,
                            opacity: isLightMode ? 0.6 : 0.45,
                            zIndex: 1,
                            ...(Platform.OS === 'web' ? {
                              boxShadow: isLightMode ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 14px rgba(0,0,0,0.45)',
                            } : {}),
                          }
                        ]}
                      />
                    )}

                    {/* Layer 1 Tumpukan Kartu Belakang (Deck Depth - Lapisan Tengah) */}
                    {cards.length > currentIndex + 1 && (
                      <View
                        style={[
                          styles.cardDeckLayer,
                          {
                            top: 5,
                            bottom: -5,
                            left: 7,
                            right: 7,
                            backgroundColor: isLightMode ? '#F1F5F9' : theme.cardInner,
                            borderColor: theme.border,
                            opacity: isLightMode ? 0.85 : 0.7,
                            zIndex: 2,
                            ...(Platform.OS === 'web' ? {
                              boxShadow: isLightMode ? '0 6px 16px rgba(0,0,0,0.08)' : '0 6px 18px rgba(0,0,0,0.5)',
                            } : {}),
                          }
                        ]}
                      />
                    )}

                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={flipCard}
                      style={[styles.flipTouchWrap, { zIndex: 5 }]}
                    >
                      {/* Front Face of Card */}
                      <Animated.View
                        pointerEvents={isFlipped ? 'none' : 'auto'}
                        style={[
                          styles.flipCardFace,
                          {
                            backgroundColor: isLightMode ? '#FFFFFF' : theme.cardInner,
                            borderColor: theme.border,
                            zIndex: isFlipped ? 0 : 10,
                            shadowColor: isLightMode ? '#0F172A' : '#000000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: isLightMode ? 0.12 : 0.55,
                            shadowRadius: 16,
                            elevation: 8,
                            transform: [
                              { perspective: 1200 },
                              { rotateY: frontInterpolate },
                            ],
                            opacity: frontOpacity,
                            ...(Platform.OS === 'web' ? {
                              boxShadow: isLightMode
                                ? '0 10px 25px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -2px rgba(15, 23, 42, 0.05)'
                                : '0 14px 30px -4px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
                            } : {}),
                          }
                        ]}
                      >
                        <View style={styles.cardFaceHeader}>
                          <View style={[styles.cardTagBadge, { backgroundColor: theme.accentBg }]}>
                            <Text style={[styles.cardTagText, { color: theme.accentLight }]}>Pertanyaan / Konsep</Text>
                          </View>
                          <Text style={[styles.cardCounterText, { color: theme.muted }]}>
                            {currentIndex + 1} / {cards.length}
                          </Text>
                        </View>

                        <View style={styles.cardBodyCenter}>
                          <Text style={[styles.cardMainText, { color: theme.text }]}>
                            {currentCard.front}
                          </Text>
                        </View>

                        {currentCard.hint && (
                          <View style={styles.hintContainer}>
                            {showHint ? (
                              <View style={[styles.hintCard, { backgroundColor: isLightMode ? '#FEF3C7' : '#2B2012', borderColor: isLightMode ? '#FDE68A' : '#4C3B18' }]}>
                                <Ionicons name="bulb-outline" size={13} color={isLightMode ? '#B45309' : '#FBBF24'} />
                                <Text style={[styles.hintText, { color: isLightMode ? '#92400E' : '#FDE68A' }]}>
                                  {currentCard.hint}
                                </Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); setShowHint(true); }}
                                style={[styles.showHintBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                              >
                                <Ionicons name="bulb-outline" size={12} color={theme.subtext} />
                                <Text style={[styles.showHintBtnText, { color: theme.subtext }]}>Lihat Petunjuk</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        <View style={styles.cardFooterNotice}>
                          <Ionicons name="repeat-outline" size={13} color={theme.muted} />
                          <Text style={[styles.cardFooterNoticeText, { color: theme.muted }]}>
                            Ketuk kartu untuk melihat jawaban
                          </Text>
                        </View>
                      </Animated.View>

                      {/* Back Face of Card */}
                      <Animated.View
                        pointerEvents={isFlipped ? 'auto' : 'none'}
                        style={[
                          styles.flipCardFace,
                          styles.flipCardBack,
                          {
                            backgroundColor: isLightMode ? '#F8FAFC' : theme.cardInner,
                            borderColor: theme.accent,
                            zIndex: isFlipped ? 10 : 0,
                            shadowColor: theme.accent || (isLightMode ? '#10B981' : '#34D399'),
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: isLightMode ? 0.2 : 0.45,
                            shadowRadius: 18,
                            elevation: 8,
                            transform: [
                              { perspective: 1200 },
                              { rotateY: backInterpolate },
                            ],
                            opacity: backOpacity,
                            ...(Platform.OS === 'web' ? {
                              boxShadow: isLightMode
                                ? `0 10px 25px -3px rgba(15, 23, 42, 0.1), 0 0 20px -2px ${theme.accent}33`
                                : `0 14px 30px -4px rgba(0, 0, 0, 0.7), 0 0 24px -2px ${theme.accent}4D`,
                            } : {}),
                          }
                        ]}
                      >
                        <View style={styles.cardFaceHeader}>
                          <View style={[styles.cardTagBadge, { backgroundColor: isLightMode ? '#DCFCE7' : '#0F261E' }]}>
                            <Text style={[styles.cardTagText, { color: isLightMode ? '#15803D' : '#34D399' }]}>Penjelasan / Jawaban</Text>
                          </View>
                          <Text style={[styles.cardCounterText, { color: theme.muted }]}>
                            {currentIndex + 1} / {cards.length}
                          </Text>
                        </View>

                        <View style={styles.cardBodyCenter}>
                          <Text style={[styles.cardAnswerText, { color: theme.text }]}>
                            {currentCard.back}
                          </Text>
                        </View>

                        <View style={styles.cardFooterNotice}>
                          <Ionicons name="repeat-outline" size={13} color={theme.muted} />
                          <Text style={[styles.cardFooterNoticeText, { color: theme.muted }]}>
                            Ketuk kartu untuk kembali ke pertanyaan
                          </Text>
                        </View>
                      </Animated.View>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyStateBox}>
                    <Ionicons name="card-outline" size={32} color={theme.muted} />
                    <Text style={[styles.emptyStateText, { color: theme.subtext }]}>
                      Belum ada flashcard untuk materi ini.
                    </Text>
                  </View>
                )
              ) : (
                /* ========================================================================= */
                /* MODE 2: ACTIVE RECALL AI EXAM (VOICE & TEXT INPUT + AI VALIDATION) */
                /* ========================================================================= */
                currentCard ? (
                  <ScrollView ref={scrollViewRef} style={styles.recallScrollView} showsVerticalScrollIndicator={false}>
                    {/* Question Card */}
                    <View style={[
                      styles.recallQuestionCard,
                      {
                        backgroundColor: isLightMode ? '#F8FAFC' : theme.cardInner,
                        borderColor: theme.border,
                        shadowColor: isLightMode ? '#0F172A' : '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: isLightMode ? 0.08 : 0.4,
                        shadowRadius: 10,
                        elevation: 4,
                        ...(Platform.OS === 'web' ? {
                          boxShadow: isLightMode
                            ? '0 4px 12px rgba(15, 23, 42, 0.06)'
                            : '0 6px 16px rgba(0, 0, 0, 0.4)',
                        } : {}),
                      }
                    ]}>
                      <View style={styles.cardFaceHeader}>
                        <View style={[styles.cardTagBadge, { backgroundColor: theme.accentBg }]}>
                          <Text style={[styles.cardTagText, { color: theme.accentLight }]}>Soal Ujian Lisan AI</Text>
                        </View>
                        <Text style={[styles.cardCounterText, { color: theme.muted }]}>
                          {currentIndex + 1} / {cards.length}
                        </Text>
                      </View>
                      <Text style={[styles.recallQuestionText, { color: theme.text }]}>
                        {currentCard.front}
                      </Text>
                    </View>

                    {/* Voice & Text Answer Input Box */}
                    <View style={[styles.answerInputWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                      {isRecordingVoice && (
                        <View style={[styles.recordingLiveBanner, { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1619', borderColor: '#EF4444' }]}>
                          <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                            <Ionicons name="radio" size={14} color="#EF4444" />
                          </Animated.View>
                          <Text style={[styles.recordingLiveBannerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>
                            {Platform.OS === 'web'
                              ? 'Mendengarkan suaramu... Bicara sekarang (otomatis tertulis di bawah)'
                              : 'Sedang merekam suara... Ketuk tombol mikrofon lagi setelah selesai bicara'}
                          </Text>
                        </View>
                      )}

                      {isProcessingVoice && (
                        <View style={[styles.recordingLiveBanner, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554', borderColor: '#3B82F6' }]}>
                          <ActivityIndicator size="small" color={theme.primary} />
                          <Text style={[styles.recordingLiveBannerText, { color: isLightMode ? '#1D4ED8' : '#93C5FD' }]}>
                            AI sedang mengubah suara menjadi teks...
                          </Text>
                        </View>
                      )}

                      {voiceErrorMessage && (
                        <View style={[styles.recordingErrorBanner, { backgroundColor: isLightMode ? '#FEF2F2' : '#2D1619', borderColor: '#FECACA' }]}>
                          <Ionicons name="alert-circle" size={14} color="#EF4444" />
                          <Text style={[styles.recordingErrorBannerText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>
                            {voiceErrorMessage}
                          </Text>
                        </View>
                      )}

                      <TextInput
                        style={[styles.answerInput, { color: theme.text }]}
                        placeholder="Ketik jawabanmu di sini, atau tekan tombol mikrofon untuk berbicara..."
                        placeholderTextColor={theme.muted}
                        multiline
                        numberOfLines={3}
                        value={userAnswerText}
                        onChangeText={setUserAnswerText}
                      />

                      {/* Action Bar: Mic Record & Submit to AI */}
                      <View style={styles.answerActionRow}>
                        <TouchableOpacity
                          style={[
                            styles.voiceMicBtn,
                            isRecordingVoice && { backgroundColor: '#DC2626', borderColor: '#EF4444' },
                            isProcessingVoice && { opacity: 0.6 }
                          ]}
                          onPress={toggleVoiceRecording}
                          disabled={isProcessingVoice}
                          activeOpacity={0.8}
                        >
                          <Animated.View style={{ transform: [{ scale: micPulse }] }}>
                            <Ionicons
                              name={isRecordingVoice ? 'stop-circle' : 'mic'}
                              size={16}
                              color={isRecordingVoice ? '#FFFFFF' : theme.accentLight}
                            />
                          </Animated.View>
                          <Text style={[styles.voiceMicText, { color: isRecordingVoice ? '#FFFFFF' : theme.accentLight }]}>
                            {isRecordingVoice ? 'Selesai Bicara' : 'Jawab via Suara'}
                          </Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {userAnswerText.trim().length > 0 && !evaluatingAnswer && (
                            <TouchableOpacity
                              style={[styles.clearTextBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                              onPress={() => setUserAnswerText('')}
                            >
                              <Ionicons name="trash-outline" size={13} color={theme.subtext} />
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[
                              styles.evalBtn,
                              { backgroundColor: theme.primary },
                              (!userAnswerText.trim() || evaluatingAnswer || isRecordingVoice) && { opacity: 0.5 }
                            ]}
                            onPress={handleEvaluateAnswer}
                            disabled={!userAnswerText.trim() || evaluatingAnswer || isRecordingVoice}
                          >
                            {evaluatingAnswer ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                                <Text style={styles.evalBtnText}>Periksa Jawaban</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {/* AI Evaluation Feedback Card */}
                    {evaluationResult && (
                      <View
                        style={[
                          styles.evalResultCard,
                          evaluationResult.status === 'correct' && {
                            backgroundColor: isLightMode ? '#ECFDF5' : '#0B2319',
                            borderColor: isLightMode ? '#A7F3D0' : '#1C4A3A'
                          },
                          evaluationResult.status === 'partial' && {
                            backgroundColor: isLightMode ? '#FFFBEB' : '#2B2010',
                            borderColor: isLightMode ? '#FDE68A' : '#574116'
                          },
                          evaluationResult.status === 'incorrect' && {
                            backgroundColor: isLightMode ? '#FEF2F2' : '#2D1619',
                            borderColor: isLightMode ? '#FECACA' : '#5C1D24'
                          }
                        ]}
                      >
                        <View style={styles.evalResultTopRow}>
                          <View style={styles.evalStatusPill}>
                            <Ionicons
                              name={
                                evaluationResult.status === 'correct'
                                  ? 'checkmark-circle'
                                  : evaluationResult.status === 'partial'
                                  ? 'alert-circle'
                                  : 'close-circle'
                              }
                              size={17}
                              color={
                                evaluationResult.status === 'correct'
                                  ? '#10B981'
                                  : evaluationResult.status === 'partial'
                                  ? '#F59E0B'
                                  : '#EF4444'
                              }
                            />
                            <Text
                              style={[
                                styles.evalStatusText,
                                {
                                  color:
                                    evaluationResult.status === 'correct'
                                      ? '#10B981'
                                      : evaluationResult.status === 'partial'
                                      ? '#F59E0B'
                                      : '#EF4444'
                                }
                              ]}
                            >
                              {evaluationResult.status === 'correct'
                                ? 'Jawaban Tepat & Benar'
                                : evaluationResult.status === 'partial'
                                ? 'Hampir Benar / Perlu Dilengkapi'
                                : 'Belum Tepat'}
                            </Text>
                          </View>
                          <Text style={[styles.evalScoreText, { color: theme.text }]}>
                            Skor: {evaluationResult.score}/100
                          </Text>
                        </View>

                        <Text style={[styles.evalFeedbackText, { color: theme.text }]}>
                          {evaluationResult.feedback}
                        </Text>

                        {/* Reference Model Answer */}
                        <View style={[styles.modelAnswerBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                          <Text style={[styles.modelAnswerLabel, { color: theme.subtext }]}>Kunci Penjelasan Resmi:</Text>
                          <Text style={[styles.modelAnswerText, { color: theme.text }]}>{currentCard.back}</Text>
                        </View>

                        {/* Next question action button if there is next card */}
                        {currentIndex < cards.length - 1 ? (
                          <TouchableOpacity
                            style={[styles.nextQuestionBtn, { backgroundColor: theme.primary }]}
                            onPress={handleNext}
                          >
                            <Text style={styles.nextQuestionBtnText}>Lanjut ke Soal Berikutnya ({currentIndex + 2}/{cards.length})</Text>
                            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.nextQuestionBtn, { backgroundColor: '#10B981' }]}
                            onPress={onClose}
                          >
                            <Text style={styles.nextQuestionBtnText}>Selesai Uji Semua Flashcard</Text>
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </ScrollView>
                ) : null
              )}

              {/* SRS Rating Mastery Buttons (Visible in Flip Mode) */}
              {studyMode === 'flip' && (
                <View style={styles.srsRow}>
                  <TouchableOpacity
                    style={[
                      styles.srsBtn,
                      { backgroundColor: isLightMode ? '#FEE2E2' : '#2D1619', borderColor: isLightMode ? '#FECACA' : '#571F26' },
                      currentCard?.difficulty === 'hard' && { borderWidth: 2, borderColor: '#EF4444' }
                    ]}
                    onPress={() => handleGrade('hard')}
                  >
                    <Ionicons name="close-circle-outline" size={15} color="#EF4444" />
                    <Text style={[styles.srsBtnText, { color: isLightMode ? '#DC2626' : '#F87171' }]}>
                      Belum Paham
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.srsBtn,
                      { backgroundColor: isLightMode ? '#FEF3C7' : '#2B2012', borderColor: isLightMode ? '#FDE68A' : '#4C3B18' },
                      currentCard?.difficulty === 'medium' && { borderWidth: 2, borderColor: '#F59E0B' }
                    ]}
                    onPress={() => handleGrade('medium')}
                  >
                    <Ionicons name="help-circle-outline" size={15} color="#F59E0B" />
                    <Text style={[styles.srsBtnText, { color: isLightMode ? '#B45309' : '#FBBF24' }]}>
                      Cukup Paham
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.srsBtn,
                      { backgroundColor: isLightMode ? '#DCFCE7' : '#0F261E', borderColor: isLightMode ? '#86EFAC' : '#1C4A36' },
                      (currentCard?.mastered || currentCard?.difficulty === 'easy') && { borderWidth: 2, borderColor: '#10B981' }
                    ]}
                    onPress={() => handleGrade('easy')}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color="#10B981" />
                    <Text style={[styles.srsBtnText, { color: isLightMode ? '#15803D' : '#34D399' }]}>
                      Sudah Dikuasai
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Bottom Nav Controller */}
              <View style={styles.navRow}>
                <TouchableOpacity
                  style={[styles.navBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, currentIndex === 0 && { opacity: 0.4 }]}
                  onPress={handlePrev}
                  disabled={currentIndex === 0}
                >
                  <Ionicons name="chevron-back" size={16} color={theme.text} />
                  <Text style={[styles.navBtnText, { color: theme.text }]}>Sebelumnya</Text>
                </TouchableOpacity>

                {studyMode === 'flip' ? (
                  <TouchableOpacity
                    style={[styles.flipBtnAction, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                    onPress={flipCard}
                  >
                    <Ionicons name="sync-outline" size={14} color={theme.accentLight} />
                    <Text style={[styles.flipBtnActionText, { color: theme.accentLight }]}>
                      {isFlipped ? 'Lihat Soal' : 'Balik Kartu'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flex: 1 }} />
                )}

                <TouchableOpacity
                  style={[styles.navBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }, currentIndex === cards.length - 1 && { opacity: 0.4 }]}
                  onPress={handleNext}
                  disabled={currentIndex === cards.length - 1}
                >
                  <Text style={[styles.navBtnText, { color: theme.text }]}>Selanjutnya</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalBox: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleWrap: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeToggleBtnActive: {
    borderWidth: 1,
  },
  modeToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  modeToggleTextActive: {
    fontWeight: '800',
  },
  progressBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 9,
    gap: 6,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  progressTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  cardContainer: {
    height: 260,
    width: '100%',
    position: 'relative',
    marginBottom: 12,
  },
  cardDeckLayer: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  flipTouchWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  flipCardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1.2,
    padding: 18,
    justifyContent: 'space-between',
    backfaceVisibility: 'hidden',
  },
  flipCardBack: {},
  cardFaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardTagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardCounterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardBodyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardMainText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  cardAnswerText: {
    fontSize: 14.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  hintContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  hintText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  showHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  showHintBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardFooterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  cardFooterNoticeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  recallScrollView: {
    maxHeight: 440,
  },
  recallQuestionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 10,
  },
  recallQuestionText: {
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 22,
  },
  answerInputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  answerInput: {
    fontSize: 13,
    lineHeight: 20,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  answerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recordingLiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  recordingLiveBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  recordingErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  recordingErrorBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
  },
  clearTextBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voiceMicText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  evalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  evalBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  evalResultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 10,
  },
  evalResultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evalStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  evalStatusText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  evalScoreText: {
    fontSize: 12,
    fontWeight: '800',
  },
  evalFeedbackText: {
    fontSize: 13,
    lineHeight: 20,
  },
  modelAnswerBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  modelAnswerLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  modelAnswerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyStateBox: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyStateText: {
    fontSize: 13,
  },
  srsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  srsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
  },
  srsBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  flipBtnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  flipBtnActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  nextQuestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
  },
  nextQuestionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
