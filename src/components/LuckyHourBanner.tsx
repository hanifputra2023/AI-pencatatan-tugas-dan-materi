import React, { useEffect, useRef, useCallback } from 'react';
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
  const { theme, isLightMode } = useTheme();
  const glowAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [timeLeft, setTimeLeft] = React.useState(Math.max(0, remainingMs));
  const onCloseRef = useRef(onClose);

  // Keep ref updated without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Entry shake animation
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();

    // Golden glow pulse (opacity only — native driver safe)
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, []);

  // Countdown timer — uses ref for onClose to avoid effect re-running
  useEffect(() => {
    const interval = setInterval(() => {
      const rem = expiresAt - Date.now();
      if (rem <= 0) {
        clearInterval(interval);
        setTimeLeft(0);
        onCloseRef.current();
        return;
      }
      setTimeLeft(rem);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          borderColor: '#F59E0B',
          backgroundColor: isLightMode ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.12)',
          opacity: glowAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1] }),
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      {/* Left content */}
      <View style={styles.leftRow}>
        <View style={[styles.iconWrap, { backgroundColor: '#F59E0B22' }]}>
          <Text style={{ fontSize: 24 }}>🎲</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⚡ LUCKY HOUR AKTIF!</Text>
            </View>
            <View style={[styles.timerWrap, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B55' }]}>
              <Text style={styles.timer}>{pad(mins)}:{pad(secs)}</Text>
            </View>
          </View>
          <Text style={[styles.desc, { color: theme.text }]}>
            Semua XP ×{LUCKY_HOUR_MULTIPLIER} sekarang! Belajar cepat!
          </Text>
        </View>
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: '#F59E0B22' }]}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={14} color="#F59E0B" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: '#1A1A1A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timerWrap: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  timer: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F59E0B',
  },
  desc: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
