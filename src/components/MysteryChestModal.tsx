import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import {
  getChestCount, openChest, ChestLootResult, equipTitle, RpgTitle
} from "../lib/lootStorage";
import { addWaterDrops } from "../lib/gardenStorage";
import { ConfettiBurst } from "./DuolingoAnimations";

interface MysteryChestModalProps {
  visible: boolean;
  onClose: () => void;
  onLootClaimed?: (xpEarned: number) => void;
}

export default function MysteryChestModal({
  visible,
  onClose,
  onLootClaimed,
}: MysteryChestModalProps) {
  const { theme, isLightMode } = useTheme();
  const [chestCount, setChestCount] = useState(0);
  const [chestState, setChestState] = useState<"ready" | "shaking" | "opened">("ready");
  const [loot, setLoot] = useState<ChestLootResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const lootCardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      getChestCount().then(setChestCount);
      setChestState("ready");
      setLoot(null);
      setShowConfetti(false);
      shakeAnim.setValue(0);
      scaleAnim.setValue(1);
      glowAnim.setValue(0);
      lootCardAnim.setValue(0);
    }
  }, [visible]);

  const handleOpenChest = async () => {
    if (chestCount <= 0 || chestState !== "ready") return;

    setChestState("shaking");

    // Shaking sequence
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -12, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 14, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.25, duration: 250, easing: Easing.back(2), useNativeDriver: true }),
    ]).start(async () => {
      const result = await openChest();
      if (result) {
        setLoot(result);
        setChestCount((prev) => Math.max(0, prev - 1));
        await addWaterDrops(result.waterDrops);
        setChestState("opened");
        setShowConfetti(true);

        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(lootCardAnim, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
        ]).start();
      }
    });
  };

  const handleEquipTitle = async (title: RpgTitle) => {
    await equipTitle(title.id);
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "legendary": return "#F59E0B";
      case "epic": return "#A855F7";
      case "rare": return "#3B82F6";
      default: return "#10B981";
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={60} />
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeftGroup}>
              <View style={[styles.headerIconCircle, { backgroundColor: "#F59E0B25" }]}>
                <Ionicons name="gift" size={18} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Peti Harta Misterius</Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
                  Peti Tersisa: <Text style={{ color: "#F59E0B", fontWeight: "900" }}>{chestCount} Peti</Text>
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

          {/* Chest Center Stage */}
          {chestState !== "opened" ? (
            <View style={[styles.stageBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Animated.View
                style={{
                  transform: [
                    { translateX: shakeAnim },
                    { scale: scaleAnim },
                  ],
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleOpenChest}
                  disabled={chestCount <= 0 || chestState === "shaking"}
                  style={styles.chestWrapper}
                >
                  <View style={[styles.chestCircle, { backgroundColor: chestCount > 0 ? "#F59E0B" : theme.border }]}>
                    <Ionicons name="cube" size={68} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              </Animated.View>

              <Text style={[styles.chestPromptTitle, { color: theme.text }]}>
                {chestCount > 0
                  ? chestState === "shaking" ? "Membuka Peti Misterius..." : "Ketuk Peti untuk Membuka!"
                  : "Peti Harta Kosong"}
              </Text>
              <Text style={[styles.chestPromptSub, { color: theme.subtext }]}>
                {chestCount > 0
                  ? "Dapatkan XP, Tetes Air, dan Title RPG Langka secara acak!"
                  : "Selesaikan sesi Pomodoro, kalahkan Bos, atau login harian untuk dapat peti baru!"}
              </Text>

              {chestCount > 0 && chestState === "ready" && (
                <TouchableOpacity
                  style={[styles.openChestBtn, { backgroundColor: "#F59E0B" }]}
                  onPress={handleOpenChest}
                >
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                  <Text style={styles.openChestBtnText}>Buka Sekarang ({chestCount} Tersedia)</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Opened Loot Result */
            loot && (
              <Animated.View
                style={[
                  styles.lootResultBox,
                  {
                    backgroundColor: theme.cardInner,
                    borderColor: getRarityColor(loot.rarity),
                    opacity: lootCardAnim,
                    transform: [{ scale: lootCardAnim }],
                  },
                ]}
              >
                <View style={[styles.rarityBadge, { backgroundColor: getRarityColor(loot.rarity) + "25" }]}>
                  <Text style={[styles.rarityText, { color: getRarityColor(loot.rarity) }]}>
                    ★ {loot.rarity.toUpperCase()} REWARD ★
                  </Text>
                </View>

                <Text style={[styles.lootResultTitle, { color: theme.text }]}>Hadiah Berhasil Didapatkan!</Text>

                {/* Loot Items Row */}
                <View style={styles.lootItemsRow}>
                  {/* XP Reward Card */}
                  <View style={[styles.lootItemCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="star" size={24} color="#F59E0B" />
                    <Text style={[styles.lootItemValue, { color: "#F59E0B" }]}>+{loot.xp} XP</Text>
                    <Text style={[styles.lootItemLabel, { color: theme.subtext }]}>Pengalaman</Text>
                  </View>

                  {/* Water Drops Reward Card */}
                  <View style={[styles.lootItemCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="water" size={24} color="#38BDF8" />
                    <Text style={[styles.lootItemValue, { color: "#38BDF8" }]}>+{loot.waterDrops} 💧</Text>
                    <Text style={[styles.lootItemLabel, { color: theme.subtext }]}>Tetes Air</Text>
                  </View>
                </View>

                {/* If Title was Unlocked */}
                {loot.unlockedTitle && (
                  <View style={[styles.unlockedTitleCard, { backgroundColor: loot.unlockedTitle.bgColor, borderColor: loot.unlockedTitle.color }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="ribbon" size={16} color={loot.unlockedTitle.color} />
                      <Text style={[styles.unlockedTitleHeader, { color: loot.unlockedTitle.color }]}>
                        TITLE RPG BARU TERBUKA!
                      </Text>
                    </View>
                    <Text style={[styles.unlockedTitleName, { color: loot.unlockedTitle.color }]}>
                      {loot.unlockedTitle.name}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: "#475569", textAlign: "center" }}>
                      {loot.unlockedTitle.desc}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.claimLootBtn, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    onLootClaimed?.(loot.xp);
                    if (chestCount > 0) {
                      setChestState("ready");
                      setLoot(null);
                      lootCardAnim.setValue(0);
                    } else {
                      onClose();
                    }
                  }}
                >
                  <Text style={styles.claimLootBtnText}>
                    {chestCount > 0 ? `Buka Lagi (${chestCount} Sisa)` : "Klaim & Selesai"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )
          )}
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
  stageBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  chestWrapper: {
    padding: 10,
  },
  chestCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  chestPromptTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: 6,
  },
  chestPromptSub: {
    fontSize: 11.5,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  openChestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  openChestBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  lootResultBox: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  rarityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  lootResultTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  lootItemsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginVertical: 4,
  },
  lootItemCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  lootItemValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  lootItemLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  unlockedTitleCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    alignItems: "center",
    gap: 3,
    marginVertical: 2,
  },
  unlockedTitleHeader: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  unlockedTitleName: {
    fontSize: 13.5,
    fontWeight: "900",
  },
  claimLootBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  claimLootBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "900",
  },
});
