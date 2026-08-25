import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Animated, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import GardenIllustration from './GardenIllustration';
import {
  GardenPlant,
  GardenSpecies,
  GARDEN_SPECIES_LIST,
  getActivePlant,
  saveActivePlant,
  addGrowthPoints,
  getHarvestedPlants,
  plantNewSeed,
  getWaterDrops,
  consumeWaterDrop,
} from '../lib/gardenStorage';
import { FloatingBadge, ConfettiBurst, XpPopup } from './DuolingoAnimations';
import { showAlert } from '../lib/alert';

interface VirtualGardenModalProps {
  visible: boolean;
  onClose: () => void;
  onPlantUpdated?: () => void;
}

export default function VirtualGardenModal({
  visible,
  onClose,
  onPlantUpdated,
}: VirtualGardenModalProps) {
  const { theme, isLightMode } = useTheme();
  const [activePlant, setActivePlant] = useState<GardenPlant | null>(null);
  const [harvests, setHarvests] = useState<GardenPlant[]>([]);
  const [waterDrops, setWaterDrops] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'active' | 'seedShop' | 'harvests'>('active');
  const [showConfetti, setShowConfetti] = useState(false);
  const [showXp, setShowXp] = useState(false);
  const [showWaterHelp, setShowWaterHelp] = useState(false);

  const loadData = async () => {
    const current = await getActivePlant();
    const harvestList = await getHarvestedPlants();
    const drops = await getWaterDrops();
    setActivePlant(current);
    setHarvests(harvestList);
    setWaterDrops(drops);
  };

  useEffect(() => {
    if (visible) {
      loadData();
      setShowWaterHelp(false);
    }
  }, [visible]);

  const handleWaterPlant = async () => {
    if (!activePlant) return;

    if (waterDrops <= 0) {
      setShowWaterHelp(true);
      return;
    }

    const didConsume = await consumeWaterDrop();
    if (!didConsume) return;

    setWaterDrops(prev => Math.max(0, prev - 1));
    const { plant, didLevelUp, didBloom } = await addGrowthPoints(20);
    setActivePlant(plant);
    onPlantUpdated?.();

    if (didBloom) {
      setShowConfetti(true);
      setShowXp(true);
      const harvestList = await getHarvestedPlants();
      setHarvests(harvestList);
    } else if (didLevelUp) {
      setShowXp(true);
    }
  };

  const handleSelectNewSpecies = async (speciesId: 'sakura' | 'bonsai' | 'cactus' | 'sunflower') => {
    const newPlant = await plantNewSeed(speciesId);
    setActivePlant(newPlant);
    setActiveTab('active');
    onPlantUpdated?.();
  };

  if (!visible || !activePlant) return null;

  const currentSpecies = GARDEN_SPECIES_LIST.find(s => s.id === activePlant.speciesId) || GARDEN_SPECIES_LIST[0];

  const getStageTitle = (stage: number) => {
    switch (stage) {
      case 1: return 'Fase 1: Bibit Muda dalam Pot';
      case 2: return 'Fase 2: Tunas Daun Bertumbuh';
      case 3: return 'Fase 3: Tanaman Rimbun';
      case 4: return 'Fase 4: Mekar Sempurna (Master)';
      default: return 'Tumbuh';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ConfettiBurst visible={showConfetti} count={50} onDone={() => setShowConfetti(false)} />
        <XpPopup xp={25} visible={showXp} onDone={() => setShowXp(false)} />

        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeftGroup}>
              <View style={[styles.headerIconCircle, { backgroundColor: theme.accentBg }]}>
                <Ionicons name="leaf-outline" size={18} color={theme.accentLight} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Taman Fokus Mahasiswa</Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtext }]}>
                  Tanaman bertumbuh seiring sesi belajarmu
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

          {/* Navigation Tab Switcher */}
          <View style={[styles.tabBar, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'active' && [styles.tabBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
              onPress={() => setActiveTab('active')}
            >
              <Ionicons name="flower-outline" size={13} color={activeTab === 'active' ? theme.accentLight : theme.subtext} />
              <Text style={[styles.tabBtnText, { color: theme.subtext }, activeTab === 'active' && [styles.tabBtnTextActive, { color: theme.text }]]}>
                Pohon Aktif
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'seedShop' && [styles.tabBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
              onPress={() => setActiveTab('seedShop')}
            >
              <Ionicons name="add-circle-outline" size={13} color={activeTab === 'seedShop' ? theme.accentLight : theme.subtext} />
              <Text style={[styles.tabBtnText, { color: theme.subtext }, activeTab === 'seedShop' && [styles.tabBtnTextActive, { color: theme.text }]]}>
                Koleksi Bibit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'harvests' && [styles.tabBtnActive, { backgroundColor: theme.card, borderColor: theme.border }]]}
              onPress={() => setActiveTab('harvests')}
            >
              <Ionicons name="trophy-outline" size={13} color={activeTab === 'harvests' ? theme.accentLight : theme.subtext} />
              <Text style={[styles.tabBtnText, { color: theme.subtext }, activeTab === 'harvests' && [styles.tabBtnTextActive, { color: theme.text }]]}>
                Panen ({harvests.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: Active Plant Hero Screen (COMPACT - NO SCROLL NEEDED) */}
          {activeTab === 'active' && (
            <View style={[styles.plantShowcaseBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              {/* Header row: Species Badge & Water Drops Pill */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <View style={[styles.speciesBadge, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
                  <Ionicons name={currentSpecies.iconName as any} size={12} color={theme.accentLight} />
                  <Text style={[styles.speciesBadgeText, { color: theme.accentLight }]}>
                    {currentSpecies.name}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0284C720', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#0284C740' }}>
                  <Ionicons name="water" size={12} color="#38BDF8" />
                  <Text style={{ color: '#38BDF8', fontSize: 11, fontWeight: '800' }}>
                    {waterDrops} Tetes Air
                  </Text>
                </View>
              </View>

              {/* Floating Plant Illustration */}
              <FloatingBadge distance={4} duration={2400}>
                <GardenIllustration
                  speciesId={activePlant.speciesId}
                  stage={activePlant.stage}
                  size={105}
                />
              </FloatingBadge>

              {/* Plant Name & Stage Title */}
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.plantMainTitle, { color: theme.text }]}>
                  {activePlant.name}
                </Text>
                <Text style={[styles.plantStageSub, { color: theme.subtext }]}>
                  {getStageTitle(activePlant.stage)}
                </Text>
              </View>

              {/* Passive Buff Card */}
              <View style={{ width: '100%', backgroundColor: currentSpecies.accentColor + '15', borderColor: currentSpecies.accentColor + '40', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={13} color={currentSpecies.accentColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.subtext, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Efek Pasif saat Mekar:
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: currentSpecies.accentColor }}>
                    {currentSpecies.passiveBuff}
                  </Text>
                </View>
              </View>

              {/* Growth Progress Bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressLabelsRow}>
                  <Text style={[styles.progressLabelLeft, { color: theme.subtext }]}>Pertumbuhan</Text>
                  <Text style={[styles.progressLabelRight, { color: theme.accentLight }]}>
                    {activePlant.growthPoints} / 100 XP
                  </Text>
                </View>
                <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        backgroundColor: currentSpecies.accentColor || theme.primary,
                        width: `${Math.min(100, activePlant.growthPoints)}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Action Buttons: Water */}
              <View style={[styles.actionButtonsRow, { width: '100%' }]}>
                <TouchableOpacity
                  style={[
                    styles.waterBtn,
                    waterDrops > 0 ? {
                      backgroundColor: theme.primary,
                    } : {
                      backgroundColor: isLightMode ? '#F1F5F9' : '#141E2E',
                      borderWidth: 1.5,
                      borderColor: '#0284C755',
                    }
                  ]}
                  onPress={handleWaterPlant}
                  activeOpacity={0.8}
                >
                  <Ionicons name="water" size={16} color={waterDrops > 0 ? '#FFFFFF' : '#38BDF8'} />
                  <Text
                    style={[
                      styles.waterBtnText,
                      waterDrops <= 0 && { color: theme.text, fontWeight: '800' }
                    ]}
                  >
                    {waterDrops > 0 ? `Siram Tanaman (Pakai 1 💧 / +20 XP)` : `Air Habis (Lihat Cara Dapat 💧)`}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.howToGrowNote, { color: theme.muted, fontSize: 9.5 }]}>
                Dapatkan 💧 dari sesi Pomodoro (+2 💧), Catatan Baru (+1 💧), atau Menang Bos (+1 💧)!
              </Text>
            </View>
          )}

          {/* Tab 2: Seed Shop & Selection */}
          {activeTab === 'seedShop' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={[styles.sectionPrompt, { color: theme.text }]}>Pilih Bibit Pohon Belajar Baru:</Text>
              <View style={styles.seedGrid}>
                {GARDEN_SPECIES_LIST.map((spec) => {
                  const isCurrent = activePlant.speciesId === spec.id;
                  return (
                    <TouchableOpacity
                      key={spec.id}
                      style={[
                        styles.seedCard,
                        { backgroundColor: theme.cardInner, borderColor: isCurrent ? theme.accent : theme.border },
                        isCurrent && { borderWidth: 1.5, backgroundColor: theme.accentBg }
                      ]}
                      onPress={() => handleSelectNewSpecies(spec.id)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.seedIllustrationBox}>
                        <GardenIllustration speciesId={spec.id} stage={4} size={70} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.seedName, { color: theme.text }]}>{spec.name}</Text>
                          {isCurrent && (
                            <View style={[styles.activeTag, { backgroundColor: theme.primary }]}>
                              <Text style={styles.activeTagText}>Aktif</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.seedSub, { color: theme.accentLight }]}>{spec.subtitle}</Text>
                        <View style={{ backgroundColor: spec.accentColor + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' }}>
                          <Text style={{ color: spec.accentColor, fontSize: 9.5, fontWeight: '800' }}>
                            Buff: {spec.passiveBuff}
                          </Text>
                        </View>
                        <Text style={[styles.seedDesc, { color: theme.subtext }]} numberOfLines={2}>
                          {spec.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Tab 3: Harvests & Showcase */}
          {activeTab === 'harvests' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {harvests.length === 0 ? (
                <View style={[styles.emptyHarvestBox, { borderColor: theme.border }]}>
                  <Ionicons name="trophy-outline" size={32} color={theme.muted} />
                  <Text style={[styles.emptyHarvestTitle, { color: theme.text }]}>Belum ada tanaman yang mekar penuh</Text>
                  <Text style={[styles.emptyHarvestSub, { color: theme.subtext }]}>
                    Selesaikan sesi fokus Pomodoro sampai tanamanmu mencapai 100 XP untuk memanen dan mengaktifkan buff pasif permanen!
                  </Text>
                </View>
              ) : (
                <View style={styles.harvestGrid}>
                  {harvests.map((h, idx) => {
                    const spec = GARDEN_SPECIES_LIST.find(s => s.id === h.speciesId) || GARDEN_SPECIES_LIST[0];
                    return (
                      <View key={idx} style={[styles.harvestCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                        <GardenIllustration speciesId={h.speciesId} stage={4} size={90} />
                        <Text style={[styles.harvestPlantName, { color: theme.text }]}>{h.name}</Text>
                        <View style={[styles.harvestBadge, { backgroundColor: '#10B98120' }]}>
                          <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                          <Text style={[styles.harvestBadgeText, { color: '#10B981' }]}>Mekar & Aktif</Text>
                        </View>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: spec.accentColor, textAlign: 'center', marginTop: 2 }}>
                          {spec.passiveBuff}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}

          {/* IN-MODAL WATER GUIDE DIALOG (Muncul langsung di depan tanpa tertutup modal) */}
          {showWaterHelp && (
            <View style={styles.waterHelpOverlay}>
              <View style={[styles.waterHelpCard, { backgroundColor: theme.card, borderColor: '#0284C7' }]}>
                <View style={[styles.waterHelpIconCircle, { backgroundColor: '#0284C725' }]}>
                  <Ionicons name="water" size={30} color="#38BDF8" />
                </View>
                <Text style={[styles.waterHelpTitle, { color: theme.text }]}>Tetes Air Habis!</Text>
                <Text style={[styles.waterHelpDesc, { color: theme.subtext }]}>
                  Kamu membutuhkan setidaknya 1 Tetes Air 💧 untuk menyiram tanamanmu.
                </Text>

                <View style={[styles.waterHelpList, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                  <Text style={[styles.waterHelpListHeader, { color: theme.text }]}>Cara Mengumpulkan 💧:</Text>
                  
                  <View style={styles.waterHelpRow}>
                    <Ionicons name="timer" size={15} color="#10B981" />
                    <Text style={[styles.waterHelpRowText, { color: theme.text }]}>
                      Selesaikan 1 Sesi Pomodoro: <Text style={{ color: '#10B981', fontWeight: '800' }}>+2 💧</Text>
                    </Text>
                  </View>

                  <View style={styles.waterHelpRow}>
                    <Ionicons name="document-text" size={15} color="#3B82F6" />
                    <Text style={[styles.waterHelpRowText, { color: theme.text }]}>
                      Buat Catatan Kuliah Baru: <Text style={{ color: '#3B82F6', fontWeight: '800' }}>+1 💧</Text>
                    </Text>
                  </View>

                  <View style={styles.waterHelpRow}>
                    <Ionicons name="skull" size={15} color="#A855F7" />
                    <Text style={[styles.waterHelpRowText, { color: theme.text }]}>
                      Menangkan Pertarungan Bos: <Text style={{ color: '#A855F7', fontWeight: '800' }}>+1 💧</Text>
                    </Text>
                  </View>

                  <View style={styles.waterHelpRow}>
                    <Ionicons name="gift" size={15} color="#F59E0B" />
                    <Text style={[styles.waterHelpRowText, { color: theme.text }]}>
                      Login Harian Gratis: <Text style={{ color: '#F59E0B', fontWeight: '800' }}>+1 💧/hari</Text>
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.waterHelpCloseBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setShowWaterHelp(false)}
                >
                  <Text style={styles.waterHelpCloseBtnText}>Mengerti & Mulai Belajar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
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
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 7,
  },
  tabBtnActive: {
    borderWidth: 1,
  },
  tabBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    fontWeight: '800',
  },
  scrollContent: {
    paddingBottom: 10,
    gap: 12,
  },
  plantShowcaseBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  speciesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  speciesBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  plantMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  plantStageSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    width: '100%',
    gap: 5,
    marginTop: 6,
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabelLeft: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  progressLabelRight: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  actionButtonsRow: {
    width: '100%',
    marginTop: 6,
  },
  waterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  waterBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  howToGrowNote: {
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 2,
  },
  sectionPrompt: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  seedGrid: {
    gap: 10,
  },
  seedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  seedIllustrationBox: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedName: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  seedSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  seedDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  activeTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  activeTagText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  emptyHarvestBox: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyHarvestTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyHarvestSub: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  harvestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  harvestCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  harvestPlantName: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  harvestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  harvestBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  harvestDate: {
    fontSize: 10,
  },
  waterHelpOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 999,
    borderRadius: 20,
  },
  waterHelpCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  waterHelpIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  waterHelpTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  waterHelpDesc: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 15,
  },
  waterHelpList: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginVertical: 4,
  },
  waterHelpListHeader: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  waterHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waterHelpRowText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  waterHelpCloseBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  waterHelpCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
