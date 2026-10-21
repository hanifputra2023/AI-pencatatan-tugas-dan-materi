import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../contexts/ThemeContext';
import { useMoods } from '../contexts/MoodContext';
import { useAuth } from '../contexts/AuthContext';
import { sendMessageToGemini, GeminiMessage } from '../lib/gemini';
import { extractAgentAction, stripAgentActionBlock, executeAgentAction } from '../lib/agentActions';
import { ChatMessage } from '../types';

interface GeminiLiveVoiceModalProps {
  visible: boolean;
  onClose: () => void;
  botName: string;
  botAvatar?: string | null;
  personaPrompt?: string;
  existingMessages?: ChatMessage[];
  onNewMessagePair?: (userText: string, aiText: string) => void;
}

type LiveState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted';
type PermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';

// Pembersih teks agar terdengar luwes dan natural saat disuarakan TTS
const cleanTextForNaturalVoice = (raw: string): string => {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\|[-=|:\s]+\|$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/^[-=*_+.]{3,}$/gm, ' ')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/gim, '')
    .replace(/^>\s*/gm, '')
    .replace(/^\s*[-*•+]\s+/gm, '. ')
    .replace(/^\s*\d+\.\s+/gm, '. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/(\w)\s*²/g, '$1 kuadrat')
    .replace(/(\w)\s*³/g, '$1 kubik')
    .replace(/√(\w+)/g, 'akar $1')
    .replace(/=/g, ' sama dengan ')
    .replace(/→|⟶|➔|➜/g, 'menuju')
    .replace(/\bdll\b\.?/gi, 'dan lain-lain')
    .replace(/\bdst\b\.?/gi, 'dan seterusnya')
    .replace(/\bdsb\b\.?/gi, 'dan sebagainya')
    .replace(/\byg\b/gi, 'yang')
    .replace(/\bdgn\b/gi, 'dengan')
    .replace(/\btsb\b/gi, 'tersebut')
    .replace(/\btgl\b\.?/gi, 'tanggal')
    .replace(/\bthn\b\.?/gi, 'tahun')
    .replace(/\bmis\b\.?/gi, 'misalnya')
    .replace(/\bno\b\.?/gi, 'nomor')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[★☆✓✗✔✘◆◇■□●○▲△▼▽]/g, '')
    .replace(/[()[\]{}<>]/g, ', ')
    .replace(/[_^~#$@&]/g, ' ')
    .replace(/\n+/g, '. ')
    .replace(/\.\s*\.\s*\./g, '. ')
    .replace(/[.]{2,}/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export default function GeminiLiveVoiceModal({
  visible,
  onClose,
  botName,
  botAvatar,
  personaPrompt,
  existingMessages = [],
  onNewMessagePair,
}: GeminiLiveVoiceModalProps) {
  // Theme & Mood Context
  const { theme, isLightMode } = useTheme();
  const { customAiAvatar, customAiName } = useMoods();
  const { user } = useAuth();
  const effectiveUserId = user?.id || 'guest_user';

  // Avatar and Display Name Resolution
  const effectiveAvatar = botAvatar || customAiAvatar || null;
  const effectiveBotDisplayName = botName || customAiName || 'Ara';

  // State
  const [liveState, setLiveState] = useState<LiveState>('idle');
  const [permissionState, setPermissionState] = useState<PermissionState>('checking');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [displayedAiSpeech, setDisplayedAiSpeech] = useState<string>('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [agentStatusNotice, setAgentStatusNotice] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);

  // Call duration counter
  useEffect(() => {
    let timer: any = null;
    if (visible) {
      setCallDuration(0);
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Gemini Live Aurora Wave Animations (5 Dynamic Bars & Soundwave Ripples)
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(0.5)).current;
  const bar4 = useRef(new Animated.Value(0.8)).current;
  const bar5 = useRef(new Animated.Value(0.4)).current;
  const auraScale = useRef(new Animated.Value(1)).current;
  const ringScale1 = useRef(new Animated.Value(1)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringScale2 = useRef(new Animated.Value(1)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;

  // Lifecycle & Voice Recording Refs
  const recognitionRef = useRef<any>(null);
  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
  const isComponentMounted = useRef(true);
  const isListeningRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const convoHistoryRef = useRef<GeminiMessage[]>([]);
  const silenceTimerRef = useRef<any>(null);
  const ttsTimeoutRef = useRef<any>(null);
  const streamTimerRef = useRef<any>(null);
  const activeUtteranceRef = useRef<any>(null);
  const fullAiTextRef = useRef<string>('');

  // Native VAD (Voice Activity Detection) refs
  const vadIsUserTalkingRef = useRef<boolean>(false);
  const vadSilenceTimerRef = useRef<any>(null);
  const lastMeteringUpdateRef = useRef<number>(0);

  // Sync mic mute ref
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // -------------------------------------------------------------
  // PERMISSION CHECK & REQUEST ENGINE (Web & Native)
  // -------------------------------------------------------------
  const requestMicrophonePermission = useCallback(async (isManualTrigger = false): Promise<boolean> => {
    if (isManualTrigger) {
      setIsRequestingPermission(true);
    }
    setErrorMessage(null);

    // 1. WEB BROWSER PERMISSION
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        setIsRequestingPermission(false);
        return false;
      }

      // Check if getUserMedia is supported
      if (navigator?.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop stream tracks immediately after permission check
          stream.getTracks().forEach((track) => track.stop());

          if (isComponentMounted.current) {
            setPermissionState('granted');
            setErrorMessage(null);
            setIsRequestingPermission(false);
          }
          return true;
        } catch (err: any) {
          console.warn('Web Microphone permission rejected:', err);
          if (isComponentMounted.current) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              setPermissionState('denied');
              setErrorMessage('Akses mikrofon diblokir. Klik ikon gembok 🔒 di bilah alamat browser lalu ubah izin Mikrofon menjadi "Izinkan".');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              setPermissionState('unsupported');
              setErrorMessage('Perangkat mikrofon tidak ditemukan. Pastikan headset atau mikrofon terhubung.');
            } else {
              setPermissionState('denied');
              setErrorMessage(err.message || 'Izin mikrofon diperlukan.');
            }
            setIsRequestingPermission(false);
          }
          return false;
        }
      } else {
        // Fallback for older browsers or non-secure contexts
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SR) {
          if (isComponentMounted.current) {
            setPermissionState('granted');
            setIsRequestingPermission(false);
          }
          return true;
        } else {
          if (isComponentMounted.current) {
            setPermissionState('unsupported');
            setErrorMessage('Browser ini belum mendukung mikrofon atau pengenalan suara. Disarankan menggunakan Google Chrome atau Microsoft Edge.');
            setIsRequestingPermission(false);
          }
          return false;
        }
      }
    }

    // 2. NATIVE PLATFORMS (Android / iOS)
    try {
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();
      if (status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        if (isComponentMounted.current) {
          setPermissionState('granted');
          setErrorMessage(null);
          setIsRequestingPermission(false);
        }
        return true;
      } else {
        if (isComponentMounted.current) {
          setPermissionState('denied');
          setErrorMessage(
            canAskAgain
              ? 'Izin mikrofon belum diberikan. Ketuk "Izinkan Mikrofon" untuk memulai.'
              : 'Izin mikrofon dinonaktifkan di pengaturan HP. Buka Pengaturan > Aplikasi > Izin untuk mengaktifkannya.'
          );
          setIsRequestingPermission(false);
        }
        return false;
      }
    } catch (err: any) {
      console.warn('Native Audio permission error:', err);
      if (isComponentMounted.current) {
        setPermissionState('denied');
        setErrorMessage('Gagal meminta izin mikrofon: ' + (err.message || 'Izin ditolak'));
        setIsRequestingPermission(false);
      }
      return false;
    }
  }, []);

  // -------------------------------------------------------------
  // INITIALIZATION ON MODAL OPEN
  // -------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      isComponentMounted.current = true;
      isMicMutedRef.current = false;
      setIsMicMuted(false);

      const history: GeminiMessage[] = existingMessages.slice(-4).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));
      convoHistoryRef.current = history;

      setUserTranscript('');
      const greeting = `Halo! Ada yang lagi kamu pikirin? Cerita aja, aku dengerin.`;
      setDisplayedAiSpeech(greeting);

      // Check permission first
      requestMicrophonePermission(false).then((granted) => {
        if (granted && isComponentMounted.current) {
          startListeningSession();
        }
      });
    } else {
      stopAllAudio();
    }

    return () => {
      isComponentMounted.current = false;
      stopAllAudio();
    };
  }, [visible, requestMicrophonePermission]);

  // Clean stop of all audio, recognition & native recording
  const stopAllAudio = useCallback(async () => {
    isListeningRef.current = false;
    isAiSpeakingRef.current = false;

    // Clear all timers including VAD
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    if (vadSilenceTimerRef.current) { clearTimeout(vadSilenceTimerRef.current); vadSilenceTimerRef.current = null; }
    vadIsUserTalkingRef.current = false;

    // Stop Native Recording
    if (nativeRecordingRef.current) {
      try {
        await nativeRecordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      nativeRecordingRef.current = null;
    }

    // Stop Web Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Stop Web TTS
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    // Stop Expo Speech
    try {
      Speech.stop();
    } catch (e) {}
  }, []);

  // -------------------------------------------------------------
  // AURORA WAVE & SONAR RIPPLE VISUALIZER ANIMATIONS
  // -------------------------------------------------------------
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    if (liveState === 'speaking') {
      const createBar = (val: Animated.Value, min: number, max: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: max, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(val, { toValue: min, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
          ])
        );
      };

      animLoop = Animated.parallel([
        createBar(bar1, 0.3, 1.0, 260),
        createBar(bar2, 0.4, 1.25, 340),
        createBar(bar3, 0.3, 1.15, 290),
        createBar(bar4, 0.25, 0.95, 380),
        createBar(bar5, 0.35, 1.1, 310),
        Animated.loop(
          Animated.sequence([
            Animated.timing(auraScale, { toValue: 1.25, duration: 600, useNativeDriver: false }),
            Animated.timing(auraScale, { toValue: 1.0, duration: 600, useNativeDriver: false }),
          ])
        ),
      ]);
    } else if (liveState === 'thinking') {
      const createBar = (val: Animated.Value, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: 0.8, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(val, { toValue: 0.2, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          ])
        );
      };

      animLoop = Animated.parallel([
        createBar(bar1, 500),
        createBar(bar2, 400),
        createBar(bar3, 450),
        createBar(bar4, 550),
        createBar(bar5, 420),
      ]);
    } else if (liveState === 'listening') {
      const createBar = (val: Animated.Value, min: number, max: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: max, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(val, { toValue: min, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          ])
        );
      };

      animLoop = Animated.parallel([
        createBar(bar1, 0.25, 0.55, 900),
        createBar(bar2, 0.35, 0.75, 800),
        createBar(bar3, 0.3, 0.65, 850),
        createBar(bar4, 0.2, 0.5, 950),
        createBar(bar5, 0.3, 0.6, 880),
        Animated.loop(
          Animated.sequence([
            Animated.timing(auraScale, { toValue: 1.12, duration: 1200, useNativeDriver: false }),
            Animated.timing(auraScale, { toValue: 0.96, duration: 1200, useNativeDriver: false }),
          ])
        ),
      ]);
    } else {
      bar1.setValue(0.15);
      bar2.setValue(0.15);
      bar3.setValue(0.15);
      bar4.setValue(0.15);
      bar5.setValue(0.15);
    }

    if (animLoop) animLoop.start();

    return () => {
      if (animLoop) animLoop.stop();
    };
  }, [liveState, bar1, bar2, bar3, bar4, bar5, auraScale]);

  // Sonar Ripple Rings Animation Effect for the Central Avatar
  useEffect(() => {
    let rippleLoop: Animated.CompositeAnimation | null = null;
    if (liveState === 'speaking' || liveState === 'listening') {
      ringOpacity1.setValue(0.7);
      ringOpacity2.setValue(0.5);
      ringScale1.setValue(1);
      ringScale2.setValue(1);

      rippleLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.parallel([
              Animated.timing(ringScale1, { toValue: 1.45, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: false }),
              Animated.timing(ringOpacity1, { toValue: 0, duration: 1800, useNativeDriver: false }),
            ]),
            Animated.parallel([
              Animated.timing(ringScale1, { toValue: 1, duration: 0, useNativeDriver: false }),
              Animated.timing(ringOpacity1, { toValue: 0.7, duration: 0, useNativeDriver: false }),
            ]),
          ]),
          Animated.sequence([
            Animated.delay(700),
            Animated.parallel([
              Animated.timing(ringScale2, { toValue: 1.55, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: false }),
              Animated.timing(ringOpacity2, { toValue: 0, duration: 1800, useNativeDriver: false }),
            ]),
            Animated.parallel([
              Animated.timing(ringScale2, { toValue: 1, duration: 0, useNativeDriver: false }),
              Animated.timing(ringOpacity2, { toValue: 0.5, duration: 0, useNativeDriver: false }),
            ]),
          ]),
        ])
      );
      rippleLoop.start();
    } else {
      ringOpacity1.setValue(0);
      ringOpacity2.setValue(0);
      ringScale1.setValue(1);
      ringScale2.setValue(1);
    }
    return () => {
      if (rippleLoop) rippleLoop.stop();
    };
  }, [liveState, ringScale1, ringOpacity1, ringScale2, ringOpacity2]);

  // -------------------------------------------------------------
  // SPEECH RECOGNITION (Multi-Turn Voice Listener)
  // -------------------------------------------------------------
  const startListeningSession = useCallback(() => {
    if (!isComponentMounted.current || isAiSpeakingRef.current || isMicMutedRef.current) return;

    // WEB PLATFORM: Web Speech Recognition
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Safely cleanup any previous recognition instance
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setErrorMessage('Browser ini belum mendukung Web Speech Recognition. Gunakan Google Chrome atau Microsoft Edge.');
        setLiveState('idle');
        return;
      }

      try {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'id-ID';

        rec.onstart = () => {
          if (!isComponentMounted.current) return;
          isListeningRef.current = true;
          setLiveState('listening');
          setErrorMessage(null);
        };

        rec.onresult = (event: any) => {
          if (!isComponentMounted.current) return;

          if (isAiSpeakingRef.current) {
            handleInterruptAi();
          }

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

          const currentText = (final || interim).trim();
          if (currentText) {
            setUserTranscript(currentText);

            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              if (currentText && !isAiSpeakingRef.current && isComponentMounted.current) {
                processVoiceQuery(currentText);
              }
            }, 1200);
          }
        };

        rec.onerror = (e: any) => {
          console.log('Recognition event error:', e.error);
          if (e.error === 'not-allowed') {
            setPermissionState('denied');
            setErrorMessage('Izin mikrofon belum aktif atau diblokir. Izinkan akses mikrofon di browser.');
            setLiveState('idle');
          } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
            // Auto restart on transient glitch
            if (isListeningRef.current && !isAiSpeakingRef.current && !isMicMutedRef.current && isComponentMounted.current) {
              setTimeout(() => {
                startListeningSession();
              }, 400);
            }
          }
        };

        rec.onend = () => {
          // If ended naturally while supposed to listen -> immediately restart with fresh instance
          if (isListeningRef.current && !isAiSpeakingRef.current && !isMicMutedRef.current && isComponentMounted.current) {
            setTimeout(() => {
              startListeningSession();
            }, 250);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (err) {
        console.log('Error creating/starting speech recognition:', err);
      }
      return;
    }

    // NATIVE PLATFORM: Expo AV Audio Recording
    startNativeRecordingSession();
  }, []);

  // -------------------------------------------------------------
  // NATIVE AUDIO RECORDING SESSION (Android & iOS)
  // -------------------------------------------------------------
  const startNativeRecordingSession = async () => {
    if (!isComponentMounted.current || isAiSpeakingRef.current || isMicMutedRef.current) return;

    // Reset VAD state before new session
    vadIsUserTalkingRef.current = false;
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }

    try {
      if (nativeRecordingRef.current) {
        try {
          await nativeRecordingRef.current.stopAndUnloadAsync();
        } catch (e) {}
        nativeRecordingRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recording.setOnRecordingStatusUpdate((status) => {
        if (!isComponentMounted.current) return;
        if (status.isRecording && typeof status.metering === 'number') {
          // Metering ranges from -160 dB to 0 dB, normalized to 0-1
          const norm = Math.max(0, Math.min(1, (status.metering + 50) / 50));

          // Throttle animation updates to ~10fps to reduce UI lag
          const now = Date.now();
          if (now - lastMeteringUpdateRef.current > 100) {
            lastMeteringUpdateRef.current = now;
            bar1.setValue(0.2 + norm * 0.7);
            bar2.setValue(0.3 + norm * 0.9);
            bar3.setValue(0.25 + norm * 0.85);
            bar4.setValue(0.2 + norm * 0.65);
          }

          // ── VAD: Auto-detect speech vs silence ──────────────────────────
          // Threshold ~0.18 normalized ≈ -41 dB — picks up clear speech
          const SPEECH_THRESHOLD = 0.18;
          const isTalking = norm > SPEECH_THRESHOLD;

          if (isTalking && !isAiSpeakingRef.current) {
            // User is speaking — mark as talking & cancel any pending silence timer
            vadIsUserTalkingRef.current = true;
            if (vadSilenceTimerRef.current) {
              clearTimeout(vadSilenceTimerRef.current);
              vadSilenceTimerRef.current = null;
            }
          } else if (!isTalking && vadIsUserTalkingRef.current && !vadSilenceTimerRef.current) {
            // User went silent after speaking — start 1.5s countdown
            vadSilenceTimerRef.current = setTimeout(() => {
              vadSilenceTimerRef.current = null;
              if (isComponentMounted.current && !isAiSpeakingRef.current && nativeRecordingRef.current) {
                vadIsUserTalkingRef.current = false;
                stopNativeRecordingAndProcess();
              }
            }, 1500);
          }
        }
      });

      await recording.startAsync();
      nativeRecordingRef.current = recording;
      isListeningRef.current = true;
      setLiveState('listening');
      setErrorMessage(null);
    } catch (e: any) {
      console.warn('Native recording error:', e);
      setLiveState('idle');
      setErrorMessage('Gagal memulai perekaman audio: ' + (e.message || ''));
    }
  };

  const stopNativeRecordingAndProcess = async () => {
    // Clear VAD state immediately to prevent double-trigger
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
    vadIsUserTalkingRef.current = false;

    if (!nativeRecordingRef.current) return;
    try {
      const recording = nativeRecordingRef.current;
      nativeRecordingRef.current = null;
      isListeningRef.current = false;
      setLiveState('thinking');

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        // Read base64 audio and send to Gemini Multimodal Audio
        const base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const userMsg = 'Halo!';
        setUserTranscript('Suara terkirim...');
        
        const audioAttachment = {
          id: Date.now().toString(),
          name: 'audio_record.m4a',
          type: 'audio' as const,
          uri,
          mimeType: 'audio/m4a',
          base64: base64Data,
        };

        const humanVoicePrompt =
          `[INSTRUKSI KHUSUS]: Kamu adalah ${botName}, teman ngobrol yang asik, ramah, empatik, dan santai. ` +
          `Kamu sedang berbicara langsung lewat panggilan suara dengan user. Dengarkan audio dari user dan jawab langsung. ` +
          `ATURAN GAYA BICARA:\n` +
          `1. Bicara dengan bahasa Indonesia santai, akrab, dan luwes (seperti teman sebaya).\n` +
          `2. Jawab SANGAT SINGKAT dan PADAT (cukup 1 sampai 3 kalimat saja).\n` +
          `3. JANGAN gunakan salam formal pembuka/penutup klise ala robot (seperti "Tentu saja!", "Halo!", "Ada lagi yang bisa dibantu?").\n` +
          `4. Langsung berikan respon yang hangat, relate, dan mengalir natural.\n` +
          (personaPrompt ? `Persona: ${personaPrompt}` : '');

        const historyWithPrompt: GeminiMessage[] = [
          { role: 'user', parts: [{ text: humanVoicePrompt }] },
          { role: 'model', parts: [{ text: 'Siap, aku bakal ngobrol santai dan natural banget kayak teman ngopi.' }] },
          ...convoHistoryRef.current,
        ];

        const reply = await sendMessageToGemini(historyWithPrompt, 'Dengarkan pesan suara saya ini dan tanggapi dengan santai.', audioAttachment, undefined, { agent: true });
        let cleanReply = (reply || 'Suaramu tadi agak putus-putus, bisa diulang lagi?').trim();

        // Voice-Driven Action Agent Execution
        const action = extractAgentAction(reply);
        if (action) {
          try {
            const res = await executeAgentAction(effectiveUserId, action);
            setAgentStatusNotice(`⚙️ ${res.message}`);
            cleanReply = stripAgentActionBlock(reply).trim();
            if (res.ok) {
              cleanReply = `${cleanReply} ${res.message}`;
            }
          } catch (actErr) {
            console.warn('[VoiceAgent Audio Error]', actErr);
          }
        }

        // Keep history bounded to last 8 entries to reduce future payload size
        const updatedHistory = [
          ...convoHistoryRef.current,
          { role: 'user', parts: [{ text: 'Pesan Suara' }] } as GeminiMessage,
          { role: 'model', parts: [{ text: cleanReply }] } as GeminiMessage,
        ];
        convoHistoryRef.current = updatedHistory.slice(-8);

        if (onNewMessagePair) {
          onNewMessagePair('Pesan Suara', cleanReply);
        }

        speakAiVoice(cleanReply);
      }
    } catch (e: any) {
      console.warn('Native recording process error:', e);
      setLiveState('listening');
      startListeningSession();
    }
  };

  // -------------------------------------------------------------
  // AI QUERY & NATURAL VOICE RESPONSE
  // -------------------------------------------------------------
  const processVoiceQuery = async (queryText: string) => {
    if (!queryText.trim() || isAiSpeakingRef.current) return;

    // Stop listening while AI is thinking and preparing answer
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    setLiveState('thinking');

    try {
      const humanVoicePrompt =
        `[INSTRUKSI KHUSUS]: Kamu adalah ${botName}, teman ngobrol yang asik, ramah, empatik, dan santai. ` +
        `Kamu sedang berbicara langsung lewat panggilan suara dengan user. ` +
        `ATURAN GAYA BICARA:\n` +
        `1. Bicara dengan bahasa Indonesia santai, akrab, dan luwes (seperti teman sebaya).\n` +
        `2. Jawab SANGAT SINGKAT dan PADAT (cukup 1 sampai 3 kalimat saja).\n` +
        `3. JANGAN gunakan salam formal pembuka/penutup klise ala robot (seperti "Tentu saja!", "Halo!", "Ada lagi yang bisa dibantu?").\n` +
        `4. Langsung berikan respon yang hangat, relate, dan mengalir natural.\n` +
        (personaPrompt ? `Persona: ${personaPrompt}` : '');

      const historyWithPrompt: GeminiMessage[] = [
        { role: 'user', parts: [{ text: humanVoicePrompt }] },
        { role: 'model', parts: [{ text: 'Siap, aku bakal ngobrol santai dan natural banget kayak teman ngopi.' }] },
        ...convoHistoryRef.current,
      ];

      const reply = await sendMessageToGemini(historyWithPrompt, queryText, null, undefined, { agent: true });
      let cleanReply = (reply || 'Suaramu tadi agak putus-putus, bisa diulang lagi?').trim();

      // Voice-Driven Action Agent Execution
      const action = extractAgentAction(reply);
      if (action) {
        try {
          const res = await executeAgentAction(effectiveUserId, action);
          setAgentStatusNotice(`⚙️ ${res.message}`);
          cleanReply = stripAgentActionBlock(reply).trim();
          if (res.ok) {
            cleanReply = `${cleanReply} ${res.message}`;
          }
        } catch (actErr) {
          console.warn('[VoiceAgent Query Error]', actErr);
        }
      }

      // Keep history bounded to last 8 entries to reduce future payload size
      const updatedHistory = [
        ...convoHistoryRef.current,
        { role: 'user', parts: [{ text: queryText }] } as GeminiMessage,
        { role: 'model', parts: [{ text: cleanReply }] } as GeminiMessage,
      ];
      convoHistoryRef.current = updatedHistory.slice(-8);

      if (onNewMessagePair) {
        onNewMessagePair(queryText, cleanReply);
      }

      speakAiVoice(cleanReply);
    } catch (e) {
      console.log('Gemini voice query error:', e);
      setLiveState('listening');
      startListeningSession();
    }
  };

  // -------------------------------------------------------------
  // TEXT-TO-SPEECH (TTS with Synchronized Word-by-Word Streaming)
  // -------------------------------------------------------------
  const speakAiVoice = (rawText: string) => {
    isAiSpeakingRef.current = true;
    isListeningRef.current = false;
    setLiveState('speaking');
    fullAiTextRef.current = rawText;
    setDisplayedAiSpeech('');

    const speechText = cleanTextForNaturalVoice(rawText);

    // Synchronized progressive word streamer in sync with audio pace
    const words = rawText.split(' ');
    let currentWordIdx = 0;
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);

    const wordIntervalMs = Math.max(150, Math.min(300, Math.round(240 / 0.96)));
    streamTimerRef.current = setInterval(() => {
      currentWordIdx += 1;
      if (currentWordIdx <= words.length) {
        setDisplayedAiSpeech(words.slice(0, currentWordIdx).join(' '));
      } else {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      }
    }, wordIntervalMs);

    const onSpeechFinished = () => {
      isAiSpeakingRef.current = false;
      if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      setDisplayedAiSpeech(fullAiTextRef.current);

      if (!isMicMutedRef.current && isComponentMounted.current) {
        setUserTranscript('');
        setLiveState('listening');
        // Give 300ms buffer before restarting mic to prevent hearing AI's own echo
        setTimeout(() => {
          startListeningSession();
        }, 300);
      } else {
        setLiveState('idle');
      }
    };

    // Safety Timeout: In case TTS onend event fails, ensure recognition ALWAYS resumes
    const estimatedDurationMs = Math.max(2500, speechText.length * 90);
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
    ttsTimeoutRef.current = setTimeout(() => {
      if (isAiSpeakingRef.current) {
        onSpeechFinished();
      }
    }, estimatedDurationMs + 2000);

    // Primary: Web SpeechSynthesis API
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'id-ID';
        utterance.rate = 0.96;
        utterance.pitch = 1.05;

        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find((v) => {
          const l = (v.lang || '').toLowerCase();
          const n = (v.name || '').toLowerCase();
          return l.includes('id') || n.includes('indonesia') || n.includes('gadis') || n.includes('ardi') || n.includes('damayanti');
        });
        if (idVoice) utterance.voice = idVoice;

        utterance.onboundary = (event) => {
          if (event.name === 'word' || typeof event.charIndex === 'number') {
            const charIdx = event.charIndex;
            if (charIdx > 0 && charIdx <= rawText.length) {
              const approxText = rawText.substring(0, Math.min(rawText.length, charIdx + 12));
              setDisplayedAiSpeech(approxText);
            }
          }
        };

        utterance.onend = () => {
          onSpeechFinished();
        };

        utterance.onerror = () => {
          onSpeechFinished();
        };

        activeUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.log('Web SpeechSynthesis error, falling back to expo-speech:', err);
      }
    }

    // Fallback: Expo Speech
    try {
      Speech.stop();
      Speech.speak(speechText, {
        language: 'id-ID',
        pitch: 1.05,
        rate: 0.96,
        onDone: onSpeechFinished,
        onError: onSpeechFinished,
      });
    } catch (e) {
      onSpeechFinished();
    }
  };

  const handleInterruptAi = () => {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    try {
      Speech.stop();
    } catch (e) {}

    isAiSpeakingRef.current = false;
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);

    setUserTranscript('');
    setLiveState('listening');
    startListeningSession();
  };

  const toggleMute = () => {
    if (isMicMuted) {
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      setUserTranscript('');
      setLiveState('listening');
      startListeningSession();
    } else {
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      setLiveState('muted');
    }
  };

  const handleManualTapToTalk = () => {
    if (permissionState !== 'granted') {
      requestMicrophonePermission(true);
      return;
    }

    if (liveState === 'speaking') {
      handleInterruptAi();
    } else if (liveState === 'muted') {
      toggleMute();
    } else if (Platform.OS !== 'web' && liveState === 'listening') {
      // On Native: Manual tap = send immediately (shortcut; VAD handles auto-send)
      stopNativeRecordingAndProcess();
    } else {
      setUserTranscript('');
      setLiveState('listening');
      startListeningSession();
    }
  };

  const handleClose = () => {
    stopAllAudio();
    onClose();
  };

  const getAuraGlowColor = () => {
    switch (liveState) {
      case 'speaking':
        return isLightMode ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.65)';
      case 'listening':
        return isLightMode ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.65)';
      case 'thinking':
        return isLightMode ? 'rgba(168, 85, 247, 0.45)' : 'rgba(168, 85, 247, 0.65)';
      case 'muted':
        return isLightMode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.55)';
      default:
        return isLightMode ? 'rgba(66, 133, 244, 0.25)' : 'rgba(56, 189, 248, 0.35)';
    }
  };

  const getAuraBorderColor = () => {
    switch (liveState) {
      case 'speaking':
        return '#38BDF8';
      case 'listening':
        return '#10B981';
      case 'thinking':
        return '#A855F7';
      case 'muted':
        return '#EF4444';
      default:
        return isLightMode ? '#93C5FD' : '#38BDF8';
    }
  };

  const getStatusDotColor = () => {
    switch (liveState) {
      case 'speaking':
        return '#38BDF8';
      case 'listening':
        return '#10B981';
      case 'thinking':
        return '#A855F7';
      case 'muted':
        return '#EF4444';
      default:
        return '#94A3B8';
    }
  };

  const getStatusText = () => {
    if (permissionState === 'checking' || isRequestingPermission) {
      return 'Memeriksa izin mikrofon...';
    }
    if (permissionState === 'denied' || permissionState === 'unsupported') {
      return 'Izin mikrofon dibutuhkan';
    }

    switch (liveState) {
      case 'listening':
        return 'Mendengarkan suaramu...';
      case 'thinking':
        return `${effectiveBotDisplayName} sedang berpikir...`;
      case 'speaking':
        return `${effectiveBotDisplayName} sedang bicara`;
      case 'muted':
        return 'Mikrofon dijeda (ketuk untuk bicara)';
      default:
        return 'Ketuk avatar untuk bicara';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <SafeAreaView
        style={[
          styles.container,
          {
            backgroundColor: isLightMode ? '#F1F5F9' : '#070A12',
          },
        ]}
      >
        {/* ========================================================================= */}
        {/* TOP HEADER: Bot Character Identity + Live Call Badge + Close Button */}
        {/* ========================================================================= */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {/* Header Avatar Thumbnail */}
            <View style={[styles.headerAvatarWrap, { borderColor: getAuraBorderColor() }]}>
              {effectiveAvatar ? (
                <Image source={{ uri: effectiveAvatar }} style={styles.headerAvatarImg} resizeMode="cover" />
              ) : (
                <View style={[styles.headerAvatarFallback, { backgroundColor: isLightMode ? theme.accentBg : '#1E293B' }]}>
                  <Ionicons name="sparkles" size={15} color={isLightMode ? theme.primary : '#38BDF8'} />
                </View>
              )}
              {/* Online Green Pulsing Indicator */}
              <View style={[styles.headerStatusDot, { backgroundColor: getStatusDotColor() }]} />
            </View>

            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.botTitle, { color: theme.text }]}>{effectiveBotDisplayName}</Text>
                <View
                  style={[
                    styles.activeLivePill,
                    {
                      backgroundColor:
                        liveState === 'speaking'
                          ? (isLightMode ? '#E0F2FE' : 'rgba(56, 189, 248, 0.18)')
                          : liveState === 'listening'
                          ? (isLightMode ? '#DCFCE7' : 'rgba(16, 185, 129, 0.18)')
                          : (isLightMode ? '#EDE9FE' : 'rgba(168, 85, 247, 0.18)'),
                      borderColor:
                        liveState === 'speaking'
                          ? '#38BDF8'
                          : liveState === 'listening'
                          ? '#10B981'
                          : '#A855F7',
                    },
                  ]}
                >
                  <View style={[styles.pulsingLiveDot, { backgroundColor: getStatusDotColor() }]} />
                  <Text
                    style={[
                      styles.activeLivePillText,
                      {
                        color:
                          liveState === 'speaking'
                            ? (isLightMode ? '#0284C7' : '#38BDF8')
                            : liveState === 'listening'
                            ? (isLightMode ? '#15803D' : '#4ADE80')
                            : (isLightMode ? '#7C3AED' : '#C084FC'),
                      },
                    ]}
                  >
                    GEMINI LIVE
                  </Text>
                </View>
              </View>

              <Text style={[styles.callTimerText, { color: theme.subtext }]}>
                {formatDuration(callDuration)} • Suara Audio HD
              </Text>
            </View>
          </View>

          {/* Close / Hangup Button */}
          <TouchableOpacity
            onPress={handleClose}
            style={[
              styles.closeBtn,
              {
                backgroundColor: isLightMode ? theme.card : 'rgba(255, 255, 255, 0.08)',
                borderColor: theme.border,
              },
            ]}
            activeOpacity={0.7}
            accessibilityLabel="Tutup Panggilan Live"
          >
            <Ionicons name="close" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* ========================================================================= */}
        {/* PERMISSION REQUIRED SCREEN OR MAIN LIVE VISUALIZER & CONVERSATION */}
        {/* ========================================================================= */}
        {permissionState === 'denied' || permissionState === 'unsupported' ? (
          <View style={styles.permissionCard}>
            <View style={[styles.permissionIconCircle, { backgroundColor: isLightMode ? '#FEE2E2' : 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="mic-off" size={40} color="#EF4444" />
            </View>

            <Text style={[styles.permissionTitle, { color: theme.text }]}>
              {permissionState === 'unsupported' ? 'Mikrofon Tidak Didukung' : 'Izin Mikrofon Diperlukan'}
            </Text>

            <Text style={[styles.permissionDesc, { color: theme.subtext }]}>
              {errorMessage ||
                'Fitur Gemini Live membutuhkan izin akses mikrofon agar kamu dapat mengobrol langsung secara real-time lewat suara.'}
            </Text>

            {Platform.OS === 'web' && (
              <View style={[styles.permissionHelpBox, { backgroundColor: isLightMode ? '#F1F5F9' : '#131823', borderColor: theme.border }]}>
                <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
                <Text style={[styles.permissionHelpText, { color: theme.subtext }]}>
                  Di browser, klik ikon gembok 🔒 di bilah URL address bar lalu aktifkan pilihan{' '}
                  <Text style={{ fontWeight: '700', color: theme.text }}>Mikrofon</Text>.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.permissionGrantBtn, { backgroundColor: theme.primary }]}
              onPress={() => requestMicrophonePermission(true)}
              disabled={isRequestingPermission}
              activeOpacity={0.8}
            >
              {isRequestingPermission ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="mic" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.permissionGrantBtnText}>Izinkan Akses Mikrofon</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.permissionCancelBtn, { borderColor: theme.border }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.permissionCancelBtnText, { color: theme.subtext }]}>Tutup</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ======================================================================= */}
            {/* CENTRAL AI CHARACTER HERO STAGE: Glowing Aura + Sonar Rings + Avatar */}
            {/* ======================================================================= */}
            <View style={styles.heroCenterStage}>
              {/* Concentric Orb Wrapper: Locks aura & ripple rings directly around the avatar */}
              <View style={styles.avatarOrbWrapper}>
                {/* Layer 1: Ambient Glowing Atmosphere Aura */}
                <Animated.View
                  style={[
                    styles.ambientAuraGlow,
                    {
                      transform: [{ scale: auraScale }],
                      backgroundColor: getAuraGlowColor(),
                      opacity:
                        liveState === 'speaking'
                          ? isLightMode ? 0.45 : 0.7
                          : liveState === 'listening'
                          ? isLightMode ? 0.35 : 0.55
                          : liveState === 'thinking'
                          ? isLightMode ? 0.35 : 0.55
                          : isLightMode ? 0.15 : 0.25,
                    },
                  ]}
                />

                {/* Layer 2: Sonar Ripple Ring 1 */}
                <Animated.View
                  style={[
                    styles.sonarRippleRing,
                    {
                      borderColor: getAuraBorderColor(),
                      transform: [{ scale: ringScale1 }],
                      opacity: ringOpacity1,
                    },
                  ]}
                />

                {/* Layer 3: Sonar Ripple Ring 2 */}
                <Animated.View
                  style={[
                    styles.sonarRippleRing,
                    {
                      borderColor: getAuraBorderColor(),
                      transform: [{ scale: ringScale2 }],
                      opacity: ringOpacity2,
                    },
                  ]}
                />

                {/* Layer 4: Interactive Character Avatar Orb */}
                <TouchableOpacity
                  style={styles.avatarTouchArea}
                  activeOpacity={0.9}
                  onPress={handleManualTapToTalk}
                  accessibilityLabel="Ketuk karakter AI untuk berinteraksi"
                >
                  <View
                    style={[
                      styles.characterAvatarFrame,
                      {
                        borderColor: getAuraBorderColor(),
                        shadowColor: getAuraBorderColor(),
                        backgroundColor: isLightMode ? '#FFFFFF' : '#0B0F19',
                      },
                    ]}
                  >
                    <View style={styles.avatarImageClipper}>
                      {effectiveAvatar ? (
                        <Image
                          source={{ uri: effectiveAvatar }}
                          style={styles.characterAvatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.characterAvatarFallback,
                            {
                              backgroundColor: isLightMode ? theme.accentBg : '#162032',
                            },
                          ]}
                        >
                          <Ionicons
                            name="sparkles"
                            size={56}
                            color={isLightMode ? theme.primary : '#38BDF8'}
                          />
                        </View>
                      )}
                    </View>

                    {/* Corner Mini Badge: Live Audio Activity Indicator */}
                    <View
                      style={[
                        styles.avatarCornerBadge,
                        {
                          backgroundColor: getStatusDotColor(),
                          borderColor: isLightMode ? '#FFFFFF' : '#070A12',
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          liveState === 'speaking'
                            ? 'volume-high'
                            : liveState === 'listening'
                            ? 'mic'
                            : liveState === 'thinking'
                            ? 'flash'
                            : liveState === 'muted'
                            ? 'mic-off'
                            : 'radio'
                        }
                        size={14}
                        color="#FFFFFF"
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Layer 5: Dynamic 5-Bar Fluid Equalizer Visualizer */}
              <View style={styles.equalizerBarsRow}>
                <Animated.View
                  style={[
                    styles.equalizerBar,
                    {
                      backgroundColor: '#38BDF8',
                      shadowColor: '#38BDF8',
                      height: bar1.interpolate({ inputRange: [0, 1.5], outputRange: [10, 40] }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.equalizerBar,
                    {
                      backgroundColor: '#818CF8',
                      shadowColor: '#818CF8',
                      height: bar2.interpolate({ inputRange: [0, 1.5], outputRange: [14, 52] }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.equalizerBar,
                    {
                      backgroundColor: '#C084FC',
                      shadowColor: '#C084FC',
                      height: bar3.interpolate({ inputRange: [0, 1.5], outputRange: [18, 62] }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.equalizerBar,
                    {
                      backgroundColor: '#F472B6',
                      shadowColor: '#F472B6',
                      height: bar4.interpolate({ inputRange: [0, 1.5], outputRange: [14, 50] }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.equalizerBar,
                    {
                      backgroundColor: '#38BDF8',
                      shadowColor: '#38BDF8',
                      height: bar5.interpolate({ inputRange: [0, 1.5], outputRange: [10, 36] }),
                    },
                  ]}
                />
              </View>

              {/* Status Capsule Indicator */}
              <View
                style={[
                  styles.statusCapsule,
                  {
                    backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: isLightMode ? '#E2E8F0' : 'rgba(255, 255, 255, 0.12)',
                  },
                ]}
              >
                <View style={[styles.statusCapsuleDot, { backgroundColor: getStatusDotColor() }]} />
                <Text style={[styles.statusCapsuleText, { color: theme.text }]}>
                  {getStatusText()}
                </Text>
              </View>

              {/* Tap to Interrupt Pill Button (Appears when AI is speaking) */}
              {liveState === 'speaking' && (
                <TouchableOpacity
                  style={[
                    styles.interruptPill,
                    {
                      backgroundColor: isLightMode ? '#FEE2E2' : 'rgba(239, 68, 68, 0.18)',
                      borderColor: isLightMode ? '#FECACA' : 'rgba(239, 68, 68, 0.4)',
                    },
                  ]}
                  onPress={handleInterruptAi}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pause" size={12} color="#EF4444" />
                  <Text style={[styles.interruptPillText, { color: isLightMode ? '#DC2626' : '#FCA5A5' }]}>
                    Ketuk untuk menyela
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {agentStatusNotice && (
              <View style={[styles.agentStatusPill, { backgroundColor: isLightMode ? '#ECFDF5' : 'rgba(16, 185, 129, 0.2)', borderColor: '#10B981' }]}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={[styles.agentStatusText, { color: isLightMode ? '#065F46' : '#6EE7B7' }]}>
                  {agentStatusNotice}
                </Text>
              </View>
            )}

            {/* ======================================================================= */}
            {/* FLOATING LIVE DIALOGUE CARD (Speech Subtitles with Speaker Badges) */}
            {/* ======================================================================= */}
            <View
              style={[
                styles.liveDialogueCard,
                {
                  backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.85)',
                  borderColor: isLightMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(255, 255, 255, 0.12)',
                },
              ]}
            >
              {userTranscript ? (
                <View style={styles.speechRow}>
                  <View style={[styles.speakerBadge, { backgroundColor: isLightMode ? '#EFF6FF' : 'rgba(56, 189, 248, 0.15)' }]}>
                    <Ionicons name="person" size={12} color={isLightMode ? theme.primary : '#38BDF8'} />
                    <Text style={[styles.speakerNameText, { color: isLightMode ? theme.primary : '#38BDF8' }]}>Kamu</Text>
                  </View>
                  <Text style={[styles.userSpeechText, { color: theme.text }]} numberOfLines={3}>
                    "{userTranscript}"
                  </Text>
                </View>
              ) : displayedAiSpeech ? (
                <View style={styles.speechRow}>
                  <View style={[styles.speakerBadge, { backgroundColor: isLightMode ? '#FDF2F8' : 'rgba(244, 114, 182, 0.15)' }]}>
                    <Ionicons name="sparkles" size={12} color={isLightMode ? '#DB2777' : '#F472B6'} />
                    <Text style={[styles.speakerNameText, { color: isLightMode ? '#DB2777' : '#F472B6' }]}>
                      {effectiveBotDisplayName}
                    </Text>
                  </View>
                  <Text style={[styles.aiSpeechText, { color: theme.text }]} numberOfLines={4}>
                    {displayedAiSpeech}
                  </Text>
                </View>
              ) : (
                <View style={styles.speechEmptyPlaceholder}>
                  <Ionicons name="mic-outline" size={18} color={theme.muted} />
                  <Text style={[styles.speechEmptyText, { color: theme.muted }]}>
                    Suaramu akan diterjemahkan secara langsung di sini...
                  </Text>
                </View>
              )}

              {errorMessage && (
                <View style={styles.errorBubbleRow}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  <Text style={styles.errorCaptionText}>{errorMessage}</Text>
                </View>
              )}
            </View>

            {/* ======================================================================= */}
            {/* FLOATING CONTROLS DOCK (Mute, Hangup, Repeat) */}
            {/* ======================================================================= */}
            <View
              style={[
                styles.bottomDock,
                {
                  backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.9)',
                  borderColor: isLightMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(255, 255, 255, 0.1)',
                },
              ]}
            >
              {/* Mic Toggle Button */}
              <TouchableOpacity
                style={[
                  styles.dockBtn,
                  {
                    backgroundColor: isMicMuted
                      ? (isLightMode ? '#FEE2E2' : 'rgba(239, 68, 68, 0.22)')
                      : (isLightMode ? '#F1F5F9' : '#1E293B'),
                    borderColor: isMicMuted ? '#EF4444' : (isLightMode ? '#E2E8F0' : 'rgba(255, 255, 255, 0.1)'),
                  },
                ]}
                onPress={toggleMute}
                activeOpacity={0.8}
                accessibilityLabel={isMicMuted ? 'Aktifkan Mikrofon' : 'Mute Mikrofon'}
              >
                <Ionicons
                  name={isMicMuted ? 'mic-off' : 'mic'}
                  size={22}
                  color={isMicMuted ? '#EF4444' : (isLightMode ? theme.text : '#F8FAFC')}
                />
              </TouchableOpacity>

              {/* Big End Call Button */}
              <TouchableOpacity
                style={styles.dockEndCallBtn}
                onPress={handleClose}
                activeOpacity={0.85}
                accessibilityLabel="Akhiri Panggilan Suara"
              >
                <Ionicons
                  name="call"
                  size={26}
                  color="#FFFFFF"
                  style={{ transform: [{ rotate: '135deg' }] }}
                />
              </TouchableOpacity>

              {/* Repeat or Interrupt Button */}
              <TouchableOpacity
                style={[
                  styles.dockBtn,
                  {
                    backgroundColor: isLightMode ? '#F1F5F9' : '#1E293B',
                    borderColor: isLightMode ? '#E2E8F0' : 'rgba(255, 255, 255, 0.1)',
                  },
                ]}
                onPress={() => {
                  if (liveState === 'speaking') {
                    handleInterruptAi();
                  } else if (displayedAiSpeech) {
                    speakAiVoice(displayedAiSpeech);
                  }
                }}
                activeOpacity={0.8}
                accessibilityLabel="Ulangi Suara AI"
              >
                <Ionicons
                  name={liveState === 'speaking' ? 'pause' : 'refresh'}
                  size={20}
                  color={isLightMode ? theme.text : '#F8FAFC'}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 24 : 8,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#070A12',
  },
  botTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  activeLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  pulsingLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeLivePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  callTimerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Central Character Hero Stage
  heroCenterStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  avatarOrbWrapper: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambientAuraGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    filter: Platform.OS === 'web' ? 'blur(45px)' : undefined,
  },
  sonarRippleRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
  },
  avatarTouchArea: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  characterAvatarFrame: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarImageClipper: {
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterAvatarImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  characterAvatarFallback: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCornerBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 6,
  },

  // Dynamic Equalizer Bars below Avatar
  equalizerBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 64,
    marginTop: 8,
    zIndex: 2,
  },
  equalizerBar: {
    width: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 6,
  },

  // Status Capsule Indicator
  statusCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
    zIndex: 2,
  },
  statusCapsuleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusCapsuleText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  interruptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 2,
  },
  interruptPillText: {
    fontSize: 11.5,
    fontWeight: '600',
  },

  // Live Dialogue Card
  liveDialogueCard: {
    minHeight: 100,
    maxHeight: 140,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 4,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  speechRow: {
    gap: 8,
  },
  speakerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  speakerNameText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  userSpeechText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  aiSpeechText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '400',
  },
  speechEmptyPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  speechEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  errorBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  errorCaptionText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },

  // Bottom Floating Controls Dock
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 36,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  dockBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockEndCallBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#EA4335',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EA4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },

  // Permission Card Styles
  permissionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  permissionIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionHelpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
    width: '100%',
  },
  permissionHelpText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  permissionGrantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  permissionGrantBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionCancelBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  agentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
    gap: 6,
    alignSelf: 'center',
  },
  agentStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
