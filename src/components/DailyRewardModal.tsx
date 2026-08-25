import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { DailyReward, DAILY_REWARD_SCHEDULE } from "../lib/dailyRewardStorage";
import { ConfettiBurst } from "./DuolingoAnimations";

interface DailyRewardModalProps {
  visible: boolean;
  reward: DailyReward;
  streak: number;
  onClaim: () => void;
}

export default function DailyRewardModal({ visible, reward, streak, onClaim }: DailyRewardModalProps) {
  const { theme, isLightMode } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const coinBounce = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowConfetti(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(coinBounce, { toValue: -8, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(coinBounce, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(0.7);
      glowAnim.setValue(0);
    }
  }, [visible]);

  const handleClaim = () => {
    setShowConfetti(true);
    setTimeout(onClaim, 1200);
  };

  const totalDays = DAILY_REWARD_SCHEDULE.length;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={70} />
        <Animated.View style={[styles.card, { backgroundColor: theme.card, borderColor: reward.isMega ? "#FBBF24" : theme.border, transform: [{ scale: scaleAnim }] }]}>
          
          {/* Header Glow Banner */}
          <View style={[styles.headerBanner, { backgroundColor: reward.isMega ? "#78350F" : (isLightMode ? "#1E3A5F" : "#0F172A") }]}>
            <Animated.View style={{ transform: [{ translateY: coinBounce }] }}>
              <View style={[styles.rewardCoinCircle, { backgroundColor: reward.isMega ? "#F59E0B" : "#6366F1" }]}>
                <Ionicons name={reward.isMega ? "trophy" : "gift"} size={34} color="#FFFFFF" />
              </View>
            </Animated.View>
            <Text style={styles.headerTitle}>{reward.isMega ? "JACKPOT HARI INI!" : "Hadiah Harian"}</Text>
            <Text style={styles.headerSub}>{reward.label}</Text>
          </View>

          {/* XP Reward Display */}
          <View style={styles.xpDisplayRow}>
            <View style={[styles.xpBigBadge, { backgroundColor: reward.isMega ? "#FEF3C7" : theme.accentBg }]}>
              <Ionicons name="star" size={20} color={reward.isMega ? "#D97706" : theme.accentLight} />
              <Text style={[styles.xpBigText, { color: reward.isMega ? "#D97706" : theme.accentLight }]}>+{reward.xp} XP</Text>
            </View>
          </View>

          {/* 7-Day Progress Strip */}
          <View style={[styles.streakStripWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <Text style={[styles.streakStripLabel, { color: theme.subtext }]}>Progres Login Minggu Ini</Text>
            <View style={styles.streakDotRow}>
              {DAILY_REWARD_SCHEDULE.map((r, i) => {
                const dayNum = i + 1;
                const claimed = streak >= dayNum;
                const isToday = streak === dayNum;
                const isMega7 = dayNum === 7;
                return (
                  <View key={i} style={styles.streakDayCell}>
                    <View style={[
                      styles.streakDot,
                      { backgroundColor: claimed ? (isMega7 ? "#F59E0B" : "#6366F1") : theme.border },
                      isToday && styles.streakDotActive,
                    ]}>
                      {claimed ? (
                        <Ionicons name={isMega7 ? "trophy" : "checkmark"} size={isMega7 ? 11 : 10} color="#FFFFFF" />
                      ) : (
                        <Text style={styles.streakDotNum}>{dayNum}</Text>
                      )}
                    </View>
                    <Text style={[styles.streakDayXp, { color: claimed ? theme.accentLight : theme.subtext }]}>+{r.xp}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Claim Button */}
          <TouchableOpacity
            style={[styles.claimBtn, { backgroundColor: reward.isMega ? "#D97706" : theme.primary }]}
            onPress={handleClaim}
            activeOpacity={0.85}
          >
            <Ionicons name="gift" size={18} color="#FFFFFF" />
            <Text style={styles.claimBtnText}>Klaim {reward.xp} XP Sekarang!</Text>
          </TouchableOpacity>

          <Text style={[styles.footerNote, { color: theme.subtext }]}>
            Login setiap hari untuk terus menambah XP-mu!
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 2,
    overflow: "hidden",
  },
  headerBanner: {
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
    gap: 8,
  },
  rewardCoinCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  headerSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12.5,
    fontWeight: "600",
  },
  xpDisplayRow: {
    alignItems: "center",
    paddingVertical: 16,
  },
  xpBigBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  xpBigText: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  streakStripWrap: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  streakStripLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  streakDotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  streakDayCell: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  streakDot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  streakDotActive: {
    shadowColor: "#6366F1",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
    transform: [{ scale: 1.15 }],
  },
  streakDotNum: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
  },
  streakDayXp: {
    fontSize: 9,
    fontWeight: "700",
  },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  claimBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  footerNote: {
    textAlign: "center",
    fontSize: 10.5,
    paddingVertical: 12,
  },
});
