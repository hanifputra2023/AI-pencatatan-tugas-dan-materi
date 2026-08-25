import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import {
  BATTLE_PASS_TIERS, BattlePassTier, BattlePassProgress,
  getBattlePassProgress, claimBattlePassTier, getBattlePassSeasonDaysLeft,
} from '../lib/battlePassStorage';
import { ConfettiBurst } from './DuolingoAnimations';
import { addChest, addWheelTicket, unlockTitle } from '../lib/lootChestStorage';
import { addWaterDrops } from '../lib/gardenStorage';
import { addExtraUserXp } from '../lib/rpgStorage';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentXp: number;
}

export default function BattlePassModal({ visible, onClose, currentXp }: Props) {
  const { theme, isLightMode } = useTheme();
  const [progress, setProgress] = useState<BattlePassProgress | null>(null);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [justClaimed, setJustClaimed] = useState<number | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const daysLeft = getBattlePassSeasonDaysLeft();

  useEffect(() => {
    if (visible) {
      getBattlePassProgress().then(p => {
        setProgress(p);
        // Auto scroll to near current tier
        if (p && p.currentTier > 3 && scrollViewRef.current) {
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({ y: (p.currentTier - 2) * 64, animated: true });
          }, 300);
        }
      });
      Animated.spring(scaleAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }).start();
    } else {
      scaleAnim.setValue(0.9);
    }
  }, [visible]);

  const getTierStatus = (tier: BattlePassTier): 'claimed' | 'unlocked' | 'locked' => {
    if (!progress) return 'locked';
    if (progress.claimedTiers.includes(tier.tier)) return 'claimed';
    if (progress.currentTier >= tier.tier) return 'unlocked';
    return 'locked';
  };

  const handleClaim = async (tier: BattlePassTier) => {
    if (claiming !== null) return;
    setClaiming(tier.tier);
    const ok = await claimBattlePassTier(tier.tier);
    if (ok) {
      const r = tier.reward;
      if (r.type === 'xp') await addExtraUserXp(r.value as number).catch(() => {});
      if (r.type === 'water') await addWaterDrops(r.value as number).catch(() => {});
      if (r.type === 'chest') await addChest(r.value as number).catch(() => {});
      if (r.type === 'ticket') { for (let i = 0; i < (r.value as number); i++) await addWheelTicket().catch(() => {}); }
      if (r.type === 'title') await unlockTitle(r.value as string).catch(() => {});

      setJustClaimed(tier.tier);
      if (tier.isMilestone) setShowConfetti(true);

      const updated = await getBattlePassProgress();
      setProgress(updated);
      setTimeout(() => setJustClaimed(null), 1500);
    }
    setClaiming(null);
  };

  const currentTier = progress?.currentTier ?? 1;
  const currentTierData = BATTLE_PASS_TIERS.find(t => t.tier === currentTier);
  const nextTierData = BATTLE_PASS_TIERS.find(t => t.tier === currentTier + 1);
  const xpToNext = nextTierData ? Math.max(0, nextTierData.xpRequired - (progress?.currentXp ?? 0)) : 0;
  const progressPercent = currentTierData && nextTierData
    ? Math.min(100, Math.max(0, (((progress?.currentXp ?? 0) - currentTierData.xpRequired) / (nextTierData.xpRequired - currentTierData.xpRequired)) * 100))
    : 100;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ConfettiBurst visible={showConfetti} count={80} onDone={() => setShowConfetti(false)} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header Banner */}
          <View style={[styles.header, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: theme.primary + '25', borderColor: theme.primary + '55' }]}>
                <Text style={{ fontSize: 20 }}>🎖️</Text>
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Battle Pass Musiman</Text>
                <Text style={[styles.headerSub, { color: theme.subtext }]}>
                  Season Bulan Ini · <Text style={{ color: theme.accentLight, fontWeight: '700' }}>{daysLeft} Hari Tersisa</Text>
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.card, borderColor: theme.border }]} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* XP Progress Summary Card */}
          {progress && (
            <View style={[styles.progressSummary, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.tierBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.tierBadgeText}>Tier {progress.currentTier}</Text>
                  </View>
                  <Text style={[styles.tierMaxText, { color: theme.subtext }]}>dari 30 Tier</Text>
                </View>
                <Text style={[styles.xpLabel, { color: theme.subtext }]}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>{progress.currentXp.toLocaleString()}</Text> XP Total
                  {nextTierData ? ` · (${xpToNext} XP lagi)` : ' · Max!'}
                </Text>
              </View>
              <View style={[styles.xpBarBg, { backgroundColor: isLightMode ? '#E2E8F0' : '#1E2433' }]}>
                <View
                  style={[
                    styles.xpBarFill,
                    { width: `${progressPercent}%` as any, backgroundColor: theme.primary },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Tiers List */}
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.tierList}
          >
            {BATTLE_PASS_TIERS.map((tier) => {
              const status = getTierStatus(tier);
              const isClaiming = claiming === tier.tier;
              const isCurrent = progress?.currentTier === tier.tier;

              // Theme-adaptive tier row background & border
              let rowBg = theme.cardInner;
              let rowBorder = theme.border;

              if (tier.isMilestone) {
                rowBg = isLightMode ? '#FFFBEB' : '#F59E0B12';
                rowBorder = '#F59E0B';
              } else if (status === 'claimed') {
                rowBg = isLightMode ? '#F0FDF4' : '#10B98110';
                rowBorder = '#10B98166';
              } else if (status === 'unlocked') {
                rowBg = isLightMode ? '#EFF6FF' : '#3B82F615';
                rowBorder = '#3B82F6';
              }

              return (
                <View
                  key={tier.tier}
                  style={[
                    styles.tierRow,
                    {
                      backgroundColor: rowBg,
                      borderColor: rowBorder,
                      borderWidth: tier.isMilestone || status === 'unlocked' ? 1.5 : 1,
                    },
                  ]}
                >
                  {/* Tier Number Indicator */}
                  <View
                    style={[
                      styles.tierNum,
                      {
                        backgroundColor: tier.isMilestone ? '#F59E0B' : status === 'unlocked' ? theme.primary : (isLightMode ? '#E2E8F0' : '#1E2433'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierNumText,
                        { color: tier.isMilestone || status === 'unlocked' ? '#FFFFFF' : theme.subtext },
                      ]}
                    >
                      {tier.tier}
                    </Text>
                  </View>

                  {/* Reward Icon & Info */}
                  <Text style={{ fontSize: 22, marginHorizontal: 2 }}>{tier.reward.emoji}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.rewardLabel, { color: theme.text }]} numberOfLines={1}>
                        {tier.reward.label}
                      </Text>
                      {tier.isMilestone && (
                        <View style={styles.milestoneTag}>
                          <Text style={styles.milestoneTagText}>MILESTONE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.xpReq, { color: theme.subtext }]}>
                      {tier.xpRequired.toLocaleString()} XP kumulatif
                    </Text>
                  </View>

                  {/* Status / Claim Action */}
                  {status === 'claimed' ? (
                    <View style={[styles.claimedBadge, { backgroundColor: '#10B98120' }]}>
                      <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                      <Text style={styles.claimedText}>Diambil</Text>
                    </View>
                  ) : status === 'unlocked' ? (
                    <TouchableOpacity
                      style={[
                        styles.claimBtn,
                        {
                          backgroundColor: tier.isMilestone ? '#F59E0B' : theme.primary,
                          opacity: isClaiming ? 0.6 : 1,
                        },
                      ]}
                      onPress={() => handleClaim(tier)}
                      disabled={isClaiming}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.claimBtnText}>{isClaiming ? '...' : 'Klaim'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.lockedBadge, { backgroundColor: isLightMode ? '#E2E8F0' : '#1E2433' }]}>
                      <Ionicons name="lock-closed" size={13} color={theme.muted} />
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    height: '84%',
    maxHeight: 700,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSummary: {
    margin: 12,
    marginBottom: 8,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  tierBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  tierMaxText: {
    fontSize: 11,
    fontWeight: '600',
  },
  xpLabel: {
    fontSize: 11,
  },
  xpBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
  },
  xpBarFill: {
    height: 8,
    borderRadius: 4,
  },
  tierList: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 8,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 10,
  },
  tierNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tierNumText: {
    fontSize: 12,
    fontWeight: '900',
  },
  rewardLabel: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  milestoneTag: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  milestoneTagText: {
    color: '#1A1A1A',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  xpReq: {
    fontSize: 10,
    marginTop: 1.5,
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  claimedText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '800',
  },
  claimBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 9,
  },
  claimBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
  lockedBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

