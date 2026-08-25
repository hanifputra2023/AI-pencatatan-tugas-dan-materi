/**
 * DuolingoAnimations.tsx
 * Kumpulan animasi Duolingo-style untuk meningkatkan daya tarik aplikasi.
 * Semua animasi murni menggunakan React Native Animated API — tanpa library eksternal.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// 1. XP POP-UP — Teks "+XP" yang terbang ke atas dan menghilang
// ─────────────────────────────────────────────────────────────────────────────
interface XpPopupProps {
  xp: number;
  visible: boolean;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  textColor?: string;
  onDone?: () => void;
  x?: number;
  y?: number;
}

export function XpPopup({
  xp,
  visible,
  color,
  bgColor,
  borderColor,
  textColor,
  onDone,
}: XpPopupProps) {
  const { theme, isLightMode } = useTheme();
  const activeColor = color || (isLightMode ? '#D97706' : '#FBBF24');
  const activeBg = bgColor || (isLightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.96)');
  const activeBorder = borderColor || (isLightMode ? '#F59E0B' : '#FBBF24');
  const activeText = textColor || (isLightMode ? '#B45309' : '#FBBF24');

  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
    opacity.setValue(0);
    scale.setValue(0.5);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1.3, tension: 200, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]),
      Animated.spring(scale, { toValue: 1, tension: 150, friction: 6, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 800, delay: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => onDone?.());
  }, [visible]);

  if (!visible) return null;

  // Fullscreen overlay wrapper agar posisi benar di web maupun native
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <Animated.View
        style={[
          styles.xpPopup,
          {
            backgroundColor: activeBg,
            borderColor: activeBorder,
            transform: [{ translateY }, { scale }],
            opacity,
          },
        ]}
      >
        <Ionicons name="star" size={16} color={activeColor} />
        <Text style={[styles.xpText, { color: activeText }]}>+{xp} XP</Text>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONFETTI BURST — Partikel warna-warni meledak di layar
// ─────────────────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1',
  '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#5DADE2', '#52BE80',
];

interface ConfettiPiece {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  isCircle: boolean;
}

function createConfettiPiece(index: number): ConfettiPiece {
  return {
    x: new Animated.Value(Math.random() * SCREEN_WIDTH),
    y: new Animated.Value(-20),
    rotate: new Animated.Value(0),
    opacity: new Animated.Value(1),
    scale: new Animated.Value(Math.random() * 0.5 + 0.7),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    size: Math.random() * 8 + 5,
    isCircle: Math.random() > 0.6,
  };
}

interface ConfettiBurstProps {
  visible: boolean;
  count?: number;
  onDone?: () => void;
}

export function ConfettiBurst({ visible, count = 40, onDone }: ConfettiBurstProps) {
  const pieces = useRef<ConfettiPiece[]>(
    Array.from({ length: count }, (_, i) => createConfettiPiece(i))
  ).current;

  useEffect(() => {
    if (!visible) return;

    pieces.forEach(piece => {
      piece.x.setValue(Math.random() * SCREEN_WIDTH);
      piece.y.setValue(-20);
      piece.rotate.setValue(0);
      piece.opacity.setValue(1);
      piece.scale.setValue(Math.random() * 0.5 + 0.7);
    });

    const animations = pieces.map(piece => {
      const delay = Math.random() * 300;
      const duration = Math.random() * 1200 + 1200;
      const targetX = (Math.random() - 0.5) * SCREEN_WIDTH * 0.8 + (piece.x as any)._value;
      const targetY = SCREEN_HEIGHT * (Math.random() * 0.5 + 0.5);
      const rotations = (Math.random() - 0.5) * 1440;

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(piece.x, { toValue: targetX, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(piece.y, { toValue: targetY, duration, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(piece.rotate, { toValue: rotations, duration, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(piece.opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(piece.opacity, { toValue: 0, duration: duration * 0.4, delay: duration * 0.6, useNativeDriver: true }),
          ]),
        ]),
      ]);
    });

    Animated.parallel(animations).start(() => onDone?.());
  }, [visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => {
        const rotateStr = piece.rotate.interpolate({
          inputRange: [-1440, 1440],
          outputRange: ['-1440deg', '1440deg'],
        });
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute', left: 0, top: 0,
              width: piece.size, height: piece.isCircle ? piece.size : piece.size * 0.6,
              borderRadius: piece.isCircle ? piece.size / 2 : 2,
              backgroundColor: piece.color,
              transform: [{ translateX: piece.x }, { translateY: piece.y }, { rotate: rotateStr }, { scale: piece.scale }],
              opacity: piece.opacity,
            }}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STREAK FLAME PULSE — Api streak yang berdenyut dengan glow
// ─────────────────────────────────────────────────────────────────────────────
interface StreakFlamePulseProps {
  streak: number;
  color?: string;
  size?: number;
  isActive?: boolean;
}

export function StreakFlamePulse({ streak, color = '#F59E0B', size = 20, isActive = false }: StreakFlamePulseProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    if (streak > 0) loop.start();
    return () => loop.stop();
  }, [streak]);

  useEffect(() => {
    if (!isActive) return;
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]),
      Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [isActive]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }, { translateX: shakeAnim }], position: 'relative' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 2.2, height: size * 2.2, borderRadius: size * 1.1,
          borderWidth: 2, borderColor: color,
          opacity: glowOpacity, left: -size * 0.6, top: -size * 0.6,
        }}
      />
      <Ionicons name="flame" size={size} color={streak > 0 ? color : '#6B7280'} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. QUEST BOUNCE WRAPPER — Tombol quest yang memantul saat di-tap
// ─────────────────────────────────────────────────────────────────────────────
interface QuestBounceWrapperProps {
  completed: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
}

export function QuestBounceWrapper({ completed, onPress, children, style }: QuestBounceWrapperProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 300, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress]);

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MILESTONE CELEBRATE — Full-screen overlay saat streak 7/14/30/100 hari
// ─────────────────────────────────────────────────────────────────────────────
interface MilestoneCelebrateProps {
  visible: boolean;
  streak: number;
  onClose: () => void;
  accentColor?: string;
  cardBg?: string;
  textColor?: string;
  subtextColor?: string;
  borderColor?: string;
}

export function MilestoneCelebrate({
  visible,
  streak,
  onClose,
  accentColor,
  cardBg,
  textColor,
  subtextColor,
  borderColor,
}: MilestoneCelebrateProps) {
  const { theme, isLightMode } = useTheme();
  const activeCardBg = cardBg || (isLightMode ? '#FFFFFF' : theme.card);
  const activeText = textColor || theme.text;
  const activeSubtext = subtextColor || theme.subtext;
  const activeBorder = borderColor || theme.border;
  const activeAccent = accentColor || theme.accent;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.5)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const iconBounce = useRef(new Animated.Value(-30)).current;
  const streakScale = useRef(new Animated.Value(0)).current;

  const getMilestoneData = () => {
    if (streak >= 100) return { icon: '🏆', title: 'Legenda Belajar!', desc: `${streak} hari streak tanpa henti. Luar biasa sekali!`, color: '#FFD700' };
    if (streak >= 30) return { icon: '💎', title: 'Daya Tahan Baja!', desc: `30 hari! Kamu lebih konsisten dari 95% mahasiswa.`, color: '#60A5FA' };
    if (streak >= 14) return { icon: '🔥', title: '2 Minggu Solid!', desc: `14 hari berturut-turut. Kebiasaan belajarmu sudah terbentuk!`, color: '#F97316' };
    if (streak >= 7) return { icon: '⭐', title: 'Satu Minggu Penuh!', desc: `7 hari streak! Kamu sudah buktikan komitmenmu.`, color: '#FBBF24' };
    return { icon: '✨', title: 'Luar Biasa!', desc: `${streak} hari aktif belajar dan refleksi!`, color: activeAccent };
  };

  const milestoneData = getMilestoneData();

  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0); cardScale.setValue(0.5); cardOpacity.setValue(0);
      iconBounce.setValue(-30); streakScale.setValue(0);

      Animated.sequence([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.parallel([
          Animated.spring(cardScale, { toValue: 1, tension: 180, friction: 7, useNativeDriver: true }),
          Animated.timing(cardOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(iconBounce, { toValue: 0, tension: 120, friction: 6, useNativeDriver: true }),
          Animated.spring(streakScale, { toValue: 1, tension: 200, friction: 6, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.8, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={handleClose} animationType="none">
      <Animated.View style={[styles.milestoneOverlay, { opacity: overlayOpacity }]}>
        <ConfettiBurst visible={visible} count={60} />
        <Animated.View
          style={[
            styles.milestoneCard,
            {
              backgroundColor: activeCardBg,
              borderColor: activeBorder,
              transform: [{ scale: cardScale }],
              opacity: cardOpacity,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ translateY: iconBounce }] }}>
            <Text style={styles.milestoneEmoji}>{milestoneData.icon}</Text>
          </Animated.View>

          <Animated.View style={{ transform: [{ scale: streakScale }] }}>
            <View style={[styles.milestoneBadge, { backgroundColor: milestoneData.color + '22', borderColor: milestoneData.color + '66' }]}>
              <StreakFlamePulse streak={streak} color={milestoneData.color} size={22} isActive />
              <Text style={[styles.milestoneStreakNum, { color: milestoneData.color }]}>{streak} HARI</Text>
            </View>
          </Animated.View>

          <Text style={[styles.milestoneTitle, { color: activeText }]}>{milestoneData.title}</Text>
          <Text style={[styles.milestoneDesc, { color: activeSubtext }]}>{milestoneData.desc}</Text>

          <TouchableOpacity style={[styles.milestoneBtn, { backgroundColor: milestoneData.color }]} onPress={handleClose} activeOpacity={0.85}>
            <Text style={styles.milestoneBtnText}>Mantap, Lanjutkan! 🚀</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PULSE DOT — Titik berdenyut untuk notifikasi / status aktif
// ─────────────────────────────────────────────────────────────────────────────
interface PulseDotProps {
  color?: string;
  size?: number;
}

export function PulseDot({ color = '#10B981', size = 8 }: PulseDotProps) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={{ width: size * 2.5, height: size * 2.5, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SHIMMER BOX — Loading skeleton dengan efek shimmer premium
// ─────────────────────────────────────────────────────────────────────────────
interface ShimmerProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
  baseColor?: string;
  highlightColor?: string;
}

export function ShimmerBox({ width, height, borderRadius = 8, style, baseColor = '#1E2430', highlightColor = '#2A3145' }: ShimmerProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const animBg = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [baseColor, highlightColor] });

  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: animBg }, style]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. FADE SLIDE IN — Entrance animation saat elemen muncul
// ─────────────────────────────────────────────────────────────────────────────
interface FadeSlideInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: any;
}

export function FadeSlideIn({
  children,
  delay = 0,
  duration = 450,
  distance = 18,
  style,
}: FadeSlideInProps) {
  const translateY = useRef(new Animated.Value(distance)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration * 0.8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, distance, duration]);

  return (
    <Animated.View style={[{ width: '100%', transform: [{ translateY }], opacity }, style]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. FLOATING BADGE — Animasi melayang / levitasi halus terus-menerus
// ─────────────────────────────────────────────────────────────────────────────
interface FloatingBadgeProps {
  children: React.ReactNode;
  distance?: number;
  duration?: number;
  style?: any;
}

export function FloatingBadge({
  children,
  distance = 6,
  duration = 2000,
  style,
}: FloatingBadgeProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -distance,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: distance,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [distance, duration]);

  return (
    <Animated.View style={[{ transform: [{ translateY: floatAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SHAKE VIEW — Getaran horizontal saat salah memilih jawaban kuis
// ─────────────────────────────────────────────────────────────────────────────
interface ShakeViewProps {
  trigger: boolean;
  children: React.ReactNode;
  style?: any;
}

export function ShakeView({ trigger, children, style }: ShakeViewProps) {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trigger) return;
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [trigger]);

  return (
    <Animated.View style={[{ transform: [{ translateX: shakeAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. ANIMATED PROGRESS BAR — Progress bar yang mengisi dengan transisi smooth
// ─────────────────────────────────────────────────────────────────────────────
interface AnimatedProgressBarProps {
  percent: number; // 0 - 100
  height?: number;
  trackColor?: string;
  fillColor?: string;
  borderRadius?: number;
  style?: any;
}

export function AnimatedProgressBar({
  percent,
  height = 8,
  trackColor = '#1F2937',
  fillColor = '#3B82F6',
  borderRadius = 4,
  style,
}: AnimatedProgressBarProps) {
  const animatedWidth = useRef(new Animated.Value(percent)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: Math.min(100, Math.max(0, percent)),
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const widthInterpolate = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[
        {
          width: '100%',
          height,
          backgroundColor: trackColor,
          borderRadius,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          width: widthInterpolate,
          height: '100%',
          backgroundColor: fillColor,
          borderRadius,
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  xpPopup: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    shadowColor: '#FBBF24', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 15,
  },
  xpText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.8 },
  milestoneOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  milestoneCard: {
    backgroundColor: '#141822', borderRadius: 24, padding: 28,
    alignItems: 'center', gap: 12, maxWidth: 340, width: '100%',
    borderWidth: 1.5, borderColor: '#2A3145',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5, shadowRadius: 40, elevation: 30,
  },
  milestoneEmoji: { fontSize: 72, lineHeight: 82 },
  milestoneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  milestoneStreakNum: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  milestoneTitle: { fontSize: 24, fontWeight: '900', color: '#F3F4F6', textAlign: 'center', letterSpacing: 0.5 },
  milestoneDesc: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  milestoneBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, alignItems: 'center', width: '100%' },
  milestoneBtnText: { color: '#000000', fontSize: 16, fontWeight: '800' },
});

