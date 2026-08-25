import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { BossEvent, getTimeRemaining } from '../lib/bossEventStorage';

interface Props {
  event: BossEvent;
  onChallenge: () => void;
  onDismiss: () => void;
}

export default function BossEventBanner({ event, onChallenge, onDismiss }: Props) {
  const { theme } = useTheme();
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
      <View style={styles.leftSide}>
        <View style={[styles.emojiCircle, { backgroundColor: event.color + '30' }]}>
          <Text style={styles.emoji}>{event.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={[styles.badge, { backgroundColor: event.color }]}>
              <Text style={styles.badgeText}>{event.title}</Text>
            </View>
            <Text style={[styles.timerText, { color: timeLeft.hours < 2 ? '#EF4444' : event.color }]}>
              ⏳ {timeStr}
            </Text>
          </View>
          <Text style={[styles.bossName, { color: theme.text }]} numberOfLines={1}>
            {event.name}
          </Text>
          <Text style={[styles.rewardHint, { color: theme.subtext }]} numberOfLines={1}>
            🏆 +{event.rewards.xp} XP · 💧 +{event.rewards.water} Air · 🏅 Gelar Eksklusif
          </Text>
        </View>
      </View>

      {/* Right: buttons */}
      <View style={styles.rightSide}>
        <TouchableOpacity
          style={[styles.challengeBtn, { backgroundColor: event.color }]}
          onPress={onChallenge}
          activeOpacity={0.8}
        >
          <Ionicons name="flash" size={12} color="#FFF" />
          <Text style={styles.challengeBtnText}>Lawan!</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
          <Ionicons name="close" size={14} color={theme.muted} />
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
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emoji: { fontSize: 22 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  timerText: { fontSize: 11, fontWeight: '800' },
  bossName: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  rewardHint: { fontSize: 10, marginTop: 2 },
  rightSide: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  challengeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  dismissBtn: { padding: 4 },
});
