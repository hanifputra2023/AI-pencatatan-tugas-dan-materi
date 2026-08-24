import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useTheme } from '../contexts/ThemeContext';

interface AudioLecturePlayerProps {
  title: string;
  summaryText?: string | null;
  fullContentText: string;
  onClose?: () => void;
}

const SPEED_OPTIONS = [0.8, 0.9, 1.0, 1.25];

export default function AudioLecturePlayer({
  title,
  summaryText,
  fullContentText,
  onClose,
}: AudioLecturePlayerProps) {
  const { theme, isLightMode } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioSource, setAudioSource] = useState<'summary' | 'full'>(summaryText ? 'summary' : 'full');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.9); // 0.9x is the most natural for Indonesian TTS
  const [activeVoiceName, setActiveVoiceName] = useState<string>('Memindai suara...');
  const [hasIndonesianVoice, setHasIndonesianVoice] = useState<boolean>(true);
  const [showVoiceHelpModal, setShowVoiceHelpModal] = useState<boolean>(false);
  const [availableIdVoiceId, setAvailableIdVoiceId] = useState<string | undefined>(undefined);

  // Animated soundwave bars
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.6)).current;
  const wave3 = useRef(new Animated.Value(0.9)).current;
  const wave4 = useRef(new Animated.Value(0.4)).current;
  const wave5 = useRef(new Animated.Value(0.7)).current;

  // Queue references
  const sentenceQueueRef = useRef<string[]>([]);
  const currentSentenceIdxRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(playbackSpeed);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Indonesian Text Normalization for ultra-natural oral flow
  const normalizeIndonesianText = (rawText: string) => {
    return rawText
      // Remove markdown format
      .replace(/#+\s/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
      .replace(/>\s/g, '')
      .replace(/[-*•+]\s/g, '. ')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[\(\)\[\]\{\}]/g, ' ')
      // Expand common abbreviations to full spoken words
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
      .replace(/\bvs\b\.?/gi, 'versus')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getFullCleanText = () => {
    if (audioSource === 'summary' && summaryText && summaryText.trim()) {
      return `Ringkasan materi ${title}. ${normalizeIndonesianText(summaryText)}`;
    }
    return `Materi kuliah: ${title}. ${normalizeIndonesianText(fullContentText)}`;
  };

  // Discover native Indonesian voices using Expo Speech
  useEffect(() => {
    const discoverVoices = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (voices && voices.length > 0) {
          // Prioritize Indonesian voice IDs
          const idVoice = voices.find(v => {
            const lang = (v.language || '').toLowerCase();
            const name = (v.name || '').toLowerCase();
            return (
              lang.includes('id-id') ||
              lang.includes('id_id') ||
              lang.startsWith('id') ||
              lang.includes('in-id') ||
              name.includes('indonesia') ||
              name.includes('gadis') ||
              name.includes('ardi') ||
              name.includes('damayanti') ||
              name.includes('andika')
            );
          });

          if (idVoice) {
            setAvailableIdVoiceId(idVoice.identifier);
            setActiveVoiceName(idVoice.name.replace(/Microsoft|Desktop|Online|Google/gi, '').trim() || 'Bahasa Indonesia');
            setHasIndonesianVoice(true);
          } else {
            setActiveVoiceName('Voice Standar');
            setHasIndonesianVoice(false);
          }
        } else {
          setActiveVoiceName('Bahasa Indonesia');
        }
      } catch (e) {
        console.log('Error discovering voices:', e);
        setActiveVoiceName('Bahasa Indonesia');
      }
    };

    discoverVoices();
  }, []);

  // Soundwave looping animation
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    if (isPlaying && !isPaused) {
      const createBarAnim = (val: Animated.Value, min: number, max: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: max, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(val, { toValue: min, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          ])
        );
      };

      const a1 = createBarAnim(wave1, 0.2, 1.0, 320);
      const a2 = createBarAnim(wave2, 0.3, 0.9, 400);
      const a3 = createBarAnim(wave3, 0.2, 1.0, 280);
      const a4 = createBarAnim(wave4, 0.4, 0.8, 450);
      const a5 = createBarAnim(wave5, 0.2, 0.95, 360);

      animLoop = Animated.parallel([a1, a2, a3, a4, a5]);
      animLoop.start();
    } else {
      wave1.setValue(0.2);
      wave2.setValue(0.2);
      wave3.setValue(0.2);
      wave4.setValue(0.2);
      wave5.setValue(0.2);
    }

    return () => {
      if (animLoop) animLoop.stop();
    };
  }, [isPlaying, isPaused]);

  // Split text into natural sentence chunks to prevent audio freeze
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

  // Speak next sentence in queue with Expo Speech
  const speakNextSentence = async () => {
    if (!isSpeakingRef.current) return;

    const queue = sentenceQueueRef.current;
    const idx = currentSentenceIdxRef.current;

    if (idx >= queue.length) {
      stopPlayback();
      return;
    }

    const sentence = queue[idx];

    try {
      Speech.speak(sentence, {
        language: 'id-ID',
        voice: availableIdVoiceId,
        pitch: 1.0,
        rate: playbackSpeedRef.current,
        onDone: () => {
          if (isSpeakingRef.current) {
            currentSentenceIdxRef.current = idx + 1;
            speakNextSentence();
          }
        },
        onError: (err) => {
          console.log('Speech error:', err);
          if (isSpeakingRef.current) {
            currentSentenceIdxRef.current = idx + 1;
            speakNextSentence();
          }
        },
      });
    } catch (err) {
      console.log('Error calling Speech.speak:', err);
      if (isSpeakingRef.current) {
        currentSentenceIdxRef.current = idx + 1;
        speakNextSentence();
      }
    }
  };

  const startPlayback = async () => {
    try {
      await Speech.stop();
    } catch (e) {}

    const fullText = getFullCleanText();
    const sentences = splitTextIntoSentences(fullText);

    if (sentences.length === 0) return;

    sentenceQueueRef.current = sentences;
    currentSentenceIdxRef.current = 0;
    isSpeakingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);

    speakNextSentence();
  };

  const pausePlayback = async () => {
    isSpeakingRef.current = false;
    setIsPlaying(true);
    setIsPaused(true);
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

    try {
      await Speech.resume();
    } catch (e) {
      speakNextSentence();
    }
  };

  const stopPlayback = async () => {
    isSpeakingRef.current = false;
    currentSentenceIdxRef.current = 0;
    setIsPlaying(false);
    setIsPaused(false);

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
      try {
        await Speech.stop();
      } catch (e) {}
      speakNextSentence();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  return (
    <View style={[styles.playerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.titleInfoGroup}>
          <View style={[styles.iconPill, { backgroundColor: theme.accentBg }]}>
            <Ionicons name="volume-high" size={15} color={theme.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.playerHeaderTitle, { color: theme.text }]} numberOfLines={1}>
                Audio Kuliah (Bahasa Indonesia)
              </Text>
              <TouchableOpacity
                onPress={() => setShowVoiceHelpModal(true)}
                style={[
                  styles.badgeHd,
                  { backgroundColor: hasIndonesianVoice ? (isLightMode ? '#DCFCE7' : '#0F261E') : (isLightMode ? '#FEF3C7' : '#2B2010') }
                ]}
              >
                <Text style={[styles.badgeHdText, { color: hasIndonesianVoice ? (isLightMode ? '#15803D' : '#34D399') : (isLightMode ? '#B45309' : '#FBBF24') }]}>
                  {activeVoiceName}
                </Text>
                <Ionicons name="information-circle-outline" size={11} color={hasIndonesianVoice ? (isLightMode ? '#15803D' : '#34D399') : (isLightMode ? '#B45309' : '#FBBF24')} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.playerHeaderSub, { color: theme.subtext }]}>
              {isPlaying
                ? isPaused
                  ? 'Dijeda'
                  : 'Sedang Membacakan Materi...'
                : 'Tekan Play untuk mulai mendengarkan'}
            </Text>
          </View>
        </View>

        {onClose && (
          <TouchableOpacity onPress={() => { stopPlayback(); onClose(); }} style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <Ionicons name="close" size={14} color={theme.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {/* Mode Selector: Summary vs Full Content */}
      {summaryText && (
        <View style={[styles.sourceToggleWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.sourceToggleBtn,
              audioSource === 'summary' && [styles.sourceToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
            ]}
            onPress={() => {
              if (audioSource !== 'summary') {
                stopPlayback();
                setAudioSource('summary');
              }
            }}
          >
            <Ionicons name="sparkles-outline" size={12} color={audioSource === 'summary' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.sourceToggleText, { color: theme.subtext }, audioSource === 'summary' && [styles.sourceToggleTextActive, { color: theme.accentLight }]]}>
              Intisari Ringkas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sourceToggleBtn,
              audioSource === 'full' && [styles.sourceToggleBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]
            ]}
            onPress={() => {
              if (audioSource !== 'full') {
                stopPlayback();
                setAudioSource('full');
              }
            }}
          >
            <Ionicons name="document-text-outline" size={12} color={audioSource === 'full' ? theme.accentLight : theme.subtext} />
            <Text style={[styles.sourceToggleText, { color: theme.subtext }, audioSource === 'full' && [styles.sourceToggleTextActive, { color: theme.accentLight }]]}>
              Materi Lengkap
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Controls & Soundwave Bar */}
      <View style={[styles.controlsRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
        {/* Play / Pause */}
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
                    outputRange: [4, 22],
                  }),
                }
              ]}
            />
          ))}
        </View>

        {/* Speed Selector */}
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
              <Text style={[styles.speedChipText, { color: theme.subtext }, playbackSpeed === s && [styles.speedChipTextActive, { color: theme.accentLight }]]}>
                {s}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Voice Pack Guide Modal */}
      <Modal visible={showVoiceHelpModal} transparent animationType="fade" onRequestClose={() => setShowVoiceHelpModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowVoiceHelpModal(false)}>
          <View style={[styles.guideBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.guideHeader}>
              <View style={[styles.guideIconWrap, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="mic-outline" size={18} color={theme.accentLight} />
              </View>
              <Text style={[styles.guideTitle, { color: theme.text }]}>Pengaturan Suara Indonesia</Text>
            </View>

            <Text style={[styles.guideBody, { color: theme.subtext }]}>
              Aplikasi menggunakan modul <Text style={{ fontWeight: '700', color: theme.text }}>expo-speech (id-ID)</Text> dengan normalisasi kata otomatis.
            </Text>

            <View style={[styles.stepCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Tips Suara Lebih Natural di Windows / HP:</Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                1. Buka <Text style={{ fontWeight: '700' }}>Windows Settings</Text> (Win + I) → <Text style={{ fontWeight: '700' }}>Time & Language</Text> → <Text style={{ fontWeight: '700' }}>Speech</Text>.
              </Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                2. Di bagian <Text style={{ fontWeight: '700' }}>Manage voices</Text>, klik <Text style={{ fontWeight: '700' }}>Add voices</Text> dan pilih <Text style={{ fontWeight: '700', color: theme.primary }}>Indonesian (Indonesia)</Text>.
              </Text>
              <Text style={[styles.stepItem, { color: theme.subtext }]}>
                3. Suara akan otomatis berubah menjadi <Text style={{ fontWeight: '700' }}>Microsoft Gadis / Ardi Natural</Text> yang fasih dan empuk.
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeHdText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  playerHeaderSub: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 5,
    borderRadius: 6,
    borderWidth: 1,
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  mainPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    gap: 4,
    height: 24,
    flex: 1,
    paddingHorizontal: 6,
  },
  soundwaveBar: {
    width: 3.5,
    borderRadius: 2,
  },
  speedSelectorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  speedChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  speedChipActive: {
    borderWidth: 1,
  },
  speedChipText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  speedChipTextActive: {
    fontWeight: '800',
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
