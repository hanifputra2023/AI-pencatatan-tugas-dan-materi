import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { BossEvent, getTimeRemaining } from '../lib/bossEventStorage';

interface Props {
  event: BossEvent;
  onChallenge: () => void;
  onDismiss: () => void;
}

export default function BossEventBanner({ event, onChallenge, onDismiss }: Props) {
  const { theme } = useTheme();
  const { isMobile, isDesktop } = useResponsive();
  const compact = isMobile && !isDesktop; // mobile & tablet -> lebih rapat
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(event.endTime));

  useEffect(() => {
    // Pulse animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    glow.start();
    return () => { pulse.stop(); glow.stop(); };
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const t = getTimeRemaining(event.endTime);
      setTimeLeft(t);
      if (t.expired) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [event.endTime]);

  if (timeLeft.expired || event.defeated) return null;


  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(timeLeft.seconds)}`;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: event.color + '18',
          borderColor: event.color + 'AA',
          opacity: glowAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0.85, 1] }),
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Left: boss emoji + info */}
      <View style={[styles.leftSide, compact && styles.leftSideCompact]}>
        <View style={[styles.emojiCircle, compact && styles.emojiCircleCompact, { backgroundColor: event.color + '30' }]}>
          <Text style={[styles.emoji, compact && styles.emojiCompact]}>{event.emoji}</Text>
        </View>
        <View style={[styles.infoWrap, compact && styles.infoWrapCompact]}>
          <View style={[styles.metaRow, compact && styles.metaRowCompact]}>
            <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: event.color }]}>
              <Text style={[styles.badgeText, compact && styles.badgeTextCompact]} numberOfLines={1}>{event.title}</Text>
            </View>
            <Text style={[styles.timerText, compact && styles.timerTextCompact, { color: timeLeft.hours < 2 ? '#EF4444' : event.color }]}>
              ⏳ {timeStr}
            </Text>
          </View>
          <Text style={[styles.bossName, { color: theme.text }, compact && styles.bossNameCompact]} numberOfLines={1}>
            {event.name}
          </Text>
          <Text style={[styles.rewardHint, { color: theme.subtext }, compact && styles.rewardHintCompact]} numberOfLines={1}>
            🏆 +{event.rewards.xp} XP · 💧 +{event.rewards.water} Air · 🏅 Gelar Eksklusif
          </Text>
        </View>
      </View>

      {/* Right: buttons */}
      <View style={[styles.rightSide, compact && styles.rightSideCompact]}>
        <TouchableOpacity
          style={[styles.challengeBtn, compact && styles.challengeBtnCompact, { backgroundColor: event.color }]}
          onPress={onChallenge}
          activeOpacity={0.8}
        >
          <Ionicons name="flash" size={compact ? 10 : 12} color="#FFF" />
          <Text style={[styles.challengeBtnText, compact && styles.challengeBtnTextCompact]}>Lawan!</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} style={[styles.dismissBtn, compact && styles.dismissBtnCompact]}>
          <Ionicons name="close" size={compact ? 12 : 14} color={theme.muted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    marginHorizontal: 0,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  leftSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  leftSideCompact: { gap: 8 },
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emojiCircleCompact: { width: 36, height: 36, borderRadius: 18 },
  emoji: { fontSize: 22 },
  emojiCompact: { fontSize: 18 },
  infoWrap: { flex: 1, minWidth: 0, flexShrink: 1 },
  infoWrapCompact: {},
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaRowCompact: { gap: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, maxWidth: 120 },
  badgeCompact: { paddingHorizontal: 4, maxWidth: 100 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  badgeTextCompact: { fontSize: 8 },
  timerText: { fontSize: 11, fontWeight: '800' },
  timerTextCompact: { fontSize: 10 },
  bossName: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  bossNameCompact: { fontSize: 12 },
  rewardHint: { fontSize: 10, marginTop: 2 },
  rewardHintCompact: { fontSize: 9 },
  rightSide: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  rightSideCompact: { gap: 4 },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  challengeBtnCompact: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, gap: 3 },
  challengeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  challengeBtnTextCompact: { fontSize: 11 },
  dismissBtn: { padding: 4 },
  dismissBtnCompact: { padding: 3 },
});
