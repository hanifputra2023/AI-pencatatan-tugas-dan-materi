import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  Image,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useMoods } from '../contexts/MoodContext';
import { useResponsive } from '../hooks/useResponsive';
import { sendMessageToGemini, extractJsonFromText } from '../lib/gemini';
import { copyToClipboard } from '../lib/clipboard';

export interface PodcastDialogue {
  speaker: 'ai_bot' | 'co_host';
  name: string;
  text: string;
}

export type PodcastStyle = 'casual' | 'speed' | 'deep';

interface AudioLecturePlayerProps {
  noteId?: string;
  title: string;
  summaryText?: string | null;
  fullContentText: string;
  onClose?: () => void;
}

const SPEED_OPTIONS = [0.8, 0.9, 1.0, 1.25];

export default function AudioLecturePlayer({
  noteId,
  title,
  summaryText,
  fullContentText,
  onClose,
}: AudioLecturePlayerProps) {
  const { theme, isLightMode } = useTheme();
  const { aiBotName, customAiName, customAiAvatar, activePersona } = useMoods();
  const { isMobile, isSmallPhone } = useResponsive();

  // Resolved dynamic identity from user's custom AI configuration in Profile
  const effectiveAiName = customAiName || activePersona?.botName || aiBotName || 'Ara';
  const coHostName = 'Reno';

  // Mode Selection: 'podcast' vs 'narration'
  const [playerMode, setPlayerMode] = useState<'podcast' | 'narration'>('podcast');

  // General Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.95);
  const [hasIndonesianVoice, setHasIndonesianVoice] = useState<boolean>(true);
  const [showVoiceHelpModal, setShowVoiceHelpModal] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  // Voice Labels for Host Card Badges
  const [aiVoiceNameDisplay, setAiVoiceNameDisplay] = useState<string>('Suara Sopran (Pitch 1.35x)');
  const [coHostVoiceNameDisplay, setCoHostVoiceNameDisplay] = useState<string>('Suara Bariton (Pitch 0.62x)');

  // Narration Mode State
  const [narrationSource, setNarrationSource] = useState<'summary' | 'full'>(summaryText ? 'summary' : 'full');
  const narrationSentenceQueueRef = useRef<string[]>([]);
  const currentNarrationIdxRef = useRef<number>(0);

  // Podcast Mode State
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('casual');
  const [podcastScript, setPodcastScript] = useState<PodcastDialogue[]>([]);
  const [generatingPodcast, setGeneratingPodcast] = useState<boolean>(false);
  const [activeScriptIdx, setActiveScriptIdx] = useState<number>(0);

  // Voice objects / IDs for Web SpeechSynthesis and Native Expo Speech
  const aiVoiceRef = useRef<any>(null);
  const coHostVoiceRef = useRef<any>(null);
  const activeUtteranceRef = useRef<any>(null);

  // References for async TTS callback loop
  const isSpeakingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(playbackSpeed);
  const activeScriptIdxRef = useRef<number>(0);
  const scriptScrollRef = useRef<ScrollView>(null);

  // Animated soundwave bars
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.6)).current;
  const wave3 = useRef(new Animated.Value(0.9)).current;
  const wave4 = useRef(new Animated.Value(0.4)).current;
  const wave5 = useRef(new Animated.Value(0.7)).current;

  // Pulse animation for active speaker host card
  const speakerPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    activeScriptIdxRef.current = activeScriptIdx;
  }, [activeScriptIdx]);

  // Indonesian Text Normalization — cleans text for natural speech delivery
  const normalizeIndonesianText = (rawText: string): string => {
    return rawText
      .replace(/```[\s\S]*?```/g, '. ')
      .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\|[-=|:\s]+\|$/gm, '')
      .replace(/^[\s|]+[-=|]+[\s|]+$/gm, '')
      .replace(/\|/g, ', ')
      .replace(/^[-=*_+.]{3,}$/gm, '. ')
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
      .replace(/https?:\/\/\S+/g, 'tautan')
      .replace(/(\w)\s*²/g, '$1 kuadrat')
      .replace(/(\w)\s*³/g, '$1 kubik')
      .replace(/(\w)\s*⁴/g, '$1 pangkat empat')
      .replace(/√(\w+)/g, 'akar dari $1')
      .replace(/∑/g, 'sigma ')
      .replace(/∫/g, 'integral ')
      .replace(/∞/g, 'tak hingga')
      .replace(/π/g, 'pi')
      .replace(/≤/g, 'kurang dari atau sama dengan')
      .replace(/≥/g, 'lebih dari atau sama dengan')
      .replace(/≠/g, 'tidak sama dengan')
      .replace(/≈/g, 'kira-kira')
      .replace(/±/g, 'plus minus')
      .replace(/×/g, 'dikali')
      .replace(/÷/g, 'dibagi')
      .replace(/=/g, ' sama dengan ')
      .replace(/\+/g, ' ditambah ')
      .replace(/\s*-\s*(\d)/g, ' dikurangi $1')
      .replace(/→|⟶|➔|➜/g, 'menuju')
      .replace(/←|⟵/g, 'dari')
      .replace(/↔|⟷/g, 'berhubungan dengan')
      .replace(/⇒|➡/g, 'sehingga')
      .replace(/\bkm\/h\b/gi, 'kilometer per jam')
      .replace(/\bm\/s\b/gi, 'meter per detik')
      .replace(/\bkg\b/gi, 'kilogram')
      .replace(/\bkm\b/gi, 'kilometer')
      .replace(/\bcm\b/gi, 'sentimeter')
      .replace(/\bmm\b/gi, 'milimeter')
      .replace(/\bHz\b/g, 'hertz')
      .replace(/\bkHz\b/g, 'kilohertz')
      .replace(/\bMHz\b/g, 'megahertz')
      .replace(/\bGHz\b/g, 'gigahertz')
      .replace(/\b%/g, 'persen')
      .replace(/\b°C\b/g, 'derajat celcius')
      .replace(/\bdll\b\.?/gi, 'dan lain-lain')
      .replace(/\bdst\b\.?/gi, 'dan seterusnya')
      .replace(/\byg\b/gi, 'yang')
      .replace(/\bdgn\b/gi, 'dengan')
      .replace(/\btsb\b/gi, 'tersebut')
      .replace(/\btgl\b\.?/gi, 'tanggal')
      .replace(/\bthn\b\.?/gi, 'tahun')
      .replace(/\bmis\b\.?/gi, 'misalnya')
      .replace(/\bno\b\.?/gi, 'nomor')
      .replace(/\bvs\b\.?/gi, 'versus')
      .replace(/\bi\.e\.\b/gi, 'yaitu')
      .replace(/\be\.g\.\b/gi, 'misalnya')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u2600-\u27BF]/g, '')
      .replace(/[★☆✓✗✔✘◆◇■□●○▲△▼▽]/g, '')
      .replace(/[()[\]{}<>]/g, ', ')
      .replace(/[_^~]/g, '')
      .replace(/#+/g, '')
      .replace(/\$/g, 'dollar')
      .replace(/@/g, 'at')
      .replace(/&/g, 'dan')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\.\s*\.\s*\./g, '. ')
      .replace(/,\s*,/g, ',')
      .replace(/\s*,\s*,/g, ', ')
      .replace(/\.\s*,/g, '.')
      .replace(/[.]{2,}/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  // Discover native Indonesian voices using Web SpeechSynthesis (Web) or Expo Speech (Native)
  useEffect(() => {
    const discoverVoices = async () => {
      // 1. Web Platform (Chrome / Edge / Windows / Mac / Linux)
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        const mapWebVoices = () => {
          const allVoices = window.speechSynthesis.getVoices();
          if (!allVoices || allVoices.length === 0) return;

          const idVoices = allVoices.filter(v => {
            const lang = (v.lang || '').toLowerCase();
            const name = (v.name || '').toLowerCase();
            return lang.includes('id') || name.includes('indonesia');
          });

          // Host 1 (AI Bot / Female): prefer Gadis, Damayanti, Siti, or first Indonesian voice
          const femaleVoice = idVoices.find(v => {
            const name = v.name.toLowerCase();
            return (
              name.includes('gadis') ||
              name.includes('damayanti') ||
              name.includes('siti') ||
              name.includes('female') ||
              name.includes('wanita')
            );
          }) || idVoices[0] || allVoices[0];

          // Host 2 (Reno / Male): prefer Ardi, Andika, Budi, or second Indonesian voice
          const maleVoice = idVoices.find(v => {
            const name = v.name.toLowerCase();
            return (
              (name.includes('ardi') ||
                name.includes('andika') ||
                name.includes('budi') ||
                name.includes('male') ||
                name.includes('pria')) &&
              v !== femaleVoice
            );
          }) || (idVoices.length > 1 ? idVoices.find(v => v !== femaleVoice) : null) || idVoices[0] || allVoices[0];

          aiVoiceRef.current = femaleVoice;
          coHostVoiceRef.current = maleVoice;

          if (femaleVoice) {
            const cleanName = femaleVoice.name.replace(/Microsoft|Online|Desktop|Google|\(Natural\)/gi, '').trim();
            setAiVoiceNameDisplay(cleanName || 'Suara Sopran (Pitch 1.35x)');
          }
          if (maleVoice && maleVoice !== femaleVoice) {
            const cleanName = maleVoice.name.replace(/Microsoft|Online|Desktop|Google|\(Natural\)/gi, '').trim();
            setCoHostVoiceNameDisplay(cleanName || 'Suara Bariton (Pitch 0.62x)');
          } else {
            setCoHostVoiceNameDisplay('Suara Bariton (Pitch 0.62x)');
          }

          setHasIndonesianVoice(idVoices.length > 0);
        };

        mapWebVoices();
        window.speechSynthesis.onvoiceschanged = mapWebVoices;
        return;
      }

      // 2. Native Platform (Expo Speech)
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (voices && voices.length > 0) {
          const idVoices = voices.filter(v => {
            const lang = (v.language || '').toLowerCase();
            const name = (v.name || '').toLowerCase();
            return lang.includes('id') || name.includes('indonesia');
          });

          const female = idVoices.find(v => {
            const name = (v.name || '').toLowerCase();
            return name.includes('gadis') || name.includes('damayanti') || name.includes('female');
          }) || idVoices[0];

          const male = idVoices.find(v => {
            const name = (v.name || '').toLowerCase();
            return (name.includes('ardi') || name.includes('andika') || name.includes('male')) && v.identifier !== female?.identifier;
          }) || (idVoices.length > 1 ? idVoices[1] : idVoices[0]);

          if (female) {
            aiVoiceRef.current = female.identifier;
            setAiVoiceNameDisplay(female.name.replace(/Microsoft|Online|Desktop|Google/gi, '').trim() || 'Suara Sopran');
          }
          if (male) {
            coHostVoiceRef.current = male.identifier;
            setCoHostVoiceNameDisplay(male.name.replace(/Microsoft|Online|Desktop|Google/gi, '').trim() || 'Suara Bariton');
          }
          setHasIndonesianVoice(idVoices.length > 0);
        }
      } catch (e) {
        console.log('Error detecting native voices:', e);
      }
    };

    discoverVoices();
  }, []);

  // Load cached podcast script on mount or style change
  const getCacheKey = (styleKey: PodcastStyle) => {
    const identifier = noteId || title.slice(0, 35).replace(/[^a-zA-Z0-9]/g, '_');
    return `@study_podcast_${identifier}_${styleKey}`;
  };

  useEffect(() => {
    const loadCachedScript = async () => {
      try {
        const key = getCacheKey(podcastStyle);
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPodcastScript(parsed);
            setActiveScriptIdx(0);
          }
        }
      } catch (e) {
        console.log('Error loading cached podcast script:', e);
      }
    };

    loadCachedScript();
  }, [noteId, title, podcastStyle]);

  // Soundwave & Speaking Pulse looping animation
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;

    if (isPlaying && !isPaused) {
      const createBarAnim = (val: Animated.Value, min: number, max: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: max, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(val, { toValue: min, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          ])
        );
      };

      animLoop = Animated.parallel([
        createBarAnim(wave1, 0.2, 1.0, 310),
        createBarAnim(wave2, 0.3, 0.9, 420),
        createBarAnim(wave3, 0.2, 1.0, 260),
        createBarAnim(wave4, 0.4, 0.8, 460),
        createBarAnim(wave5, 0.2, 0.95, 340),
      ]);
      animLoop.start();

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(speakerPulse, { toValue: 1.05, duration: 450, easing: Easing.ease, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(speakerPulse, { toValue: 1.0, duration: 450, easing: Easing.ease, useNativeDriver: Platform.OS !== 'web' }),
        ])
      );
      pulseLoop.start();
    } else {
      wave1.setValue(0.2);
      wave2.setValue(0.2);
      wave3.setValue(0.2);
      wave4.setValue(0.2);
      wave5.setValue(0.2);
      speakerPulse.setValue(1.0);
    }

    return () => {
      if (animLoop) animLoop.stop();
      if (pulseLoop) pulseLoop.stop();
    };
  }, [isPlaying, isPaused]);

  // =========================================================================
  // GENERATE AI PODCAST SCRIPT VIA GEMINI
  // =========================================================================
  const handleGeneratePodcast = async (targetStyle: PodcastStyle = podcastStyle) => {
    setGeneratingPodcast(true);
    stopPlayback();

    try {
      const styleGuides: Record<PodcastStyle, string> = {
        casual: 'Gaya santai, asyik, penuh analogi relate kehidupan sehari-hari anak kuliah, santun dan seru.',
        speed: 'Gaya bedah kilat (crash course), to-the-point langsung merangkum konsep kunci & potensi soal ujian.',
        deep: 'Gaya deep dive kritis, membedah prinsip logika dasar, alasan ilmiah di balik teori, dan studi kasus nyata.',
      };

      const systemPrompt = `Kamu adalah produser AI Study Podcast edukasi kampus profesional ala Google NotebookLM Audio Overview.
Tugasmu adalah mengubah materi catatan belajar kuliah menjadi naskah obrolan podcast dua arah yang seru dan berbobot antara 2 Host:
1. "${effectiveAiName}" (Teman & Tutor AI: cerdas, bersahabat, terstruktur, menjelaskan konsep inti materi, rumus, dan klarifikasi).
2. "${coHostName}" (Partner Mahasiswa: antusias, kritis, mewakili pertanyaan mahasiswa, memberi analogi sederhana sehari-hari, dan menyimpulkan poin penting).

PEDOMAN PENTING:
- Buat obrolan saling bersahutan secara natural (bukan membaca artikel panjang).
- Gunakan bahasa Indonesia lisan santai yang enak didengar, edukatif, dan bersahabat.
- JANGAN gunakan format markdown (tidak boleh ada **, ##, bullet point di dalam teks dialog) agar jernih dibacakan Text-to-Speech.
- Gaya diskusi: ${styleGuides[targetStyle]}.
- Jumlah dialog: Antara 10 hingga 14 pertukaran dialog bergantian antara ${effectiveAiName} dan ${coHostName}.

WAJIB menghasilkan output dalam format JSON Array murni:
[
  {
    "speaker": "ai_bot",
    "name": "${effectiveAiName}",
    "text": "Hai semuanya! Balik lagi bareng aku ${effectiveAiName} dan Reno di AI Study Podcast..."
  },
  {
    "speaker": "co_host",
    "name": "${coHostName}",
    "text": "Halo teman-teman! Hari ini kita bakal kupas tuntas catatan kuliah tentang..."
  }
]`;

      const userPrompt = `Judul Catatan: ${title}\n\nRingkasan: ${summaryText || 'Tidak ada ringkasan'}\n\nIsi Materi Kuliah Lengkap:\n${fullContentText.slice(0, 4500)}`;

      const rawAiResponse = await sendMessageToGemini([], userPrompt, null, systemPrompt);
      const parsedScript = extractJsonFromText<PodcastDialogue[]>(rawAiResponse);

      if (Array.isArray(parsedScript) && parsedScript.length > 0) {
        const sanitized: PodcastDialogue[] = parsedScript.map(item => ({
          speaker: item.speaker === 'co_host' ? 'co_host' : 'ai_bot',
          name: item.speaker === 'co_host' ? coHostName : effectiveAiName,
          text: item.text || '',
        }));

        setPodcastScript(sanitized);
        setActiveScriptIdx(0);

        const cacheKey = getCacheKey(targetStyle);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(sanitized));
      }
    } catch (err: any) {
      console.log('Error generating podcast script:', err);
    } finally {
      setGeneratingPodcast(false);
    }
  };

  // =========================================================================
  // AUDIO PLAYBACK ENGINE: DUAL-VOICE AUDIBLE CONTRAST
  // =========================================================================
  const speakPodcastDialogue = (index: number) => {
    if (!isSpeakingRef.current) return;
    if (!podcastScript || podcastScript.length === 0 || index >= podcastScript.length) {
      stopPlayback();
      return;
    }

    const currentItem = podcastScript[index];
    setActiveScriptIdx(index);
    activeScriptIdxRef.current = index;

    const cleanSpeech = normalizeIndonesianText(currentItem.text);
    const isAiSpeaker = currentItem.speaker === 'ai_bot';

    // MAXIMUM DUAL-VOICE CONTRAST:
    // Host 1 (AI Bot): Pitch 1.35 (cheerful, feminine, high soprano tone) & brisk rate
    // Host 2 (Reno): Pitch 0.62 (deep, baritone, masculine relaxed tone) & steady rate
    const dynamicPitch = isAiSpeaker ? 1.35 : 0.62;
    const dynamicRate = isAiSpeaker
      ? Math.max(0.85, playbackSpeedRef.current * 1.04)
      : Math.max(0.75, playbackSpeedRef.current * 0.90);

    const onFinished = () => {
      if (isSpeakingRef.current) {
        const nextIdx = index + 1;
        if (nextIdx < podcastScript.length) {
          speakPodcastDialogue(nextIdx);
        } else {
          stopPlayback();
        }
      }
    };

    // ── 1. WEB PLATFORM: Direct Native SpeechSynthesis for crystal clear dual voices ──
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleanSpeech);
        utterance.lang = 'id-ID';
        utterance.pitch = dynamicPitch;
        utterance.rate = dynamicRate;

        // Assign distinct voice if separate voices exist
        const voiceObj = isAiSpeaker ? aiVoiceRef.current : coHostVoiceRef.current;
        if (voiceObj) {
          utterance.voice = voiceObj;
        }

        utterance.onend = onFinished;
        utterance.onerror = (e) => {
          console.log('Utterance error:', e);
          onFinished();
        };

        activeUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.log('Web SpeechSynthesis error, falling back to expo-speech:', err);
      }
    }

    // ── 2. NATIVE PLATFORM (Expo Speech) ──
    try {
      Speech.stop();
      const voiceId = isAiSpeaker ? aiVoiceRef.current : coHostVoiceRef.current;

      Speech.speak(cleanSpeech, {
        language: 'id-ID',
        voice: typeof voiceId === 'string' ? voiceId : undefined,
        pitch: dynamicPitch,
        rate: dynamicRate,
        onDone: onFinished,
        onError: onFinished,
      });
    } catch (e) {
      console.log('Speech.speak error:', e);
      onFinished();
    }
  };

  const seekToPodcastIndex = async (index: number) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    try {
      await Speech.stop();
    } catch (e) {}

    const clamped = Math.max(0, Math.min(podcastScript.length - 1, index));
    setActiveScriptIdx(clamped);
    activeScriptIdxRef.current = clamped;
    isSpeakingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);

    speakPodcastDialogue(clamped);
  };

  // =========================================================================
  // AUDIO PLAYBACK ENGINE: NARRATION MODE
  // =========================================================================
  const splitTextIntoSentences = (text: string): string[] => {
    const raw = text.split(/(?<=[.!?])\s+/);
    const result: string[] = [];
    for (const s of raw) {
      const trimmed = s.trim();
      if (trimmed.length > 0) {
        if (trimmed.length > 140) {
          const sub = trimmed.split(/(?<=[,;])\s+/);
          result.push(...sub.filter(x => x.trim().length > 0));
        } else {
          result.push(trimmed);
        }
      }
    }
    return result;
  };

  const getFullCleanNarrationText = () => {
    if (narrationSource === 'summary' && summaryText && summaryText.trim()) {
      return `Ringkasan materi ${title}. ${normalizeIndonesianText(summaryText)}`;
    }
    return `Materi kuliah: ${title}. ${normalizeIndonesianText(fullContentText)}`;
  };

  const speakNarrationSentence = () => {
    if (!isSpeakingRef.current) return;

    const queue = narrationSentenceQueueRef.current;
    const idx = currentNarrationIdxRef.current;

    if (idx >= queue.length) {
      stopPlayback();
      return;
    }

    const sentence = queue[idx];

    const onNarrationDone = () => {
      if (isSpeakingRef.current) {
        currentNarrationIdxRef.current = idx + 1;
        speakNarrationSentence();
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = 'id-ID';
        utterance.pitch = 1.0;
        utterance.rate = playbackSpeedRef.current;
        if (aiVoiceRef.current) utterance.voice = aiVoiceRef.current;
        utterance.onend = onNarrationDone;
        utterance.onerror = onNarrationDone;
        window.speechSynthesis.speak(utterance);
        return;
      } catch (e) {}
    }

    try {
      Speech.speak(sentence, {
        language: 'id-ID',
        voice: typeof aiVoiceRef.current === 'string' ? aiVoiceRef.current : undefined,
        pitch: 1.0,
        rate: playbackSpeedRef.current,
        onDone: onNarrationDone,
        onError: onNarrationDone,
      });
    } catch (err) {
      onNarrationDone();
    }
  };

  // =========================================================================
  // GENERAL PLAYBACK CONTROLS
  // =========================================================================
  const startPlayback = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    try {
      await Speech.stop();
    } catch (e) {}

    isSpeakingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);

    if (playerMode === 'podcast') {
      if (podcastScript.length === 0) {
        handleGeneratePodcast();
      } else {
        speakPodcastDialogue(activeScriptIdxRef.current);
      }
    } else {
      const fullText = getFullCleanNarrationText();
      const sentences = splitTextIntoSentences(fullText);
      if (sentences.length === 0) return;

      narrationSentenceQueueRef.current = sentences;
      currentNarrationIdxRef.current = 0;
      speakNarrationSentence();
    }
  };

  const pausePlayback = async () => {
    isSpeakingRef.current = false;
    setIsPlaying(true);
    setIsPaused(true);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.pause();
        return;
      } catch (e) {}
    }

    try {
      await Speech.pause();
    } catch (e) {
      try {
        await Speech.stop();
      } catch (err) {}
    }
  };

  const resumePlayback = async () => {
    isSpeakingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          return;
        }
      } catch (e) {}
    }

    try {
      await Speech.resume();
    } catch (e) {
      if (playerMode === 'podcast') {
        speakPodcastDialogue(activeScriptIdxRef.current);
      } else {
        speakNarrationSentence();
      }
    }
  };

  const stopPlayback = async () => {
    isSpeakingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    try {
      await Speech.stop();
    } catch (e) {}
  };

  const togglePlay = () => {
    if (!isPlaying) {
      startPlayback();
    } else if (isPaused) {
      resumePlayback();
    } else {
      pausePlayback();
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    playbackSpeedRef.current = speed;
    if (isPlaying && !isPaused) {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
      try {
        await Speech.stop();
      } catch (e) {}
      if (playerMode === 'podcast') {
        speakPodcastDialogue(activeScriptIdxRef.current);
      } else {
        speakNarrationSentence();
      }
    }
  };

  const handleCopyTranscript = async () => {
    if (podcastScript.length === 0) return;
    const formatted = podcastScript
      .map(d => `[${d.name} (${d.speaker === 'ai_bot' ? 'Host AI' : 'Co-Host'})]:\n${d.text}`)
      .join('\n\n');

    await copyToClipboard(formatted);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2500);
  };

  // Cleanup audio playback on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Determine current active speaker in podcast mode
  const currentDialogue = podcastScript[activeScriptIdx];
  const isAiSpeakingNow = isPlaying && !isPaused && playerMode === 'podcast' && currentDialogue?.speaker === 'ai_bot';
  const isCoHostSpeakingNow = isPlaying && !isPaused && playerMode === 'podcast' && currentDialogue?.speaker === 'co_host';

  return (
    <View style={[styles.playerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* ── Top Header Row (Responsive) ── */}
      <View style={[styles.topRow, isMobile && { flexWrap: 'wrap', gap: 6 }]}>
        <View style={[styles.titleInfoGroup, isMobile && { minWidth: 160 }]}>
          <View style={[styles.iconPill, { backgroundColor: theme.accentBg }]}>
            <Ionicons
              name={playerMode === 'podcast' ? 'mic' : 'volume-high'}
              size={15}
              color={theme.accentLight}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={[styles.playerHeaderTitle, { color: theme.text }]} numberOfLines={1}>
                {playerMode === 'podcast' ? 'AI Study Podcast Studio' : 'Audio Narasi Kuliah'}
              </Text>
              {playerMode === 'podcast' && (
                <View style={[styles.notebookBadge, { backgroundColor: isLightMode ? '#EFF6FF' : '#172554', borderColor: isLightMode ? '#BFDBFE' : '#1E3A8A' }]}>
                  <Text style={[styles.notebookBadgeText, { color: isLightMode ? '#2563EB' : '#60A5FA' }]}>2 Host Live</Text>
                </View>
              )}
            </View>
            <Text style={[styles.playerHeaderSub, { color: theme.subtext }]} numberOfLines={1}>
              {isPlaying
                ? isPaused
                  ? 'Dijeda'
                  : playerMode === 'podcast'
                    ? `Bicara: ${currentDialogue?.name || effectiveAiName}`
                    : 'Sedang Membacakan Materi...'
                : playerMode === 'podcast'
                  ? `Diskusi ${effectiveAiName} & ${coHostName}`
                  : 'Tekan Play untuk mendengarkan'}
            </Text>
          </View>
        </View>

        {/* Header Actions */}
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            onPress={() => setShowVoiceHelpModal(true)}
            style={[
              styles.badgeHd,
              { backgroundColor: hasIndonesianVoice ? (isLightMode ? '#DCFCE7' : '#0F261E') : (isLightMode ? '#FEF3C7' : '#2B2010') }
            ]}
          >
            <Text style={[styles.badgeHdText, { color: hasIndonesianVoice ? (isLightMode ? '#15803D' : '#34D399') : (isLightMode ? '#B45309' : '#FBBF24') }]}>
              {hasIndonesianVoice ? 'Dual Voice HD' : 'Voice Standar'}
            </Text>
            <Ionicons
              name="information-circle-outline"
              size={11}
              color={hasIndonesianVoice ? (isLightMode ? '#15803D' : '#34D399') : (isLightMode ? '#B45309' : '#FBBF24')}
            />
          </TouchableOpacity>

          {onClose && (
            <TouchableOpacity
              onPress={() => { stopPlayback(); onClose(); }}
              style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
            >
              <Ionicons name="close" size={14} color={theme.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Mode Switcher Tab Bar: Podcast vs Narration (Responsive) ── */}
      <View style={[styles.mainTabWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }, isMobile && { padding: 2.5 }]}>
        <TouchableOpacity
          style={[
            styles.mainTabBtn,
            isMobile && { paddingVertical: 5 },
            playerMode === 'podcast' && [styles.mainTabBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
          ]}
          onPress={() => {
            if (playerMode !== 'podcast') {
              stopPlayback();
              setPlayerMode('podcast');
            }
          }}
        >
          <Ionicons
            name="mic"
            size={isMobile ? 12 : 13}
            color={playerMode === 'podcast' ? theme.primary : theme.subtext}
          />
          <Text
            style={[
              styles.mainTabText,
              { color: theme.subtext },
              isMobile && { fontSize: 10.5 },
              playerMode === 'podcast' && [styles.mainTabTextActive, { color: theme.primary }]
            ]}
          >
            AI Podcast (2 Host)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mainTabBtn,
            isMobile && { paddingVertical: 5 },
            playerMode === 'narration' && [styles.mainTabBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
          ]}
          onPress={() => {
            if (playerMode !== 'narration') {
              stopPlayback();
              setPlayerMode('narration');
            }
          }}
        >
          <Ionicons
            name="reader-outline"
            size={isMobile ? 12 : 13}
            color={playerMode === 'narration' ? theme.primary : theme.subtext}
          />
          <Text
            style={[
              styles.mainTabText,
              { color: theme.subtext },
              isMobile && { fontSize: 10.5 },
              playerMode === 'narration' && [styles.mainTabTextActive, { color: theme.primary }]
            ]}
          >
            Narasi Catatan Asli
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MODE 1: AI PODCAST (NOTEBOOKLM STYLE) ── */}
      {playerMode === 'podcast' ? (
        <View style={styles.podcastContainer}>
          {/* Dual Host Live Broadcast Stage (Responsive Stack on Small Phones) */}
          <View
            style={[
              styles.broadcastStage,
              { backgroundColor: theme.cardInner, borderColor: theme.border },
              isSmallPhone && { flexDirection: 'column', gap: 5, padding: 6 }
            ]}
          >
            {/* Host 1: Custom Teman AI */}
            <Animated.View
              style={[
                styles.hostCard,
                {
                  backgroundColor: theme.card,
                  borderColor: isAiSpeakingNow ? theme.primary : theme.border,
                  transform: isAiSpeakingNow ? [{ scale: speakerPulse }] : [{ scale: 1 }],
                },
                isMobile && { paddingHorizontal: 7, paddingVertical: 6, gap: 6 },
                isAiSpeakingNow && {
                  shadowColor: theme.primary,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 4,
                  borderWidth: 1.5,
                }
              ]}
            >
              <View style={styles.avatarWrapper}>
                {customAiAvatar ? (
                  <Image
                    source={{ uri: customAiAvatar }}
                    style={[styles.hostAvatarImg, isMobile && { width: 28, height: 28, borderRadius: 14 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.hostAvatarFallback,
                      { backgroundColor: theme.accentBg },
                      isMobile && { width: 28, height: 28, borderRadius: 14 }
                    ]}
                  >
                    <Ionicons name="sparkles" size={isMobile ? 14 : 16} color={theme.accentLight} />
                  </View>
                )}
                {isAiSpeakingNow && (
                  <View style={[styles.liveGlowIndicator, { backgroundColor: '#10B981' }]} />
                )}
              </View>

              <View style={styles.hostMetaWrap}>
                <Text style={[styles.hostNameText, { color: theme.text }, isMobile && { fontSize: 10.5 }]} numberOfLines={1}>
                  {effectiveAiName}
                </Text>
                <Text style={[styles.hostRoleText, { color: theme.muted }, isMobile && { fontSize: 8.5 }]} numberOfLines={1}>
                  Host AI • {aiVoiceNameDisplay}
                </Text>
              </View>

              <View
                style={[
                  styles.speakerStatusPill,
                  isMobile && { paddingHorizontal: 4, paddingVertical: 2 },
                  isAiSpeakingNow
                    ? { backgroundColor: isLightMode ? '#DCFCE7' : '#064E3B', borderColor: '#10B981' }
                    : { backgroundColor: theme.cardInner, borderColor: theme.border }
                ]}
              >
                <Ionicons
                  name={isAiSpeakingNow ? 'mic' : 'headset'}
                  size={isMobile ? 9 : 10}
                  color={isAiSpeakingNow ? '#10B981' : theme.muted}
                />
                <Text
                  style={[
                    styles.speakerStatusText,
                    isMobile && { fontSize: 8 },
                    { color: isAiSpeakingNow ? (isLightMode ? '#15803D' : '#34D399') : theme.muted }
                  ]}
                >
                  {isAiSpeakingNow ? 'Bicara' : 'Menyimak'}
                </Text>
              </View>
            </Animated.View>

            {/* Stage Center Divider */}
            <View style={[styles.stageCenterDivider, isSmallPhone && { flexDirection: 'row', paddingVertical: 1, gap: 4 }]}>
              <Ionicons
                name="radio-outline"
                size={14}
                color={isPlaying && !isPaused ? theme.primary : theme.muted}
              />
              <Text style={[styles.stageVsText, { color: theme.muted }]}>DUAL</Text>
            </View>

            {/* Host 2: Reno (Co-Host Mahasiswa) */}
            <Animated.View
              style={[
                styles.hostCard,
                {
                  backgroundColor: theme.card,
                  borderColor: isCoHostSpeakingNow ? '#38BDF8' : theme.border,
                  transform: isCoHostSpeakingNow ? [{ scale: speakerPulse }] : [{ scale: 1 }],
                },
                isMobile && { paddingHorizontal: 7, paddingVertical: 6, gap: 6 },
                isCoHostSpeakingNow && {
                  shadowColor: '#38BDF8',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 4,
                  borderWidth: 1.5,
                }
              ]}
            >
              <View style={styles.avatarWrapper}>
                <View
                  style={[
                    styles.hostAvatarFallback,
                    { backgroundColor: isLightMode ? '#E0F2FE' : '#082F49' },
                    isMobile && { width: 28, height: 28, borderRadius: 14 }
                  ]}
                >
                  <Ionicons name="headset" size={isMobile ? 14 : 16} color={isLightMode ? '#0284C7' : '#38BDF8'} />
                </View>
                {isCoHostSpeakingNow && (
                  <View style={[styles.liveGlowIndicator, { backgroundColor: '#38BDF8' }]} />
                )}
              </View>

              <View style={styles.hostMetaWrap}>
                <Text style={[styles.hostNameText, { color: theme.text }, isMobile && { fontSize: 10.5 }]} numberOfLines={1}>
                  {coHostName}
                </Text>
                <Text style={[styles.hostRoleText, { color: theme.muted }, isMobile && { fontSize: 8.5 }]} numberOfLines={1}>
                  Co-Host • {coHostVoiceNameDisplay}
                </Text>
              </View>

              <View
                style={[
                  styles.speakerStatusPill,
                  isMobile && { paddingHorizontal: 4, paddingVertical: 2 },
                  isCoHostSpeakingNow
                    ? { backgroundColor: isLightMode ? '#E0F2FE' : '#082F49', borderColor: '#38BDF8' }
                    : { backgroundColor: theme.cardInner, borderColor: theme.border }
                ]}
              >
                <Ionicons
                  name={isCoHostSpeakingNow ? 'mic' : 'headset'}
                  size={isMobile ? 9 : 10}
                  color={isCoHostSpeakingNow ? '#38BDF8' : theme.muted}
                />
                <Text
                  style={[
                    styles.speakerStatusText,
                    isMobile && { fontSize: 8 },
                    { color: isCoHostSpeakingNow ? (isLightMode ? '#0284C7' : '#38BDF8') : theme.muted }
                  ]}
                >
                  {isCoHostSpeakingNow ? 'Bicara' : 'Menyimak'}
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* Style Selector Chips (Responsive Wrap) */}
          <View style={[styles.styleSelectorRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
            <Text style={[styles.styleSelectorLabel, { color: theme.muted }]}>Gaya Obrolan:</Text>
            <View style={[styles.styleChipsGroup, isMobile && { width: '100%' }]}>
              {(
                [
                  { key: 'casual', label: '☕ Santai' },
                  { key: 'speed', label: '⚡ Kilat' },
                  { key: 'deep', label: '🧐 Deep Dive' },
                ] as const
              ).map(st => (
                <TouchableOpacity
                  key={st.key}
                  disabled={generatingPodcast}
                  style={[
                    styles.styleChipBtn,
                    { backgroundColor: theme.cardInner, borderColor: theme.border },
                    isMobile && { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 4 },
                    podcastStyle === st.key && [
                      styles.styleChipBtnActive,
                      { backgroundColor: theme.accentBg, borderColor: theme.accent }
                    ]
                  ]}
                  onPress={() => {
                    if (podcastStyle !== st.key) {
                      setPodcastStyle(st.key);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.styleChipBtnText,
                      { color: theme.subtext },
                      isMobile && { fontSize: 9.5 },
                      podcastStyle === st.key && { color: theme.accentLight, fontWeight: '700' }
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Empty / Generating / Loaded Script View */}
          {generatingPodcast ? (
            <View style={[styles.loadingBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.text }]}>
                Gemini sedang meramu naskah obrolan seru antara <Text style={{ fontWeight: '700' }}>{effectiveAiName}</Text> & <Text style={{ fontWeight: '700' }}>{coHostName}</Text>...
              </Text>
            </View>
          ) : podcastScript.length === 0 ? (
            <View style={[styles.emptyPodcastBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Ionicons name="sparkles" size={24} color={theme.primary} style={{ marginBottom: 4 }} />
              <Text style={[styles.emptyPodcastTitle, { color: theme.text }]}>
                Naskah Podcast Belum Dibuat
              </Text>
              <Text style={[styles.emptyPodcastSub, { color: theme.subtext }]}>
                Dengarkan penjelasan materi kuliah dalam format podcast dialog interaktif 2 orang yang santai & mudah dicerna.
              </Text>
              <TouchableOpacity
                style={[styles.generatePodcastBtn, { backgroundColor: theme.primary }]}
                onPress={() => handleGeneratePodcast(podcastStyle)}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                <Text style={styles.generatePodcastBtnText}>Buat Naskah Podcast AI Sekarang</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Controls & Soundwave Bar (Responsive 2-Tier on Mobile) */}
              <View style={[styles.controlsCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                {/* Primary Playback Row */}
                <View style={styles.controlsPrimaryRow}>
                  {/* Prev Dialogue */}
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => seekToPodcastIndex(activeScriptIdx - 1)}
                    disabled={activeScriptIdx <= 0}
                  >
                    <Ionicons name="play-skip-back" size={13} color={activeScriptIdx > 0 ? theme.text : theme.muted} />
                  </TouchableOpacity>

                  {/* Main Play / Pause */}
                  <TouchableOpacity
                    style={[styles.mainPlayBtn, { backgroundColor: theme.primary }]}
                    onPress={togglePlay}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isPlaying && !isPaused ? 'pause' : 'play'}
                      size={17}
                      color="#FFFFFF"
                      style={isPlaying && !isPaused ? {} : { marginLeft: 2 }}
                    />
                  </TouchableOpacity>

                  {/* Next Dialogue */}
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => seekToPodcastIndex(activeScriptIdx + 1)}
                    disabled={activeScriptIdx >= podcastScript.length - 1}
                  >
                    <Ionicons name="play-skip-forward" size={13} color={activeScriptIdx < podcastScript.length - 1 ? theme.text : theme.muted} />
                  </TouchableOpacity>

                  {/* Soundwave Visualizer Bars */}
                  <View style={styles.soundwaveWrap}>
                    {[wave1, wave2, wave3, wave4, wave5].map((w, idx) => (
                      <Animated.View
                        key={idx}
                        style={[
                          styles.soundwaveBar,
                          {
                            backgroundColor: isPlaying && !isPaused ? theme.accentLight : theme.border,
                            height: w.interpolate({
                              inputRange: [0, 1],
                              outputRange: [4, 18],
                            }),
                          }
                        ]}
                      />
                    ))}
                  </View>

                  {/* Desktop Only Speed chips in primary row */}
                  {!isMobile && (
                    <View style={styles.speedSelectorGroup}>
                      {SPEED_OPTIONS.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.speedChip,
                            playbackSpeed === s && [styles.speedChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => handleSpeedChange(s)}
                        >
                          <Text
                            style={[
                              styles.speedChipText,
                              { color: theme.subtext },
                              playbackSpeed === s && [styles.speedChipTextActive, { color: theme.accentLight }]
                            ]}
                          >
                            {s}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Regenerate Script Button */}
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => handleGeneratePodcast(podcastStyle)}
                    accessibilityLabel="Buat ulang naskah podcast"
                  >
                    <Ionicons name="refresh" size={13} color={theme.subtext} />
                  </TouchableOpacity>

                  {/* Copy Transcript Button */}
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={handleCopyTranscript}
                    accessibilityLabel="Salin naskah obrolan"
                  >
                    <Ionicons
                      name={copiedSuccess ? 'checkmark-circle' : 'copy-outline'}
                      size={13}
                      color={copiedSuccess ? '#10B981' : theme.subtext}
                    />
                  </TouchableOpacity>
                </View>

                {/* Mobile Sub-Row: Speed Selector & Quick Jump */}
                {isMobile && (
                  <View style={[styles.controlsSecondaryRow, { borderTopColor: theme.border }]}>
                    <Text style={[styles.speedLabelMobile, { color: theme.muted }]}>Kecepatan:</Text>
                    <View style={styles.speedSelectorGroup}>
                      {SPEED_OPTIONS.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.speedChip,
                            playbackSpeed === s && [styles.speedChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                          ]}
                          onPress={() => handleSpeedChange(s)}
                        >
                          <Text
                            style={[
                              styles.speedChipText,
                              { color: theme.subtext },
                              playbackSpeed === s && [styles.speedChipTextActive, { color: theme.accentLight }]
                            ]}
                          >
                            {s}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Interactive Live Transcript Drawer */}
              <View style={[styles.transcriptContainer, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <View style={styles.transcriptHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="chatbubbles-outline" size={13} color={theme.muted} />
                    <Text style={[styles.transcriptSectionTitle, { color: theme.text }]}>
                      Naskah Obrolan ({activeScriptIdx + 1}/{podcastScript.length})
                    </Text>
                  </View>
                  <Text style={[styles.transcriptHint, { color: theme.muted }]}>
                    Ketuk kalimat untuk melompat memutar
                  </Text>
                </View>

                <ScrollView
                  ref={scriptScrollRef}
                  style={[styles.transcriptScrollView, isMobile && { maxHeight: 185 }]}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {podcastScript.map((item, idx) => {
                    const isItemActive = idx === activeScriptIdx;
                    const isAi = item.speaker === 'ai_bot';

                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.7}
                        onPress={() => seekToPodcastIndex(idx)}
                        style={[
                          styles.dialogueBubble,
                          {
                            backgroundColor: isItemActive
                              ? (isLightMode ? '#F0FDF4' : '#06281D')
                              : theme.card,
                            borderColor: isItemActive
                              ? (isLightMode ? '#86EFAC' : '#059669')
                              : theme.border,
                          }
                        ]}
                      >
                        <View style={styles.dialogueHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {isAi ? (
                              customAiAvatar ? (
                                <Image source={{ uri: customAiAvatar }} style={styles.bubbleMiniAvatar} />
                              ) : (
                                <Ionicons name="sparkles" size={12} color={theme.accentLight} />
                              )
                            ) : (
                              <Ionicons name="headset" size={12} color="#38BDF8" />
                            )}
                            <Text
                              style={[
                                styles.dialogueSpeakerName,
                                isMobile && { fontSize: 10.5 },
                                { color: isAi ? theme.primary : (isLightMode ? '#0284C7' : '#38BDF8') }
                              ]}
                            >
                              {item.name}
                            </Text>
                            <Text style={[styles.dialogueRoleTag, { color: theme.muted }, isMobile && { fontSize: 8.5 }]}>
                              • {isAi ? 'Host AI (Sopran)' : 'Co-Host (Bariton)'}
                            </Text>
                          </View>

                          {isItemActive && (
                            <View style={styles.nowPlayingIndicator}>
                              <Ionicons name="volume-high" size={12} color="#10B981" />
                              <Text style={[styles.nowPlayingText, { color: '#10B981' }]}>Memutar</Text>
                            </View>
                          )}
                        </View>

                        <Text
                          style={[
                            styles.dialogueContentText,
                            isMobile && { fontSize: 11, lineHeight: 16 },
                            { color: isItemActive ? theme.text : theme.subtext },
                            isItemActive && { fontWeight: '600' }
                          ]}
                        >
                          {item.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      ) : (
        /* ── MODE 2: ORIGINAL NARRATION MODE ── */
        <View style={styles.narrationContainer}>
          {summaryText && (
            <View style={[styles.sourceToggleWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[
                  styles.sourceToggleBtn,
                  isMobile && { paddingVertical: 4.5 },
                  narrationSource === 'summary' && [styles.sourceToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                ]}
                onPress={() => {
                  if (narrationSource !== 'summary') {
                    stopPlayback();
                    setNarrationSource('summary');
                  }
                }}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={12}
                  color={narrationSource === 'summary' ? theme.accentLight : theme.subtext}
                />
                <Text
                  style={[
                    styles.sourceToggleText,
                    { color: theme.subtext },
                    isMobile && { fontSize: 10.5 },
                    narrationSource === 'summary' && [styles.sourceToggleTextActive, { color: theme.accentLight }]
                  ]}
                >
                  Intisari Ringkas
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sourceToggleBtn,
                  isMobile && { paddingVertical: 4.5 },
                  narrationSource === 'full' && [styles.sourceToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
                ]}
                onPress={() => {
                  if (narrationSource !== 'full') {
                    stopPlayback();
                    setNarrationSource('full');
                  }
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={12}
                  color={narrationSource === 'full' ? theme.accentLight : theme.subtext}
                />
                <Text
                  style={[
                    styles.sourceToggleText,
                    { color: theme.subtext },
                    isMobile && { fontSize: 10.5 },
                    narrationSource === 'full' && [styles.sourceToggleTextActive, { color: theme.accentLight }]
                  ]}
                >
                  Materi Lengkap
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Controls & Soundwave Bar (Responsive) */}
          <View style={[styles.controlsCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <View style={styles.controlsPrimaryRow}>
              {/* Main Play / Pause */}
              <TouchableOpacity
                style={[styles.mainPlayBtn, { backgroundColor: theme.primary }]}
                onPress={togglePlay}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPlaying && !isPaused ? 'pause' : 'play'}
                  size={18}
                  color="#FFFFFF"
                  style={isPlaying && !isPaused ? {} : { marginLeft: 2 }}
                />
              </TouchableOpacity>

              {/* Stop Button */}
              {isPlaying && (
                <TouchableOpacity
                  style={[styles.stopBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={stopPlayback}
                >
                  <Ionicons name="square" size={12} color="#EF4444" />
                </TouchableOpacity>
              )}

              {/* Soundwave Visualizer Bars */}
              <View style={styles.soundwaveWrap}>
                {[wave1, wave2, wave3, wave4, wave5].map((w, idx) => (
                  <Animated.View
                    key={idx}
                    style={[
                      styles.soundwaveBar,
                      {
                        backgroundColor: isPlaying && !isPaused ? theme.accentLight : theme.border,
                        height: w.interpolate({
                          inputRange: [0, 1],
                          outputRange: [4, 20],
                        }),
                      }
                    ]}
                  />
                ))}
              </View>

              {/* Desktop Speed */}
              {!isMobile && (
                <View style={styles.speedSelectorGroup}>
                  {SPEED_OPTIONS.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.speedChip,
                        playbackSpeed === s && [styles.speedChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                      ]}
                      onPress={() => handleSpeedChange(s)}
                    >
                      <Text
                        style={[
                          styles.speedChipText,
                          { color: theme.subtext },
                          playbackSpeed === s && [styles.speedChipTextActive, { color: theme.accentLight }]
                        ]}
                      >
                        {s}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Mobile Speed Sub-Row */}
            {isMobile && (
              <View style={[styles.controlsSecondaryRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.speedLabelMobile, { color: theme.muted }]}>Kecepatan:</Text>
                <View style={styles.speedSelectorGroup}>
                  {SPEED_OPTIONS.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.speedChip,
                        playbackSpeed === s && [styles.speedChipActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                      ]}
                      onPress={() => handleSpeedChange(s)}
                    >
                      <Text
                        style={[
                          styles.speedChipText,
                          { color: theme.subtext },
                          playbackSpeed === s && [styles.speedChipTextActive, { color: theme.accentLight }]
                        ]}
                      >
                        {s}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Voice Pack Guide Modal ── */}
      <Modal visible={showVoiceHelpModal} transparent animationType="fade" onRequestClose={() => setShowVoiceHelpModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowVoiceHelpModal(false)}>
          <View style={[styles.guideBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.guideHeader}>
              <View style={[styles.guideIconWrap, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="mic-outline" size={18} color={theme.accentLight} />
              </View>
              <Text style={[styles.guideTitle, { color: theme.text }]}>Pengaturan Suara Dual Voice</Text>
            </View>

            <Text style={[styles.guideBody, { color: theme.subtext }]}>
              Fitur AI Podcast ini menggunakan modul Speech Audio dengan modulasi pitch dan tempo otomatis:
            </Text>

            <View style={[styles.stepCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Karakter Suara Dua Host:</Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                • <Text style={{ fontWeight: '700', color: theme.primary }}>{effectiveAiName}</Text> (Host AI): {aiVoiceNameDisplay} — Nada cerah, sopran, dan bertempo artikulatif.
              </Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                • <Text style={{ fontWeight: '700', color: '#38BDF8' }}>{coHostName}</Text> (Co-Host): {coHostVoiceNameDisplay} — Nada berat, bariton, dan bertempo santai.
              </Text>
            </View>

            <View style={[styles.stepCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Tips Suara Lebih Natural di Windows / HP:</Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                1. Buka <Text style={{ fontWeight: '700' }}>Windows Settings</Text> (Win + I) → <Text style={{ fontWeight: '700' }}>Time & Language</Text> → <Text style={{ fontWeight: '700' }}>Speech</Text>.
              </Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                2. Di bagian <Text style={{ fontWeight: '700' }}>Manage voices</Text>, klik <Text style={{ fontWeight: '700' }}>Add voices</Text> dan pilih <Text style={{ fontWeight: '700', color: theme.primary }}>Indonesian (Indonesia)</Text>.
              </Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                3. Windows akan menyediakan suara natural <Text style={{ fontWeight: '700' }}>Microsoft Gadis (Wanita)</Text> dan <Text style={{ fontWeight: '700' }}>Microsoft Ardi (Pria)</Text>.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeGuideBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowVoiceHelpModal(false)}
            >
              <Text style={styles.closeGuideBtnText}>Saya Mengerti</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  notebookBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  notebookBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  badgeHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  badgeHdText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  playerHeaderSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  closeBtn: {
    padding: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  mainTabWrap: {
    flexDirection: 'row',
    borderRadius: 9,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 7,
  },
  mainTabBtnActive: {
    borderWidth: 1,
  },
  mainTabText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  mainTabTextActive: {
    fontWeight: '800',
  },
  podcastContainer: {
    gap: 10,
  },
  broadcastStage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  hostCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  hostAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  hostAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveGlowIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  hostMetaWrap: {
    flex: 1,
    minWidth: 0,
  },
  hostNameText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  hostRoleText: {
    fontSize: 9.5,
    marginTop: 0.5,
  },
  speakerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  speakerStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  stageCenterDivider: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    gap: 1,
  },
  stageVsText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  styleSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  styleSelectorLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  styleChipsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  styleChipBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  styleChipBtnActive: {
    borderWidth: 1,
  },
  styleChipBtnText: {
    fontSize: 10,
  },
  loadingBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  emptyPodcastBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 6,
  },
  emptyPodcastTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyPodcastSub: {
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 16,
    marginBottom: 4,
  },
  generatePodcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 2,
  },
  generatePodcastBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  controlsCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    gap: 6,
  },
  controlsPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlsSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 5,
    borderTopWidth: 1,
    paddingHorizontal: 2,
  },
  speedLabelMobile: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundwaveWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    height: 20,
    flex: 1,
    paddingHorizontal: 2,
  },
  soundwaveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  speedSelectorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  speedChip: {
    paddingHorizontal: 4.5,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  speedChipActive: {
    borderWidth: 1,
  },
  speedChipText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  speedChipTextActive: {
    fontWeight: '800',
  },
  transcriptContainer: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  transcriptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  transcriptSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
  },
  transcriptHint: {
    fontSize: 9.5,
  },
  transcriptScrollView: {
    maxHeight: 220,
  },
  dialogueBubble: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginBottom: 6,
    gap: 4,
  },
  dialogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bubbleMiniAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dialogueSpeakerName: {
    fontSize: 11,
    fontWeight: '800',
  },
  dialogueRoleTag: {
    fontSize: 9,
  },
  nowPlayingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  nowPlayingText: {
    fontSize: 9,
    fontWeight: '800',
  },
  dialogueContentText: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  narrationContainer: {
    gap: 10,
  },
  sourceToggleWrap: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  sourceToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    borderRadius: 6,
  },
  sourceToggleBtnActive: {
    borderWidth: 1,
  },
  sourceToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  sourceToggleTextActive: {
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  guideBox: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guideIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  guideBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  stepCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepItem: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  closeGuideBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeGuideBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
