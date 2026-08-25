import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LUCKY_HOUR_MULTIPLIER } from '../lib/luckyHourStorage';

interface Props {
  expiresAt: number;
  remainingMs: number;
  onClose: () => void;
}

export default function LuckyHourBanner({ expiresAt, remainingMs, onClose }: Props) {
  const { theme } = useTheme();
  const glowAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [timeLeft, setTimeLeft] = React.useState(remainingMs);

  useEffect(() => {
    // Golden glow pulse
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ])
    );
    // Entry shake
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
    glow.start();
    return () => glow.stop();
  }, []);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const rem = expiresAt - Date.now();
      if (rem <= 0) { clearInterval(interval); onClose(); return; }
      setTimeLeft(rem);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onClose]);

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#F59E0B88', '#F59E0B'],
  });
  const bgColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(245,158,11,0.08)', 'rgba(245,158,11,0.16)'],
  });

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      <View style={styles.leftRow}>
        <View style={styles.iconWrap}>
          <Text style={{ fontSize: 24 }}>🎲</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⚡ LUCKY HOUR AKTIF!</Text>
            </View>
            <Text style={styles.timer}>{pad(mins)}:{pad(secs)}</Text>
          </View>
          <Text style={[styles.desc, { color: theme.text }]}>
            Semua XP ×{LUCKY_HOUR_MULTIPLIER} sekarang! Belajar cepat!
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Ionicons name="close" size={14} color="#F59E0B" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leftRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F59E0B22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { backgroundColor: '#F59E0B', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#1A1A1A', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  timer: { fontSize: 13, fontWeight: '900', color: '#F59E0B', fontVariant: ['tabular-nums'] as any },
  desc: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  closeBtn: { padding: 4 },
});
