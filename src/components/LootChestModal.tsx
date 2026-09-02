import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import {
  LootResult, rollLootChest, consumeChest, getChestCount,
  unlockTitle, ALL_RPG_TITLES, RARITY_COLORS, RARITY_LABELS,
} from "../lib/lootChestStorage";
import { addWaterDrops } from "../lib/gardenStorage";
import { addExtraUserXp } from "../lib/rpgStorage";
import { addBattlePassXp } from "../lib/battlePassStorage";
import { ConfettiBurst, XpPopup } from "./DuolingoAnimations";

interface Props {
  visible: boolean;
  onClose: () => void;
  onRewardClaimed: (reward: LootResult) => void;
}

type Phase = "idle" | "shake" | "open" | "reveal";

export default function LootChestModal({ visible, onClose, onRewardClaimed }: Props) {
  const { theme, isLightMode } = useTheme();
  const [phase, setPhase] = useState<Phase>("idle");
  const [chestCount, setChestCount] = useState(0);
  const [reward, setReward] = useState<LootResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Symmetrical Animation Values
  const shakeAnim = useRef(new Animated.Value(0)).current; // -1 to 1
  const chestScaleAnim = useRef(new Animated.Value(1)).current;
  const chestOpacity = useRef(new Animated.Value(1)).current;
  const modalScaleAnim = useRef(new Animated.Value(0.85)).current;
  const glowScale = useRef(new Animated.Value(0.8)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.3)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      getChestCount().then(setChestCount);
      setPhase("idle");
      setReward(null);
      setShowConfetti(false);
      shakeAnim.setValue(0);
      chestScaleAnim.setValue(1);
      chestOpacity.setValue(1);
      glowScale.setValue(0.8);
      glowOpacity.setValue(0);
      revealScale.setValue(0.3);
      revealOpacity.setValue(0);

      Animated.spring(modalScaleAnim, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: -6, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(floatAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    } else {
      modalScaleAnim.setValue(0.85);
      floatAnim.setValue(0);
    }
  }, [visible]);

  const handleOpen = async () => {
    if (phase !== "idle" || chestCount <= 0) return;
    const ok = await consumeChest();
    if (!ok) return;
    setChestCount(prev => Math.max(0, prev - 1));

    setPhase("shake");

    // Symmetrical wobble and scale pulse
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0.8, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -0.8, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0.5, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -0.5, duration: 65, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 65, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(chestScaleAnim, { toValue: 1.08, duration: 200, useNativeDriver: true }),
        Animated.timing(chestScaleAnim, { toValue: 1.0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start(async () => {
      const loot = rollLootChest();
      setReward(loot);
      if (loot.titleId) { await unlockTitle(loot.titleId).catch(() => {}); }
      if (loot.waterAmount && loot.waterAmount > 0) { await addWaterDrops(loot.waterAmount).catch(() => {}); }
      if (loot.xpAmount && loot.xpAmount > 0) {
        await addExtraUserXp(loot.xpAmount).catch(() => {});
        await addBattlePassXp(loot.xpAmount).catch(() => {});
      }

      setPhase("open");

      // Radiant burst opening
      Animated.parallel([
        Animated.timing(chestScaleAnim, { toValue: 1.2, duration: 280, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(chestOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1.4, duration: 280, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setPhase("reveal");
        setShowConfetti(loot.rarity === "epic" || loot.rarity === "legendary" || loot.rarity === "mythic");
        Animated.parallel([
          Animated.spring(revealScale, { toValue: 1, tension: 80, friction: 7, useNativeDriver: true }),
          Animated.timing(revealOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      });
    });
  };

  const handleClaim = () => {
    if (reward) onRewardClaimed(reward);
    setPhase("idle");
    setReward(null);
    shakeAnim.setValue(0);
    chestScaleAnim.setValue(1);
    chestOpacity.setValue(1);
    glowScale.setValue(0.8);
    glowOpacity.setValue(0);
    revealScale.setValue(0.3);
    revealOpacity.setValue(0);
    if (chestCount <= 0) onClose();
  };

  const rarityColor = reward ? RARITY_COLORS[reward.rarity] : "#6B7280";
  const rarityLabel = reward ? RARITY_LABELS[reward.rarity] : "";

  // Symmetrical Transform interpolations
  const rotateInterpolate = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-8deg', '0deg', '8deg'],
  });

  const translateXInterpolate = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-10, 0, 10],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={80} onDone={() => setShowConfetti(false)} />
        <Animated.View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, transform: [{ scale: modalScaleAnim }] }]}>

          {/* Header */}
          <View style={[styles.headerBanner, { backgroundColor: theme.cardInner }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Kotak Hadiah</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: '#F59E0B20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <Ionicons name="gift" size={13} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 11.5 }}>{chestCount} Hadiah Tersisa</Text>
            </View>
          </View>

          {/* Symmetrical Centered Stage Area */}
          <View style={styles.stageContainer}>
            {/* Ambient Radial Glow */}
            <Animated.View
              style={[
                styles.ambientGlow,
                {
                  transform: [{ scale: glowScale }],
                  opacity: glowOpacity,
                  backgroundColor: phase === "reveal" ? rarityColor : "#F59E0B",
                }
              ]}
            />

            {/* Chest Visual */}
            {phase !== "reveal" && (
              <Animated.View
                style={[
                  styles.chestWrap,
                  {
                    transform: [
                      { translateX: translateXInterpolate },
                      { translateY: floatAnim },
                      { rotate: rotateInterpolate },
                      { scale: chestScaleAnim },
                    ],
                    opacity: chestOpacity,
                  }
                ]}
              >
                <View
                  style={[
                    styles.chestCircle,
                    {
                      backgroundColor: isLightMode ? '#FEF3C7' : 'rgba(245, 158, 11, 0.12)',
                      borderColor: isLightMode ? '#F59E0B' : '#F59E0B88',
                    }
                  ]}
                >
                  <Text style={styles.chestEmojiText}>🎁</Text>
                </View>
                <Text style={[styles.tapHintText, { color: theme.subtext }]}>
                  {phase === "shake" ? "Membuka hadiah..." : "Ketuk tombol untuk membuka!"}
                </Text>
              </Animated.View>
            )}

            {/* Symmetrical Reveal Reward Card */}
            {phase === "reveal" && reward && (
              <Animated.View
                style={[
                  styles.revealCard,
                  {
                    transform: [{ scale: revealScale }],
                    opacity: revealOpacity,
                    backgroundColor: isLightMode ? '#FFFFFF' : theme.cardInner,
                    borderColor: rarityColor,
                  }
                ]}
              >
                <View style={[styles.rewardIconCircle, { backgroundColor: rarityColor + "20" }]}>
                  <Ionicons name={reward.icon as any} size={36} color={rarityColor} />
                </View>
                <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                  <Text style={styles.rarityBadgeText}>{rarityLabel.toUpperCase()}</Text>
                </View>
                <Text style={[styles.rewardLabel, { color: theme.text }]} numberOfLines={2}>
                  {reward.label}
                </Text>
                {reward.type === "title" && (
                  <Text style={[styles.rewardSub, { color: theme.subtext }]}>
                    Gelar baru ditambahkan ke koleksimu! Pasang di menu Profil.
                  </Text>
                )}
                {reward.type === "skin" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: reward.skinColor as string }} />
                    <Text style={{ color: theme.subtext, fontSize: 11 }}>Warna tema eksklusif tersimpan!</Text>
                  </View>
                )}
              </Animated.View>
            )}
          </View>

          {/* Action Buttons */}
          {phase === "idle" && (
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[
                  styles.openBtn,
                  chestCount > 0 ? {
                    backgroundColor: theme.primary,
                  } : {
                    backgroundColor: isLightMode ? '#F1F5F9' : '#141E2E',
                    borderWidth: 1,
                    borderColor: theme.border,
                  }
                ]}
                onPress={handleOpen}
                disabled={chestCount <= 0}
                activeOpacity={0.85}
              >
                <Ionicons name="gift" size={17} color={chestCount > 0 ? "#FFFFFF" : theme.subtext} />
                <Text style={[styles.openBtnText, { color: chestCount > 0 ? "#FFFFFF" : theme.subtext }]}>
                  {chestCount > 0 ? "Buka Hadiah Sekarang!" : "Hadiah Habis"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.closeBtn, { borderColor: theme.border, backgroundColor: theme.cardInner }]}
                onPress={onClose}
              >
                <Text style={[styles.closeBtnText, { color: theme.text }]}>Tutup</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "reveal" && (
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.openBtn, { backgroundColor: theme.primary }]} onPress={handleClaim} activeOpacity={0.85}>
                <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                <Text style={styles.openBtnText}>Klaim Hadiah!</Text>
              </TouchableOpacity>
              {chestCount > 0 && (
                <TouchableOpacity style={[styles.closeBtn, { borderColor: '#F59E0B', backgroundColor: '#F59E0B15' }]} onPress={handleClaim}>
                  <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 12 }}>Buka Lagi ({chestCount})</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {chestCount <= 0 && phase === "idle" && (
            <View style={[styles.emptyHint, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Ionicons name="information-circle" size={14} color={theme.accentLight} />
              <Text style={{ color: theme.subtext, fontSize: 10.5, flex: 1, lineHeight: 14 }}>
                Dapatkan Hadiah 🎁 dengan: Selesaikan Sesi Pomodoro (+1), Buat Catatan Kuliah Baru (+1), atau Kalahkan Bos Arena (+1).
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  headerBanner: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  stageContainer: {
    minHeight: 220,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingVertical: 12,
    overflow: "hidden",
  },
  ambientGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0,
    alignSelf: "center",
  },
  chestWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  chestCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  chestEmojiText: {
    fontSize: 62,
    textAlign: "center",
    lineHeight: 72,
  },
  tapHintText: {
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "center",
  },
  revealCard: {
    width: "90%",
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  rewardIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rarityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rarityBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  rewardLabel: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  rewardSub: {
    fontSize: 10.5,
    textAlign: "center",
    lineHeight: 14,
  },
  btnRow: {
    padding: 14,
    paddingTop: 4,
    gap: 8,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  openBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  closeBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    margin: 14,
    marginTop: 0,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
