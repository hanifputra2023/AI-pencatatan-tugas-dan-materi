import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getSpinTickets, consumeSpinTicket, addChest } from "../lib/lootStorage";
import { addWaterDrops } from "../lib/gardenStorage";
import { getGamificationConfig, GamificationConfig, DEFAULT_GAMIFICATION_CONFIG } from "../lib/gamificationConfig";
import { ConfettiBurst } from "./DuolingoAnimations";

interface LuckySpinWheelModalProps {
  visible: boolean;
  onClose: () => void;
  onRewardWon?: (xp: number) => void;
}

export default function LuckySpinWheelModal({
  visible,
  onClose,
  onRewardWon,
}: LuckySpinWheelModalProps) {
  const { theme, isLightMode } = useTheme();
  const [tickets, setTickets] = useState(1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelSectors, setWheelSectors] = useState(DEFAULT_GAMIFICATION_CONFIG.wheelSectors);
  const [wonSector, setWonSector] = useState<typeof DEFAULT_GAMIFICATION_CONFIG.wheelSectors[0] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const spinAngle = useRef(new Animated.Value(0)).current;
  const currentRotation = useRef(0);

  useEffect(() => {
    if (visible) {
      getSpinTickets().then(setTickets);
      getGamificationConfig().then((cfg) => {
        if (cfg.wheelSectors && cfg.wheelSectors.length > 0) {
          setWheelSectors(cfg.wheelSectors);
        }
      });
      setIsSpinning(false);
      setWonSector(null);
      setShowConfetti(false);
    }
  }, [visible]);

  const handleSpin = async () => {
    if (tickets <= 0 || isSpinning) return;

    const didConsume = await consumeSpinTicket();
    if (!didConsume) return;

    setIsSpinning(true);
    setWonSector(null);
    setTickets((prev) => Math.max(0, prev - 1));

    // Weighted random sector selection based on admin-defined weights
    const totalWeight = wheelSectors.reduce((sum, s) => sum + (s.weight || 10), 0);
    let rand = Math.random() * totalWeight;
    let targetSectorIndex = 0;
    for (let i = 0; i < wheelSectors.length; i++) {
      const weight = wheelSectors[i].weight || 10;
      if (rand < weight) {
        targetSectorIndex = i;
        break;
      }
      rand -= weight;
    }

    const sectorAngle = 360 / wheelSectors.length;
    const targetSegAngle = targetSectorIndex * sectorAngle + sectorAngle / 2;
    const targetEnd = (360 - targetSegAngle) % 360;
    let delta = targetEnd - (currentRotation.current % 360);
    if (delta <= 0) delta += 360;
    
    // Multiple full spins (5 to 8 rotations) + target sector offset
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const targetDeg = currentRotation.current + (fullSpins * 360) + delta;

    Animated.timing(spinAngle, {
      toValue: targetDeg,
      duration: 3600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      currentRotation.current = targetDeg % 360;
      const picked = wheelSectors[targetSectorIndex];
      setWonSector(picked);
      setIsSpinning(false);
      setShowConfetti(true);

      // Award rewards
      if (picked.water > 0) await addWaterDrops(picked.water);
      if (picked.chest > 0) await addChest(picked.chest);
      if (picked.xp > 0) onRewardWon?.(picked.xp);
    });
  };

  const spinInterpolation = spinAngle.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={60} />
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeftGroup}>
              <View style={[styles.headerIconCircle, { backgroundColor: "#EC489925" }]}>
                <Ionicons name="sparkles" size={18} color="#EC4899" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Roda Putar Keberuntungan</Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
                  Tiket Putar: <Text style={{ color: "#EC4899", fontWeight: "900" }}>{tickets} Tiket</Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={16} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          {/* Wheel Stage */}
          <View style={[styles.wheelStageBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            {/* Top Indicator Needle */}
            <View style={styles.needleWrap}>
              <View style={styles.needleTriangle} />
            </View>

            {/* Rotating Wheel Circle */}
            <Animated.View
              style={[
                styles.wheelCircle,
                {
                  transform: [{ rotate: spinInterpolation }],
                },
              ]}
            >
              {wheelSectors.map((s, idx) => {
                const angle = (idx * 360) / wheelSectors.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.wheelSectorLabel,
                      {
                        transform: [
                          { rotate: `${angle}deg` },
                          { translateY: -60 },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.sectorIconWrap, { backgroundColor: s.color + "25" }]}>
                      <Ionicons name={s.icon as any} size={13} color={s.color} />
                    </View>
                    <Text style={[styles.sectorText, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })}
              
              {/* Wheel Center Button */}
              <View style={[styles.wheelCenterHub, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Ionicons name="flash" size={18} color="#EC4899" />
              </View>
            </Animated.View>

            {/* Won Reward Banner */}
            {wonSector && (
              <View style={[styles.wonBanner, { backgroundColor: wonSector.color + "20", borderColor: wonSector.color }]}>
                <Ionicons name="trophy" size={16} color={wonSector.color} />
                <Text style={[styles.wonBannerText, { color: wonSector.color }]}>
                  Selamat! Kamu Mendapatkan {wonSector.label}
                </Text>
              </View>
            )}

            {/* Spin Button */}
            <TouchableOpacity
              style={[
                styles.spinBtn,
                { backgroundColor: tickets > 0 && !isSpinning ? "#EC4899" : theme.border },
                (tickets <= 0 || isSpinning) && { opacity: 0.7 }
              ]}
              onPress={handleSpin}
              disabled={tickets <= 0 || isSpinning}
            >
              <Ionicons name="reload" size={16} color="#FFFFFF" />
              <Text style={styles.spinBtnText}>
                {isSpinning ? "Memutar Roda..." : tickets > 0 ? `Putar Roda (${tickets} Tiket)` : "Tiket Habis (Login Besok / Belajar)"}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.hintFooter, { color: theme.muted }]}>
              Dapatkan tiket putar gratis tiap hari dengan login atau menyelesaikan sesi Pomodoro!
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  wheelStageBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: "center",
    gap: 12,
    position: "relative",
  },
  needleWrap: {
    position: "absolute",
    top: 8,
    zIndex: 99,
    alignItems: "center",
  },
  needleTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 18,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#EF4444",
  },
  wheelCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: "#EC4899",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginVertical: 10,
  },
  wheelSectorLabel: {
    position: "absolute",
    alignItems: "center",
    gap: 2,
  },
  sectorIconWrap: {
    padding: 4,
    borderRadius: 6,
  },
  sectorText: {
    fontSize: 8.5,
    fontWeight: "800",
    textAlign: "center",
  },
  wheelCenterHub: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  wonBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    width: "100%",
    justifyContent: "center",
  },
  wonBannerText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  spinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
  },
  spinBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  hintFooter: {
    fontSize: 9.5,
    textAlign: "center",
    lineHeight: 13,
  },
});
