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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../contexts/ThemeContext';
import { sendMessageToGemini, GeminiMessage } from '../lib/gemini';
import { ChatAttachment, ChatMessage } from '../types';

interface GeminiLiveVoiceModalProps {
  visible: boolean;
  onClose: () => void;
  botName: string;
  personaPrompt?: string;
  existingMessages?: ChatMessage[];
  onNewMessagePair?: (userText: string, aiText: string) => void;
}

type LiveState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted';

// Pembersih teks agar terdengar luwes dan natural (tanpa simbol kaku)
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
  personaPrompt,
  existingMessages = [],
  onNewMessagePair,
}: GeminiLiveVoiceModalProps) {
  // Theme Context
  const { theme, isLightMode } = useTheme();

  // State
  const [liveState, setLiveState] = useState<LiveState>('listening');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [displayedAiSpeech, setDisplayedAiSpeech] = useState<string>('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gemini Live Aurora Wave Animations (4 Dynamic Bars)
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(0.5)).current;
  const bar4 = useRef(new Animated.Value(0.8)).current;
  const auraScale = useRef(new Animated.Value(1)).current;

  // Lifecycle Refs
  const recognitionRef = useRef<any>(null);
  const mobileRecordingRef = useRef<Audio.Recording | null>(null);
  const hasPermissionRef = useRef<boolean>(false);
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

  // Hands-free voice activity detection (mobile recording)
  const meterPollRef = useRef<any>(null);
  const lastSoundRef = useRef<number>(0);
  const lastMeterRef = useRef<number>(-120);
  const isSilenceDetectedRef = useRef<boolean>(false);
  const pendingMobileVoiceRef = useRef<{ handled: boolean }>({ handled: false });

  // Sync mic mute ref
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Request runtime microphone permission on mobile
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web') {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status === 'granted') {
          hasPermissionRef.current = true;
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
          setErrorMessage(null);
          return true;
        } else {
          hasPermissionRef.current = false;
          setErrorMessage('Izin mikrofon dibutuhkan untuk berbicara dengan AI. Buka pengaturan HP dan izinkan akses mikrofon.');
          setLiveState('idle');
          return false;
        }
      } catch (e: any) {
        console.log('Permission error:', e);
        setErrorMessage('Gagal meminta izin mikrofon: ' + e.message);
        return false;
      }
    }
    return true;
  }, []);

  // Clean stop of all audio & recognition
  const stopAllAudio = useCallback(async () => {
    isListeningRef.current = false;
    isAiSpeakingRef.current = false;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    if (meterPollRef.current) clearInterval(meterPollRef.current);
    meterPollRef.current = null;

    if (mobileRecordingRef.current) {
      try {
        await mobileRecordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      mobileRecordingRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    try {
      Speech.stop();
    } catch (e) {}
  }, []);

  // Init session when modal opens
  useEffect(() => {
    if (visible) {
      isComponentMounted.current = true;
      isMicMutedRef.current = false;
      setIsMicMuted(false);

      const history: GeminiMessage[] = existingMessages.slice(-6).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));
      convoHistoryRef.current = history;

      setUserTranscript('');
      const greeting = `Halo! Ada yang lagi kamu pikirin? Cerita aja, aku dengerin.`;
      setDisplayedAiSpeech(greeting);
      
      if (Platform.OS !== 'web') {
        requestMicPermission().then((granted) => {
          if (granted) {
            startListeningSession();
          }
        });
      } else {
        startListeningSession();
      }
    } else {
      stopAllAudio();
    }

    return () => {
      isComponentMounted.current = false;
      stopAllAudio();
    };
  }, [visible]);

  // -------------------------------------------------------------
  // AURORA WAVE VISUALIZER ANIMATIONS
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
        Animated.loop(
          Animated.sequence([
            Animated.timing(auraScale, { toValue: 1.3, duration: 600, useNativeDriver: true }),
            Animated.timing(auraScale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
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
        Animated.loop(
          Animated.sequence([
            Animated.timing(auraScale, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
            Animated.timing(auraScale, { toValue: 0.95, duration: 1200, useNativeDriver: true }),
          ])
        ),
      ]);
    } else {
      bar1.setValue(0.15);
      bar2.setValue(0.15);
      bar3.setValue(0.15);
      bar4.setValue(0.15);
    }

    if (animLoop) animLoop.start();

    return () => {
      if (animLoop) animLoop.stop();
    };
  }, [liveState]);

  // -------------------------------------------------------------
  // SPEECH RECOGNITION / AUDIO RECORDING ENGINE
  // -------------------------------------------------------------
  const startListeningSession = useCallback(async () => {
    if (!isComponentMounted.current || isAiSpeakingRef.current || isMicMutedRef.current) return;

    // 1. Mobile Native Engine (expo-av) - HANDS-FREE via voice activity detection
    if (Platform.OS !== 'web') {
      try {
        const granted = hasPermissionRef.current || (await requestMicPermission());
        if (!granted) return;

        if (mobileRecordingRef.current) {
          try {
            await mobileRecordingRef.current.stopAndUnloadAsync();
          } catch (e) {}
          mobileRecordingRef.current = null;
        }

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        await recording.startAsync();
        mobileRecordingRef.current = recording;
        pendingMobileVoiceRef.current = { handled: false };
        isSilenceDetectedRef.current = false;
        lastMeterRef.current = -120;
        lastSoundRef.current = Date.now();
        isListeningRef.current = true;
        setLiveState('listening');
        setErrorMessage(null);

        // Continuous voice activity detection loop:
        // - Barge in: if AI is speaking and user talks, interrupt AI.
        // - Turn end: after user stops talking (silence) for ~1.4s, auto-send.
        if (meterPollRef.current) clearInterval(meterPollRef.current);
        meterPollRef.current = setInterval(async () => {
          if (!isComponentMounted.current) return;
          const rec = mobileRecordingRef.current;
          if (!rec) {
            if (meterPollRef.current) clearInterval(meterPollRef.current);
            return;
          }
          try {
            const status = await rec.getStatusAsync();
            if (!status?.isRecording) {
              if (meterPollRef.current) clearInterval(meterPollRef.current);
              return;
            }
            const meter = typeof status.metering === 'number' ? status.metering : -120;
            lastMeterRef.current = meter;
            const now = Date.now();

            if (meter > -26) {
              lastSoundRef.current = now;
              isSilenceDetectedRef.current = false;
            } else {
              // User appears silent; auto-send after 1.4s of continuous silence
              if (!isSilenceDetectedRef.current) {
                isSilenceDetectedRef.current = true;
                lastSoundRef.current = now;
              } else if (now - lastSoundRef.current > 1400 && !pendingMobileVoiceRef.current.handled) {
                pendingMobileVoiceRef.current.handled = true;
                if (meterPollRef.current) clearInterval(meterPollRef.current);
                meterPollRef.current = null;
                stopMobileRecordingAndSend();
              }
            }
          } catch (e) {
            // ignore transient polling errors
          }
        }, 180);
      } catch (err: any) {
        console.log('Error starting mobile audio recording:', err);
        setErrorMessage('Gagal merekam suara: ' + (err.message || 'Periksa izin mikrofon'));
      }
      return;
    }

    // 2. Web Browser Engine (Web Speech API)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setErrorMessage('Browser ini belum mendukung Web Speech Recognition. Gunakan Google Chrome atau Edge ya.');
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
            setErrorMessage('Izin mikrofon belum aktif. Izinkan akses mikrofon di browser.');
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
    }
  }, [requestMicPermission]);

  // Stop mobile recording and send to Gemini
  const stopMobileRecordingAndSend = async () => {
    if (!mobileRecordingRef.current) {
      if (liveState === 'listening') {
        startListeningSession();
      }
      return;
    }

    isListeningRef.current = false;
    setLiveState('thinking');

    try {
      const rec = mobileRecordingRef.current;
      mobileRecordingRef.current = null;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      if (uri) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await processVoiceQuery('', base64Audio, 'audio/m4a');
      } else {
        startListeningSession();
      }
    } catch (err: any) {
      console.log('Error stopping mobile recording:', err);
      setLiveState('listening');
      startListeningSession();
    }
  };

  // -------------------------------------------------------------
  // AI QUERY & NATURAL VOICE RESPONSE
  // -------------------------------------------------------------
  const processVoiceQuery = async (queryText: string, audioBase64?: string, audioMime?: string) => {
    if ((!queryText.trim() && !audioBase64) || isAiSpeakingRef.current) return;

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

      let reply = '';
      if (audioBase64) {
        const attachments: ChatAttachment[] = [
          {
            uri: 'memory://voice_recording.m4a',
            name: 'voice_recording.m4a',
            type: 'audio',
            mimeType: audioMime || 'audio/m4a',
            base64: audioBase64,
          },
        ];
        const prompt = 'Dengarkan suara rekaman pengguna yang terlampir dan jawab langsung dengan ramah, santai, dan alami sesuai persona kamu.';
        reply = await sendMessageToGemini(historyWithPrompt, prompt, attachments);
      } else {
        reply = await sendMessageToGemini(historyWithPrompt, queryText);
      }
      
      const cleanReply = (reply || 'Suaramu tadi agak kurang jelas, bisa diulang lagi?').trim();

      convoHistoryRef.current = [
        ...convoHistoryRef.current,
        { role: 'user', parts: [{ text: queryText || '[Pesan Suara Pengguna]' }] },
        { role: 'model', parts: [{ text: cleanReply }] },
      ];

      if (onNewMessagePair) {
        onNewMessagePair(queryText || '🎙️ Pesan Suara', cleanReply);
      }

      speakAiVoice(cleanReply);
    } catch (e: any) {
      console.log('Gemini voice query error:', e);
      setErrorMessage(e?.message || 'Gagal memproses suara. Mencoba kembali...');
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

    // Synchronized progressive word streamer in sync with audio pace (~250ms/word)
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
        // Give 350ms buffer before restarting mic to prevent hearing AI's own echo
        setTimeout(() => {
          startListeningSession();
        }, 350);
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

    // 1. Web SpeechSynthesis
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'id-ID';
        utterance.rate = 0.98;
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

    // 2. Mobile Native TTS: Expo Speech
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
      if (mobileRecordingRef.current) {
        mobileRecordingRef.current.stopAndUnloadAsync().catch(() => {});
        mobileRecordingRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      setLiveState('muted');
    }
  };

  const handleManualTapToTalk = () => {
    if (liveState === 'speaking') {
      handleInterruptAi();
    } else if (liveState === 'muted') {
      toggleMute();
    } else if (Platform.OS !== 'web') {
      if (liveState === 'listening') {
        stopMobileRecordingAndSend();
      } else {
        startListeningSession();
      }
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

  const getStatusText = () => {
    switch (liveState) {
      case 'listening':
        return 'Dengarkan, silakan bicara...';
      case 'thinking':
        return 'Menghubungkan pikiran AI...';
      case 'speaking':
        return `${botName} sedang bicara (Ketuk untuk sela)`;
      case 'muted':
        return 'Mikrofon dijeda (ketuk untuk bicara)';
      default:
        return 'Ketuk untuk bicara';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: isLightMode ? '#F8FAFC' : theme.bg }]}>
        {/* Top Minimalist Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={[styles.geminiSparkleIcon, { backgroundColor: isLightMode ? theme.accentBg : (theme.accentBg || 'rgba(66, 133, 244, 0.15)') }]}>
              <Ionicons name="sparkles" size={14} color={isLightMode ? theme.primary : (theme.accentLight || '#4285F4')} />
            </View>
            <Text style={[styles.botTitle, { color: theme.text }]}>{botName}</Text>
          </View>

          <TouchableOpacity
            onPress={handleClose}
            style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border, borderWidth: 1 }]}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        {/* Central Gemini Live Aurora Fluid Wave Visualizer */}
        <View style={styles.visualizerContainer}>
          {/* Ambient Glow Aura */}
          <Animated.View
            style={[
              styles.ambientAura,
              {
                transform: [{ scale: auraScale }],
                opacity: liveState === 'speaking' ? (isLightMode ? 0.45 : 0.7) : liveState === 'listening' ? (isLightMode ? 0.3 : 0.4) : (isLightMode ? 0.15 : 0.2),
                backgroundColor:
                  liveState === 'speaking'
                    ? (theme.accentLight || '#38BDF8')
                    : liveState === 'thinking'
                    ? '#A855F7'
                    : liveState === 'muted'
                    ? '#F59E0B'
                    : (theme.primary || '#00E5FF'),
              },
            ]}
          />

          {/* Gemini Live Fluid Soundwave Aurora Bars */}
          <TouchableOpacity
            style={styles.waveTouchable}
            activeOpacity={0.85}
            onPress={handleManualTapToTalk}
          >
            <View style={styles.auroraBarsRow}>
              {/* Bar 1: Primary Accent */}
              <Animated.View
                style={[
                  styles.auroraBar,
                  {
                    backgroundColor: theme.primary || '#4285F4',
                    shadowColor: theme.primary || '#4285F4',
                    height: bar1.interpolate({ inputRange: [0, 1.5], outputRange: [18, 120] }),
                  },
                ]}
              />
              {/* Bar 2: Cyan / Light Accent */}
              <Animated.View
                style={[
                  styles.auroraBar,
                  {
                    backgroundColor: theme.accentLight || '#00E5FF',
                    shadowColor: theme.accentLight || '#00E5FF',
                    height: bar2.interpolate({ inputRange: [0, 1.5], outputRange: [24, 150] }),
                  },
                ]}
              />
              {/* Bar 3: Gemini Purple */}
              <Animated.View
                style={[
                  styles.auroraBar,
                  {
                    backgroundColor: '#A855F7',
                    shadowColor: '#A855F7',
                    height: bar3.interpolate({ inputRange: [0, 1.5], outputRange: [20, 135] }),
                  },
                ]}
              />
              {/* Bar 4: Gemini Coral Pink */}
              <Animated.View
                style={[
                  styles.auroraBar,
                  {
                    backgroundColor: '#FF5252',
                    shadowColor: '#FF5252',
                    height: bar4.interpolate({ inputRange: [0, 1.5], outputRange: [16, 110] }),
                  },
                ]}
              />
            </View>
          </TouchableOpacity>

          {/* Status Label */}
          <Text style={[styles.statusIndicatorText, { color: theme.subtext }]}>{getStatusText()}</Text>

          {liveState === 'listening' && Platform.OS !== 'web' && (
            <View
              style={[
                styles.interruptPill,
                {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: theme.border,
                  borderWidth: 1,
                },
              ]}
            >
              <Ionicons name="pulse" size={12} color={theme.subtext} />
              <Text style={[styles.interruptPillText, { color: theme.subtext }]}>Berhenti bicara sebentar = langsung terkirim otomatis</Text>
            </View>
          )}

          {liveState === 'speaking' && (
            <TouchableOpacity
              style={[
                styles.interruptPill,
                {
                  backgroundColor: isLightMode ? theme.card : 'rgba(255, 255, 255, 0.08)',
                  borderColor: theme.border,
                  borderWidth: 1,
                },
              ]}
              onPress={handleInterruptAi}
              activeOpacity={0.7}
            >
              <Ionicons name="pause" size={11} color={theme.subtext} />
              <Text style={[styles.interruptPillText, { color: theme.subtext }]}>Ketuk untuk menyela</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status / Error Toast Area */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.errorCaptionText}>{errorMessage}</Text>
          </View>
        )}

        {/* Gemini Live Sleek Floating Controls Dock */}
        <View
          style={[
            styles.bottomDock,
            {
              backgroundColor: isLightMode ? theme.card : 'rgba(19, 24, 35, 0.85)',
              borderColor: theme.border,
              borderWidth: 1,
            },
          ]}
        >
          {/* Mic Toggle */}
          <TouchableOpacity
            style={[
              styles.dockBtn,
              {
                backgroundColor: isLightMode ? theme.cardInner : '#1E2536',
                borderColor: theme.border,
                borderWidth: 1,
              },
              isMicMuted && styles.dockBtnMuted,
            ]}
            onPress={toggleMute}
            activeOpacity={0.8}
            accessibilityLabel="Mute Mikrofon"
          >
            <Ionicons
              name={isMicMuted ? 'mic-off' : 'mic'}
              size={22}
              color={isMicMuted ? '#EF4444' : isLightMode ? theme.text : '#FFFFFF'}
            />
          </TouchableOpacity>

          {/* End Call Button */}
          <TouchableOpacity
            style={styles.dockEndCallBtn}
            onPress={handleClose}
            activeOpacity={0.8}
            accessibilityLabel="Akhiri Panggilan"
          >
            <Ionicons name="call" size={24} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>

          {/* Interrupt / Action Button */}
          <TouchableOpacity
            style={[
              styles.dockBtn,
              {
                backgroundColor: isLightMode ? theme.cardInner : '#1E2536',
                borderColor: theme.border,
                borderWidth: 1,
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
            accessibilityLabel="Ulangi Ucapan"
          >
            <Ionicons
              name={liveState === 'speaking' ? 'hand-left' : 'refresh'}
              size={20}
              color={isLightMode ? theme.text : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 24 : 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  geminiSparkleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(66, 133, 244, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#131823',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 260,
    position: 'relative',
  },
  ambientAura: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    filter: Platform.OS === 'web' ? 'blur(60px)' : undefined,
  },
  waveTouchable: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  auroraBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 160,
  },
  auroraBar: {
    width: 14,
    borderRadius: 7,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
  },
  statusIndicatorText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  interruptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  interruptPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
  },
  captionsContainer: {
    minHeight: 90,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  userCaptionText: {
    color: '#38BDF8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  aiCaptionText: {
    color: '#E2E8F0',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginHorizontal: 20,
  },
  errorCaptionText: {
    color: '#F87171',
    fontSize: 12.5,
    textAlign: 'center',
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    paddingVertical: 14,
    backgroundColor: 'rgba(19, 24, 35, 0.85)',
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: Platform.OS === 'ios' ? 10 : 8,
  },
  dockBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  dockEndCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EA4335',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EA4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
});
