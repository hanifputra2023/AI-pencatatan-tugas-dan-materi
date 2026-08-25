import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import {
  WHEEL_SEGMENTS, WheelSegment, pickWheelResult, consumeWheelTicket,
  getWheelTickets, unlockTitle, ALL_RPG_TITLES, LootResult,
  addChest, RARITY_COLORS,
} from "../lib/lootChestStorage";
import { addWaterDrops } from "../lib/gardenStorage";
import { addExtraUserXp } from "../lib/rpgStorage";
import { addBattlePassXp } from "../lib/battlePassStorage";
import { ConfettiBurst } from "./DuolingoAnimations";

interface Props {
  visible: boolean;
  onClose: () => void;
  onRewardClaimed: (reward: LootResult) => void;
}

const SEG_COUNT = WHEEL_SEGMENTS.length;
const SEG_ANGLE = 360 / SEG_COUNT;
const WHEEL_R = 130;
const SVG_SIZE = WHEEL_R * 2;

function polar(angleDeg: number, r = WHEEL_R) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: WHEEL_R + r * Math.cos(rad), y: WHEEL_R + r * Math.sin(rad) };
}

function buildArcPath(startDeg: number, endDeg: number): string {
  const start = polar(startDeg);
  const end = polar(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [`M ${WHEEL_R} ${WHEEL_R}`, `L ${start.x} ${start.y}`, `A ${WHEEL_R} ${WHEEL_R} 0 ${largeArc} 1 ${end.x} ${end.y}`, "Z"].join(" ");
}

const EMOJI_MAP: Record<string, string> = {
  jackpot: "🏆", xp_small: "⭐", xp_medium: "⚡", xp_big: "📈",
  water_3: "💧", chest_free: "🎁", title_random: "🏅", streak_shield: "🛡️",
};

function WheelSVG({ rotationAnim }: { rotationAnim: Animated.Value }) {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const id = rotationAnim.addListener(({ value }) => setDeg(value));
    return () => rotationAnim.removeListener(id);
  }, [rotationAnim]);

  const labelR = WHEEL_R * 0.65;
  const iconR = WHEEL_R * 0.82;

  if (Platform.OS !== "web") {
    return (
      <View style={{ width: SVG_SIZE, height: SVG_SIZE, borderRadius: WHEEL_R, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 32 }}>🎰</Text>
      </View>
    );
  }

  return (
    <div style={{ width: SVG_SIZE, height: SVG_SIZE, transform: `rotate(${deg}deg)`, willChange: "transform", borderRadius: "50%", overflow: "hidden", border: "3px solid rgba(255,255,255,0.18)", boxShadow: "0 0 32px rgba(0,0,0,0.5)", flexShrink: 0 }}>
      <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} style={{ display: "block" }}>
        {WHEEL_SEGMENTS.map((seg, i) => {
          const startDeg = i * SEG_ANGLE;
          const endDeg = startDeg + SEG_ANGLE;
          const midDeg = startDeg + SEG_ANGLE / 2;
          const lp = polar(midDeg, labelR);
          const ip = polar(midDeg, iconR);
          const path = buildArcPath(startDeg, endDeg);
          return (
            <g key={seg.id}>
              <path d={path} fill={seg.color} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} />
              <text x={ip.x} y={ip.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} style={{ pointerEvents: "none", userSelect: "none" }} transform={`rotate(${midDeg}, ${ip.x}, ${ip.y})`}>{EMOJI_MAP[seg.id] || "✨"}</text>
              <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight="800" fill={seg.textColor} style={{ pointerEvents: "none", userSelect: "none" }} transform={`rotate(${midDeg}, ${lp.x}, ${lp.y})`}>{seg.label}</text>
            </g>
          );
        })}
        <circle cx={WHEEL_R} cy={WHEEL_R} r={24} fill="#0F172A" stroke="#F59E0B" strokeWidth={3} />
        <text x={WHEEL_R} y={WHEEL_R + 2} textAnchor="middle" dominantBaseline="middle" fontSize={18} style={{ pointerEvents: "none" }}>🎰</text>
      </svg>
    </div>
  );
}

export default function LuckyWheelModal({ visible, onClose, onRewardClaimed }: Props) {
  const { theme } = useTheme();
  const [tickets, setTickets] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ segment: WheelSegment; reward: LootResult } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const resultScale = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const totalRotation = useRef(0);

  useEffect(() => {
    if (visible) {
      getWheelTickets().then(setTickets);
      setResult(null);
      setShowConfetti(false);
      resultScale.setValue(0);
      resultOpacity.setValue(0);
    }
  }, [visible]);

  const handleSpin = async () => {
    if (spinning || tickets <= 0) return;
    const ok = await consumeWheelTicket();
    if (!ok) return;
    setTickets(prev => Math.max(0, prev - 1));
    setSpinning(true);
    setResult(null);
    resultScale.setValue(0);
    resultOpacity.setValue(0);

    const { segment, angleIndex } = pickWheelResult();
    const targetSegAngle = angleIndex * SEG_ANGLE + SEG_ANGLE / 2;
    const spins = 5 + Math.floor(Math.random() * 3);
    const destination = spins * 360 + (360 - targetSegAngle);
    totalRotation.current += destination;

    Animated.timing(spinAnim, {
      toValue: totalRotation.current,
      duration: 3800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(async () => {
      setSpinning(false);
      let finalReward = segment.reward;
      if (segment.id === "title_random") {
        const pool = ALL_RPG_TITLES.filter(t => t.rarity === "rare" || t.rarity === "epic");
        const picked = pool[Math.floor(Math.random() * pool.length)];
        await unlockTitle(picked.id).catch(() => {});
        finalReward = { ...finalReward, titleId: picked.id, label: `Gelar: ${picked.label}` };
      }
      if (segment.id === "chest_free") await addChest(1).catch(() => {});
      if (segment.id === "jackpot") {
        await unlockTitle("penguasa_roda").catch(() => {});
        finalReward = { ...finalReward, titleId: "penguasa_roda" };
      }

      // Persist XP and water permanently to AsyncStorage
      if (finalReward.waterAmount && finalReward.waterAmount > 0) {
        await addWaterDrops(finalReward.waterAmount).catch(() => {});
      }
      if (finalReward.xpAmount && finalReward.xpAmount > 0) {
        await addExtraUserXp(finalReward.xpAmount).catch(() => {});
        await addBattlePassXp(finalReward.xpAmount).catch(() => {});
      }

      setResult({ segment, reward: finalReward });
      const isEpic = finalReward.rarity === "epic" || finalReward.rarity === "legendary";
      setShowConfetti(isEpic || segment.id === "jackpot");
      Animated.parallel([
        Animated.spring(resultScale, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleClaim = () => {
    if (result) onRewardClaimed(result.reward);
    setResult(null);
    if (tickets <= 0) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={90} onDone={() => setShowConfetti(false)} />
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

          {/* Header */}
          <View style={[styles.header, { backgroundColor: theme.cardInner }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="radio-button-on" size={18} color="#F59E0B" />
              <Text style={[styles.headerTitle, { color: theme.text }]}>Roda Putar Keberuntungan</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F59E0B20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <Ionicons name="ticket" size={13} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", fontWeight: "800", fontSize: 11 }}>{tickets} Tiket</Text>
            </View>
          </View>

          {/* Wheel */}
          <View style={styles.wheelWrapper}>
            <View style={styles.needleWrap}>
              <View style={styles.needleTriangle} />
            </View>
            <WheelSVG rotationAnim={spinAnim} />
          </View>

          {/* Result */}
          {result && (
            <Animated.View
              style={[
                styles.resultCard,
                {
                  backgroundColor: RARITY_COLORS[result.reward.rarity] + "18",
                  borderColor: RARITY_COLORS[result.reward.rarity] + "55",
                  transform: [{ scale: resultScale }],
                  opacity: resultOpacity,
                },
              ]}
            >
              <Text style={{ fontSize: 26 }}>{EMOJI_MAP[result.segment.id] || "✨"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultLabel, { color: theme.text }]}>{result.reward.label}</Text>
                <Text style={{ fontSize: 11, color: RARITY_COLORS[result.reward.rarity], fontWeight: "700", marginTop: 2 }}>
                  {result.reward.rarity === "mythic" ? "🔥 MITOS (MYTHIC)" :
                   result.reward.rarity === "legendary" ? "✨ LEGENDARIS" :
                   result.reward.rarity === "epic" ? "💜 EPIK" : "💙 LANGKA"}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Buttons */}
          <View style={styles.btnArea}>
            {!result ? (
              <TouchableOpacity
                style={[styles.spinBtn, { backgroundColor: spinning ? "#374151" : tickets > 0 ? "#7C3AED" : "#374151", opacity: spinning || tickets <= 0 ? 0.7 : 1 }]}
                onPress={handleSpin}
                disabled={spinning || tickets <= 0}
                activeOpacity={0.8}
              >
                <Ionicons name={spinning ? "hourglass" : "refresh-circle"} size={18} color="#FFF" />
                <Text style={styles.spinBtnText}>
                  {spinning ? "Berputar..." : tickets > 0 ? `Putar Roda! (${tickets} Tiket)` : "Tiket Habis"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.spinBtn, { backgroundColor: "#10B981" }]} onPress={handleClaim} activeOpacity={0.8}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.spinBtnText}>Klaim Hadiah!</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: "600" }}>Tutup</Text>
            </TouchableOpacity>
          </View>

          {tickets <= 0 && !spinning && !result && (
            <View style={[styles.emptyHint, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <Ionicons name="information-circle" size={13} color={theme.accentLight} />
              <Text style={{ color: theme.subtext, fontSize: 10, flex: 1, lineHeight: 14 }}>
                Dapatkan Tiket dengan menyelesaikan aktivitas belajar (Pomodoro, Catatan Baru, Bos Arena, atau Tugas Selesai).
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "center", alignItems: "center", padding: 16 },
  card: { width: "100%", maxWidth: 400, borderRadius: 24, borderWidth: 1.5, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 14, fontWeight: "800" },
  wheelWrapper: { alignItems: "center", justifyContent: "center", paddingVertical: 20, position: "relative" },
  needleWrap: { position: "absolute", top: 8, zIndex: 10, alignItems: "center" },
  needleTriangle: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 24, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#EF4444" },
  resultCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 14, marginBottom: 8, gap: 10 },
  resultLabel: { fontSize: 13.5, fontWeight: "800" },
  btnArea: { padding: 14, paddingTop: 4, gap: 8 },
  spinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14 },
  spinBtnText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  cancelBtn: { alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  emptyHint: { flexDirection: "row", alignItems: "flex-start", gap: 6, margin: 14, marginTop: 0, padding: 10, borderRadius: 10, borderWidth: 1 },
});
